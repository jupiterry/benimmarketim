// Kampanya getirisi: flaş indirim ve haftalık fırsat başına satış, ciro ve verilen indirim
// (Kampanya merkezi, flaş indirim yöneticisi ve haftalık fırsatlar ekranı bu servisi kullanır).
//
// Ölçüm iptal edilmemiş siparişlerin ürün satırlarından yapılır (kupon öncesi satır tutarı):
//   units: Σ adet · orders: farklı sipariş sayısı · revenue: Σ ödenen birim fiyat × adet
//   discount: Σ (liste fiyatı − ödenen birim fiyat) × adet · inferredLines: fiyattan tahmin edilen satır sayısı
//   from/to: ölçülen aralık [from, to) — to en geç "şimdi"; başlamamış kampanyada boş aralık (to = from)
//
// Satırın fiyat bilgisi (originalPrice = liste fiyatı, priceSource, flashSaleId) 1 Kasım 2026'dan sonraki
// siparişlerde kayıtlıdır. Daha eski satırlar tahmin edilir:
//   - flaş: ordersAnalytics.inferFlashLines (satır fiyatı o an süren kampanyanın appliedPrice'ı ile aynı)
//   - haftalık: satır fiyatı fırsat fiyatıyla kuruşu kuruşuna aynı ve sipariş fırsat süresi içinde; liste
//     fiyatı olarak ürünün bugünkü fiyatı kullanılır.
// Bir satır yalnızca bir haftalık fırsata yazılır: aynı ürünün süreleri çakışan fırsatlarından siparişin
// verildiği an süren ve en son başlamış olanına.
// Sorgular sınırlıdır: kampanya penceresi + ürün süzgeci ve en fazla PERFORMANCE_ORDER_CAP sipariş
// (aşılırsa truncated: true; en yeni siparişler sayılır).
import Order from "../models/order.model.js";
import FlashSale from "../models/flashSale.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Product from "../models/product.model.js";
import { inferFlashLines } from "../controllers/ordersAnalytics.controller.js";
import { toKurus } from "./productPricing.js";

export const PERFORMANCE_MAX_IDS = 100;
export const PERFORMANCE_ORDER_CAP = 20000;
const SIBLING_DEAL_CAP = 2000;
const CANCELLED = "İptal Edildi";
const PRICE_EPSILON = 0.005;
const HOUR_MS = 60 * 60 * 1000;
const TR_OFFSET_MS = 3 * HOUR_MS;
export const DAY_MS = 24 * HOUR_MS;
/** Mağazanın iş günü İstanbul saatiyle 04:00'te değişir (siparişler gece 01:00'e kadar sürer) */
export const BUSINESS_DAY_START_HOUR = 4;
const HEX24 = /^[0-9a-f]{24}$/i;
const LINE_FIELDS = [
  "createdAt",
  "products.product",
  "products.quantity",
  "products.price",
  "products.originalPrice",
  "products.priceSource",
  "products.flashSaleId",
  "products.flashDiscountPercentage",
  "products.weeklyDealId",
].join(" ");
const WEEKLY_FIELDS = "product weeklyPrice startDate endDate isActive scheduled stoppedAt createdAt updatedAt";

// ── Zaman (İstanbul, UTC+3, yaz saati yok) ───────────────────────────────
/** İstanbul saatiyle günün başlangıcı */
export const istanbulDayStart = (date = new Date()) =>
  new Date(Math.floor((new Date(date).getTime() + TR_OFFSET_MS) / DAY_MS) * DAY_MS - TR_OFFSET_MS);
/** İstanbul saatiyle günün sonu (23:59:59.999) */
export const istanbulDayEnd = (date = new Date()) => new Date(istanbulDayStart(date).getTime() + DAY_MS - 1);
/**
 * "Bugün / bu gece" sınırı: içinde bulunulan iş gününün bittiği an (ertesi gün 04:00, İstanbul). Akşam 22:00'de
 * gece 01:00'de bitecek kampanya "bu gece biter"; gece 02:00'de ise iş günü hâlâ dünkü gecedir.
 */
export const tonightCutoff = (date = new Date()) => {
  const shift = BUSINESS_DAY_START_HOUR * HOUR_MS;
  return new Date(istanbulDayStart(new Date(new Date(date).getTime() - shift)).getTime() + DAY_MS + shift);
};

