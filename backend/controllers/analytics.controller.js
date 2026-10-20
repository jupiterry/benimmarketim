import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Product from "../models/product.model.js";

export const getAnalytics = async (req, res) => {
	try {
		const { timeRange } = req.query;
		let startDate = new Date();

		// Zaman aralığına göre başlangıç tarihini ayarla
		switch (timeRange) {
			case "week":
				startDate.setDate(startDate.getDate() - 7);
				break;
			case "month":
				startDate.setMonth(startDate.getMonth() - 1);
				break;
			case "year":
				startDate.setFullYear(startDate.getFullYear() - 1);
				break;
			default:
				startDate.setDate(startDate.getDate() - 7);
		}

		// Toplam istatistikler - Tüm zamanlar için
		const totalOrders = await Order.countDocuments();
		const totalUsers = await User.countDocuments();
		const totalProducts = await Product.countDocuments();

		// Seçili dönem için sipariş verileri
		const currentPeriodOrders = await Order.find({
			createdAt: { $gte: startDate }
		});

		// Önceki dönem için sipariş verileri
		const previousPeriodStart = new Date(startDate);
		switch (timeRange) {
			case "week":
				previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
				break;
			case "month":
				previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
				break;
			case "year":
				previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
				break;
		}

		const previousPeriodOrders = await Order.find({
			createdAt: { $gte: previousPeriodStart, $lt: startDate }
		});

		// Toplam gelir hesaplama - Tüm zamanlar için (İptal edilenler hariç)
		const allOrders = await Order.find({ status: { $ne: "İptal Edildi" } });
		const totalRevenue = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

		// Değişim oranları hesaplama
		const currentPeriodRevenue = currentPeriodOrders.filter(o => o.status !== "İptal Edildi").reduce((sum, order) => sum + (order.totalAmount || 0), 0);
		const previousPeriodRevenue = previousPeriodOrders.filter(o => o.status !== "İptal Edildi").reduce((sum, order) => sum + (order.totalAmount || 0), 0);

		const revenueChange = previousPeriodRevenue === 0 ? null :
			((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100;

		const ordersChange = previousPeriodOrders.length === 0 ? null :
			((currentPeriodOrders.length - previousPeriodOrders.length) / previousPeriodOrders.length) * 100;

		// Günlük satış verileri
		const salesByDay = await Order.aggregate([
			{
				$match: {
					createdAt: { $gte: startDate }, status: { $ne: "İptal Edildi" }
				}
			},
			{
				$group: {
					_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
					amount: { $sum: "$totalAmount" }
				}
			},
			{
				$project: {
					date: "$_id",
					amount: 1,
					_id: 0
				}
			},
			{
				$sort: { date: 1 }
			}
		]);

		// En çok satan ürünler
		const popularProducts = await Order.aggregate([
			{ $match: { createdAt: { $gte: startDate }, status: { $ne: "İptal Edildi" } } },
			{
				$unwind: "$products"
			},
			{
				$group: {
					_id: "$products.product",
					totalSales: { $sum: "$products.quantity" },
					revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } }
				}
			},
			{
				$lookup: {
					from: "products",
					localField: "_id",
					foreignField: "_id",
					as: "productInfo"
				}
			},
			{
				$project: {
					name: { $arrayElemAt: ["$productInfo.name", 0] },
					totalSales: 1,
					revenue: 1
				}
			},
			{
				$sort: { totalSales: -1 }
			},
			{
				$limit: 5
			}
		]);

		// Kullanıcı büyüme verileri
		const userGrowth = await User.aggregate([
			{
				$match: {
					createdAt: { $gte: startDate }
				}
			},
			{
				$group: {
					_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
					count: { $sum: 1 }
				}
			},
			{
				$sort: { _id: 1 }
			}
		]);

		// Son siparişler
		const recentOrders = await Order.find()
			.sort({ createdAt: -1 })
			.limit(10)
			.populate("user", "name email")
			.lean();

		const formattedRecentOrders = recentOrders.map(order => ({
			id: order._id,
			customer: order.user?.name || "Bilinmeyen Kullanıcı",
			items: order.products?.length || 0,
			total: order.totalAmount || 0,
			status: order.status || "Beklemede"
		}));

		// Yeni metrikler hesaplama

		// Ortalama sipariş değeri
		const currentValidCount = currentPeriodOrders.filter(o => o.status !== "İptal Edildi").length;
		const averageOrderValue = currentValidCount > 0 ? currentPeriodRevenue / currentValidCount : 0;

		// Dönüşüm oranı (basit hesaplama - sipariş veren kullanıcı / toplam kullanıcı)
		const ordersWithUsers = await Order.distinct("user");
		const conversionRate = totalUsers > 0 ? (ordersWithUsers.length / totalUsers) * 100 : 0;

		// Müşteri sadakati (tekrar sipariş veren müşteri oranı)
		const repeatCustomers = await Order.aggregate([
			{
				$group: {
					_id: "$user",
					orderCount: { $sum: 1 }
				}
			},
			{
				$match: {
					orderCount: { $gt: 1 }
				}
			}
		]);
		const customerRetention = ordersWithUsers.length > 0 ? (repeatCustomers.length / ordersWithUsers.length) * 100 : 0;

		// Kategori dağılımı
		const categoryBreakdown = await Order.aggregate([
			{ $match: { createdAt: { $gte: startDate }, status: { $ne: "İptal Edildi" } } },
			{
				$unwind: "$products"
			},
			{
				$lookup: {
					from: "products",
					localField: "products.product",
					foreignField: "_id",
					as: "productInfo"
				}
			},
			{
				$unwind: "$productInfo"
			},
			{
				$group: {
					_id: "$productInfo.category",
					count: { $sum: "$products.quantity" },
					revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } }
				}
			},
			{
				$project: {
					name: "$_id",
					count: 1,
					revenue: 1,
					_id: 0
				}
			}
		]);

		// Toplam satış sayısını hesapla
		const totalSales = categoryBreakdown.reduce((sum, cat) => sum + cat.count, 0);
		
		// Yüzdelik dağılımı hesapla
		const formattedCategoryBreakdown = categoryBreakdown.map(category => ({
			...category,
			percentage: totalSales > 0 ? parseFloat(((category.count / totalSales) * 100).toFixed(1)) : 0
		}));

		// Saatlik sipariş verileri
		const hourlyData = await Order.aggregate([
			{
				$match: {
					createdAt: { $gte: startDate }
				}
			},
			{
				$group: {
					_id: { $hour: "$createdAt" },
					orders: { $sum: 1 },
					revenue: { $sum: "$totalAmount" }
				}
			},
			{
				$project: {
					hour: "$_id",
					orders: 1,
					revenue: 1,
					_id: 0
				}
			},
			{
				$sort: { hour: 1 }
			}
		]);

		// Sipariş durumu dağılımı
		const orderStatusBreakdown = await Order.aggregate([
			{
				$group: {
					_id: "$status",
					count: { $sum: 1 }
				}
			},
			{
				$project: {
					status: "$_id",
					count: 1,
					percentage: {
						$round: [
							{
								$multiply: [
									{ $divide: ["$count", totalOrders] },
									100
								]
							},
							1
						]
					},
					_id: 0
				}
			}
		]);

		// Şehir bazında satışlar
		const topCities = await Order.aggregate([
			{
				$group: {
					_id: "$city",
					orders: { $sum: 1 },
					revenue: { $sum: "$totalAmount" }
				}
			},
			{
				$project: {
					name: "$_id",
					orders: 1,
					revenue: 1,
					_id: 0
				}
			},
			{
				$sort: { orders: -1 }
			},
			{
				$limit: 10
			}
		]);

		const cancelled = currentPeriodOrders.filter(o => o.status === "İptal Edildi");
		const valid = currentPeriodOrders.filter(o => o.status !== "İptal Edildi");
		res.json({
			periodRevenue: currentPeriodRevenue,
			previousPeriodRevenue,
			periodOrders: valid.length,
			cancelledCount: cancelled.length,
			cancelledAmount: cancelled.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
			returnRate: null,
			couponOrders: valid.filter(o => o.couponCode).length,
			couponDiscount: valid.reduce((sum, o) => sum + (o.couponDiscount || 0), 0),
			totalRevenue,
			totalOrders,
			totalUsers,
			totalProducts,
			revenueChange: revenueChange === null ? null : parseFloat(revenueChange.toFixed(2)),
			ordersChange: ordersChange === null ? null : parseFloat(ordersChange.toFixed(2)),
			averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
			conversionRate: parseFloat(conversionRate.toFixed(2)),
			customerRetention: parseFloat(customerRetention.toFixed(2)),
			salesByDay,
			popularProducts,
			userGrowth,
			recentOrders: formattedRecentOrders,
			categoryBreakdown: formattedCategoryBreakdown,
			hourlyData,
			orderStatusBreakdown,
			topCities
		});

	} catch (error) {
		console.error("Analytics error:", error);
		res.status(500).json({ message: "Analiz verileri alınırken bir hata oluştu" });
	}
};

