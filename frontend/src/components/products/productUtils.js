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
  // Satış bilgisine dayanan filtreler (satış özeti yüklenemediyse gösterilmez)
  { key: "lostSales", label: "Çok satan ama tükendi", tone: "danger", needsStats: true },
  { key: "stale", label: "Yayında ama satmayan", tone: "warn", needsStats: true },
];
export const STATS_FILTERS = new Set(FILTERS.filter((f) => f.needsStats).map((f) => f.key));

export const SORTS = [
  { key: "order", label: "Vitrin sırası" },
  { key: "name", label: "Ada göre (A-Z)" },
  { key: "priceAsc", label: "Fiyat (artan)" },
  { key: "priceDesc", label: "Fiyat (azalan)" },
  { key: "discount", label: "İndirim oranı" },
  { key: "newest", label: "En yeni" },
  { key: "updated", label: "Son güncellenen" },
  { key: "sold30", label: "Çok satan (30 gün)", needsStats: true },
  { key: "oosLongest", label: "En uzun süredir tükenen" },
];

export const hasImage = (p) => Boolean(p.image && String(p.image).trim());
export const isPublished = (p) => !p.isHidden && !p.isOutOfStock;
export const effectivePrice = (p) => (p.isDiscounted && Number(p.discountedPrice) > 0 ? Number(p.discountedPrice) : Number(p.price) || 0);
export const discountPct = (p) => {
  const price = Number(p.price);
  if (!p.isDiscounted || !(price > 0) || !(Number(p.discountedPrice) >= 0)) return 0;
  return Math.round((1 - Number(p.discountedPrice) / price) * 100);
};

// ---- Satış ve tükenme bilgisi ----
const DAY_MS = 24 * 60 * 60 * 1000;
export const LOST_SALES_MIN_UNITS = 5; // "Çok satan ama tükendi": 30 günde en az bu kadar adet
export const STALE_DAYS = 30; // "Yayında ama satmayan": ürün en az bu kadar gündür katalogda

const NO_SALES = Object.freeze({ units7: 0, units30: 0, orders30: 0 });
/** Ürünün satış özeti; özet hiç yüklenmediyse null (bilinmiyor), ürün hiç satmadıysa sıfırlar */
export const statsOf = (stats, id) => (stats ? stats[id] || NO_SALES : null);

/**
 * Son 7 günün temposu, ondan önceki 23 güne göre belirgin farklıysa "up" / "down"; değilse null.
 * Az satan üründe (birkaç adet) ok gösterilmez: küçük sayılarda fark tesadüftür.
 */
export const salesTrend = (stat) => {
  if (!stat) return null;
  const recent = Number(stat.units7) || 0;
  const earlier = Math.max(0, (Number(stat.units30) || 0) - recent);
  const recentPace = recent / 7;
  const earlierPace = earlier / 23;
  if (recent >= 5 && recentPace >= earlierPace * 1.5) return "up";
  if (earlier >= 8 && recentPace <= earlierPace * 0.5) return "down";
  return null;
};

/** Kaç gündür tükendi? Tarih yoksa (eski kayıt) ya da ürün stoktaysa null */
export const outOfStockDays = (p, now = Date.now()) => {
  if (!p?.isOutOfStock || !p.outOfStockSince) return null;
  const since = new Date(p.outOfStockSince).getTime();
  if (!Number.isFinite(since)) return null;
  return Math.max(0, Math.floor((now - since) / DAY_MS));
};
export const outOfStockLabel = (p, now = Date.now()) => {
  if (!p?.isOutOfStock) return "";
  const days = outOfStockDays(p, now);
  if (days === null) return "Tükendi";
  return days === 0 ? "Bugün tükendi" : `${days} gündür tükendi`;
};

const isOlderThan = (p, days, now) => {
  const created = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
  return !Number.isFinite(created) || now - created >= days * DAY_MS; // tarihi olmayan eski kayıt: eski sayılır
};

/**
 * @param ctx { stats, now }: satış özeti haritası (yoksa satışa dayalı filtreler hiçbir ürünü seçmez) ve şimdiki zaman
 */
