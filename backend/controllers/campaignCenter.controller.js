// Kampanya merkezi (yalnızca yönetici; rotalar routes/campaign.route.js).
//   GET /api/campaigns/performance?type=flash|weekly&ids=<virgülle, en fazla 100>
//       → { success, items: { "<id>": { units, orders, revenue, discount, from, to, inferredLines } }, truncated }
//       Bu sözleşmeyi haftalık fırsatlar ekranı ve flaş indirim yöneticisi kullanır; alanlar değiştirilmez.
//   GET /api/campaigns/overview
//       → yayındaki ve önümüzdeki 14 günde planlı kampanyalar türe göre gruplu (groups), sayılar (counts),
//         dikkat gerektirenler (attention) ve son 7/30 gün getirisi (totals).
// Her öğe: { id, type, title, status: live | ending_today | upcoming, startsAt, endsAt, details, stats,
//            children, target: { tab, handoff?: { key, value }, section? } }
//   - status "ending_today": iş günü (İstanbul 04:00–04:00) bitmeden biter; akşam bakıldığında gece 01:00'de
//     biten kampanya da "bu gece biter" sayılır (siparişler gece yarısından sonra da sürer).
//   - handoff.key, paneldeki HANDOFF anahtarının adıdır ("product" → ürün çekmecesini açar).
//   - Bir bölüm yüklenemezse diğerleri yine döner; yüklenemeyenler `partial`, sınıra takılanlar `capped` listesinde.
import FlashSale from "../models/flashSale.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Coupon from "../models/coupon.model.js";
import CouponRequest from "../models/couponRequest.model.js";
import Mission from "../models/mission.model.js";
import Banner from "../models/banner.model.js";
import Referral from "../models/referral.model.js";
import Settings from "../models/settings.model.js";
import { activeWeeklyFilter, isWeeklyDealLive } from "../services/productPricing.js";
import { flashPrice } from "../services/flashSale.service.js";
import { missionRule } from "../services/mission.service.js";
import {
  AUTOMATION_LABELS,
  AUTOMATION_TYPES,
  getAutomationSettings,
  getAutomationStats,
} from "../services/notificationAutomation.service.js";
import {
  DAY_MS,
  PERFORMANCE_MAX_IDS,
  campaignTotals,
  collectFlashPerformance,
  collectWeeklyPerformance,
  finalizePerformance,
  flashSalePerformance,
  istanbulDayStart,
  mergePerformanceAccs,
  refId,
  tonightCutoff,
  weeklyDealPerformance,
} from "../services/campaignPerformance.service.js";

export const CAMPAIGN_TYPES = ["flash", "weekly", "coupon", "coupon_request", "mission", "banner", "automation", "free_delivery"];
export const OVERVIEW_HORIZON_DAYS = 14;
export const LIST_CAP = 300;
const COUPON_CAP = 200;
const SMALL_CAP = 50;
const ATTENTION_CAP = 60;
/** Başlama saati geçtiği hâlde ürüne uygulanmamış flaş indirim bu kadar sonra uyarı olur (zamanlayıcı dakikada bir) */
const NOT_APPLIED_GRACE_MS = 3 * 60 * 1000;
const HEX24 = /^[0-9a-f]{24}$/i;
const IDS_MAX_LENGTH = PERFORMANCE_MAX_IDS * 30;
const PRODUCT_FIELDS = "name price isHidden isOutOfStock image thumbnail";
const BULK_SEPARATOR = " · ";
const STATUS_RANK = { ending_today: 0, live: 1, upcoming: 2 };
const SEVERITY_RANK = { danger: 0, warn: 1, info: 2 };

const validDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const iso = (value) => validDate(value)?.toISOString() ?? null;
const timeOf = (value) => validDate(value)?.getTime() ?? NaN;
const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const text = (value, fallback = "") => (typeof value === "string" ? value.trim() : "") || fallback;