// Isı haritası verileri
export const getHeatmapData = async (req, res) => {
	try {
		const { month, year } = req.query;
		
		// Ay ve yıl parametrelerini al (varsayılan: şu anki ay ve yıl)
		const targetMonth = month !== undefined ? parseInt(month) : new Date().getMonth();
		const targetYear = year !== undefined ? parseInt(year) : new Date().getFullYear();

		// Ay başlangıç ve bitiş tarihlerini hesapla
		const startDate = new Date(targetYear, targetMonth, 1);
		const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

		// Siparişleri getir ve gün + saate göre grupla
		const heatmapData = await Order.aggregate([
			{
				$match: {
					createdAt: { $gte: startDate, $lte: endDate },
					status: { $in: ["processing", "shipped", "completed"] }
				}
			},
			{
				$project: {
					dayOfWeek: { $dayOfWeek: "$createdAt" }, // 1 = Pazar, 7 = Cumartesi
					hour: { $hour: "$createdAt" },
					totalAmount: 1
				}
			},
			{
				$group: {
					_id: {
						dayOfWeek: "$dayOfWeek",
						hour: "$hour"
					},
					sales: { $sum: 1 },
					revenue: { $sum: "$totalAmount" }
				}
			},
			{
				$project: {
					_id: 0,
					dayOfWeek: { $subtract: ["$_id.dayOfWeek", 1] }, // MongoDB: 1=Pazar, JS: 0=Pazar
					hour: "$_id.hour",
					sales: 1,
					revenue: 1
				}
			},
			{
				$sort: { dayOfWeek: 1, hour: 1 }
			}
		]);

		res.json({ heatmap: heatmapData });
	} catch (error) {
		console.error("Heatmap error:", error);
		res.status(500).json({ message: "Isı haritası verileri alınırken hata oluştu" });
	}
};

