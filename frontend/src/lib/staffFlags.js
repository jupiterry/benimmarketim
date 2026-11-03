// Personelin müşteri hakkındaki iç işaretleri (yalnızca panel). Anahtarlar backend/lib/staffFlags.js ile aynıdır.
// tone: ui-badge / so-chip tonları (warn | info | danger)
export const STAFF_FLAGS = [
  { key: "call_before", label: "Siparişten önce ara", short: "Önce ara", tone: "warn" },
  { key: "hard_address", label: "Adres tarifi zor", short: "Zor adres", tone: "info" },
  { key: "pays_card", label: "Kapıda kartla öder", short: "Kartla öder", tone: "info" },
  { key: "complaint_history", label: "Şikâyet geçmişi var", short: "Şikâyet geçmişi", tone: "danger" },
];
export const STAFF_FLAG_BY_KEY = Object.fromEntries(STAFF_FLAGS.map((flag) => [flag.key, flag]));
export const STAFF_NOTE_MAX = 500;

/** Anahtar dizisi → işaret tanımları (bilinmeyenler atılır, sıra STAFF_FLAGS'teki gibi) */
export const staffFlagsOf = (keys) => {
  const set = new Set(Array.isArray(keys) ? keys : []);
  return STAFF_FLAGS.filter((flag) => set.has(flag.key));
};