// ── Yardımcılar ───────────────────────────────────────────────────────────
const validDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const timeOf = (value) => validDate(value)?.getTime() ?? NaN;
/** Kimlik ya da doldurulmuş belge → kimlik metni */
export const refId = (ref) => {
  if (ref === null || ref === undefined || ref === "") return null;
  if (typeof ref === "object" && ref._bsontype !== "ObjectId" && ref._id !== undefined && ref._id !== null) return String(ref._id);
  return String(ref);
};
/** Geçerli, tekrarsız kimlikler (en fazla `max`) */
export const uniqueIds = (ids, max = Infinity) =>
  [...new Set((Array.isArray(ids) ? ids : []).map((id) => refId(id)).filter((id) => id && HEX24.test(id)))].slice(0, max);

const inWindow = (time, window) => Number.isFinite(time) && window.from.getTime() <= time && time < window.to.getTime();

/** [from, to) ölçüm aralığı: to = min(bitiş, şimdi); başlamamışsa boş aralık */
const clampWindow = (from, stop, now) => {
  const end = Math.min(stop ? stop.getTime() : Infinity, now.getTime());
  return { from, to: new Date(Math.max(from.getTime(), end)) };
};
const earliest = (dates) => {
  const valid = dates.filter(Boolean);
  return valid.length ? new Date(Math.min(...valid.map((date) => date.getTime()))) : null;
};

/**
 * Flaş indirimin ölçüm aralığı: [startDate, bitiş). Bitiş; endDate, iptal anı (cancelledAt) ve kapatılmış
 * kayıtta (isActive: false) son güncelleme anının en erkenidir. Süresi dolunca zamanlayıcı kaydı kapatır
 * (updatedAt bitişten sonra kalır); elle kapatılan kampanyada updatedAt kapatma anıdır. Planlıyken iptal
 * edilen kampanya (iptal < başlangıç) hiç başlamadığı için boş aralık döner.
 */
export const flashSaleWindow = (sale, now = new Date()) => {
  const from = validDate(sale?.startDate);
  if (!from) return null;
  const stop = earliest([
    validDate(sale.endDate),
    validDate(sale.cancelledAt),
    sale.isActive === false ? validDate(sale.updatedAt) : null,
  ]);
  return clampWindow(from, stop, now);
};

/**
 * Haftalık fırsatın ölçüm aralığı: [startDate, endDate ya da şimdi). Elle durdurulmuş fırsat (isActive: false,
 * planlı değil) durdurulduğu anda (stoppedAt) bitmiş sayılır; bu alan olmayan eski kayıtlarda son güncellenme
 * anı kullanılır. Bitiş tarihi boş ya da ileride olabilir.
 * Planlı fırsat (scheduled: true) başlangıcı gelmeden boş aralık döner.
 */
export const weeklyDealWindow = (deal, now = new Date()) => {
  const from = validDate(deal?.startDate) || validDate(deal?.createdAt);
  if (!from) return null;
  const stopped = deal.isActive === false && deal.scheduled !== true ? (validDate(deal.stoppedAt) || validDate(deal.updatedAt)) : null;
  return clampWindow(from, earliest([validDate(deal.endDate), stopped]), now);
};

/** Ürünün fırsatları arasından siparişin verildiği an süren ve en son başlamış olanı */
export const pickWeeklyDeal = (candidates, time) => {
  let best = null;
  for (const candidate of candidates || []) {
    if (!candidate?.window || !inWindow(time, candidate.window)) continue;
    if (!best || candidate.window.from > best.window.from) best = candidate;
  }
  return best;
};

/** Ürün kimliği → [{ id, window, weeklyPrice }] (aynı fırsat bir kez) */
const indexDealsByProduct = (deals, now) => {
  const byProduct = new Map();
  const seen = new Set();
  for (const deal of deals || []) {
    const id = refId(deal?._id);
    const productId = refId(deal?.product);
    if (!id || !productId || seen.has(id)) continue;
    seen.add(id);
    const window = weeklyDealWindow(deal, now);
    if (!window) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    const weeklyPrice = deal.weeklyPrice === null || deal.weeklyPrice === undefined ? NaN : Number(deal.weeklyPrice);
    byProduct.get(productId).push({ id, window, weeklyPrice });
  }
  return byProduct;
};

const matchesWeeklyPrice = (line, deal) =>
  Boolean(deal) && Number.isFinite(deal.weeklyPrice) && Math.abs(Number(line?.price) - deal.weeklyPrice) < PRICE_EPSILON;

