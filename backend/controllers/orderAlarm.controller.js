import User from "../models/user.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import Order from "../models/order.model.js";
import { applyOrderStatusChange } from "../services/order.service.js";
import {
  ORDER_STATUSES,
  acknowledgeOrder,
  alarmStatus,
  canPhoneChangeStatus,
  connectedDb,
  createDevice,
  findDeviceByToken,
  listPendingOrders,
  listTodayOrders,
  parseKnown,
  parseWait,
  publicDevice,
  revokeDevice,
  signalOrderAlarm,
  tokenFromRequest,
  waitForPendingChange,
} from "../services/orderAlarm.service.js";

const dbOr503 = (res) => {
  const db = connectedDb();
  if (!db) res.status(503).json({ success: false, message: "Veritabanı hazır değil, birazdan tekrar deneyin." });
  return db;
};

const appVersionOf = (req) => String(req.headers["x-app-version"] || "").slice(0, 20);

/** Telefonun cihaz anahtarını doğrular (yönetici oturumu değil). */
export const requireAlarmDevice = async (req, res, next) => {
  try {
    const db = dbOr503(res);
    if (!db) return;
    const device = await findDeviceByToken(db, tokenFromRequest(req), { appVersion: appVersionOf(req) });
    if (!device) {
      return res.status(401).json({ success: false, code: "DEVICE_REVOKED", message: "Bu telefonun eşlemesi geçersiz. Yeniden giriş yapın." });
    }
    req.alarmDevice = device;
    req.alarmDb = db;
    next();
  } catch (error) {
    console.error("Sipariş alarmı cihaz doğrulaması:", error.message);
    res.status(500).json({ success: false, message: "Cihaz doğrulanamadı." });
  }
};

/** POST /api/order-alarm/pair  { email, password, deviceName } → { token, device } (yalnızca yönetici hesabı) */
export const pairDeviceHandler = async (req, res) => {
  try {
    const { email, password, deviceName } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: "E-posta ve şifre gerekli." });
    }
    const db = dbOr503(res);
    if (!db) return;
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ success: false, message: "Geçersiz e-posta veya şifre." });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Bu uygulamaya yalnızca yönetici hesabıyla giriş yapılabilir." });
    }
    const { token, device } = await createDevice(db, { name: deviceName, userId: user._id, appVersion: appVersionOf(req) });
    AdminAudit.create({ actor: user._id, action: "Sipariş alarmı telefonu eşlendi", target: device.name, summary: "POST /api/order-alarm/pair" })
      .catch((error) => console.error("Admin audit write failed:", error));
    res.status(201).json({ success: true, token, device: publicDevice(device), user: { name: user.name } });
  } catch (error) {
    console.error("Sipariş alarmı eşleme hatası:", error.message);
    res.status(500).json({ success: false, message: "Telefon eşlenemedi." });
  }
};

/**
 * GET /api/order-alarm/pending?known=id1,id2&wait=25
 * Bekleyen (henüz onaylanmamış) siparişler. Liste `known` ile aynıysa en çok `wait` sn bekletilir.
 */
export const getPendingHandler = async (req, res) => {
  let closed = false;
  res.on("close", () => { closed = true; });
  try {
    const { alarmDb: db, alarmDevice: device } = req;
    const orders = await waitForPendingChange(
      () => listPendingOrders(db, device),
      parseKnown(req.query.known),
      { waitSeconds: parseWait(req.query.wait), isClosed: () => closed },
    );
    if (closed) return;
    res.set("Cache-Control", "no-store");
    res.json({ success: true, serverTime: new Date().toISOString(), device: { id: device._id, name: device.name }, orders });
  } catch (error) {
    console.error("Sipariş alarmı bekleyen liste hatası:", error.message);
    if (!closed) res.status(500).json({ success: false, message: "Siparişler alınamadı." });
  }
};

/** POST /api/order-alarm/orders/:orderId/ack  { action: "seen" | "accepted" } */
export const ackOrderHandler = async (req, res) => {
  try {
    const ack = await acknowledgeOrder(req.alarmDb, req.alarmDevice, req.params.orderId, req.body?.action);
    // Bu süreçte bekleyen diğer telefonlar da hemen susar.
    signalOrderAlarm();
    res.json({ success: true, ack });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Sipariş alarmı onay hatası:", error.message);
    res.status(statusCode).json({ success: false, message: statusCode === 500 ? "Onay kaydedilemedi." : error.message });
  }
};

