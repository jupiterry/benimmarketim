// Geri bildirim seçenekleri tek yerde. Kimlikler mobil uygulamada (order_feedback_sheet.dart,
// quick_feedback_sheet.dart, orders_page.dart) ve panelde (FeedbackList.jsx, SatisfactionReport.jsx) aynı tutulmalı.

/** Detaylı anket (1., 3. ve 5. teslim edilen sipariş) */
export const FEEDBACK_MILESTONES = [1, 3, 5];
/** Eski sürümde sorulan taşlar; raporda ve eski kayıtlarda tanınır */
export const LEGACY_MILESTONES = [15];

export const FEEDBACK_TAGS = {
  hizli: "Hızlı geldi", taze: "Ürünler tazeydi", kurye: "Kurye nazikti", fiyat: "Fiyatlar uygundu", kolay: "Uygulama kolaydı",
  gec: "Geç geldi", eksik: "Eksik ürün vardı", yanlis: "Yanlış ürün geldi", bozuk: "Ürün bozuk/ezikti", pahali: "Fiyatlar yüksekti",
  uygulama: "Uygulamada sorun yaşadım", kurye_kotu: "Kurye ilgisizdi", paket: "Paketleme kötüydü",
};
export const POSITIVE_TAGS = ["hizli", "taze", "kurye", "fiyat", "kolay"];

/** Ürün bazında sorun: siparişteki ürün işaretlenir */
export const ISSUE_TYPES = { bozuk: "Bozuk / ezik", eksik: "Eksik geldi", yanlis: "Yanlış ürün" };

/** Sipariş iptal nedeni */
export const CANCEL_REASONS = {
  gec: "Teslimat çok uzun sürecek",
  fikir: "Fikrimi değiştirdim",
  yanlis_siparis: "Yanlış/eksik sipariş verdim",
  fiyat: "Fiyat yüksek geldi",
  baska_yer: "Başka yerden aldım",
  bolge_disi: "Adresime teslimat yok",
  ucret_yuksek: "Teslimat ücreti yüksek",
  diger: "Diğer",
};

/**
 * "Teslim edilemedi" nedeni (yönetici işaretler; sipariş iptal edilir). Müşteriye
 * "Teslim edilemedi: <etiket>" olarak gösterilir (GET /api/orders-analytics/user-orders → deliveryOutcomeLabel).
 */
export const DELIVERY_OUTCOMES = {
  adres_bulunamadi: "Adres bulunamadı",
  cevap_yok: "Müşteriye ulaşılamadı",
  reddetti: "Müşteri teslim almadı",
  diger: "Diğer",
};
export const DELIVERY_OUTCOME_NOTE_MAX = 200;
/** Müşteri metni: "Teslim edilemedi: Adres bulunamadı" ya da "" */
export const deliveryOutcomeText = (outcome) => {
  const label = outcome?.code ? outcome.label || DELIVERY_OUTCOMES[outcome.code] || "" : "";
  return label ? `Teslim edilemedi: ${label}` : "";
};

/** Sepeti boşaltan müşteriye sorulan "Neden vazgeçtin?" */
export const ABANDON_REASONS = {
  fiyat: "Fiyatlar yüksek",
  teslimat: "Teslimat süresi uzun",
  urun_yok: "Aradığım ürün yok",
  minimum: "Minimum sepet tutarı yüksek",
  sonra: "Sonra sipariş vereceğim",
  diger: "Diğer",
};

export const LOW_RATING = 3; // Bu puan ve altı şikâyet sayılır
export const SUPPORT_RATING = 2; // Bu puan ve altında destek kaydı açılır
export const NPS_INTERVAL_DAYS = 30;
export const NPS_MIN_DELIVERED = 2;
export const QUICK_WINDOW_DAYS = 3; // Hızlı soru en fazla bu kadar gün önce teslim edilen sipariş için sorulur
export const ABANDON_INTERVAL_DAYS = 7;

export const labelsOf = (map, ids = []) => ids.map((id) => map[id]).filter(Boolean);
export const pickKnown = (map, values, max = 6) =>
  (Array.isArray(values) ? [...new Set(values.map(String))] : []).filter((id) => map[id]).slice(0, max);
