import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import axios from "../lib/axios";
import {
	TrendingUp,
	Users,
	ShoppingBag,
	Package,
	ArrowUp,
	ArrowDown,
	DollarSign,
	Star,
	Clock
} from "lucide-react";

const AnalyticsTab = () => {
	const [analyticsData, setAnalyticsData] = useState({
		totalRevenue: 0,
		totalOrders: 0,
		totalUsers: 0,
		totalProducts: 0,
		revenueChange: 0,
		ordersChange: 0,
		popularProducts: [],
		salesByDay: [],
		userGrowth: [],
		recentOrders: []
	});
	const [timeRange, setTimeRange] = useState("week");
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		fetchAnalytics();
	}, [timeRange]);

	const fetchAnalytics = async () => {
		try {
			const response = await axios.get("/analytics", {
				params: { timeRange }
			});
			setAnalyticsData(response.data);
		} catch (error) {
			console.error("Analiz verileri alınırken hata:", error);
		} finally {
			setIsLoading(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex justify-center items-center min-h-[400px]">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Zaman Aralığı Seçici */}
			<div className="flex justify-end mb-6">
				<div className="bg-gray-700/50 rounded-lg p-1 inline-flex">
					{["week", "month", "year"].map((range) => (
						<button
							key={range}
							onClick={() => setTimeRange(range)}
							className={`px-4 py-2 rounded-md transition-all ${
								timeRange === range
									? "bg-emerald-500 text-white"
									: "text-gray-400 hover:text-white"
							}`}
						>
							{range === "week" ? "Haftalık" : range === "month" ? "Aylık" : "Yıllık"}
						</button>
					))}
				</div>
			</div>

			{/* Özet Kartları */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<StatCard
					title="Toplam Gelir"
					value={`₺${analyticsData.totalRevenue.toLocaleString()}`}
					change={analyticsData.revenueChange}
					icon={<DollarSign className="w-6 h-6" />}
					color="emerald"
				/>
				<StatCard
					title="Toplam Sipariş"
					value={analyticsData.totalOrders}
					change={analyticsData.ordersChange}
					icon={<ShoppingBag className="w-6 h-6" />}
					color="blue"
				/>
				<StatCard
					title="Toplam Kullanıcı"
					value={analyticsData.totalUsers}
					change={analyticsData.userGrowth[analyticsData.userGrowth.length - 1]?.change || 0}
					icon={<Users className="w-6 h-6" />}
					color="purple"
				/>
				<StatCard
					title="Toplam Ürün"
					value={analyticsData.totalProducts}
					icon={<Package className="w-6 h-6" />}
					color="amber"
				/>
			</div>

			{/* Satış Grafiği */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
					<div className="flex items-center justify-between mb-6">
						<h3 className="text-lg font-semibold text-white flex items-center gap-2">
							<TrendingUp className="w-5 h-5 text-emerald-500" />
							Satış Trendi
						</h3>
					</div>
					<div className="h-64">
						{/* Burada Chart.js veya benzeri bir kütüphane ile grafik gösterilebilir */}
						<div className="flex items-end justify-between h-full">
							{analyticsData.salesByDay.map((sale, index) => (
								<div
									key={index}
									className="w-8 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-t-lg transition-all relative group"
									style={{ height: `${(sale.amount / analyticsData.totalRevenue) * 100}%` }}
								>
									<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity">
										₺{sale.amount}
										<br />
										{sale.date}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Popüler Ürünler */}
				<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
					<div className="flex items-center justify-between mb-6">
						<h3 className="text-lg font-semibold text-white flex items-center gap-2">
							<Star className="w-5 h-5 text-amber-500" />
							En Çok Satan Ürünler
						</h3>
					</div>
					<div className="space-y-4">
						{analyticsData.popularProducts.map((product, index) => (
							<div
								key={index}
								className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg"
							>
								<div className="flex items-center gap-3">
									<div className="bg-amber-500/10 text-amber-500 p-2 rounded-lg">
										#{index + 1}
									</div>
									<div>
										<div className="font-medium text-white">{product.name}</div>
										<div className="text-sm text-gray-400">{product.totalSales} satış</div>
									</div>
								</div>
								<div className="text-emerald-400 font-semibold">₺{product.revenue}</div>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Son Siparişler */}
			<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
				<div className="flex items-center justify-between mb-6">
					<h3 className="text-lg font-semibold text-white flex items-center gap-2">
						<Clock className="w-5 h-5 text-blue-500" />
						Son Siparişler
					</h3>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-700/50">
						<thead>
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
									Sipariş ID
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
									Müşteri
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
									Ürünler
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
									Toplam
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
									Durum
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-700/50">
							{analyticsData.recentOrders.map((order) => (
								<tr key={order.id} className="hover:bg-gray-700/20">
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
										#{order.id}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
										{order.customer}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
										{order.items} ürün
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-400 font-medium">
										₺{order.total}
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<span
											className={`px-3 py-1 rounded-full text-xs font-medium ${
												order.status === "Tamamlandı"
													? "bg-emerald-500/10 text-emerald-500"
													: order.status === "İşleniyor"
													? "bg-blue-500/10 text-blue-500"
													: "bg-amber-500/10 text-amber-500"
											}`}
										>
											{order.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
};

const StatCard = ({ title, value, change, icon, color }) => {
	const colors = {
		emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
		blue: "from-blue-500/20 to-blue-500/5 text-blue-500",
		purple: "from-purple-500/20 to-purple-500/5 text-purple-500",
		amber: "from-amber-500/20 to-amber-500/5 text-amber-500"
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			className={`bg-gradient-to-br ${colors[color]} p-6 rounded-xl border border-gray-700/50`}
		>
			<div className="flex items-center justify-between">
				<div className={`p-2 rounded-lg bg-${color}-500/10`}>{icon}</div>
				{typeof change !== "undefined" && (
					<div
						className={`flex items-center gap-1 text-sm ${
							change >= 0 ? "text-emerald-500" : "text-red-500"
						}`}
					>
						{change >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
						{Math.abs(change)}%
					</div>
				)}
			</div>
			<div className="mt-4">
				<div className="text-2xl font-bold text-white">{value}</div>
				<div className="text-sm text-gray-400">{title}</div>
			</div>
		</motion.div>
	);
};

export default AnalyticsTab;