// ── Getiri uç noktası ─────────────────────────────────────────────────────
/** ?type=flash|weekly&ids=a,b,c (dizi olarak da gelebilir) → { type, ids } ya da { error } */
export const parsePerformanceQuery = (query = {}) => {
  const type = typeof query.type === "string" ? query.type.trim() : "";
  if (type !== "flash" && type !== "weekly") return { error: "Kampanya türü flash ya da weekly olmalı" };
  const raw = query.ids;
  let joined = "";
  if (typeof raw === "string") joined = raw;
  else if (Array.isArray(raw) && raw.every((part) => typeof part === "string")) joined = raw.join(",");
  else if (raw !== undefined && raw !== null) return { error: "Geçersiz kampanya kimliği" };
  if (joined.length > IDS_MAX_LENGTH) return { error: `Tek seferde en fazla ${PERFORMANCE_MAX_IDS} kampanya sorgulanabilir` };
  const ids = [...new Set(joined.split(",").map((part) => part.trim()).filter(Boolean))];
  if (ids.length > PERFORMANCE_MAX_IDS) return { error: `Tek seferde en fazla ${PERFORMANCE_MAX_IDS} kampanya sorgulanabilir` };
  if (ids.some((id) => !HEX24.test(id))) return { error: "Geçersiz kampanya kimliği" };
  return { type, ids };
};

export const getCampaignPerformance = async (req, res) => {
  const { type, ids, error } = parsePerformanceQuery(req.query);
  if (error) return res.status(400).json({ success: false, message: error });
  try {
    const result = type === "flash" ? await flashSalePerformance(ids) : await weeklyDealPerformance(ids);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, items: result.items, truncated: result.truncated });
  } catch (err) {
    console.error("Kampanya getirisi hesaplanamadı:", err?.message);
    return res.status(500).json({ success: false, message: "Kampanya getirisi hesaplanamadı" });
  }
};

// ── Öğe yardımcıları ──────────────────────────────────────────────────────
/**
 * Kampanya durumu (bitmiş kayıtlar listeye girmez): upcoming | ending_today (bu iş günü, gece dahil) | live
 */
export const campaignStatus = (startsAt, endsAt, now = new Date()) => {
  const start = validDate(startsAt);
  if (start && start > now) return "upcoming";
  const end = validDate(endsAt);
  if (end && end <= tonightCutoff(now)) return "ending_today";
  return "live";
};
const isLiveStatus = (status) => status === "live" || status === "ending_today";

const productTarget = (productId) =>
  (productId ? { tab: "products", handoff: { key: "product", value: productId } } : { tab: "products" });

const productInfo = (product) => {
  if (!product || typeof product !== "object" || product._bsontype === "ObjectId" || !product._id) return null;
  return {
    id: refId(product._id),
    name: String(product.name || ""),
    price: Number(product.price) || 0,
    isHidden: product.isHidden === true,
    isOutOfStock: product.isOutOfStock === true,
    image: product.thumbnail || product.image || "",
  };
};

/** Ürün satırı ortak alanları (flaş / haftalık alt öğesi) */
const productChild = (product, ref) => ({
  productId: product?.id || refId(ref),
  name: product?.name || "Silinmiş ürün",
  image: product?.image || "",
  missing: !product,
  isHidden: Boolean(product?.isHidden),
  isOutOfStock: Boolean(product?.isOutOfStock),
  listPrice: product ? product.price : null,
});

/** Durum, sonra (yayında: bitişe göre; planlı: başlangıca göre) sıralar */
const compareItems = (a, b) => {
  const rank = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3);
  if (rank) return rank;
  const key = (item) => timeOf(item.status === "upcoming" ? item.startsAt : item.endsAt);
  const ka = key(a);
  const kb = key(b);
  if (Number.isFinite(ka) && Number.isFinite(kb) && ka !== kb) return ka - kb;
  if (Number.isFinite(ka) !== Number.isFinite(kb)) return Number.isFinite(ka) ? -1 : 1;
  return String(a.title).localeCompare(String(b.title), "tr");
};
/** Alt öğeler: ciroya göre, sonra ada göre */
const compareChildren = (a, b) =>
  (Number(b.stats?.revenue) || 0) - (Number(a.stats?.revenue) || 0) || String(a.name).localeCompare(String(b.name), "tr");

/** Grubun getirisi; ölçülemediyse (planlı ya da getiri okunamadı) null — sıfır satış gibi görünmesin */
const groupStats = (accs) => (accs.length ? finalizePerformance(mergePerformanceAccs(accs)) : null);

const discountRange = (children) => {
  const pcts = children.map((child) => Number(child.discountPercentage)).filter((pct) => Number.isFinite(pct) && pct > 0);
  return pcts.length ? { minDiscount: Math.min(...pcts), maxDiscount: Math.max(...pcts) } : { minDiscount: 0, maxDiscount: 0 };
};

/**
 * Toplu oluşturulan flaş indirimin adı "Kampanya adı · Ürün adı" biçimindedir (flashSale.controller
 * createBulkFlashSales). Kampanya adını döndürür; tekil kampanyada null.
 */
