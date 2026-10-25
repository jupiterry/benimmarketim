// Otomatik bildirimler — yönetici uç noktaları (/api/notification-automations, yalnızca yönetici).
// Ayar değişiklikleri ve test gönderimleri recordAdminAction ile işlem kaydına yazılır.
import { recordAdminAction } from "../services/adminAudit.service.js";
import { isPushConfigured } from "../services/push.service.js";
import {
  AUTOMATION_LABELS,
  AUTOMATION_TYPES,
  BODY_LIMIT,
  DEFAULT_AUTOMATION_SETTINGS,
  PLACEHOLDERS,
  TITLE_LIMIT,
  getAutomationSettings,
  getAutomationStats,
  getLastAutomationTick,
  previewAutomation,
  saveAutomationSettings,
  sendAutomationTest,
  validateAutomationSettingsInput,
} from "../services/notificationAutomation.service.js";

const TEST_GAP_MS = 10 * 1000;
const lastTestAt = new Map(); // yönetici başına test sıklığı (süreç içi)

const meta = () => ({
  types: AUTOMATION_TYPES,
  labels: AUTOMATION_LABELS,
  placeholders: PLACEHOLDERS,
  defaults: DEFAULT_AUTOMATION_SETTINGS,
  limits: { title: TITLE_LIMIT, body: BODY_LIMIT },
});

const typeFrom = (req, res) => {
  const type = String(req.params?.type || "");
  if (AUTOMATION_TYPES.includes(type)) return type;
  res.status(400).json({ success: false, message: "Geçersiz otomasyon türü" });
  return null;
};

// GET /settings
export const getSettings = async (_req, res) => {
  const settings = await getAutomationSettings();
  res.json({ success: true, settings, configured: isPushConfigured(), meta: meta() });
};

// PUT /settings — kısmi güncelleme (yalnızca gönderilen alanlar değişir)
export const updateSettings = async (req, res) => {
  const current = await getAutomationSettings();
  const { error, data, changes } = validateAutomationSettingsInput(req.body, current);
  if (error) return res.status(400).json({ success: false, message: error });
  const settings = await saveAutomationSettings(data, req.user?._id || null);
  if (changes.length) {
    const toggled = AUTOMATION_TYPES.filter((type) => current[type].enabled !== settings[type].enabled);
    const action = toggled.length === 1
      ? `Otomatik bildirim ${settings[toggled[0]].enabled ? "açıldı" : "kapatıldı"}`
      : "Otomatik bildirim ayarları değiştirildi";
    recordAdminAction(req, {
      action,
      category: "campaign",
      target: toggled.length === 1 ? toggled[0] : "notification-automations",
      targetName: toggled.length === 1 ? AUTOMATION_LABELS[toggled[0]] : "Otomatik bildirimler",
      changes,
    });
  } else {
    req.auditRecorded = true; // değişiklik yok: genel yakalayıcı da yazmasın
  }
  res.json({ success: true, settings, changed: changes.length, message: changes.length ? "Kaydedildi" : "Değişiklik yok" });
};

// GET /stats
export const getStats = async (_req, res) => {
  const stats = await getAutomationStats();
  res.json({ success: true, ...stats, configured: isPushConfigured(), lastTick: getLastAutomationTick() });
};

// POST /:type/preview — gönderim yapmaz; gövdede { config } verilirse kaydedilmemiş ayarla hesaplar
export const previewType = async (req, res) => {
  const type = typeFrom(req, res);
  if (!type) return undefined;
  // Salt okunur: işlem kaydına yazılmaz (genel yakalayıcı POST'u yanlış bölüm adıyla kaydetmesin)
  req.auditRecorded = true;
  try {
    const result = await previewAutomation(type, { override: req.body?.config });
    return res.json({ success: true, type, ...result });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    throw error;
  }
};

// POST /:type/test — yalnızca isteyen yöneticinin telefonuna, örnek değerlerle
export const testType = async (req, res) => {
  const type = typeFrom(req, res);
  if (!type) return undefined;
  if (!isPushConfigured()) return res.status(503).json({ success: false, message: "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)" });
  const key = String(req.user._id);
  const last = lastTestAt.get(key) || 0;
  if (Date.now() - last < TEST_GAP_MS) return res.status(429).json({ success: false, message: "Birkaç saniye bekleyip yeniden deneyin" });
  lastTestAt.set(key, Date.now());
  let result;
  try {
    result = await sendAutomationTest(type, req.user, { override: req.body?.config });
  } catch (error) {
    lastTestAt.delete(key);
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    throw error;
  }
  recordAdminAction(req, {
    action: "Otomatik bildirim testi gönderildi",
    category: "campaign",
    target: type,
    targetName: AUTOMATION_LABELS[type],
    changes: [{ label: "Sonuç", from: "—", to: result.sent ? "Gönderildi" : result.reason || "Gönderilemedi" }],
  });
  if (result.sent) return res.json({ success: true, message: "Test bildirimi telefonunuza gönderildi", preview: result.message });
  const message = result.reason === "no_devices"
    ? "Test bildirimi gönderilemedi: bu yönetici hesabıyla mobil uygulamada oturum açılmamış. Telefonunuzda uygulamaya bu hesapla girip bildirimlere izin verin."
    : !result.reason
      ? "Test bildirimi gönderilemedi: hesabınızda bildirimler ya da kampanya bildirimleri kapalı."
      : result.reason === "network"
        ? "OneSignal'a ulaşılamadı. Birkaç dakika sonra tekrar deneyin."
        : result.reason === "error"
          ? "Test bildirimi gönderilirken sunucu hatası oluştu. Birkaç dakika sonra tekrar deneyin."
          : "OneSignal bildirimi kabul etmedi. Sunucudaki OneSignal ayarlarını kontrol edin.";
  return res.status(result.reason === "error" ? 500 : result.reason === "network" || result.reason === "auth" || result.reason === "rejected" ? 502 : 422)
    .json({ success: false, reason: result.reason || "opted_out", message, preview: result.message });
};
