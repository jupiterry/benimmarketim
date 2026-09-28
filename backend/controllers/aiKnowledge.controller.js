import AiKnowledge from "../models/aiKnowledge.model.js";
import Settings from "../models/settings.model.js";

// Stable, user-facing facts taken from the actual photocopy flow and support UI.
// Live values (prices, hours, campaigns, stock and order status) intentionally
// stay in the existing live-data tools and are never copied into this catalog.
const STARTER_KNOWLEDGE = [
  { title: "Fotokopi için hangi dosyaları yükleyebilirim?", category: "Fotokopi", content: "Fotokopi sayfasından PDF, JPG/JPEG, PNG, GIF, BMP, TIFF, Word, Excel, PowerPoint ve metin dosyaları yükleyebilirsiniz. Dosya başına üst sınır 50 MB'dır.", keywords: ["fotokopi", "dosya", "format", "pdf", "word", "excel", "yükleme"], priority: 30 },
  { title: "Fotokopi siparişinde hangi seçenekler var?", category: "Fotokopi", content: "Yükleme sırasında kopya adedini, siyah-beyaz veya renkli baskıyı ve A4, A3, A5 ya da Letter kâğıt boyutunu seçebilirsiniz.", keywords: ["fotokopi", "renkli", "siyah beyaz", "kağıt", "boyut", "kopya"], priority: 25 },
  { title: "Fotokopi dosyamı nasıl yüklerim?", category: "Fotokopi", content: "Fotokopi sayfasını açıp desteklenen dosyanızı seçin; ardından kopya adedi, baskı rengi ve kâğıt boyutunu belirleyerek yüklemeyi tamamlayın. Dosya yüklemek için hesabınızla giriş yapmanız gerekir.", keywords: ["fotokopi", "dosya yükleme", "belge", "çıktı", "giriş"], priority: 25 },
  { title: "Sipariş durumumu nereden takip edebilirim?", category: "Sipariş", content: "Sipariş durumunuzu hesabınızdaki Siparişlerim bölümünden takip edebilirsiniz. Asistan, isterseniz bu sohbet sırasında da hesabınızdaki siparişleri kontrol edebilir.", keywords: ["sipariş", "takip", "durum", "siparişim nerede"], priority: 20 },
  { title: "Canlı destek ekibine nasıl ulaşırım?", category: "Hizmetler", content: "Bu sohbetten canlı destek veya yetkili istediğinizi yazın; görüşmeniz destek ekibine aktarılır.", keywords: ["canlı destek", "yetkili", "müşteri hizmetleri", "temsilci", "insan"], priority: 20 },
];

export const seedKnowledge = async (_req, res) => {
  let added = 0;
  for (const item of STARTER_KNOWLEDGE) {
    const result = await AiKnowledge.updateOne(
      { title: item.title },
      { $setOnInsert: { ...item, isActive: true } },
      { upsert: true },
    );
    if (result.upsertedCount) added += 1;
  }
  const total = await AiKnowledge.countDocuments({ title: { $in: STARTER_KNOWLEDGE.map(({ title }) => title) } });
  res.json({ success: true, added, total });
};

const cleanKeywords = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split(",")).map((item) => String(item).trim().toLocaleLowerCase("tr-TR")).filter(Boolean))].slice(0, 30);
const payload = (body) => ({
  title: String(body.title || "").trim(), category: String(body.category || "Genel").trim(),
  content: String(body.content || "").trim(), keywords: cleanKeywords(body.keywords),
  isActive: body.isActive !== false, priority: Math.max(0, Math.min(Number(body.priority) || 0, 100)),
});

export const listKnowledge = async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.active === "true") filter.isActive = true;
  const rows = await AiKnowledge.find(filter).sort({ priority: -1, updatedAt: -1 }).lean();
  res.json({ success: true, knowledge: rows });
};

export const createKnowledge = async (req, res) => {
  const data = payload(req.body);
  if (!data.title || !data.content) return res.status(400).json({ message: "Başlık ve içerik zorunludur." });
  const row = await AiKnowledge.create(data);
  res.status(201).json({ success: true, knowledge: row });
};

export const updateKnowledge = async (req, res) => {
  const data = payload(req.body);
  if (!data.title || !data.content) return res.status(400).json({ message: "Başlık ve içerik zorunludur." });
  const row = await AiKnowledge.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!row) return res.status(404).json({ message: "Bilgi kaydı bulunamadı." });
  res.json({ success: true, knowledge: row });
};

export const toggleKnowledge = async (req, res) => {
  const row = await AiKnowledge.findByIdAndUpdate(req.params.id, { $set: { isActive: Boolean(req.body.isActive) } }, { new: true });
  if (!row) return res.status(404).json({ message: "Bilgi kaydı bulunamadı." });
  res.json({ success: true, knowledge: row });
};

export const deleteKnowledge = async (req, res) => {
  const row = await AiKnowledge.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ message: "Bilgi kaydı bulunamadı." });
  res.json({ success: true });
};

export const getAiConfig = async (req, res) => {
  const settings = await Settings.getSettings();
  res.json({ success: true, config: settings.ai });
};

export const updateAiConfig = async (req, res) => {
  const allowedProviders = ["groq", "openrouter", "gemini"];
  const provider = allowedProviders.includes(req.body.provider) ? req.body.provider : (process.env.AI_DEFAULT_PROVIDER || "openrouter");
  const config = { enabled: req.body.enabled !== false, provider, model: String(req.body.model || "").trim(), maxHistoryMessages: Math.max(2, Math.min(Number(req.body.maxHistoryMessages) || 12, 30)) };
  if (!config.model) return res.status(400).json({ message: "Model adı zorunludur." });
  const settings = await Settings.getSettings();
  settings.ai = config;
  await settings.save();
  res.json({ success: true, config: settings.ai });
};
