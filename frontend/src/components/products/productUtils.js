/* global Intl */
// Ürünler sayfasının saf yardımcıları: kategori, filtre, sıralama, CSV ve flash sale durumu.

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

const CATEGORY_NAMES = new Map(CATEGORIES.map((c) => [c.slug, c.name]));
export const normalizeCategory = (value) => String(value || "").replace(/^\//, "").trim().toLowerCase();
export const categoryName = (value) => {
  const slug = normalizeCategory(value);
  return CATEGORY_NAMES.get(slug) || slug || "Kategorisiz";
};

// Durum filtreleri (çipler ve KPI kartları aynı anahtarları kullanır)
export const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "published", label: "Yayında", tone: "ok" },
  { key: "outOfStock", label: "Stokta yok", tone: "danger" },
  { key: "hidden", label: "Gizli", tone: "warn" },
  { key: "discounted", label: "İndirimli", tone: "info" },
  { key: "flash", label: "Flash sale" },
  { key: "featured", label: "Öne çıkan" },
  { key: "noImage", label: "Görselsiz" },
];

export const SORTS = [
  { key: "order", label: "Vitrin sırası" },
  { key: "name", label: "Ada göre (A-Z)" },
  { key: "priceAsc", label: "Fiyat (artan)" },
  { key: "priceDesc", label: "Fiyat (azalan)" },
  { key: "discount", label: "İndirim oranı" },
  { key: "newest", label: "En yeni" },
  { key: "updated", label: "Son güncellenen" },
];

export const hasImage = (p) => Boolean(p.image && String(p.image).trim());
export const isPublished = (p) => !p.isHidden && !p.isOutOfStock;
export const effectivePrice = (p) => (p.isDiscounted && Number(p.discountedPrice) > 0 ? Number(p.discountedPrice) : Number(p.price) || 0);
export const discountPct = (p) => {
  const price = Number(p.price);
  if (!p.isDiscounted || !(price > 0) || !(Number(p.discountedPrice) >= 0)) return 0;
  return Math.round((1 - Number(p.discountedPrice) / price) * 100);
};

export const matchesFilter = (p, key, flashByProduct) => {
  switch (key) {
    case "published": return isPublished(p);
    case "outOfStock": return Boolean(p.isOutOfStock);
    case "hidden": return Boolean(p.isHidden);
    case "discounted": return Boolean(p.isDiscounted);
    case "flash": return flashByProduct.has(p._id);
    case "featured": return Boolean(p.isFeatured);
    case "noImage": return !hasImage(p);
    default: return true;
  }
};

// Türkçe büyük/küçük harf ve aksan farkı gözetmeden arama
export const fold = (s) => String(s || "")
  .toLocaleLowerCase("tr")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/ı/g, "i");

const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || collator.compare(a.name || "", b.name || "");
const time = (v) => (v ? new Date(v).getTime() || 0 : 0);

export const sortProducts = (list, sort) => {
  const arr = [...list];
  switch (sort) {
    case "name": return arr.sort((a, b) => collator.compare(a.name || "", b.name || ""));
    case "priceAsc": return arr.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    case "priceDesc": return arr.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    case "discount": return arr.sort((a, b) => discountPct(b) - discountPct(a) || byOrder(a, b));
    case "newest": return arr.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    case "updated": return arr.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    default: return arr.sort(byOrder);
  }
};

/**
 * Filtrelenmiş alt kümenin yeni sırasını tüm katalog sırasına yerleştirir: alt küme
 * ürünleri katalogda kapladıkları konumlarda kalır, yalnızca kendi aralarında yer değiştirir.
 */
export const mergeOrder = (catalogSorted, subsetNewOrder) => {
  const subsetIds = new Set(subsetNewOrder.map((p) => p._id));
  const queue = [...subsetNewOrder];
  return catalogSorted.map((p) => (subsetIds.has(p._id) ? queue.shift() : p));
};

const TRY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
export const money = (n) => TRY.format(Number(n) || 0);
export const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

// Fiyat girdisini okur: "12,50" ve "12.50" kabul edilir
export const parsePrice = (value) => {
  const n = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// ---- Flash sale ----
export const flashStatus = (sale, now = Date.now()) => {
  if (!sale) return "ended";
  if (sale.isActive === false) return "ended";
  if (time(sale.endDate) <= now) return "ended";
  if (time(sale.startDate) > now) return "upcoming";
  return "active";
};

/** Ürün kimliği → { sale, status } (önce aktif, yoksa en yakın yaklaşan kampanya) */
export const flashIndex = (sales, now = Date.now()) => {
  const map = new Map();
  for (const sale of sales) {
    const status = flashStatus(sale, now);
    if (status === "ended") continue;
    const id = sale.product?._id || sale.product;
    if (!id) continue;
    const prev = map.get(id);
    if (!prev || (status === "active" && prev.status !== "active") ||
      (status === prev.status && time(sale.startDate) < time(prev.sale.startDate))) {
      map.set(id, { sale, status });
    }
  }
  return map;
};

export const remaining = (target, now = Date.now()) => {
  const ms = time(target) - now;
  if (ms <= 0) return "şimdi";
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa ${m % 60 ? `${m % 60} dk` : ""}`.trim();
  const d = Math.floor(h / 24);
  return `${d} gün ${h % 24 ? `${h % 24} sa` : ""}`.trim();
};

const DT = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const formatDateTime = (v) => (v ? DT.format(new Date(v)) : "—");

// <input type="datetime-local"> değeri (yerel saat) ↔ Date
const pad = (n) => String(n).padStart(2, "0");
export const toLocalInput = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// Yerel saat girdisini saat dilimi bilgisiyle ISO'ya çevirir (sunucu UTC'de olsa da kayma olmaz)
export const localInputToIso = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const DURATIONS = [
  { hours: 1, label: "1 saat" },
  { hours: 3, label: "3 saat" },
  { hours: 6, label: "6 saat" },
  { hours: 24, label: "24 saat" },
  { hours: 72, label: "3 gün" },
];

// ---- CSV ----
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const buildCsv = (products) => {
  const head = ["Ürün", "Kategori", "Fiyat", "İndirimli fiyat", "İndirim %", "Stok", "Görünürlük", "Öne çıkan", "Görsel", "Sıra"];
  const rows = products.map((p) => [
    p.name,
    categoryName(p.category),
    String(roundMoney(p.price)).replace(".", ","),
    p.isDiscounted ? String(roundMoney(p.discountedPrice)).replace(".", ",") : "",
    p.isDiscounted ? discountPct(p) : "",
    p.isOutOfStock ? "Stokta yok" : "Stokta",
    p.isHidden ? "Gizli" : "Görünür",
    p.isFeatured ? "Evet" : "Hayır",
    hasImage(p) ? "Var" : "Yok",
    p.order ?? "",
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
};
export const downloadText = (text, filename, type = "text/csv;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---- Tercihler ----
const PREF_KEY = "admin-products-prefs";
export const readPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {};
  } catch {
    return {};
  }
};
export const writePrefs = (prefs) => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* gizli pencere vb. */
  }
};

/** Bir dizi işlemi sınırlı eşzamanlılıkla çalıştırır; başarılı/başarısız sayısını döner. */
export const runPool = async (items, worker, concurrency = 4) => {
  let ok = 0;
  let fail = 0;
  let i = 0;
  const next = async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await worker(item);
        ok++;
      } catch {
        fail++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return { ok, fail };
};

export const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.response?.data?.error || fallback;
