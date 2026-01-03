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
		const currentPeriodRevenue = currentPeriodOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
		const previousPeriodRevenue = previousPeriodOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

		const revenueChange = previousPeriodRevenue === 0 ? 100 : 
			((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100;

		const ordersChange = previousPeriodOrders.length === 0 ? 100 :
			((currentPeriodOrders.length - previousPeriodOrders.length) / previousPeriodOrders.length) * 100;

		// Günlük satış verileri
		const salesByDay = await Order.aggregate([
			{
				$match: {
					createdAt: { $gte: startDate }
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
		const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

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

		res.json({
			totalRevenue,
			totalOrders,
			totalUsers,
			totalProducts,
			revenueChange: parseFloat(revenueChange.toFixed(2)),
			ordersChange: parseFloat(ordersChange.toFixed(2)),
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
			io.emit('orderStatusUpdated', {
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