export const matchesFilter = (p, key, flashByProduct, ctx = {}) => {
  switch (key) {
    case "lostSales": {
      const stat = statsOf(ctx.stats, p._id);
      return Boolean(stat) && Boolean(p.isOutOfStock) && !p.isHidden && stat.units30 >= LOST_SALES_MIN_UNITS;
    }
    case "stale": {
      const stat = statsOf(ctx.stats, p._id);
      return Boolean(stat) && isPublished(p) && stat.units30 === 0 && isOlderThan(p, STALE_DAYS, ctx.now ?? Date.now());
    }
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

export const sortProducts = (list, sort, ctx = {}) => {
  const arr = [...list];
  switch (sort) {
    case "sold30": {
      const units = (p) => statsOf(ctx.stats, p._id)?.units30 || 0;
      return arr.sort((a, b) => units(b) - units(a) || byOrder(a, b));
    }
    case "oosLongest": {
      // Önce tükenenler: en eski tükenme tarihi başta; tarihi bilinmeyen (eski kayıt) tükenenler ardından; stoktakiler sonda
      const rank = (p) => (!p.isOutOfStock ? 2 : time(p.outOfStockSince) ? 0 : 1);
      return arr.sort((a, b) => rank(a) - rank(b) || time(a.outOfStockSince) - time(b.outOfStockSince) || byOrder(a, b));
    }
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

// Fiyat girdisini okur: "12,50" ve "12.50" kabul edilir. Boş kutu 0 değil, geçersizdir (NaN).
export const parsePrice = (value) => {
  const text = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  if (!text) return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
};

// ---- Fiyat güvenliği ----
export const toKurus = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-7) : 0;
};
export const BIG_PRICE_CHANGE_PCT = 50; // bundan büyük değişiklikte kaydetmeden önce sorulur

/** Eski → yeni fiyat farkı: { pct (işaretli, tam sayı), big } */
export const priceChangeOf = (oldPrice, newPrice) => {
  const from = Number(oldPrice);
  const to = Number(newPrice);
  if (!(from > 0) || !Number.isFinite(to)) return { pct: 0, big: false };
  const raw = ((to - from) / from) * 100;
  return { pct: Math.round(raw), big: Math.abs(raw) > BIG_PRICE_CHANGE_PCT };
};

/** Yeni liste fiyatı mevcut indirimi geçersiz kılar mı? (sunucu indirimi kaldırır) */
export const willRemoveDiscount = (product, newPrice) =>
  Boolean(product?.isDiscounted) && product.discountedPrice !== null && product.discountedPrice !== undefined &&
  toKurus(product.discountedPrice) >= toKurus(newPrice);

/**
 * Tekil fiyat değişikliğinden önce sorulacak soru; sorulacak bir şey yoksa null.
 * product: { name, price, isDiscounted, discountedPrice }
 */
export const priceChangeQuestion = (product, newPrice) => {
  const change = priceChangeOf(product.price, newPrice);
  const removes = willRemoveDiscount(product, newPrice);
  if (!change.big && !removes) return null;
  const lines = [];
  if (change.big) {
    lines.push(`${money(product.price)} → ${money(newPrice)} (%${Math.abs(change.pct)} ${change.pct > 0 ? "artış" : "düşüş"}). Virgülü kontrol edin.`);
  } else {
    lines.push(`${money(product.price)} → ${money(newPrice)}.`);
  }
  if (removes) lines.push(`Bu fiyatla ${money(product.discountedPrice)} indirimli fiyat kalkar; müşteri ${money(newPrice)} öder.`);
  return {
    title: change.big ? "Fiyat çok değişiyor. Doğru mu?" : "İndirim kalkacak. Devam edilsin mi?",
    message: `${product.name ? `“${product.name}”: ` : ""}${lines.join(" ")}`,
  };
};

// ---- Toplu fiyat önizlemesi (sunucudaki productAdmin.service planBulkPrice ile aynı hesap) ----
export const DISCOUNT_MODES = [
  { key: "keepRatio", label: "İndirim oranını koru", hint: "İndirimli fiyat da aynı oranda değişir." },
  { key: "keepPrice", label: "İndirimli fiyatı sabit tut", hint: "Müşterinin ödediği fiyat değişmez; yeni fiyatın altında kalmayan indirim kalkar." },
  { key: "remove", label: "İndirimi kaldır", hint: "Müşteri yeni liste fiyatını öder." },
];
const kurusMoney = (n) => toKurus(n) / 100;
export const bulkNewPrice = (oldPrice, priceType, priceValue) => {
  const price = Number(oldPrice) || 0;
  const value = Number(priceValue);
  switch (priceType) {
    case "set": return kurusMoney(value);
    case "increase": return kurusMoney(price + value);
    case "decrease": return kurusMoney(price - value);
    case "percentage": return kurusMoney(price * (1 + value / 100));
    default: return NaN;
  }
};
export const scaleDiscount = (discounted, oldPrice, newPrice, mode = "keepRatio") => {
  if (discounted === null || discounted === undefined || discounted === "") return null;
  const d = Number(discounted);
  if (!Number.isFinite(d) || d < 0) return null;
  const newK = toKurus(newPrice);
  if (mode === "remove") return null;
  if (mode === "keepPrice") return toKurus(d) < newK ? kurusMoney(d) : null;
  const oldK = toKurus(oldPrice);
  if (oldK <= 0 || toKurus(d) >= oldK) return null;
  let k = Math.round((newK * toKurus(d)) / oldK);
  if (k >= newK) k = newK - 1;
  if (k > 0) return k / 100;
  return toKurus(d) === 0 && newK > 0 ? 0 : null;
};
const customerPriceOf = (price, isDiscounted, discountedPrice) => {
  const d = Number(discountedPrice);
  const valid = isDiscounted && discountedPrice !== null && discountedPrice !== undefined && Number.isFinite(d) && d >= 0 && toKurus(d) < toKurus(price);
  return kurusMoney(valid ? d : price);
};
/**
 * Bir ürünün toplu fiyat değişikliğinden sonraki hâli.
 * @param flashSale ürünün yayındaki flaş indirim kaydı ({ discountPercentage }; yoksa null). Flaş indirimde
 *   müşteri fiyatı yeni liste fiyatından aynı yüzdeyle yeniden hesaplanır.
 */
export const previewBulkPrice = (product, { priceType, priceValue, discountMode = "keepRatio" }, flashSale = null) => {
  const oldPrice = kurusMoney(product.price);
  const price = bulkNewPrice(product.price, priceType, priceValue);
  const customerBefore = customerPriceOf(oldPrice, product.isDiscounted, product.discountedPrice);
  const out = { oldPrice, price, isDiscounted: false, discountedPrice: null, customerBefore, customerAfter: price, discountRemoved: false, flash: false, invalid: !(toKurus(price) > 0) };
  if (out.invalid) return out;
  const pct = Number(flashSale?.discountPercentage);
  if (flashSale && product.isDiscounted && pct > 0 && pct < 100) {
    let flashK = toKurus(Math.round(price * (1 - pct / 100) * 100) / 100);
    if (flashK >= toKurus(price)) flashK = toKurus(price) - 1;
    out.isDiscounted = true;
    out.discountedPrice = Math.max(0, flashK) / 100;
    out.flash = true;
  } else if (product.isDiscounted) {
    const next = scaleDiscount(product.discountedPrice, oldPrice, price, discountMode);
    out.isDiscounted = next !== null;
    out.discountedPrice = next;
    out.discountRemoved = next === null;
  }
  out.customerAfter = customerPriceOf(price, out.isDiscounted, out.discountedPrice);
  return out;
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
const csvDate = (v) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const two = (n) => String(n).padStart(2, "0");
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
/** @param stats satış özeti haritası (yoksa "30 gün satış" sütunu boş kalır) */
export const buildCsv = (products, stats = null) => {
  const head = ["Ürün", "Kategori", "Fiyat", "İndirimli fiyat", "İndirim %", "Stok", "Görünürlük", "Öne çıkan", "Görsel", "Sıra", "30 gün satış (adet)", "Tükenme tarihi"];
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
    stats ? statsOf(stats, p._id).units30 : "",
    p.isOutOfStock ? csvDate(p.outOfStockSince) : "",
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
};
// ---- CSV ile toplu yükleme şablonu ----
export const IMPORT_HEADERS = ["name", "description", "price", "image", "category", "isOutOfStock", "isHidden", "discountedPrice"];
export const IMPORT_MAX_MB = 5;
/** Excel'in doğrudan açtığı şablon: ";" ayırıcı, BOM, başlık + bir örnek satır */
export const buildImportTemplate = () => {
  const example = ["Örnek Süt 1 L", "Tam yağlı, uzun ömürlü", "42,50", "", "sut", "hayır", "hayır", "39,90"];
  return "\uFEFF" + [IMPORT_HEADERS, example].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
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
