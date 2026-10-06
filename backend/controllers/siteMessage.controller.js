import mongoose from "mongoose";
import SiteMessage from "../models/siteMessage.model.js";

// Formlarda seçilebilen konular; sunucu yalnızca bunları kabul eder.
export const SITE_MESSAGE_TOPICS = {
  contact: ["siparis", "teslimat", "iade", "urun", "genel", "sikayet", "oneri"],
  kvkk: ["bilgi", "erisim", "duzeltme", "silme", "itiraz", "diger"],
};
const STATUSES = ["new", "in_progress", "done"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[0-9+()\s-]{7,20}$/;
const clean = (value) => String(value ?? "").trim();

export const validateSiteMessage = (body = {}) => {
  const kind = clean(body.kind);
  if (!SITE_MESSAGE_TOPICS[kind]) return { error: "Geçersiz form türü" };
  const data = { kind, name: clean(body.name), email: clean(body.email).toLowerCase(), phone: clean(body.phone), topic: clean(body.topic), message: clean(body.message) };
  if (data.name.length < 3 || data.name.length > 80) return { error: "Ad soyad 3-80 karakter olmalıdır" };
  if (data.email.length > 120 || !EMAIL.test(data.email)) return { error: "Geçerli bir e-posta adresi girin" };
  if (data.phone && !PHONE.test(data.phone)) return { error: "Geçerli bir telefon numarası girin" };
  if (kind === "kvkk" && !data.phone) return { error: "Kimliğinizi doğrulayabilmemiz için telefon numarası gereklidir" };
  if (!SITE_MESSAGE_TOPICS[kind].includes(data.topic)) return { error: "Lütfen bir konu seçin" };
  if (data.message.length < 10 || data.message.length > 2000) return { error: "Mesaj 10-2000 karakter olmalıdır" };
  return { data };
};

// Herkese açık: iletişim mesajı veya KVKK başvurusu oluşturur
export const createSiteMessage = async (req, res) => {
  // Botların doldurduğu gizli alan: kayıt oluşturmadan başarılı görün
  if (clean(req.body?.website)) return res.status(201).json({ success: true });
  const { data, error } = validateSiteMessage(req.body);
  if (error) return res.status(400).json({ success: false, message: error });
  const record = await SiteMessage.create(data);
  req.app.get("io")?.to("adminRoom").emit("siteMessageCreated", { id: String(record._id), kind: record.kind, name: record.name, topic: record.topic });
  res.status(201).json({ success: true, reference: String(record._id).slice(-6).toUpperCase() });
};

// Yönetici: kayıtları listeler
export const listSiteMessages = async (req, res) => {
  const filter = {};
  if (SITE_MESSAGE_TOPICS[req.query.kind]) filter.kind = req.query.kind;
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const [messages, openCounts] = await Promise.all([
    SiteMessage.find(filter).sort({ createdAt: -1 }).limit(200).populate("handledBy", "name").lean(),
    Promise.all(Object.keys(SITE_MESSAGE_TOPICS).map(async (kind) => [kind, await SiteMessage.countDocuments({ kind, status: { $ne: "done" } })])),
  ]);
  res.json({ success: true, messages, open: Object.fromEntries(openCounts) });
};

// Yönetici: kaydın durumunu günceller
export const updateSiteMessageStatus = async (req, res) => {
  const status = clean(req.body?.status);
  if (!mongoose.isValidObjectId(req.params.id) || !STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Geçersiz istek" });
  const message = await SiteMessage.findByIdAndUpdate(req.params.id, { $set: { status, handledBy: req.user._id, handledAt: new Date() } }, { new: true }).populate("handledBy", "name").lean();
  if (!message) return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });
  res.json({ success: true, message });
};
