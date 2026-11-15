/* global Intl */
// Tek seferlik bildirim ekranının bağımlılıksız yardımcıları: İstanbul saati, "Ne zaman" seçenekleri, saat
// uyarıları ve sonuç metinleri. React ya da tarayıcı API'si kullanmaz (backend/tests/push-schedule-ui.test.js sınar).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Türkiye yıl boyu UTC+3'tür (yaz saati yok). Bilgisayarın saat dilimi ne olursa olsun girdiler İstanbul saatidir.
export const TR_OFFSET = 3 * HOUR;
export const TITLE_LIMIT = 60;
export const BODY_LIMIT = 180;
// Deneme gönderimi: kitle adı geriye uyumluluk için "self"
export const TEST_AUDIENCE = "self";
// Müşteriler ekranından seçili kişilere gönderilen bildirim
export const CUSTOM_AUDIENCE = "custom";
// Sunucu listeyi gönderir; yanıt gelene kadar (ve eski sunucuda) bu liste kullanılır
export const DEFAULT_ZONES = [
  { id: "", label: "Tümü" },
  { id: "girlsDorm", label: "Kız yurdu" },
  { id: "boysDorm", label: "Erkek yurdu" },
  { id: "devrek", label: "Devrek (adres)" },
];
export const DEFAULT_LIMITS = { maxScheduled: 20, maxScheduleDays: 30 };
export const WHEN_OPTIONS = [
  { id: "now", label: "Şimdi" },
  { id: "today", label: "Bugün 20:30" },
  { id: "tomorrow", label: "Yarın 12:00" },
  { id: "custom", label: "Tarih ve saat seç" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const msOf = (value) => (value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime());

/** <input type="datetime-local"> değeri (İstanbul saati) */
export const toTrInput = (value) => {
  const ms = msOf(value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + TR_OFFSET);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
/** İstanbul saatiyle girilen "YYYY-MM-DDTHH:mm" → ms (geçersizse NaN) */
export const fromTrInput = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!m) return NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - TR_OFFSET;
  // 31 Şubat gibi var olmayan tarih başka bir güne kaymasın
  return toTrInput(ms) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` ? ms : NaN;
};
/** İstanbul'da o günün 00:00'ı */
export const trMidnight = (value) => {
  const ms = msOf(value);
  return Math.floor((ms + TR_OFFSET) / DAY) * DAY - TR_OFFSET;
};
/** İstanbul saatiyle günün dakikası (0–1439) */
export const trMinutesOfDay = (value) => Math.floor((((msOf(value) + TR_OFFSET) % DAY) + DAY) % DAY / MINUTE);

const TR_DATE = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", weekday: "short" });
const TR_CLOCK = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "15 Kas Paz 20:30"; bugün / yarın ise "Bugün 20:30", "Yarın 12:00" (hep İstanbul saati) */
export const formatWhen = (value, now = Date.now()) => {
  const ms = msOf(value);
  if (!Number.isFinite(ms)) return "–";
  const clock = TR_CLOCK.format(new Date(ms));
  const days = Math.round((trMidnight(ms) - trMidnight(now)) / DAY);
  if (days === 0) return `Bugün ${clock}`;
  if (days === 1) return `Yarın ${clock}`;
  if (days === -1) return `Dün ${clock}`;
  return `${TR_DATE.format(new Date(ms))} ${clock}`;
};

/** "Ne zaman" seçiminin anı (ms). "now" → null; geçersiz özel tarih → NaN */
export const resolveWhen = (when, custom, now = Date.now()) => {
  if (when === "today") return trMidnight(now) + 20 * HOUR + 30 * MINUTE;
  if (when === "tomorrow") return trMidnight(now) + DAY + 12 * HOUR;
  if (when === "custom") return fromTrInput(custom);
  return null;
};

/** Planlanan zaman kabul edilebilir mi? Sorun varsa yöneticiye gösterilecek metin, yoksa "" */
export const scheduleProblem = (ms, now = Date.now(), limits = DEFAULT_LIMITS) => {
  if (ms === null) return "";
  if (!Number.isFinite(ms)) return "Tarih ve saat seçin.";
  // Sunucu en az 1 dakika ister; onay penceresinde geçen süre için pay bırakılır
  if (ms < now + 2 * MINUTE) return "Bu saat geçti ya da çok yakın. İleri bir saat seçin ya da “Şimdi” ile hemen gönderin.";
  const days = Number(limits?.maxScheduleDays) || DEFAULT_LIMITS.maxScheduleDays;
  if (ms > now + days * DAY) return `Bildirim en fazla ${days} gün sonrasına planlanabilir.`;
  return "";
};

const clockOf = (minutes) => `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`;
const clockToMinutes = (value) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};
/** Sipariş saatleri (Ayarlar): { start, end, alwaysOpen } dakika olarak. 00:00 kapanış gün sonudur; gece yarısını aşabilir. */
export const orderHoursRange = (hours) => {
  if (!hours) return null;
  const start = (Number(hours.startHour) || 0) * 60 + (Number(hours.startMinute) || 0);
  let end = (Number(hours.endHour) || 0) * 60 + (Number(hours.endMinute) || 0);
  if (end === 0 && start !== 0) end = 24 * 60;
  return { start, end, alwaysOpen: start === end || (start === 0 && end === 24 * 60) };
};
const withinRange = (minute, start, end) => (start < end ? minute >= start && minute < end : minute >= start || minute < end);

/**
 * Gönderim saati için uyarılar (engellemez): sipariş saatleri dışında mı, otomatik bildirimlerin gönderim
 * aralığı dışında mı? ms null ise şu an için denetlenir.
 */
export const sendTimeWarnings = (ms, { orderHours, sendWindow } = {}, now = Date.now()) => {
  const at = ms === null || ms === undefined ? now : ms;
  if (!Number.isFinite(at)) return [];
  const minute = trMinutesOfDay(at);
  const when = ms === null || ms === undefined ? "Şu an" : "Seçilen saat";
  const warnings = [];
  const range = orderHoursRange(orderHours);
  if (range && !range.alwaysOpen && !withinRange(minute, range.start, range.end)) {
    warnings.push(`${when} sipariş saatlerinin (${clockOf(range.start)}–${clockOf(range.end)}) dışında: bildirime dokunan müşteri o an sipariş veremez.`);
  }
  const start = clockToMinutes(sendWindow?.start);
  const end = clockToMinutes(sendWindow?.end);
  if (start !== null && end !== null && start < end && !(minute >= start && minute < end)) {
    warnings.push(`${when} otomatik bildirimlerin gönderim aralığının (${sendWindow.start}–${sendWindow.end}) dışında: bu saatte gelen bildirim müşteriyi rahatsız edebilir.`);
  }
  return warnings;
};

/** "3 dk önce", "5 saat önce", "2 gün önce" */
export const agoLabel = (value, now = Date.now()) => {
  const ms = msOf(value);
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.max(0, Math.round((now - ms) / MINUTE));
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.round(hours / 24)} gün önce`;
};

/** Aynı kitle + bölgeye son gönderim uyarısı; 24 saatten yeniyse sık bildirim uyarısı da eklenir */
export const lastSendHint = (lastSentAt, now = Date.now()) => {
  const ms = msOf(lastSentAt);
  if (!lastSentAt || !Number.isFinite(ms)) return null;
  const recent = now - ms < DAY;
  return {
    recent,
    text: `Bu kitleye son gönderim: ${agoLabel(ms, now)}.${recent ? " Sık gelen bildirim, müşterilerin bildirimleri kapatmasına yol açabilir." : ""}`,
  };
};

const lira = (value) => `₺${Math.round(Number(value) || 0).toLocaleString("tr-TR")}`;
const count = (value) => (Number(value) || 0).toLocaleString("tr-TR");

/**
 * Geçmiş satırındaki sonuç metni: "24 saatte 14 sipariş · 72 saatte 31 sipariş · ₺8.420".
 * Pencere dolmadan "ölçülüyor" denir ve şu ana kadarki sayı gösterilir. Sayılar yalnızca bildirimi alanların
 * bildirimden SONRA verdiği siparişlerdir (bildirim sayesinde verildiği anlamına gelmez).
 * @returns {{ text: string, title: string, pending: boolean } | null}
 */
export const describeResult = (result) => {
  if (!result) return null;
  if (result.state === "unavailable") {
    return { text: "sonuç ölçülemiyor", title: "Bu gönderimin alıcıları saklanmadı (eski kayıt ya da 5.000 kişiden büyük gönderim); bildirimden sonra verilen siparişler sayılamıyor.", pending: false };
  }
  if (result.state !== "final" && result.state !== "measuring") return null;
  const parts = [];
  if (result.done24) parts.push(`24 saatte ${count(result.orders24)} sipariş`);
  else parts.push(`24 saat ölçülüyor (şu ana kadar ${count(result.orders24)} sipariş)`);
  if (result.done72) parts.push(`72 saatte ${count(result.orders72)} sipariş`);
  else if (result.done24) parts.push(`72 saat ölçülüyor (şu ana kadar ${count(result.orders72)} sipariş)`);
  if (Number(result.revenue72) > 0 || result.done72) parts.push(lira(result.revenue72));
  return {
    text: parts.join(" · "),
    title: `Bildirimi alanlardan bildirimden sonra sipariş verenler: 24 saatte ${count(result.buyers24)} kişi, 72 saatte ${count(result.buyers72)} kişi. Tutar, bu siparişlerin ürün toplamıdır. Siparişin bildirim sayesinde verildiği anlamına gelmez.`,
    pending: !result.done72,
  };
};

// Geçmiş satırının durumu: rozet metni ve renk (ok | bad | wait)
const FAILURE_LABELS = {
  no_devices: "Kayıtlı cihaz yok",
  auth: "Anahtar reddedildi",
  rejected: "OneSignal reddetti",
  network: "Bağlantı hatası",
  not_configured: "Yapılandırılmamış",
  error: "Sunucu hatası",
  push_disabled: "Bildirimler kapalı",
  no_audience: "Kitlede kimse yoktu",
  invalid_audience: "Geçersiz kitle",
  interrupted: "Yarıda kaldı (bir kısmı gitmiş olabilir)",
  missed: "Kaçtı: sunucu kapalıydı, gönderilmedi",
};
export const failureLabel = (reason) => FAILURE_LABELS[reason] || "Başarısız";
/** Eski kayıtlarda status yoktur: sent true → gönderildi, değilse başarısız */
export const historyState = (item) => {
  const status = item?.status || (item?.sent ? "sent" : "failed");
  if (status === "sent" || (item?.sent && status !== "sending")) return { tone: "ok", badge: "ui-badge--ok", label: "Gönderildi" };
  if (status === "sending") return { tone: "wait", badge: "ui-badge--info", label: "Gönderiliyor" };
  if (status === "missed") return { tone: "bad", badge: "ui-badge--warn", label: failureLabel("missed") };
  return { tone: "bad", badge: "ui-badge--danger", label: failureLabel(item?.failureReason) };
};