// Sipariş durumu güncelleme fonksiyonu
export const updateOrderStatus = async (req, res) => {
	try {
		const { orderId, newStatus } = req.body;
		
		if (!orderId || !newStatus) {
			return res.status(400).json({ error: "Sipariş ID ve yeni durum gerekli!" });
		}
		
		// Geçerli durumlar
		const validStatuses = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];
		if (!validStatuses.includes(newStatus)) {
			return res.status(400).json({ error: "Geçersiz sipariş durumu!" });
		}
		
		// Siparişi bul ve güncelle
		const order = await Order.findById(orderId);
		if (!order) {
			return res.status(404).json({ error: "Sipariş bulunamadı!" });
		}
		
		// Durumu güncelle
		order.status = newStatus;
		await order.save();
		
		// Socket.IO ile gerçek zamanlı güncelleme gönder
		const io = req.app.get('io');
		if (io) {
			io.to(`user_${order.user.toString()}`).to('adminRoom').emit('orderStatusUpdated', {
				orderId: order._id,
				newStatus: newStatus,
				userId: order.user.toString(),
				timestamp: new Date()
			});
		}
		
		res.json({ 
			success: true, 
			message: "Sipariş durumu güncellendi",
			order: {
				_id: order._id,
				status: order.status,
				updatedAt: order.updatedAt
			}
		});
		
	} catch (error) {
		console.error("Sipariş durumu güncelleme hatası:", error);
		res.status(500).json({ error: "Sipariş durumu güncellenirken hata oluştu" });
	}
};