export const flashCampaignName = (name, productName) => {
  const full = text(name);
  if (!full) return null;
  if (productName) {
    const suffix = `${BULK_SEPARATOR}${productName}`;
    if (full.endsWith(suffix) && full.length > suffix.length) return full.slice(0, -suffix.length).trim() || null;
  }
  const index = full.indexOf(BULK_SEPARATOR);
  return index > 0 ? full.slice(0, index).trim() || null : null;
};

/**
 * Flaş indirim öğeleri. Aynı kampanya adı, başlangıç ve bitişi paylaşan kayıtlar tek öğede toplanır
 * (children: ürünler); tekil kampanya tek alt öğeli öğedir. Planlı kampanyada stats null.
 */
export const buildFlashItems = (sales, accs = new Map(), now = new Date()) => {
  const singles = [];
  const groups = new Map();
  for (const sale of sales || []) {
    const id = refId(sale?._id);
    if (!id) continue;
    const product = productInfo(sale.product);
    const status = campaignStatus(sale.startDate, sale.endDate, now);
    const acc = status === "upcoming" ? null : accs.get(id) || null;
    const base = productChild(product, sale.product);
    const pct = Number(sale.discountPercentage) || 0;
    const child = {
      id,
      ...base,
      discountPercentage: pct,
      // Uygulanmış kampanyada ürüne yazılan fiyat; değilse ürünün bugünkü fiyatından (uygulandığında aynı kural)
      price: sale.applied === true && finite(sale.appliedPrice) ? Number(sale.appliedPrice) : product ? flashPrice(product.price, pct) : null,
      applied: sale.applied === true,
      status,
      startsAt: iso(sale.startDate),
      endsAt: iso(sale.endDate),
      stats: acc ? finalizePerformance(acc) : null,
      target: productTarget(base.productId),
    };
    const campaign = flashCampaignName(sale.name, product?.name);
    if (!campaign) {
      // Tekil kampanyaya elle verilmiş ad (varsayılan "<ürün> - Flash Sale" değilse) ayrıntıda gösterilir
      const saleName = text(sale.name);
      const customName = saleName && saleName !== `${product?.name || ""} - Flash Sale` ? saleName : null;
      singles.push({ child, accs: acc ? [acc] : [], customName });
      continue;
    }
    const key = `${campaign}\u0000${timeOf(sale.startDate)}\u0000${timeOf(sale.endDate)}`;
    if (!groups.has(key)) groups.set(key, { campaign, children: [], accs: [] });
    const group = groups.get(key);
    group.children.push(child);
    if (acc) group.accs.push(acc);
  }

  const toItem = (title, children, groupAccs, campaign, customName = null) => {
    const first = children[0];
    return {
      id: campaign ? `flash-group:${children.map((child) => child.id).sort()[0]}` : first.id,
      type: "flash",
      title,
      status: first.status,
      startsAt: first.startsAt,
      endsAt: first.endsAt,
      details: { campaign: Boolean(campaign), name: customName, productCount: children.length, ...discountRange(children) },
      stats: groupStats(groupAccs),
      children: [...children].sort(compareChildren),
      target: children.length === 1 ? first.target : { tab: "products" },
    };
  };
  return [
    ...singles.map(({ child, accs: own, customName }) => toItem(child.name, [child], own, false, customName)),
    ...[...groups.values()].map((group) => toItem(group.campaign, group.children, group.accs, true)),
  ].sort(compareItems);
};

/**
 * Haftalık fırsat öğeleri: yayındakiler aynı bitişe, planlılar aynı başlangıç ve bitişe göre tek öğede
 * (children: ürünler). Planlı öğede stats null.
 */
