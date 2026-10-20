// Sipariş alarmı: ayrı Android uygulaması ("Benim Marketim Sipariş Alarmı") için sunucu tarafı.
//
// - Telefon bir kez yönetici e-posta/şifresiyle eşlenir. Telefonda yönetici oturumu tutulmaz;
//   yalnızca bekleyen siparişleri okuyup onaylayabilen, panelden kaldırılabilen bir cihaz anahtarı kalır
//   (veritabanında anahtarın kendisi değil, SHA-256 özeti saklanır).
// - "Bekleyen sipariş": durumu "Hazırlanıyor", son ORDER_ALARM_WINDOW_HOURS saat (varsayılan 12) içinde
//   ve cihaz eşlendikten sonra verilmiş, henüz hiçbir cihazda "Gördüm" / "Kabul Et" denmemiş sipariş.
//   Bir telefonda onaylanan sipariş diğer telefonlarda da susar. Sipariş durumu değiştirilmez.
// - Telefon /pending isteğini uzun bekletmeli (long-poll) yapar: liste telefonun bildiğinden farklıysa
//   hemen, değilse en çok 30 sn sonra yanıt döner. Aynı süreçte verilen sipariş anında,
//   PM2 küme modunda başka süreçte verilen sipariş en geç RECHECK_MS içinde fark edilir.
import crypto from "node:crypto";
import mongoose from "mongoose";

export const DEVICES_COLLECTION = "order_alarm_devices";
export const ACKS_COLLECTION = "order_alarm_acks";
export const PENDING_STATUS = "Hazırlanıyor";
export const ACK_ACTIONS = ["seen", "accepted"];
export const MAX_WAIT_SECONDS = 30;
export const RECHECK_MS = 5000;
// Kupon kullanımı aynı anda tükenirse sipariş oluşturulduktan hemen sonra silinir (order.service →
// commitCouponUsage). Bu kısa pencerede alarm çalmasın diye siparişin en az bu kadar eski olması beklenir.
export const SETTLE_MS = 2000;
export const MAX_PENDING = 20;
const ACK_RETENTION_SECONDS = 60 * 24 * 3600;
const LAST_SEEN_WRITE_GAP_MS = 60 * 1000;
const TOKEN_PREFIX = "oa_";