// ─────────────────────────────────────────────────────────────────────────────
// Dönem karşılaştırması: GET /analytics/compare?period=day|week|month|year
// Bu dönem (başından şimdiye) ile önceki dönemin aynı noktaya kadarki kısmını kıyaslar;
// kırılımlar (saat, yurt, kategori, ürün, hazırlama süresi) seçili dönem için hesaplanır.
// Türkiye saati sabit UTC+3 (2016'dan beri yaz saati yok); sınırlar buna göre çizilir.
// ─────────────────────────────────────────────────────────────────────────────
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const COMPARE_PERIODS = new Set(["day", "week", "month", "year"]);
const ACTIVE_STATUSES = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];

/** Yerel (TR) takvime göre dönem başlangıcını UTC Date olarak verir */
const periodStart = (date, period) => {
	const local = new Date(date.getTime() + TR_OFFSET_MS);
	const y = local.getUTCFullYear();
	const m = local.getUTCMonth();
	const d = local.getUTCDate();
	let start;
	switch (period) {
		case "day": start = Date.UTC(y, m, d); break;
		case "week": {
			const dow = (local.getUTCDay() + 6) % 7; // Pazartesi = 0
			start = Date.UTC(y, m, d - dow);
			break;
		}
		case "year": start = Date.UTC(y, 0, 1); break;
		default: start = Date.UTC(y, m, 1);
	}
	return new Date(start - TR_OFFSET_MS);
};

/** Bir dönem başlangıcını bir önceki döneme kaydırır (takvim birimine göre) */
const shiftPeriod = (start, period, delta) => {
	const local = new Date(start.getTime() + TR_OFFSET_MS);
	let next;
	switch (period) {
		case "day": next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + delta); break;
		case "week": next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 7 * delta); break;
		case "year": next = Date.UTC(local.getUTCFullYear() + delta, 0, 1); break;
		default: next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + delta, 1);
	}
	return new Date(next - TR_OFFSET_MS);
};

/**
 * Karşılaştırma pencereleri: current = [bu dönemin başı, şimdi),
 * previous = [önceki dönemin başı, önceki dönemde aynı mesafe), previousFull = önceki dönemin tamamı.
 */
export const resolveComparePeriods = (period = "week", now = new Date()) => {
	const unit = COMPARE_PERIODS.has(period) ? period : "week";
	const currentStart = periodStart(now, unit);
	const previousStart = shiftPeriod(currentStart, unit, -1);
	const elapsed = now.getTime() - currentStart.getTime();
	const previousEnd = new Date(Math.min(previousStart.getTime() + elapsed, currentStart.getTime()));
	return {
		period: unit,
		current: { start: currentStart, end: now },
		previous: { start: previousStart, end: previousEnd },
		previousFull: { start: previousStart, end: currentStart },
	};
};

const trHour = (date) => new Date(new Date(date).getTime() + TR_OFFSET_MS).getUTCHours();
const trDay = (date) => new Date(new Date(date).getTime() + TR_OFFSET_MS).toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (current, previous) => (previous > 0 ? round2(((current - previous) / previous) * 100) : null);
const diff = (current, previous) => (previous === null || current === null ? null : round2(current - previous));

/** Hazırlanıyor → Yolda arası dakika (statusHistory'den; "Hazırlanıyor" kaydı yoksa sipariş zamanı esas alınır) */
export const prepMinutes = (order) => {
	const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
	const shipped = history.find((h) => h.status === "Yolda" && h.changedAt);
	if (!shipped) return null;
	const preparing = history.find((h) => h.status === "Hazırlanıyor" && h.changedAt);
	const from = new Date(preparing?.changedAt || order.createdAt).getTime();
	const to = new Date(shipped.changedAt).getTime();
	if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
	return (to - from) / 60000;
};