export const buildWeeklyItems = (deals, accs = new Map(), now = new Date()) => {
  const groups = new Map();
  for (const deal of deals || []) {
    const id = refId(deal?._id);
    if (!id) continue;
    const product = productInfo(deal.product);
    const start = validDate(deal.startDate) || validDate(deal.createdAt);
    const status = campaignStatus(start, deal.endDate, now);
    const acc = status === "upcoming" ? null : accs.get(id) || null;
    const base = productChild(product, deal.product);
    const weeklyPrice = finite(deal.weeklyPrice) ? Number(deal.weeklyPrice) : null;
    // Liste fiyatı fırsat fiyatının altına inmişse fırsat etkisizdir: müşteri liste fiyatını öder (productPricing)
    const ineffective = base.listPrice > 0 && weeklyPrice !== null && weeklyPrice >= base.listPrice;
    const child = {
      id,
      ...base,
      weeklyPrice,
      ineffective,
      // İndirim oranı güncel liste fiyatından (kayıtlı oran fiyat değişince eskir)
      discountPercentage: base.listPrice > 0 && weeklyPrice !== null
        ? (ineffective ? 0 : Math.round((1 - weeklyPrice / base.listPrice) * 100))
        : Number(deal.discountPercentage) || 0,
      status,
      startsAt: iso(start),
      endsAt: iso(deal.endDate),
      stats: acc ? finalizePerformance(acc) : null,
      target: productTarget(base.productId),
    };
    const endKey = Number.isFinite(timeOf(deal.endDate)) ? timeOf(deal.endDate) : "open";
    const key = status === "upcoming" ? `upcoming:${timeOf(start)}:${endKey}` : `live:${endKey}`;
    if (!groups.has(key)) groups.set(key, { key, children: [], accs: [] });
    const group = groups.get(key);
    group.children.push(child);
    if (acc) group.accs.push(acc);
  }
  return [...groups.values()].map((group) => {
    const first = group.children[0];
    const starts = group.children.map((child) => timeOf(child.startsAt)).filter(Number.isFinite);
    const planned = first.status === "upcoming";
    return {
      id: `weekly-group:${group.key}`,
      type: "weekly",
      title: planned ? "Planlı haftalık fırsatlar" : "Haftalık fırsatlar",
      status: first.status,
      startsAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
      endsAt: first.endsAt,
      details: { productCount: group.children.length, planned, ...discountRange(group.children) },
      stats: groupStats(group.accs),
      children: [...group.children].sort(compareChildren),
      target: { tab: "weekly-products" },
    };
  }).sort(compareItems);
};

