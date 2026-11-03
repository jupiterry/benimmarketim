// Personelin müşteri hakkındaki iç işaretleri ve notu.
// Yalnızca yönetici paneli görür; müşteriye dönen hiçbir yanıta girmez (user.model'de select: false).
// Anahtarlar sabittir; panel etiketleri frontend/src/lib/staffFlags.js ile aynı tutulur.
export const STAFF_FLAGS = Object.freeze([
  Object.freeze({ key: "call_before", label: "Siparişten önce ara" }),
  Object.freeze({ key: "hard_address", label: "Adres tarifi zor" }),
  Object.freeze({ key: "pays_card", label: "Kapıda kartla öder" }),
  Object.freeze({ key: "complaint_history", label: "Şikâyet geçmişi var" }),
]);
export const STAFF_FLAG_KEYS = Object.freeze(STAFF_FLAGS.map((flag) => flag.key));
export const STAFF_NOTE_MAX = 500;

/** Gelen değeri geçerli, tekrarsız işaret anahtarlarına çevirir (bilinmeyenler atılır) */
export const normalizeStaffFlags = (value) =>
  [...new Set((Array.isArray(value) ? value : []).map((item) => String(item)))].filter((key) => STAFF_FLAG_KEYS.includes(key));