const median = (values) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Sipariş listesinden dönem özeti (saf; test edilebilir) */
export const summarizeCompareOrders = (orders = []) => {
	const valid = orders.filter((o) => o.status !== "İptal Edildi");
	const cancelled = orders.filter((o) => o.status === "İptal Edildi");
	const revenue = round2(valid.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0));
	const prep = valid.map(prepMinutes).filter((m) => m !== null);
	const avgPrep = prep.length ? round2(prep.reduce((a, b) => a + b, 0) / prep.length) : null;
	return {
		orders: valid.length,
		revenue,
		cancelled: cancelled.length,
		cancelledAmount: round2(cancelled.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)),
		cancelRate: orders.length ? round2((cancelled.length / orders.length) * 100) : null,
		averageOrderValue: valid.length ? round2(revenue / valid.length) : 0,
		couponOrders: valid.filter((o) => o.couponCode).length,
		couponDiscount: round2(valid.reduce((sum, o) => sum + (Number(o.couponDiscount) || 0), 0)),
		avgPrepMinutes: avgPrep,
		medianPrepMinutes: prep.length ? round2(median(prep)) : null,
		prepSampled: prep.length,
		units: valid.reduce((sum, o) => sum + (o.products || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0), 0),
	};
};

/** Dönem başından itibaren gün sırası (1..n) ile günlük ciro/sipariş; iki dönem aynı eksende çizilir */
export const dailySeries = (orders, start) => {
	const startDay = trDay(start);
	const map = new Map();
	for (const o of orders) {
		if (o.status === "İptal Edildi") continue;
		const day = trDay(o.createdAt);
		const entry = map.get(day) || { date: day, amount: 0, orders: 0 };
		entry.amount = round2(entry.amount + (Number(o.totalAmount) || 0));
		entry.orders += 1;
		map.set(day, entry);
	}
	const startMs = Date.UTC(+startDay.slice(0, 4), +startDay.slice(5, 7) - 1, +startDay.slice(8, 10));
	return [...map.values()]
		.sort((a, b) => (a.date < b.date ? -1 : 1))
		.map((e) => ({ ...e, dayIndex: Math.round((Date.UTC(+e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10)) - startMs) / 86400000) + 1 }));
};

/** Saat dilimine göre sipariş (24 satır, TR saati) */
export const hourlyBreakdown = (orders) => {
	const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
	for (const o of orders) {
		if (o.status === "İptal Edildi") continue;
		const row = rows[trHour(o.createdAt)];
		row.orders += 1;
		row.revenue = round2(row.revenue + (Number(o.totalAmount) || 0));
	}
	return rows;
};

/** Yurda göre sipariş ve ciro */
export const dormBreakdown = (orders) => {
	const map = new Map();
	for (const o of orders) {
		if (o.status === "İptal Edildi") continue;
		const key = o.deliveryPoint || "unknown";
		const row = map.get(key) || { deliveryPoint: key, orders: 0, revenue: 0 };
		row.orders += 1;
		row.revenue = round2(row.revenue + (Number(o.totalAmount) || 0));
		map.set(key, row);
	}
	return [...map.values()].sort((a, b) => b.revenue - a.revenue);
};

/** En çok satan ürünler (sipariş satırlarından; adet, sipariş sayısı, ciro) */
export const topProductsBreakdown = (orders, limit = 10) => {
	const map = new Map();
	for (const o of orders) {
		if (o.status === "İptal Edildi") continue;
		for (const line of o.products || []) {
			const key = String(line.product || line.name || "");
			if (!key) continue;
			const row = map.get(key) || { productId: line.product ? String(line.product) : null, name: line.name || "İsimsiz ürün", category: line.category || null, units: 0, orders: 0, revenue: 0 };
			row.units += Number(line.quantity) || 0;
			row.orders += 1;
			row.revenue = round2(row.revenue + (Number(line.price) || 0) * (Number(line.quantity) || 0));
			map.set(key, row);
		}
	}
	return [...map.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit);
};