const couponSchedule = (coupon) => {
  const days = Array.isArray(coupon.validDays)
    ? [...new Set(coupon.validDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : [];
  return {
    validDays: days.length && days.length < 7 ? days : [],
    startTime: text(coupon.startTime),
    endTime: text(coupon.endTime),
  };
};

/** Genel kuponlar (kişiye özel olmayan, süresi dolmamış). stats: kullanım ve son 30 günün siparişleri */
export const buildCouponItems = (coupons, couponsByCode = {}, now = new Date()) => (coupons || []).map((coupon) => {
  const code = String(coupon.code || "").trim().toUpperCase();
  const usage = couponsByCode[code] || null;
  const usageCount = Number(coupon.usageCount) || 0;
  const usageLimit = finite(coupon.usageLimit) && Number(coupon.usageLimit) > 0 ? Number(coupon.usageLimit) : null;
  const fixed = coupon.discountType === "fixed";
  return {
    id: refId(coupon._id),
    type: "coupon",
    title: code || "Kupon",
    status: campaignStatus(null, coupon.expirationDate, now),
    startsAt: iso(coupon.createdAt),
    endsAt: iso(coupon.expirationDate),
    details: {
      description: String(coupon.description || ""),
      discountType: fixed ? "fixed" : "percentage",
      discountValue: Number(fixed ? coupon.discountAmount : coupon.discountPercentage) || 0,
      minimumOrderAmount: Number(coupon.minimumOrderAmount) || 0,
      maximumDiscount: finite(coupon.maximumDiscount) ? Number(coupon.maximumDiscount) : null,
      firstOrderOnly: coupon.firstOrderOnly === true,
      newUsersOnly: coupon.newUsersOnly === true,
      ...couponSchedule(coupon),
    },
    stats: {
      usageCount,
      usageLimit,
      exhausted: usageLimit !== null && usageCount >= usageLimit,
      orders30: usage?.orders || 0,
      discount30: usage?.discount || 0,
      revenue30: usage?.revenue || 0,
    },
    children: [],
    target: { tab: "coupons" },
  };
}).sort(compareItems);

/** Topluluk kupon talepleri: katılımcı ve ağırlıklı puan (daveti olan katılımcı 2 puan, couponRequest.controller ile aynı) */
export const buildCouponRequestItems = (campaigns, weights = new Map(), now = new Date()) => (campaigns || []).map((campaign) => {
  const requesterIds = [...new Set((campaign.requesters || []).map((entry) => refId(entry?.user)).filter(Boolean))];
  const targetCount = Number(campaign.targetCount) || 0;
  return {
    id: refId(campaign._id),
    type: "coupon_request",
    title: text(campaign.title, "Topluluk indirimi"),
    status: campaignStatus(campaign.startsAt, campaign.endsAt, now),
    startsAt: iso(campaign.startsAt),
    endsAt: iso(campaign.endsAt),
    details: {
      description: String(campaign.description || ""),
      discountPercentage: Number(campaign.discountPercentage) || 0,
      targetCount,
    },
    stats: {
      participants: requesterIds.length,
      weightedCount: requesterIds.reduce((sum, id) => sum + (weights.get(id) || 1), 0),
      targetCount,
    },
    children: [],
    target: { tab: "coupons", section: "requests" },
  };
}).sort(compareItems);

export const buildMissionItems = (missions, now = new Date()) => (missions || []).map((mission) => {
  const completions = Array.isArray(mission.completions) ? mission.completions.length : 0;
  return {
    id: refId(mission._id),
    type: "mission",
    title: text(mission.title, "Sipariş görevi"),
    status: campaignStatus(mission.startsAt, mission.endsAt, now),
    startsAt: iso(mission.startsAt),
    endsAt: iso(mission.endsAt),
    details: { rule: missionRule(mission), description: String(mission.description || "") },
    stats: { completions, rewardTotal: Math.round(completions * (Number(mission.rewardAmount) || 0) * 100) / 100 },
    children: [],
    target: { tab: "coupons", section: "missions" },
  };
}).sort(compareItems);

const bannerItem = (banner) => ({
  id: refId(banner._id),
  type: "banner",
  title: text(banner.title, "Vitrin görseli"),
  status: "live",
  startsAt: null,
  endsAt: null,
  details: { subtitle: String(banner.subtitle || ""), image: banner.image || "", linkUrl: banner.linkUrl || null },
  stats: null,
  children: [],
  target: { tab: "banners" },
});

const automationItem = ({ type, config, stats }) => ({
  id: `automation:${type}`,
  type: "automation",
  title: AUTOMATION_LABELS[type] || type,
  status: "live",
  startsAt: null,
  endsAt: null,
  details: {
    automation: type,
    coupon: config?.coupon?.enabled
      ? { type: config.coupon.type === "fixed" ? "fixed" : "percentage", value: Number(config.coupon.value) || 0, validDays: Number(config.coupon.validDays) || 0 }
      : null,
  },
  stats: stats
    ? { sent7: stats.sent7 || 0, conversions7: stats.conversions7 || 0, sent30: stats.sent30 || 0, conversions30: stats.conversions30 || 0, revenue30: stats.revenue30 || 0 }
    : null,
  children: [],
  target: { tab: "push", section: "auto" },
});

const freeDeliveryItem = () => ({
  id: "free-delivery",
  type: "free_delivery",
  title: "Tüm bölgelerde ücretsiz teslimat",
  status: "live",
  startsAt: null,
  endsAt: null,
  details: {},
  stats: null,
  children: [],
  target: { tab: "delivery-zones" },
});

// ── Dikkat gerektirenler ──────────────────────────────────────────────────
const unavailableReason = (child) =>
  (child.missing ? "deleted" : child.isHidden ? "hidden" : child.isOutOfStock ? "out_of_stock" : null);

/**
 * kind:
 *  - product_unavailable (danger): yayındaki flaş/haftalık kampanyanın ürünü stokta yok, gizli ya da silinmiş
 *  - flash_not_applied (danger): başlama saati geçtiği hâlde indirim ürüne uygulanmamış (müşteri eski fiyatı görür)
 *  - weekly_ineffective (warn): yayındaki haftalık fırsatın fiyatı liste fiyatından düşük değil (müşteri liste fiyatını öder)
 *  - ending_today (warn): bu iş günü (gece dahil) biten kampanya
 *  - coupon_ending (warn): bugün biten genel kupon
 *  - flash_weekly_overlap: ürün aynı anda flaş indirimde ve haftalık fırsatta; effective: müşterinin ödediği
 *    fiyat (weekly → flaş indirim müşteriye yansımıyor, warn · flash → haftalık fiyat flaş bitene kadar geçmez, info)
 *  - coupon_exhausted (info): kullanım sınırı dolmuş ama açık kupon
 * Önem, sonra zamana göre sıralı; en fazla 60.
 */
export const buildCampaignAttention = ({ flash = [], weekly = [], coupons = [], others = [] } = {}, now = new Date()) => {
  const list = [];

  for (const item of [...flash, ...weekly, ...others]) {
    if (item.status !== "ending_today") continue;
    list.push({ id: `ending:${item.id}`, kind: "ending_today", severity: "warn", type: item.type, title: item.title, at: item.endsAt, target: item.target });
  }

  const liveFlash = new Map();
  const liveWeekly = new Map();
  for (const [items, index] of [[flash, liveFlash], [weekly, liveWeekly]]) {
    for (const item of items) {
      if (!isLiveStatus(item.status)) continue;
      const children = item.children || [];
      const campaign = children.length > 1 || item.type === "weekly" ? item.title : null;
      for (const child of children) {
        if (child.productId && !child.missing && !index.has(child.productId)) index.set(child.productId, { item, child });
        const reason = unavailableReason(child);
        if (reason) {
          list.push({
            id: `unavailable:${item.type}:${child.id}`,
            kind: "product_unavailable",
            severity: "danger",
            type: item.type,
            title: child.name,
            reason,
            campaign,
            at: item.endsAt,
            target: reason === "deleted" ? item.target : productTarget(child.productId),
          });
        } else if (item.type === "weekly" && child.ineffective) {
          list.push({
            id: `weekly-ineffective:${child.id}`,
            kind: "weekly_ineffective",
            severity: "warn",
            type: "weekly",
            title: child.name,
            weeklyPrice: child.weeklyPrice,
            listPrice: child.listPrice,
            campaign,
            at: item.endsAt,
            target: productTarget(child.productId),
          });
        } else if (item.type === "flash" && child.applied === false && now.getTime() - timeOf(child.startsAt) > NOT_APPLIED_GRACE_MS) {
          list.push({
            id: `not-applied:${child.id}`,
            kind: "flash_not_applied",
            severity: "danger",
            type: "flash",
            title: child.name,
            campaign,
            at: item.endsAt,
            target: productTarget(child.productId),
          });
        }
      }
    }
  }

  for (const [productId, flashEntry] of liveFlash) {
    const weeklyEntry = liveWeekly.get(productId);
    if (!weeklyEntry) continue;
    const flashPriceValue = Number(flashEntry.child.price);
    const weeklyPrice = Number(weeklyEntry.child.weeklyPrice);
    if (!Number.isFinite(flashPriceValue) || !Number.isFinite(weeklyPrice)) continue;
    const effective = weeklyPrice <= flashPriceValue ? "weekly" : "flash";
    const ends = [timeOf(flashEntry.item.endsAt), timeOf(weeklyEntry.item.endsAt)].filter(Number.isFinite);
    list.push({
      id: `overlap:${productId}`,
      kind: "flash_weekly_overlap",
      severity: effective === "weekly" ? "warn" : "info",
      type: "flash",
      title: flashEntry.child.name,
      flashPrice: flashPriceValue,
      weeklyPrice,
      effective,
      at: ends.length ? new Date(Math.min(...ends)).toISOString() : null,
      target: productTarget(productId),
    });
  }

  for (const coupon of coupons) {
    if (coupon.status === "ending_today") {
      list.push({ id: `coupon-ending:${coupon.id}`, kind: "coupon_ending", severity: "warn", type: "coupon", title: coupon.title, at: coupon.endsAt, target: coupon.target });
    }
    if (coupon.stats?.exhausted) {
      list.push({
        id: `coupon-exhausted:${coupon.id}`,
        kind: "coupon_exhausted",
        severity: "info",
        type: "coupon",
        title: coupon.title,
        usageCount: coupon.stats.usageCount,
        usageLimit: coupon.stats.usageLimit,
        at: coupon.endsAt,
        target: coupon.target,
      });
    }
  }

  return list
    .sort((a, b) => {
      const severity = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
      if (severity) return severity;
      const ta = timeOf(a.at);
      const tb = timeOf(b.at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
      return String(a.title).localeCompare(String(b.title), "tr");
    })
    .slice(0, ATTENTION_CAP);
};

// ── Veri okuma ────────────────────────────────────────────────────────────
const loadFlashSales = (now, horizonEnd) =>
  FlashSale.find({ isActive: true, endDate: { $gt: now }, startDate: { $lt: horizonEnd } })
    .select("product name discountPercentage startDate endDate applied appliedPrice")
    .populate("product", PRODUCT_FIELDS)
    .sort({ startDate: 1 })
    .limit(LIST_CAP)
    .lean();

/**
 * Yayındaki (activeWeeklyFilter) ve 14 gün içinde başlayacak haftalık fırsatlar. Planlı fırsatlar
 * isActive: false, scheduled: true olarak saklanabilir (alan şemada olmayabilir: strictQuery kapalı).
 */
const loadWeeklyDeals = async (now, horizonEnd) => {
  const deals = await WeeklyProduct.find({
    $or: [
      activeWeeklyFilter(now),
      { isActive: true, startDate: { $gt: now, $lt: horizonEnd } },
      { scheduled: true, startDate: { $gt: now, $lt: horizonEnd } },
    ],
  })
    .setOptions({ strictQuery: false })
    .select("product weeklyPrice discountPercentage startDate endDate isActive scheduled createdAt order")
    .populate("product", PRODUCT_FIELDS)
    .sort({ order: 1, startDate: 1 })
    .limit(LIST_CAP)
    .lean();
  return (deals || []).filter((deal) => {
    if (isWeeklyDealLive(deal, now)) return true;
    const start = validDate(deal.startDate);
    const end = validDate(deal.endDate);
    return Boolean(start) && start > now && start < horizonEnd && (!end || end > start) &&
      (deal.isActive === true || deal.scheduled === true);
  });
};

const loadCoupons = (now) =>
  Coupon.find({
    isActive: true,
    expirationDate: { $gt: now },
    isReferralCoupon: { $ne: true },
    $or: [{ userId: null }, { userId: { $exists: false } }],
  })
    .select("code description discountType discountPercentage discountAmount minimumOrderAmount maximumDiscount usageLimit usageCount expirationDate createdAt validDays startTime endTime firstOrderOnly newUsersOnly")
    .sort({ expirationDate: 1 })
    .limit(COUPON_CAP)
    .lean();

const loadCouponRequests = async (now, horizonEnd) => {
  const campaigns = await CouponRequest.find({ isActive: true, endsAt: { $gt: now }, startsAt: { $lt: horizonEnd } })
    .select("title description targetCount discountPercentage startsAt endsAt requesters.user")
    .sort({ startsAt: 1 })
    .limit(SMALL_CAP)
    .lean();
  const requesterIds = [...new Set((campaigns || []).flatMap((campaign) =>
    (campaign.requesters || []).map((entry) => refId(entry?.user)).filter(Boolean)))];
  const weights = new Map();
  if (requesterIds.length) {
    const referrals = await Referral.find({ referrer: { $in: requesterIds } }).select("referrer totalReferrals").lean();
    for (const referral of referrals || []) {
      weights.set(refId(referral.referrer), (Number(referral.totalReferrals) || 0) > 0 ? 2 : 1);
    }
  }
  return { campaigns: campaigns || [], weights };
};

const loadMissions = (now, horizonEnd) =>
  Mission.find({ isActive: true, endsAt: { $gt: now }, startsAt: { $lt: horizonEnd } })
    .select("title description targetOrders minOrderAmount rewardAmount startsAt endsAt completions.completedAt")
    .sort({ startsAt: 1 })
    .limit(SMALL_CAP)
    .lean();

const loadBanners = () =>
  Banner.find({ isActive: true })
    .select("title subtitle image linkUrl order createdAt")
    .sort({ order: 1, createdAt: -1 })
    .limit(SMALL_CAP)
    .lean();

const loadAutomations = async (now) => {
  const settings = await getAutomationSettings();
  const enabled = AUTOMATION_TYPES.filter((type) => settings?.[type]?.enabled === true);
  if (!enabled.length) return [];
  let stats = null;
  try {
    stats = await getAutomationStats(now);
  } catch (error) {
    console.error("Kampanya merkezi: otomatik bildirim istatistiği okunamadı:", error?.message);
  }
  return enabled.map((type) => ({ type, config: settings[type], stats: stats?.types?.[type] || null }));
};

const loadFreeDelivery = async () => {
  const settings = await Settings.findOne({ name: "default" }).select("delivery.freeDeliveryEverywhere").lean();
  return settings?.delivery?.freeDeliveryEverywhere === true;
};

const EMPTY_PERFORMANCE = Object.freeze({ accs: new Map(), truncated: false });

/**
 * Kampanya merkezi verisi. Bölümler birbirinden bağımsız okunur; biri hata verirse boş döner ve adı
 * `partial` listesine yazılır (ekran diğer bölümleri göstermeye devam eder).
 */
export const buildCampaignOverview = async (now = new Date()) => {
  const todayStart = istanbulDayStart(now);
  const horizonEnd = new Date(todayStart.getTime() + OVERVIEW_HORIZON_DAYS * DAY_MS);
  const partial = [];
  const safe = async (section, load, fallback) => {
    try {
      return await load();
    } catch (error) {
      console.error(`Kampanya merkezi: ${section} okunamadı:`, error?.message);
      partial.push(section);
      return fallback;
    }
  };

  const totalsPromise = safe("totals", () => campaignTotals({ now }), null);
  const [sales, deals, coupons, couponRequests, missions, banners, automations, freeDeliveryEverywhere] = await Promise.all([
    safe("flash", () => loadFlashSales(now, horizonEnd), []),
    safe("weekly", () => loadWeeklyDeals(now, horizonEnd), []),
    safe("coupon", () => loadCoupons(now), []),
    safe("coupon_request", () => loadCouponRequests(now, horizonEnd), { campaigns: [], weights: new Map() }),
    safe("mission", () => loadMissions(now, horizonEnd), []),
    safe("banner", () => loadBanners(), []),
    safe("automation", () => loadAutomations(now), []),
    safe("free_delivery", () => loadFreeDelivery(), false),
  ]);

  const liveFlashIds = (sales || []).filter((sale) => {
    const start = validDate(sale.startDate);
    return Boolean(start) && start <= now;
  }).map((sale) => refId(sale._id));
  const liveWeeklyIds = (deals || []).filter((deal) => isWeeklyDealLive(deal, now)).map((deal) => refId(deal._id));
  const [flashPerformance, weeklyPerformance] = await Promise.all([
    liveFlashIds.length ? safe("flash_performance", () => collectFlashPerformance(liveFlashIds, { now }), EMPTY_PERFORMANCE) : EMPTY_PERFORMANCE,
    liveWeeklyIds.length ? safe("weekly_performance", () => collectWeeklyPerformance(liveWeeklyIds, { now }), EMPTY_PERFORMANCE) : EMPTY_PERFORMANCE,
  ]);
  const totals = await totalsPromise;

  const groups = {
    flash: buildFlashItems(sales, flashPerformance.accs, now),
    weekly: buildWeeklyItems(deals, weeklyPerformance.accs, now),
    coupon: buildCouponItems(coupons, totals?.couponsByCode || {}, now),
    coupon_request: buildCouponRequestItems(couponRequests.campaigns, couponRequests.weights, now),
    mission: buildMissionItems(missions, now),
    banner: (banners || []).map(bannerItem),
    automation: (automations || []).map(automationItem),
    free_delivery: freeDeliveryEverywhere ? [freeDeliveryItem()] : [],
  };

  const all = CAMPAIGN_TYPES.flatMap((type) => groups[type]);
  const counts = {
    live: all.filter((item) => isLiveStatus(item.status)).length,
    endingToday: all.filter((item) => item.status === "ending_today").length,
    upcoming: all.filter((item) => item.status === "upcoming").length,
    byType: Object.fromEntries(CAMPAIGN_TYPES.map((type) => [type, groups[type].filter((item) => isLiveStatus(item.status)).length])),
  };
  const attention = buildCampaignAttention({
    flash: groups.flash,
    weekly: groups.weekly,
    coupons: groups.coupon,
    others: [...groups.coupon_request, ...groups.mission],
  }, now);
  const capped = [
    (sales || []).length >= LIST_CAP && "flash",
    (deals || []).length >= LIST_CAP && "weekly",
    (coupons || []).length >= COUPON_CAP && "coupon",
  ].filter(Boolean);

  return {
    generatedAt: now.toISOString(),
    horizon: { from: todayStart.toISOString(), to: horizonEnd.toISOString(), days: OVERVIEW_HORIZON_DAYS },
    tonightCutoff: tonightCutoff(now).toISOString(),
    counts,
    groups,
    attention,
    totals: totals ? { last7: totals.last7, last30: totals.last30, truncated: totals.truncated } : null,
    performanceTruncated: Boolean(flashPerformance.truncated || weeklyPerformance.truncated),
    freeDeliveryEverywhere: freeDeliveryEverywhere === true,
    partial,
    capped,
  };
};

export const getCampaignOverview = async (req, res) => {
  try {
    const overview = await buildCampaignOverview(new Date());
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, ...overview });
  } catch (error) {
    console.error("Kampanya merkezi yüklenemedi:", error?.message);
    return res.status(500).json({ success: false, message: "Kampanya merkezi yüklenemedi" });
  }
};