const text = (value, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const windowHours = () => clamp(Number(process.env.ORDER_ALARM_WINDOW_HOURS) || 12, 1, 72);

// ─── Cihaz anahtarı ───────────────────────────────────────────────

export const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
export const newDeviceToken = () => `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;

/** "Authorization: Bearer oa_..." başlığından cihaz anahtarını okur (yönetici JWT'si kabul edilmez). */
export const tokenFromRequest = (req) => {
  const header = String(req?.headers?.authorization || "");
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const token = match?.[1] || "";
  return token.startsWith(TOKEN_PREFIX) && token.length > 20 && token.length < 200 ? token : null;
};

export const deviceName = (value) => text(value, 40) || "Sipariş telefonu";

// ─── Sipariş biçimi (saf fonksiyonlar) ────────────────────────────

export const orderNumber = (id) => `#${String(id).slice(-8).toUpperCase()}`;

const DELIVERY_POINT_NAMES = { girlsDorm: "Kız KYK Yurdu", boysDorm: "Erkek KYK Yurdu" };
const PAYMENT_LABELS = {
  cash: "Kapıda nakit",
  nakit: "Kapıda nakit",
  card: "Kapıda kart",
  kart: "Kapıda kart",
  pos: "Kapıda kart",
  online: "Online ödendi",
};

/**
 * Sipariş kayıtlarında ödeme yöntemi alanı yoktur (site ve uygulama ödemeyi teslimatta alır).
 * İleride siparişe `paymentMethod` eklenirse o gösterilir; yoksa ORDER_ALARM_PAYMENT_LABEL ya da "Teslimatta ödeme".
 */
export const paymentLabel = (order) => {
  const raw = text(order?.paymentMethod, 40);
  if (raw) return PAYMENT_LABELS[raw.toLowerCase()] || raw;
  return text(process.env.ORDER_ALARM_PAYMENT_LABEL, 40) || "Teslimatta ödeme";
};

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Telefona gönderilen sipariş özeti. Müşteri telefonu yalnızca aramak için gösterilir. */
export const toAlarmOrder = (order, customerName = "") => {
  const products = (Array.isArray(order.products) ? order.products : []).slice(0, 60).map((item) => {
    const quantity = Number(item?.quantity) || 0;
    const price = money(item?.price);
    return { name: text(item?.name || "Ürün", 100), quantity, price, lineTotal: money(price * quantity) };
  });
  const deliveryPointName = text(order.deliveryPointName, 80) || DELIVERY_POINT_NAMES[order.deliveryPoint] || "";
  const city = text(order.city, 80);
  const address = [...new Set([deliveryPointName, city].filter(Boolean))].join(" · ") || "Belirtilmemiş";
  const subtotal = money(order.subtotalAmount);
  const total = money(order.totalAmount);
  return {
    id: String(order._id),
    number: orderNumber(order._id),
    createdAt: new Date(order.createdAt).toISOString(),
    status: order.status,
    customerName: text(customerName, 80) || "Müşteri",
    phone: text(order.phone, 30),
    address,
    deliveryPoint: deliveryPointName,
    note: text(order.note, 400),
    paymentMethod: paymentLabel(order),
    products,
    itemCount: products.reduce((sum, item) => sum + item.quantity, 0),
    subtotalAmount: subtotal > total ? subtotal : total,
    couponCode: order.couponCode ? text(order.couponCode, 40) : null,
    couponDiscount: money(order.couponDiscount),
    totalAmount: total,
  };
};

/** Telefonun bildiği liste ile sunucudaki liste aynı mı (sıra önemsiz). */
export const pendingKey = (ids) => [...new Set((ids || []).map(String).filter(Boolean))].sort().join(",");

export const parseKnown = (value) =>
  String(value || "").split(",").map((id) => id.trim()).filter((id) => /^[a-f\d]{24}$/i.test(id)).slice(0, 100);

export const parseWait = (value) => clamp(Math.floor(Number(value) || 0), 0, MAX_WAIT_SECONDS);

/** Bu cihaz için alarm çalınabilecek en eski sipariş zamanı */
export const pendingSince = (device, now = new Date()) =>
  new Date(Math.max(new Date(device.createdAt).getTime(), now.getTime() - windowHours() * 3600 * 1000));

// ─── Veritabanı ───────────────────────────────────────────────────

export const connectedDb = () => (mongoose.connection?.readyState === 1 ? mongoose.connection.db : null);

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

let indexesReady = null;
export const ensureIndexes = (db) => {
  indexesReady ||= Promise.all([
    db.collection(DEVICES_COLLECTION).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(ACKS_COLLECTION).createIndex({ at: 1 }, { expireAfterSeconds: ACK_RETENTION_SECONDS }),
    // Bekleyen sipariş sorgusu ve panelin "en yeni önce" listesi için
    db.collection("orders").createIndex({ createdAt: -1 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
};

export const publicDevice = (device) => ({
  id: device._id,
  name: device.name,
  createdAt: device.createdAt,
  lastSeenAt: device.lastSeenAt || null,
  appVersion: device.appVersion || "",
  revokedAt: device.revokedAt || null,
});

export const createDevice = async (db, { name, userId, appVersion = "" }, now = new Date()) => {
  await ensureIndexes(db);
  const token = newDeviceToken();
  const device = {
    _id: crypto.randomUUID(),
    tokenHash: hashToken(token),
    name: deviceName(name),
    createdBy: String(userId),
    createdAt: now,
    lastSeenAt: now,
    appVersion: text(appVersion, 20),
    revokedAt: null,
  };
  await db.collection(DEVICES_COLLECTION).insertOne(device);
  return { token, device };
};

export const findDeviceByToken = async (db, token, { appVersion = "", now = new Date() } = {}) => {
  if (!token) return null;
  const device = await db.collection(DEVICES_COLLECTION).findOne({ tokenHash: hashToken(token), revokedAt: null });
  if (!device) return null;
  const version = text(appVersion, 20);
  if (!device.lastSeenAt || now - new Date(device.lastSeenAt) > LAST_SEEN_WRITE_GAP_MS || (version && version !== device.appVersion)) {
    const update = { lastSeenAt: now, ...(version ? { appVersion: version } : {}) };
    await db.collection(DEVICES_COLLECTION).updateOne({ _id: device._id }, { $set: update });
    Object.assign(device, update);
  }
  return device;
};

export const revokeDevice = async (db, deviceId, now = new Date()) => {
  const result = await db.collection(DEVICES_COLLECTION).updateOne({ _id: String(deviceId), revokedAt: null }, { $set: { revokedAt: now } });
  return (result?.modifiedCount ?? result?.matchedCount ?? 0) > 0;
};

export const listPendingOrders = async (db, device, { now = new Date() } = {}) => {
  const since = pendingSince(device, now);
  const until = new Date(now.getTime() - SETTLE_MS);
  if (since > until) return [];
  const orders = await db.collection("orders")
    .find({ createdAt: { $gte: since, $lte: until }, status: PENDING_STATUS })
    .sort({ createdAt: 1 })
    .limit(MAX_PENDING + 50)
    .toArray();
  if (orders.length === 0) return [];

  const acks = await db.collection(ACKS_COLLECTION).find({ _id: { $in: orders.map((order) => String(order._id)) } }).toArray();
  const acked = new Set(acks.map((ack) => String(ack._id)));
  const open = orders.filter((order) => !acked.has(String(order._id))).slice(0, MAX_PENDING);
  if (open.length === 0) return [];

  const userIds = open.map((order) => order.user).filter(Boolean);
  const users = userIds.length
    ? await db.collection("users").find({ _id: { $in: userIds } }, { projection: { name: 1 } }).toArray()
    : [];
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  return open.map((order) => toAlarmOrder(order, names.get(String(order.user))));
};

export const acknowledgeOrder = async (db, device, orderId, action, now = new Date()) => {
  if (!ACK_ACTIONS.includes(action)) throw Object.assign(new Error("Geçersiz işlem"), { statusCode: 400 });
  if (!/^[a-f\d]{24}$/i.test(String(orderId))) throw Object.assign(new Error("Geçersiz sipariş"), { statusCode: 400 });
  const order = await db.collection("orders").findOne({ _id: toObjectId(orderId) }, { projection: { _id: 1 } });
  if (!order) throw Object.assign(new Error("Sipariş bulunamadı"), { statusCode: 404 });
  await ensureIndexes(db);
  const id = String(orderId);
  // İlk onay geçerlidir; ikinci telefonun onayı kaydı değiştirmez.
  await db.collection(ACKS_COLLECTION).updateOne(
    { _id: id },
    { $setOnInsert: { action, deviceId: device._id, deviceName: device.name, at: now } },
    { upsert: true },
  );
  const ack = await db.collection(ACKS_COLLECTION).findOne({ _id: id });
  return { orderId: id, action: ack?.action || action, deviceName: ack?.deviceName || device.name, at: ack?.at || now };
};

/** Yönetici için: eşlenmiş telefonlar ve son onaylar */
export const alarmStatus = async (db) => {
  const [devices, acks] = await Promise.all([
    db.collection(DEVICES_COLLECTION).find({}).sort({ createdAt: -1 }).limit(50).toArray(),
    db.collection(ACKS_COLLECTION).find({}).sort({ at: -1 }).limit(30).toArray(),
  ]);
  return {
    devices: devices.map(publicDevice),
    recentAcks: acks.map((ack) => ({ orderId: ack._id, number: orderNumber(ack._id), action: ack.action, deviceName: ack.deviceName, at: ack.at })),
  };
};

// ─── Bugünün siparişleri ve telefondan durum değişikliği ─────────

export const ORDER_STATUSES = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];
// Telefondan yalnızca ileri adımlar atılabilir; iptal ve geri alma panelde kalır.
const PHONE_TRANSITIONS = { "Hazırlanıyor": ["Yolda", "Teslim Edildi"], "Yolda": ["Teslim Edildi"] };
export const canPhoneChangeStatus = (from, to) => (PHONE_TRANSITIONS[from] || []).includes(to);

/** İstanbul saatine göre bugünün başlangıcı (Türkiye UTC+3, yaz saati uygulanmaz). */
export const istanbulDayStart = (now = new Date()) => {
  const local = new Date(now.getTime() + 3 * 3600 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * 3600 * 1000);
};

/** Günlük özet: iptaller sipariş sayısına ve ciroya katılmaz. */
export const summarizeOrders = (orders) => {
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  let revenue = 0;
  for (const order of orders) {
    if (order.status in byStatus) byStatus[order.status] += 1;
    if (order.status !== "İptal Edildi") revenue += Number(order.totalAmount) || 0;
  }
  return { count: orders.length - byStatus["İptal Edildi"], cancelled: byStatus["İptal Edildi"], revenue: money(revenue), byStatus };
};

/** Telefondaki "Bugün" ekranı: bugünün siparişleri (en yeni önce), onay bilgisiyle. */
export const listTodayOrders = async (db, { now = new Date(), limit = 200 } = {}) => {
  const since = istanbulDayStart(now);
  const orders = await db.collection("orders").find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(limit).toArray();
  const ids = orders.map((order) => String(order._id));
  const acks = ids.length ? await db.collection(ACKS_COLLECTION).find({ _id: { $in: ids } }).toArray() : [];
  const ackMap = new Map(acks.map((ack) => [String(ack._id), ack]));
  const userIds = orders.map((order) => order.user).filter(Boolean);
  const users = userIds.length
    ? await db.collection("users").find({ _id: { $in: userIds } }, { projection: { name: 1 } }).toArray()
    : [];
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  return {
    since: since.toISOString(),
    summary: summarizeOrders(orders),
    orders: orders.map((order) => {
      const ack = ackMap.get(String(order._id));
      return {
        ...toAlarmOrder(order, names.get(String(order.user))),
        ack: ack ? { action: ack.action, deviceName: ack.deviceName, at: ack.at } : null,
      };
    }),
  };
};

// ─── Uzun bekletme (long-poll) ───────────────────────────────────

const waiters = new Set();

/** Yeni sipariş kaydedildiğinde çağrılır (order.service). Bu süreçte bekleyen telefonlar hemen yeniden bakar. */
export const signalOrderAlarm = () => {
  for (const wake of [...waiters]) wake();
};

const nap = (ms) => new Promise((resolve) => {
  let timer;
  const finish = () => {
    clearTimeout(timer);
    waiters.delete(onSignal);
    resolve();
  };
  // Sinyal gelince siparişin "oturması" (SETTLE_MS) beklenir, sonra liste yeniden okunur.
  const onSignal = () => {
    waiters.delete(onSignal);
    clearTimeout(timer);
    timer = setTimeout(finish, SETTLE_MS + 300);
  };
  timer = setTimeout(finish, Math.max(0, ms));
  waiters.add(onSignal);
});

/**
 * Liste telefonun bildiğinden farklı olana ya da süre dolana kadar bekler.
 * `load` her çağrıda güncel listeyi döndürür; `isClosed` bağlantı kapandıysa true döner.
 */
export const waitForPendingChange = async (load, knownIds, { waitSeconds = 0, isClosed = () => false, recheckMs = RECHECK_MS } = {}) => {
  const known = pendingKey(knownIds);
  let orders = await load();
  const deadline = Date.now() + waitSeconds * 1000;
  while (pendingKey(orders.map((order) => order.id)) === known && Date.now() < deadline && !isClosed()) {
    await nap(Math.min(recheckMs, deadline - Date.now()));
    if (isClosed()) break;
    orders = await load();
  }
  return orders;
};

export const waiterCount = () => waiters.size;