/** Flaş satırının liste fiyatı: kayıtlıysa originalPrice, değilse indirim oranından geri hesap */
const flashListPrice = (line, fallbackPct) => {
  const original = Number(line?.originalPrice);
  if (Number.isFinite(original) && original > 0) return original;
  const pct = Number(line?.flashDiscountPercentage ?? fallbackPct);
  const price = Number(line?.price);
  if (!(pct > 0 && pct < 100) || !Number.isFinite(price)) return null;
  return Math.round((price / (1 - pct / 100)) * 100) / 100;
};

/** Kayıtlı liste fiyatı (originalPrice) yoksa null */
const recordedListPrice = (line) => {
  const original = Number(line?.originalPrice);
  return Number.isFinite(original) && original > 0 ? original : null;
};

// ── Biriktirici ───────────────────────────────────────────────────────────
/** Tutarlar tam sayı kuruş olarak toplanır (ondalık toplama hatası olmasın) */
export const newPerformanceAcc = (window = null) => ({
  units: 0,
  orderIds: new Set(),
  revenueKurus: 0,
  discountKurus: 0,
  inferredLines: 0,
  from: window?.from || null,
  to: window?.to || null,
});

const addLine = (acc, orderId, line, listPrice, inferred) => {
  if (!acc) return;
  const quantity = Number(line?.quantity);
  const price = Number(line?.price);
  if (!(quantity > 0) || !Number.isFinite(price) || price < 0) return;
  const priceKurus = toKurus(price);
  acc.units += quantity;
  acc.orderIds.add(orderId);
  acc.revenueKurus += priceKurus * quantity;
  const list = listPrice === null || listPrice === undefined ? NaN : Number(listPrice);
  if (Number.isFinite(list)) {
    const unitDiscount = toKurus(list) - priceKurus;
    if (unitDiscount > 0) acc.discountKurus += unitDiscount * quantity;
  }
  if (inferred) acc.inferredLines += 1;
};

/** Birden çok kampanyanın toplamı (aynı sipariş bir kez sayılır) */
export const mergePerformanceAccs = (accs) => {
  const out = newPerformanceAcc();
  for (const acc of accs || []) {
    if (!acc) continue;
    out.units += acc.units;
    for (const id of acc.orderIds) out.orderIds.add(id);
    out.revenueKurus += acc.revenueKurus;
    out.discountKurus += acc.discountKurus;
    out.inferredLines += acc.inferredLines;
    if (acc.from && (!out.from || acc.from < out.from)) out.from = acc.from;
    if (acc.to && (!out.to || acc.to > out.to)) out.to = acc.to;
  }
  return out;
};

/** Yanıt biçimi: { units, orders, revenue, discount, from, to, inferredLines } */
export const finalizePerformance = (acc) => ({
  units: acc.units,
  orders: acc.orderIds.size,
  revenue: acc.revenueKurus / 100,
  discount: acc.discountKurus / 100,
  from: acc.from ? acc.from.toISOString() : null,
  to: acc.to ? acc.to.toISOString() : null,
  inferredLines: acc.inferredLines,
});

const finalizeAll = (accs) => Object.fromEntries([...accs].map(([id, acc]) => [id, finalizePerformance(acc)]));

// ── Sipariş sorgusu ───────────────────────────────────────────────────────
/** Aynı pencereyi paylaşan kampanyalar (toplu flaş indirim) tek koşulda birleşir */
const windowClauses = (entries) => {
  const byWindow = new Map();
  for (const { window, productId } of entries) {
    if (!productId || !window || window.to <= window.from) continue;
    const key = `${window.from.getTime()}:${window.to.getTime()}`;
    if (!byWindow.has(key)) byWindow.set(key, { window, products: new Set() });
    byWindow.get(key).products.add(productId);
  }
  return [...byWindow.values()].map(({ window, products }) => ({
    createdAt: { $gte: window.from, $lt: window.to },
    "products.product": { $in: [...products] },
  }));
};

const capOrders = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  return { orders: list.slice(0, PERFORMANCE_ORDER_CAP), truncated: list.length > PERFORMANCE_ORDER_CAP };
};

const fetchCampaignOrders = async (clauses) => {
  if (!clauses.length) return { orders: [], truncated: false };
  const raw = await Order.find({ status: { $ne: CANCELLED }, $or: clauses })
    .select(LINE_FIELDS)
    .sort({ createdAt: -1 })
    .limit(PERFORMANCE_ORDER_CAP + 1)
    .lean();
  return capOrders(raw);
};

