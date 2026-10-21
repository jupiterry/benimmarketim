// Memnuniyet raporu (yönetici paneli → Geri bildirimler → Rapor)
// Haftalık ortalama puan, 👍/👎 oranı, şikâyet etiketleri, 1./3./5. sipariş ortalamaları,
// en çok sorun bildirilen ürünler (kalite uyarısı), teslimat noktasına göre teslimat puanı,
// tavsiye puanı (NPS), iptal ve vazgeçme nedenleri.
import Feedback from "../models/feedback.model.js";
import Order from "../models/order.model.js";
import { ABANDON_REASONS, CANCEL_REASONS, FEEDBACK_TAGS, ISSUE_TYPES, POSITIVE_TAGS } from "../lib/feedbackOptions.js";

const DAY = 24 * 60 * 60 * 1000;
const round1 = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);
const avg = (values) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null);
export const QUALITY_ALERT_THRESHOLD = 2; // Dönem içinde bu kadar sorun bildirilen ürün kalite uyarısı alır

/** Pazartesi başlangıçlı hafta anahtarı (Türkiye saati) */
export const weekStart = (date) => {
  const local = new Date(new Date(date).getTime() + 3 * 60 * 60 * 1000);
  const day = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - day);
  return local.toISOString().slice(0, 10);
};

/** NPS = destekçi % − eleştirmen % (0-6 eleştirmen, 7-8 pasif, 9-10 destekçi) */
export const npsOf = (scores) => {
  if (!scores.length) return { score: null, count: 0, promoters: 0, passives: 0, detractors: 0 };
  const promoters = scores.filter((score) => score >= 9).length;
  const detractors = scores.filter((score) => score <= 6).length;
  return {
    score: Math.round(((promoters - detractors) / scores.length) * 100),
    count: scores.length,
    promoters,
    passives: scores.length - promoters - detractors,
    detractors,
  };
};

const countBy = (items, keyOf) => {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key) map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
};

