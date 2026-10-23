// Satıcı / veri sorumlusu bilgileri: tüm yasal sayfalar (Mesafeli Satış, KVKK, Gizlilik, Kullanım
// Şartları, İade, İletişim, SSS) bu dosyadan okur. Köşeli parantezli ve "XXX" içeren değerler
// henüz bilinmeyen bilgilerin yer tutucularıdır; gerçek bilgi gelince yalnızca burayı doldurun.
export const company = {
  brand: "Benim Marketim",
  legalName: "Benim Marketim Ticaret Limited Şirketi",
  address: "[Şirket Adresi]",
  taxOffice: "[Vergi Dairesi]",
  taxNumber: "[Vergi Numarası]",
  mersisNumber: "[MERSİS Numarası]",
  phone: "+90 (XXX) XXX XX XX",
  // tel: bağlantısı için boşluksuz biçim
  phoneHref: "tel:+90XXXXXXXXXX",
  email: "info@benimmarketim.com",
  supportEmail: "destek@benimmarketim.com",
  kvkkEmail: "kvkk@benimmarketim.com",
  // Mağaza (hizmet noktası) adresi; ana sayfa ve kategori sayfalarında da bu adres yazar.
  storeAddress: "Ağalar Mahallesi, 760. Sokak, TOKİ Konutları, No: 19 Devrek / Zonguldak",
  city: "Devrek, Zonguldak",
  website: "devrekbenimmarketim.com",
};

// Değer hâlâ yer tutucu mu? (Sayfalarda vurgulamak ya da bağlantıyı gizlemek için.)
export const isPlaceholder = (value) => /^\[.*\]$/.test(String(value || "")) || /X{3}/.test(String(value || ""));

// Sitedeki teslimat ve sipariş metinlerinin ortak ifadeleri.
export const DELIVERY_AREA_TEXT = "Teslimat bölgeleri sayfasında listelenen bölgeler";
export const DELIVERY_ZONES_PATH = "/teslimat-bolgeleri";

// Mobil uygulama mağaza bağlantıları (siparişler yalnızca uygulamadan verilir).
export const appStores = [
  { id: "apple", name: "App Store", url: "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr" },
  { id: "google", name: "Google Play", url: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app" },
];

// Sipariş saatleri metni (GET /api/settings → orderStart/EndHour/Minute). Uygulama aynı saatleri kullanır.
const pad = (value) => String(Number(value) || 0).padStart(2, "0");
export const orderHoursText = (settings = {}) => {
  const { orderStartHour = 10, orderStartMinute = 0, orderEndHour = 1, orderEndMinute = 0 } = settings || {};
  return `${pad(orderStartHour)}:${pad(orderStartMinute)} – ${pad(orderEndHour)}:${pad(orderEndMinute)}`;
};