const loadListPrices = async (productIds) => {
  const ids = uniqueIds(productIds);
  if (!ids.length) return new Map();
  const products = await Product.find({ _id: { $in: ids } }).select("price").lean();
  return new Map((products || []).map((product) => [refId(product._id), Number(product.price)]));
};

const linesOf = (order) => (Array.isArray(order?.products) ? order.products.filter(Boolean) : []);

// ── Flaş indirim ──────────────────────────────────────────────────────────
/**
 * Flaş indirim başına biriktiriciler.
 * Satır eşleşmesi: flashSaleId === kampanya; kimliği yazılmamış flaş satırı → aynı ürün ve kampanya süresi;
 * fiyat bilgisi olmayan eski satır → inferFlashLines (tahmini).
 * @returns {Promise<{ accs: Map<string, object>, truncated: boolean }>} yalnızca bulunan kampanyalar
 */
export const collectFlashPerformance = async (ids, { now = new Date() } = {}) => {
  const accs = new Map();
  const wanted = uniqueIds(ids);
  if (!wanted.length) return { accs, truncated: false };
  const sales = await FlashSale.find({ _id: { $in: wanted } })
    .select("product discountPercentage startDate endDate cancelledAt isActive updatedAt")
    .lean();

  const entries = [];
  for (const sale of sales || []) {
    const window = flashSaleWindow(sale, now);
    const id = refId(sale?._id);
    if (!window || !id) continue;
    accs.set(id, newPerformanceAcc(window));
    entries.push({ id, productId: refId(sale.product), window, pct: Number(sale.discountPercentage) });
  }
  const { orders, truncated } = await fetchCampaignOrders(windowClauses(entries));
  if (!orders.length) return { accs, truncated };

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const entriesByProduct = new Map();
  for (const entry of entries) {
    if (!entriesByProduct.has(entry.productId)) entriesByProduct.set(entry.productId, []);
    entriesByProduct.get(entry.productId).push(entry);
  }

  const pending = [];
  for (const order of orders) {
    const time = timeOf(order.createdAt);
    const orderId = refId(order._id);
    const waiting = [];
    for (const line of linesOf(order)) {
      const productId = refId(line.product);
      if (line.priceSource === "flash") {
        // Sipariş kampanyanın süresi içinde olmalı: sonuç, aynı istekte başka hangi kampanyaların sorulduğuna bağlı kalmaz
        const entry = line.flashSaleId
          ? entryById.get(refId(line.flashSaleId))
          : (entriesByProduct.get(productId) || []).find((candidate) => inWindow(time, candidate.window));
        if (entry && inWindow(time, entry.window)) addLine(accs.get(entry.id), orderId, line, flashListPrice(line, entry.pct), false);
      } else if (!line.priceSource && entriesByProduct.has(productId)) {
        waiting.push(line);
      }
    }
    if (waiting.length) pending.push({ orderId, time, view: { createdAt: order.createdAt, products: waiting } });
  }

  if (pending.length) {
    // inferFlashLines satırları yerinde işaretler (priceSource, flashSaleId, originalPrice, pricingInferred)
    await inferFlashLines(pending.map((item) => item.view));
    for (const { orderId, time, view } of pending) {
      for (const line of view.products) {
        if (line.priceSource !== "flash" || !line.flashSaleId) continue;
        const entry = entryById.get(refId(line.flashSaleId));
        if (entry && inWindow(time, entry.window)) addLine(accs.get(entry.id), orderId, line, flashListPrice(line, entry.pct), true);
      }
    }
  }
  return { accs, truncated };
};

/** GET /api/campaigns/performance?type=flash → { items: { [id]: performans }, truncated } */
export const flashSalePerformance = async (ids, options = {}) => {
  const { accs, truncated } = await collectFlashPerformance(ids, options);
  return { items: finalizeAll(accs), truncated };
};

// ── Haftalık fırsat ───────────────────────────────────────────────────────
/**
 * Haftalık fırsat başına biriktiriciler. "weekly" satırları ve fiyatı fırsat fiyatına eşit eski satırlar
 * (tahmini) sayılır; satır, ürünün o an süren en son başlamış fırsatına yazılır.
 * @returns {Promise<{ accs: Map<string, object>, truncated: boolean }>} yalnızca bulunan fırsatlar
 */
