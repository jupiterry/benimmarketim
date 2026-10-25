// Otomatik bildirimler — yönetici uç noktaları (/api/notification-automations, yalnızca yönetici).
// Ayar değişiklikleri (test alıcısı dahil) ve test gönderimleri recordAdminAction ile işlem kaydına yazılır.
import { recordAdminAction } from "../services/adminAudit.service.js";
import { isPushConfigured } from "../services/push.service.js";
import {
  AUTOMATION_LABELS,
  AUTOMATION_TYPES,
  BODY_LIMIT,
  DEFAULT_AUTOMATION_SETTINGS,
  PLACEHOLDERS,
  SELF_RECIPIENT_LABEL,
  TEST_RECIPIENT_LABEL,
  TITLE_LIMIT,
  describeTestSend,
  findTestRecipient,
  getAutomationSettings,
  getAutomationStats,
  getLastAutomationTick,
  previewAutomation,
  recipientLabel,
  resolveTestRecipient,
  saveAutomationSettings,
  sendAutomationTest,
  toTestRecipient,
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

// GET /settings — testRecipient: kayıtlı test alıcısı (yoksa null → testler isteyen yöneticiye gider);
// testRecipientSelf: isteyen yönetici (panel "Kendim" seçeneğinde bildirim alıp alamayacağını gösterir)
export const getSettings = async (req, res) => {
  const settings = await getAutomationSettings();
  const stored = settings.testRecipientId ? await findTestRecipient(settings.testRecipientId) : null;
  res.json({
    success: true,
    settings,
    testRecipient: toTestRecipient(stored),
    testRecipientMissing: Boolean(settings.testRecipientId && !stored),
    testRecipientSelf: toTestRecipient(req.user),
    configured: isPushConfigured(),
    meta: meta(),
  });
};

// PUT /settings — kısmi güncelleme (yalnızca gönderilen alanlar değişir).
// testRecipientId: 24 haneli kullanıcı kimliği (hesap var olmalı) ya da null (kendim).
export const updateSettings = async (req, res) => {
  const current = await getAutomationSettings();
  const { error, data, changes } = validateAutomationSettingsInput(req.body, current);
  if (error) return res.status(400).json({ success: false, message: error });
  const recipientChanged = data.testRecipientId !== current.testRecipientId;
  let recipient = null;
  if (data.testRecipientId && (recipientChanged || req.body?.testRecipientId !== undefined)) {
    recipient = await findTestRecipient(data.testRecipientId);
    if (!recipient) return res.status(404).json({ success: false, message: "Test alıcısı bulunamadı; hesap silinmiş olabilir" });
  }
  if (recipientChanged) {
    // İşlem kaydında kimlik yerine hesap adı görünsün
    const previous = current.testRecipientId ? await findTestRecipient(current.testRecipientId) : null;
    const entry = changes.find((change) => change.label === TEST_RECIPIENT_LABEL);
    if (entry) {
      entry.from = current.testRecipientId ? (previous ? recipientLabel(previous) : "Silinmiş hesap") : SELF_RECIPIENT_LABEL;
      entry.to = recipient ? recipientLabel(recipient) : SELF_RECIPIENT_LABEL;
    }
  }
  const settings = await saveAutomationSettings(data, req.user?._id || null);
  if (changes.length) {
    const toggled = AUTOMATION_TYPES.filter((type) => current[type].enabled !== settings[type].enabled);
    const onlyRecipient = recipientChanged && changes.length === 1;
    const action = toggled.length === 1
      ? `Otomatik bildirim ${settings[toggled[0]].enabled ? "açıldı" : "kapatıldı"}`
      : onlyRecipient ? "Test bildirimi alıcısı değiştirildi" : "Otomatik bildirim ayarları değiştirildi";
    recordAdminAction(req, {
      action,
      category: "campaign",
      target: toggled.length === 1 ? toggled[0] : "notification-automations",
      targetName: toggled.length === 1 ? AUTOMATION_LABELS[toggled[0]] : onlyRecipient ? "Test bildirimi alıcısı" : "Otomatik bildirimler",
      changes,
    });
  } else {
    req.auditRecorded = true; // değişiklik yok: genel yakalayıcı da yazmasın
  }
  const body = { success: true, settings, changed: changes.length, message: changes.length ? "Kaydedildi" : "Değişiklik yok" };
  // Test alıcısı istekte varsa güncel özeti de döner (panel iki yerde aynı alıcıyı gösterir)
  if (req.body?.testRecipientId !== undefined) {
    body.testRecipient = toTestRecipient(recipient);
    body.testRecipientSelf = toTestRecipient(req.user);
  }
  res.json(body);
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

// POST /:type/test — test alıcısının telefonuna, alıcının adı ve örnek değerlerle.
// Alıcı: gövdedeki recipientId > kayıtlı test alıcısı > isteyen yönetici. Sıklık sınırı isteyen yönetici başınadır.
export const testType = async (req, res) => {
  const type = typeFrom(req, res);
  if (!type) return undefined;
  if (!isPushConfigured()) return res.status(503).json({ success: false, message: "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)" });
  const key = String(req.user._id);
  const last = lastTestAt.get(key) || 0;
  if (Date.now() - last < TEST_GAP_MS) return res.status(429).json({ success: false, message: "Birkaç saniye bekleyip yeniden deneyin" });
  lastTestAt.set(key, Date.now());
  let result;
  let recipient;
  try {
    const settings = await getAutomationSettings();
    ({ user: recipient } = await resolveTestRecipient({ recipientId: req.body?.recipientId, requester: req.user, settings }));
    result = await sendAutomationTest(type, recipient, { override: req.body?.config, settings });
  } catch (error) {
    lastTestAt.delete(key);
    if (error.status === 400 || error.status === 404) return res.status(error.status).json({ success: false, message: error.message });
    throw error;
  }
  const outcome = describeTestSend(result, recipient);
  recordAdminAction(req, {
    action: "Otomatik bildirim testi gönderildi",
    category: "campaign",
    target: type,
    targetName: AUTOMATION_LABELS[type],
    changes: [
      { label: "Alıcı", from: "—", to: recipientLabel(recipient) },
      { label: "Sonuç", from: "—", to: result.sent ? "Gönderildi" : result.reason || "Gönderilemedi" },
    ],
  });
  const summary = toTestRecipient(recipient);
  if (outcome.success) return res.json({ success: true, message: outcome.message, preview: result.message, recipient: summary });
  return res.status(outcome.status).json({ success: false, reason: outcome.reason, message: outcome.message, preview: result.message, recipient: summary });
};
