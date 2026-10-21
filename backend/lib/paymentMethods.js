/**
 * Sipariş ödeme yöntemleri (mobil uygulamada sipariş verirken seçilir).
 * Anahtarlar veritabanına yazılır; etiketler yönetici paneli, sipariş alarmı
 * ve bildirimlerde gösterilir.
 */
export const PAYMENT_METHODS = {
  cash: "Kapıda nakit",
  card: "Kapıda kart (POS)",
  bank_transfer: "Havale / EFT",
};

export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS);

/** Geçerli bir anahtarsa onu, değilse null döndürür. */
export const normalizePaymentMethod = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return PAYMENT_METHOD_KEYS.includes(key) ? key : null;
};

/** Ödeme yönteminin okunur etiketi; seçilmemiş eski siparişler için "Belirtilmedi". */
export const paymentMethodLabel = (value) => PAYMENT_METHODS[value] || "Belirtilmedi";