/** Ham kayıtlardan rapor; veritabanından bağımsız (test edilebilir) */
export const buildSatisfactionReport = ({ feedbacks = [], cancelledOrders = [], now = new Date(), days = 56 } = {}) => {
  const surveys = feedbacks.filter((f) => f.kind === "order" || (f.milestone && !f.kind) || (f.milestone && f.kind === "general"));
  const quick = feedbacks.filter((f) => f.kind === "quick");
  const rated = feedbacks.filter((f) => Number(f.rating) > 0 && f.kind !== "nps");

  // Haftalık eğilim: ortalama puan (anket + eski serbest form), 👍 oranı, teslimat puanı
  const weeks = new Map();
  const start = new Date(now.getTime() - days * DAY);
  for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getTime() + 7 * DAY)) {
    weeks.set(weekStart(cursor), { week: weekStart(cursor), ratings: [], delivery: [], up: 0, down: 0 });
  }
  for (const f of feedbacks) {
    const bucket = weeks.get(weekStart(f.createdAt));
    if (!bucket) continue;
    if (Number(f.rating) > 0 && f.kind !== "nps") bucket.ratings.push(Number(f.rating));
    if (Number(f.deliveryRating) > 0) bucket.delivery.push(Number(f.deliveryRating));
    if (f.thumb === "up") bucket.up += 1;
    if (f.thumb === "down") bucket.down += 1;
  }
  const weekly = [...weeks.values()].map((w) => ({
    week: w.week,
    averageRating: avg(w.ratings),
    ratingCount: w.ratings.length,
    averageDelivery: avg(w.delivery),
    up: w.up,
    down: w.down,
  }));

  // Şikâyet etiketleri (olumlu etiketler hariç)
  const complaintTags = [...countBy(feedbacks.flatMap((f) => (f.tags || []).filter((tag) => !POSITIVE_TAGS.includes(tag))), (tag) => tag)]
    .map(([tag, count]) => ({ tag, label: FEEDBACK_TAGS[tag] || tag, count }))
    .sort((a, b) => b.count - a.count).slice(0, 10);

  // 1., 3., 5. sipariş anketi ortalamaları (eski 15. sipariş anketi de gösterilir)
  const byMilestone = [...new Set(surveys.map((f) => Number(f.milestone)).filter(Boolean))].sort((a, b) => a - b).map((milestone) => {
    const rows = surveys.filter((f) => Number(f.milestone) === milestone);
    return {
      milestone,
      count: rows.length,
      averageRating: avg(rows.map((f) => Number(f.rating)).filter(Boolean)),
      averageDelivery: avg(rows.map((f) => Number(f.deliveryRating)).filter(Boolean)),
    };
  });

  // Ürün bazında sorunlar → kalite uyarıları
  const products = new Map();
  for (const f of feedbacks) {
    for (const item of f.problemItems || []) {
      const key = item.product ? String(item.product) : `name:${item.name}`;
      const row = products.get(key) || { productId: item.product ? String(item.product) : null, name: item.name || "Ürün", count: 0, issues: {}, lastAt: null };
      row.count += 1;
      row.issues[item.issue] = (row.issues[item.issue] || 0) + 1;
      if (!row.lastAt || new Date(f.createdAt) > new Date(row.lastAt)) row.lastAt = f.createdAt;
      products.set(key, row);
    }
  }
  const problemProducts = [...products.values()]
    .map((row) => ({ ...row, alert: row.count >= QUALITY_ALERT_THRESHOLD, issueLabels: Object.entries(row.issues).map(([issue, count]) => ({ issue, label: ISSUE_TYPES[issue] || issue, count })) }))
    .sort((a, b) => b.count - a.count).slice(0, 15);

  // Teslimat noktasına göre
  const points = new Map();
  for (const f of feedbacks) {
    if (!f.deliveryPoint || f.kind === "nps" || f.kind === "abandon") continue;
    const row = points.get(f.deliveryPoint) || { deliveryPoint: f.deliveryPoint, ratings: [], delivery: [], up: 0, down: 0, lateComplaints: 0 };
    if (Number(f.rating) > 0) row.ratings.push(Number(f.rating));
    if (Number(f.deliveryRating) > 0) row.delivery.push(Number(f.deliveryRating));
    if (f.thumb === "up") row.up += 1;
    if (f.thumb === "down") row.down += 1;
    if ((f.tags || []).includes("gec")) row.lateComplaints += 1;
    points.set(f.deliveryPoint, row);
  }
  const byDeliveryPoint = [...points.values()].map((row) => ({
    deliveryPoint: row.deliveryPoint,
    count: row.ratings.length + row.up + row.down,
    averageRating: avg(row.ratings),
    averageDelivery: avg(row.delivery),
    up: row.up,
    down: row.down,
    lateComplaints: row.lateComplaints,
  }));

  // NPS: dönem toplamı ve aylık eğilim
  const npsRows = feedbacks.filter((f) => f.kind === "nps" && Number.isFinite(Number(f.npsScore)));
  const months = new Map();
  for (const f of npsRows) {
    const key = new Date(new Date(f.createdAt).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
    months.set(key, [...(months.get(key) || []), Number(f.npsScore)]);
  }
  const nps = { ...npsOf(npsRows.map((f) => Number(f.npsScore))), monthly: [...months.entries()].sort().map(([month, scores]) => ({ month, ...npsOf(scores) })) };

  const cancelReasons = [...countBy(cancelledOrders, (order) => order.cancelReason?.code)]
    .map(([code, count]) => ({ code, label: CANCEL_REASONS[code] || code, count })).sort((a, b) => b.count - a.count);
  const abandonReasons = [...countBy(feedbacks.filter((f) => f.kind === "abandon"), (f) => f.reason)]
    .map(([code, count]) => ({ code, label: ABANDON_REASONS[code] || code, count })).sort((a, b) => b.count - a.count);

  const ratings = rated.map((f) => Number(f.rating));
  const deliveryRatings = feedbacks.map((f) => Number(f.deliveryRating)).filter((value) => value > 0);
  return {
    days,
    totals: {
      feedbacks: feedbacks.length,
      averageRating: avg(ratings),
      averageDelivery: avg(deliveryRatings),
      up: quick.filter((f) => f.thumb === "up").length,
      down: quick.filter((f) => f.thumb === "down").length,
      problemReports: feedbacks.reduce((sum, f) => sum + (f.problemItems?.length || 0), 0),
      cancelledWithReason: cancelledOrders.filter((order) => order.cancelReason?.code).length,
      cancelled: cancelledOrders.length,
    },
    weekly,
    complaintTags,
    byMilestone,
    problemProducts,
    qualityAlerts: problemProducts.filter((row) => row.alert),
    byDeliveryPoint,
    nps,
    cancelReasons,
    abandonReasons,
  };
};

// GET /api/feedback/report?days=56
export const getSatisfactionReport = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 56));
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY);
    const [feedbacks, cancelledOrders] = await Promise.all([
      Feedback.find({ createdAt: { $gte: since } })
        .select("kind rating deliveryRating thumb npsScore tags milestone problemItems deliveryPoint reason createdAt")
        .lean(),
      Order.find({ status: "İptal Edildi", updatedAt: { $gte: since } }).select("cancelReason").lean(),
    ]);
    res.json(buildSatisfactionReport({ feedbacks, cancelledOrders, now, days }));
  } catch (error) {
    console.error("Memnuniyet raporu hazırlanamadı:", error);
    res.status(500).json({ message: "Rapor hazırlanamadı", error: error.message });
  }
};