export const collectWeeklyPerformance = async (ids, { now = new Date() } = {}) => {
  const accs = new Map();
  const wanted = uniqueIds(ids);
  if (!wanted.length) return { accs, truncated: false };
  const deals = await WeeklyProduct.find({ _id: { $in: wanted } }).select(WEEKLY_FIELDS).lean();
  const entries = [];
  for (const deal of deals || []) {
    const window = weeklyDealWindow(deal, now);
    const id = refId(deal?._id);
    const productId = refId(deal?.product);
    if (!window || !id || !productId) continue;
    accs.set(id, newPerformanceAcc(window));
    entries.push({ id, productId, window });
  }
  const clauses = windowClauses(entries);
  if (!clauses.length) return { accs, truncated: false };

  // Aynı ürünün diğer fırsatları (geçen haftanın kopyası, durdurulup yeniden açılanlar): satır tek fırsata yazılsın
  const productIds = [...new Set(entries.map((entry) => entry.productId))];
  const siblings = await WeeklyProduct.find({ product: { $in: productIds } })
    .select(WEEKLY_FIELDS)
    .sort({ startDate: -1 })
    .limit(SIBLING_DEAL_CAP)
    .lean();
  const dealsByProduct = indexDealsByProduct([...deals, ...(siblings || [])], now);
  const { orders, truncated } = await fetchCampaignOrders(clauses);

  const needListPrice = [];
  const candidates = [];
  for (const order of orders) {
    const time = timeOf(order.createdAt);
    const orderId = refId(order._id);
    const waiting = [];
    for (const line of linesOf(order)) {
      if (line.priceSource && line.priceSource !== "weekly") continue;
      const productId = refId(line.product);
      // Sipariş satırı fırsatın kimliğini taşıyorsa doğrudan o fırsata yazılır (durdurulup yeniden açılan
      // fırsatlarda zaman aralığı yanıltabilir); kimliksiz eski satırlarda aralık kuralı kullanılır
      const lineDealId = line.priceSource === "weekly" ? refId(line.weeklyDealId) : null;
      const deal = lineDealId ? { id: lineDealId } : pickWeeklyDeal(dealsByProduct.get(productId), time);
      const acc = deal ? accs.get(deal.id) : null;
      if (!acc) continue;
      if (line.priceSource === "weekly") {
        const original = recordedListPrice(line);
        if (original !== null) addLine(acc, orderId, line, original, false);
        else needListPrice.push({ acc, orderId, line, productId, inferred: false });
      } else if (matchesWeeklyPrice(line, deal)) {
        waiting.push({ acc, orderId, line, productId, inferred: true });
      }
    }
    if (waiting.length) candidates.push({ createdAt: order.createdAt, waiting });
  }
  if (candidates.length) {
    // Dönem toplamlarıyla aynı kural: fiyatı o an süren flaş indirimin fiyatıyla eşleşen eski satır flaştır
    await inferFlashLines(candidates.map(({ createdAt, waiting }) => ({ createdAt, products: waiting.map((entry) => entry.line) })));
    for (const { waiting } of candidates) {
      for (const entry of waiting) if (!entry.line.priceSource) needListPrice.push(entry);
    }
  }
  if (needListPrice.length) {
    const listPrices = await loadListPrices(needListPrice.map((item) => item.productId));
    for (const { acc, orderId, line, productId, inferred } of needListPrice) {
      addLine(acc, orderId, line, listPrices.get(productId), inferred);
    }
  }
  return { accs, truncated };
};

/** GET /api/campaigns/performance?type=weekly → { items: { [id]: performans }, truncated } */
export const weeklyDealPerformance = async (ids, options = {}) => {
  const { accs, truncated } = await collectWeeklyPerformance(ids, options);
  return { items: finalizeAll(accs), truncated };
};

// ── Dönem toplamları ──────────────────────────────────────────────────────
const normalizeCode = (code) => (typeof code === "string" ? code.trim().toUpperCase() : "");

/**
 * Son 7 ve 30 günün (bugün dahil, İstanbul günleri; Genel bakıştaki "7 gün"/"30 gün" ile aynı) kampanya toplamları:
 * flaş ve haftalık satırların cirosu/indirimi ve kupon indirimi. Ayrıca son 30 günde kupon kodu başına
 * kullanım (couponsByCode: { KOD: { orders, discount, revenue } }; revenue = siparişin ürün tutarı, kupon sonrası).
 */