const COMPARE_FIELDS = "products totalAmount status statusHistory createdAt deliveryPoint couponCode couponDiscount";
const findCompareOrders = (range) =>
	Order.find({ createdAt: { $gte: range.start, $lt: range.end }, status: { $in: ACTIVE_STATUSES } }).select(COMPARE_FIELDS).lean();

/** Kategoriye göre ciro: satırdaki `category` alanı, eski siparişlerde ürün kaydından tamamlanır */
const categoryRevenue = (range) =>
	Order.aggregate([
		{ $match: { createdAt: { $gte: range.start, $lt: range.end }, status: { $ne: "İptal Edildi" } } },
		{ $unwind: "$products" },
		{
			$lookup: {
				from: "products",
				localField: "products.product",
				foreignField: "_id",
				pipeline: [{ $project: { category: 1 } }],
				as: "productInfo",
			},
		},
		{
			$group: {
				_id: { $ifNull: ["$products.category", { $arrayElemAt: ["$productInfo.category", 0] }] },
				units: { $sum: "$products.quantity" },
				revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } },
			},
		},
		{ $project: { _id: 0, category: { $ifNull: ["$_id", "diger"] }, units: 1, revenue: { $round: ["$revenue", 2] } } },
		{ $sort: { revenue: -1 } },
	]);

/** Saf hesaplama: veritabanı sonuçlarından yanıt gövdesi */
export const buildCompareResponse = ({ ranges, currentOrders, previousOrders, categories }) => {
	const previousInWindow = previousOrders.filter((o) => new Date(o.createdAt).getTime() < ranges.previous.end.getTime());
	const current = summarizeCompareOrders(currentOrders);
	const previous = summarizeCompareOrders(previousInWindow);
	const previousFull = summarizeCompareOrders(previousOrders);
	const catTotal = categories.reduce((sum, c) => sum + (Number(c.revenue) || 0), 0);
	return {
		period: ranges.period,
		generatedAt: ranges.current.end.toISOString(),
		current: { start: ranges.current.start.toISOString(), end: ranges.current.end.toISOString(), ...current },
		previous: { start: ranges.previous.start.toISOString(), end: ranges.previous.end.toISOString(), ...previous },
		previousFull: { start: ranges.previousFull.start.toISOString(), end: ranges.previousFull.end.toISOString(), revenue: previousFull.revenue, orders: previousFull.orders },
		deltas: {
			revenue: pct(current.revenue, previous.revenue),
			orders: pct(current.orders, previous.orders),
			averageOrderValue: pct(current.averageOrderValue, previous.averageOrderValue),
			units: pct(current.units, previous.units),
			cancelRate: diff(current.cancelRate, previous.cancelRate),
			avgPrepMinutes: diff(current.avgPrepMinutes, previous.avgPrepMinutes),
			couponDiscount: pct(current.couponDiscount, previous.couponDiscount),
		},
		salesByDay: { current: dailySeries(currentOrders, ranges.current.start), previous: dailySeries(previousOrders, ranges.previous.start) },
		hourly: hourlyBreakdown(currentOrders),
		byDorm: dormBreakdown(currentOrders),
		byCategory: categories.map((c) => ({ ...c, share: catTotal > 0 ? round2((c.revenue / catTotal) * 100) : 0 })),
		topProducts: topProductsBreakdown(currentOrders),
	};
};

export const getAnalyticsCompare = async (req, res) => {
	try {
		const ranges = resolveComparePeriods(String(req.query.period || "week"), new Date());
		const [currentOrders, previousOrders, categories] = await Promise.all([
			findCompareOrders(ranges.current),
			findCompareOrders(ranges.previousFull),
			categoryRevenue(ranges.current),
		]);
		res.json(buildCompareResponse({ ranges, currentOrders, previousOrders, categories }));
	} catch (error) {
		console.error("Analytics compare error:", error);
		res.status(500).json({ message: "Karşılaştırma verileri alınırken bir hata oluştu" });
	}
};
