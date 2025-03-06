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

		// Toplam gelir hesaplama - Tüm zamanlar için
		const allOrders = await Order.find();
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

		res.json({
			totalRevenue,
			totalOrders,
			totalUsers,
			totalProducts,
			revenueChange: parseFloat(revenueChange.toFixed(2)),
			ordersChange: parseFloat(ordersChange.toFixed(2)),
			salesByDay,
			popularProducts,
			userGrowth,
			recentOrders: formattedRecentOrders
		});

	} catch (error) {
		console.error("Analytics error:", error);
		res.status(500).json({ message: "Analiz verileri alınırken bir hata oluştu" });
	}
};