/** GET /api/order-alarm/orders/today → bugünün siparişleri ve özet */
export const todayOrdersHandler = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, ...(await listTodayOrders(req.alarmDb)) });
  } catch (error) {
    console.error("Sipariş alarmı bugünün siparişleri hatası:", error.message);
    res.status(500).json({ success: false, message: "Siparişler alınamadı." });
  }
};

/**
 * PUT /api/order-alarm/orders/:orderId/status  { status: "Yolda" | "Teslim Edildi" }
 * Paneldeki durum güncellemesiyle aynı servis ve yan etkiler (müşteri bildirimi, görev ve davet ödülü, canlı panel).
 * Telefondan yalnızca ileri adım atılır; iptal ve geri alma panelde kalır.
 */
export const changeOrderStatusHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const status = req.body?.status;
    const device = req.alarmDevice;
    if (!/^[a-f\d]{24}$/i.test(String(orderId)) || !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz istek." });
    }
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Sipariş bulunamadı." });
    const previousStatus = order.status;
    if (previousStatus === status) return res.json({ success: true, order: { id: String(order._id), status } });
    if (!canPhoneChangeStatus(previousStatus, status)) {
      return res.status(409).json({ success: false, status: previousStatus, message: `Sipariş şu an "${previousStatus}". Bu değişiklik yalnızca panelden yapılabilir.` });
    }

    // Paneldeki durum güncellemesiyle aynı servis: müşteri bildirimi, görevler, davet (referral)
    // ödülü ve canlı panel olayı. Kayıt okunduğu andaki duruma koşulludur; bu arada panelden
    // değiştiyse 409 döner.
    try {
      await applyOrderStatusChange(order, status, { actorId: device.createdBy, io: req.app?.get?.("io") });
    } catch (error) {
      if (error?.name === "VersionError" || error?.name === "DocumentNotFoundError") {
        const current = await Order.findById(orderId).select("status").lean();
        return res.status(409).json({ success: false, status: current?.status, message: "Sipariş bu sırada başka bir yerden güncellendi. Listeyi yenileyin." });
      }
      throw error;
    }
    AdminAudit.create({ actor: device.createdBy, action: "Sipariş durumu (alarm telefonu)", target: String(order._id), summary: `${device.name}: ${previousStatus} → ${status}` })
      .catch((error) => console.error("Admin audit write failed:", error));
    // "Hazırlanıyor"dan çıkan sipariş tüm telefonlarda susar.
    signalOrderAlarm();
    res.json({ success: true, order: { id: String(order._id), status } });
  } catch (error) {
    console.error("Sipariş alarmı durum değiştirme hatası:", error.message);
    res.status(500).json({ success: false, message: "Sipariş durumu değiştirilemedi." });
  }
};

/** POST /api/order-alarm/logout → telefon kendi eşlemesini kaldırır */
export const logoutDeviceHandler = async (req, res) => {
  try {
    await revokeDevice(req.alarmDb, req.alarmDevice._id);
    res.json({ success: true });
  } catch (error) {
    console.error("Sipariş alarmı çıkış hatası:", error.message);
    res.status(500).json({ success: false, message: "Çıkış yapılamadı." });
  }
};

/** GET /api/order-alarm/status (yönetici) → eşlenmiş telefonlar ve son onaylar */
export const alarmStatusHandler = async (req, res) => {
  try {
    const db = dbOr503(res);
    if (!db) return;
    res.json({ success: true, ...(await alarmStatus(db)) });
  } catch (error) {
    console.error("Sipariş alarmı durum hatası:", error.message);
    res.status(500).json({ success: false, message: "Durum alınamadı." });
  }
};

/** DELETE /api/order-alarm/devices/:deviceId (yönetici) → kaybolan/verilen telefonun erişimini kapatır */
export const revokeDeviceHandler = async (req, res) => {
  try {
    const db = dbOr503(res);
    if (!db) return;
    const revoked = await revokeDevice(db, req.params.deviceId);
    if (!revoked) return res.status(404).json({ success: false, message: "Telefon bulunamadı ya da zaten kaldırılmış." });
    res.json({ success: true });
  } catch (error) {
    console.error("Sipariş alarmı cihaz kaldırma hatası:", error.message);
    res.status(500).json({ success: false, message: "Telefon kaldırılamadı." });
  }
};