export const campaignTotals = async ({ now = new Date() } = {}) => {
  const todayStart = istanbulDayStart(now);
  const periods = [
    { key: "last7", from: new Date(todayStart.getTime() - 6 * DAY_MS) },
    { key: "last30", from: new Date(todayStart.getTime() - 29 * DAY_MS) },
  ].map((period) => ({
    ...period,
    flash: newPerformanceAcc({ from: period.from, to: now }),
    weekly: newPerformanceAcc({ from: period.from, to: now }),
    coupon: { orderIds: new Set(), discountKurus: 0 },
  }));
  const raw = await Order.find({ status: { $ne: CANCELLED }, createdAt: { $gte: periods[1].from, $lte: now } })
    .select(`${LINE_FIELDS} couponCode couponDiscount productTotal totalAmount`)
    .sort({ createdAt: -1 })
    .limit(PERFORMANCE_ORDER_CAP + 1)
    .lean();
  const { orders, truncated } = capOrders(raw);

  const add = (kind, item, line, listPrice, inferred) => {
    for (const period of periods) {
      if (item.time >= period.from.getTime()) addLine(period[kind], item.orderId, line, listPrice, inferred);
    }
  };
  const couponsByCode = new Map();
  const items = [];
  const needListPrice = [];
  for (const order of orders) {
    const item = { orderId: refId(order._id), time: timeOf(order.createdAt), createdAt: order.createdAt, waiting: [] };
    if (!Number.isFinite(item.time)) continue;
    const couponDiscount = Number(order.couponDiscount);
    if (couponDiscount > 0) {
      for (const period of periods) {
        if (item.time < period.from.getTime()) continue;
        period.coupon.orderIds.add(item.orderId);
        period.coupon.discountKurus += toKurus(couponDiscount);
      }
    }
    const code = normalizeCode(order.couponCode);
    if (code) {
      const row = couponsByCode.get(code) || { orders: 0, discountKurus: 0, revenueKurus: 0 };
      row.orders += 1;
      if (couponDiscount > 0) row.discountKurus += toKurus(couponDiscount);
      row.revenueKurus += toKurus(order.productTotal ?? order.totalAmount);
      couponsByCode.set(code, row);
    }
    for (const line of linesOf(order)) {
      if (line.priceSource === "flash") add("flash", item, line, flashListPrice(line, null), false);
      else if (line.priceSource === "weekly") {
        const original = recordedListPrice(line);
        if (original !== null) add("weekly", item, line, original, false);
        else needListPrice.push({ item, line, productId: refId(line.product), inferred: false });
      } else if (!line.priceSource && refId(line.product)) item.waiting.push(line);
    }
    if (item.waiting.length) items.push(item);
  }

  if (items.length) {
    // Eski satırlar: önce flaş (appliedPrice eşleşmesi), kalanlar haftalık fırsat fiyatıyla eşleştirilir
    await inferFlashLines(items.map((item) => ({ createdAt: item.createdAt, products: item.waiting })));
    const remaining = [];
    for (const item of items) {
      for (const line of item.waiting) {
        if (line.priceSource === "flash") add("flash", item, line, flashListPrice(line, null), true);
        else if (!line.priceSource) remaining.push({ item, line, productId: refId(line.product) });
      }
    }
    const productIds = uniqueIds(remaining.map((entry) => entry.productId));
    if (productIds.length) {
      const deals = await WeeklyProduct.find({ product: { $in: productIds } })
        .select(WEEKLY_FIELDS)
        .sort({ startDate: -1 })
        .limit(SIBLING_DEAL_CAP)
        .lean();
      const dealsByProduct = indexDealsByProduct(deals, now);
      for (const { item, line, productId } of remaining) {
        if (matchesWeeklyPrice(line, pickWeeklyDeal(dealsByProduct.get(productId), item.time))) {
          needListPrice.push({ item, line, productId, inferred: true });
        }
      }
    }
  }
  if (needListPrice.length) {
    const listPrices = await loadListPrices(needListPrice.map((entry) => entry.productId));
    for (const { item, line, productId, inferred } of needListPrice) add("weekly", item, line, listPrices.get(productId), inferred);
  }

  const summary = (period) => ({
    from: period.from.toISOString(),
    to: now.toISOString(),
    flash: finalizePerformance(period.flash),
    weekly: finalizePerformance(period.weekly),
    coupon: { orders: period.coupon.orderIds.size, discount: period.coupon.discountKurus / 100 },
  });
  return {
    last7: summary(periods[0]),
    last30: summary(periods[1]),
    couponsByCode: Object.fromEntries([...couponsByCode].map(([code, row]) => [code, {
      orders: row.orders,
      discount: row.discountKurus / 100,
      revenue: row.revenueKurus / 100,
    }])),
    truncated,
  };
};
