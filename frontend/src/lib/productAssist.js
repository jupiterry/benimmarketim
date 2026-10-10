// Fotoğraftan ürün ekleme (tek ve toplu) ekranlarının ortak yardımcıları.

// Mağaza kategorileri (CreateProductForm ve backend/services/productAssist.service.js ile aynı;
// değer = ürünün category alanı). Değişirse üç yerde birlikte güncellenmeli.
export const CATEGORIES = [
  { slug: "kahve", name: "Benim Kahvem" },
  { slug: "yiyecekler", name: "Yiyecekler" },
  { slug: "kahvalti", name: "Kahvaltılık Ürünler" },
  { slug: "gida", name: "Temel Gıda" },
  { slug: "meyve-sebze", name: "Meyve & Sebze" },
  { slug: "sut", name: "Süt & Süt Ürünleri" },
  { slug: "bespara", name: "Beş Para Etmeyen Ürünler" },
  { slug: "tozicecekler", name: "Toz İçecekler" },
  { slug: "cips", name: "Cips & Çerez" },
  { slug: "cayseker", name: "Çay ve Şekerler" },
  { slug: "atistirma", name: "Atıştırmalıklar" },
  { slug: "temizlik", name: "Temizlik & Hijyen" },
  { slug: "kisisel", name: "Kişisel Bakım" },
  { slug: "makarna", name: "Makarna ve Kuru Bakliyat" },
  { slug: "et", name: "Şarküteri & Et Ürünleri" },
  { slug: "icecekler", name: "Buz Gibi İçecekler" },
  { slug: "dondurulmus", name: "Dondurulmuş Gıdalar" },
  { slug: "baharat", name: "Baharatlar" },
  { slug: "dondurma", name: "Dondurmalar" },
];

export const categoryName = (slug) => CATEGORIES.find((category) => category.slug === slug)?.name || slug;

// Telefondan gelen büyük fotoğrafı yüklemeden önce küçültür (varsayılan: en uzun kenar 1280 px, JPEG).
export const shrinkPhoto = (file, maxSide = 1280, quality = 0.85) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

export const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

// "24,50" / "24.5" → 24.5; geçersizse NaN
export const parsePrice = (value) => Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));

export const formatPrice = (value) =>
  `₺${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Ad karşılaştırması: büyük/küçük harf, Türkçe harf ve fazla boşluk farkı yok sayılır
export const normalizeName = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Aynı anda en fazla `limit` iş çalıştırır (sunucuyu ve görsel aramayı boğmamak için)
export const runPool = async (items, limit, worker) => {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
};
