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
	Clock,
	Calendar,
	Target,
	PieChart,
	BarChart3,
	Activity,
	Percent,
	MapPin,
	Eye,
	Filter,
	Download,
	Flame
} from "lucide-react";
import SalesHeatmap from "./SalesHeatmap";

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
		recentOrders: [],
		categoryBreakdown: [],
		hourlyData: [],
		conversionRate: 0,
		averageOrderValue: 0,
		customerRetention: 0,
		topCities: [],
		orderStatusBreakdown: []
	});
	const [timeRange, setTimeRange] = useState("week");
	const [isLoading, setIsLoading] = useState(true);
	const [activeView, setActiveView] = useState("overview");

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
			{/* Üst Kontrol Paneli */}
			<div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
				{/* Görünüm Seçici */}
				<div className="flex flex-wrap gap-2">
					{[
						{ id: "overview", label: "Genel Bakış", icon: <Eye className="w-4 h-4" /> },
						{ id: "sales", label: "Satış Analizi", icon: <TrendingUp className="w-4 h-4" /> },
						{ id: "products", label: "Ürün Analizi", icon: <Package className="w-4 h-4" /> },
						{ id: "customers", label: "Müşteri Analizi", icon: <Users className="w-4 h-4" /> },
						{ id: "geography", label: "Coğrafi Analiz", icon: <MapPin className="w-4 h-4" /> },
						{ id: "heatmap", label: "Isı Haritası", icon: <Flame className="w-4 h-4" /> }
					].map((view) => (
						<button
							key={view.id}
							onClick={() => setActiveView(view.id)}
							className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
								activeView === view.id
									? "bg-emerald-500 text-white shadow-lg"
									: "bg-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700"
							}`}
						>
							{view.icon}
							{view.label}
						</button>
					))}
				</div>

				{/* Zaman Aralığı ve Export */}
				<div className="flex items-center gap-3">
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
					<button className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-all">
						<Download className="w-4 h-4" />
						Export
					</button>
				</div>
			</div>

			{/* Özet Kartları */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
					title="Ortalama Sipariş"
					value={`₺${analyticsData.averageOrderValue.toLocaleString()}`}
					icon={<Target className="w-6 h-6" />}
					color="purple"
				/>
				<StatCard
					title="Dönüşüm Oranı"
					value={`${analyticsData.conversionRate.toFixed(1)}%`}
					icon={<Percent className="w-6 h-6" />}
					color="amber"
				/>
				<StatCard
					title="Müşteri Sadakati"
					value={`${analyticsData.customerRetention.toFixed(1)}%`}
					icon={<Users className="w-6 h-6" />}
					color="pink"
				/>
			</div>

			{/* Dinamik İçerik - Seçili Görünüme Göre */}
			{renderAnalyticsView()}
		</div>
	);

	// Analiz görünümlerini render eden fonksiyon
	function renderAnalyticsView() {
		switch (activeView) {
			case "overview":
				return renderOverviewView();
			case "sales":
				return renderSalesView();
			case "products":
				return renderProductsView();
		case "customers":
			return renderCustomersView();
		case "geography":
			return renderGeographyView();
		case "heatmap":
			return renderHeatmapView();
		default:
			return renderOverviewView();
	}
	}

	// Genel Bakış Görünümü
	function renderOverviewView() {
		return (
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Satış Trendi */}
				<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
					<div className="flex items-center justify-between mb-6">
						<h3 className="text-lg font-semibold text-white flex items-center gap-2">
							<TrendingUp className="w-5 h-5 text-emerald-500" />
							Satış Trendi
						</h3>
					</div>
					<div className="h-64">
						<div className="flex items-end justify-between h-full">
							{analyticsData.salesByDay.map((sale, index) => (
								<div
									key={index}
									className="w-8 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-t-lg transition-all relative group"
									style={{ height: `${Math.max((sale.amount / Math.max(...analyticsData.salesByDay.map(s => s.amount))) * 100, 5)}%` }}
								>
									<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
										₺{sale.amount?.toLocaleString()}
										<br />
										{sale.date}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Sipariş Durumu Dağılımı */}
				<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
					<div className="flex items-center justify-between mb-6">
						<h3 className="text-lg font-semibold text-white flex items-center gap-2">
							<PieChart className="w-5 h-5 text-blue-500" />
							Sipariş Durumları
						</h3>
					</div>
					<div className="space-y-4">
						{analyticsData.orderStatusBreakdown.map((status, index) => (
							<div key={index} className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className={`w-4 h-4 rounded-full ${getStatusColor(status.status)}`}></div>
									<span className="text-gray-300">{status.status}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-white font-medium">{status.count}</span>
									<span className="text-gray-400 text-sm">({status.percentage}%)</span>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* En Çok Satan Ürünler */}
				<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
					<div className="flex items-center justify-between mb-6">
						<h3 className="text-lg font-semibold text-white flex items-center gap-2">
							<Star className="w-5 h-5 text-amber-500" />
							En Çok Satan Ürünler
						</h3>
					</div>
					<div className="space-y-4">
						{analyticsData.popularProducts.slice(0, 5).map((product, index) => (
							<div
								key={index}
								className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-all"
							>
								<div className="flex items-center gap-3">
									<div className="bg-amber-500/10 text-amber-500 p-2 rounded-lg font-bold text-sm">
										#{index + 1}
									</div>
									<div>
										<div className="font-medium text-white">{product.name}</div>
										<div className="text-sm text-gray-400">{product.totalSales} satış</div>
									</div>
								</div>
								<div className="text-emerald-400 font-semibold">₺{product.revenue?.toLocaleString()}</div>
							</div>
						))}
				</div>
			</div>

				{/* Saatlik Satış Aktivitesi */}
			<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
				<div className="flex items-center justify-between mb-6">
					<h3 className="text-lg font-semibold text-white flex items-center gap-2">
							<Clock className="w-5 h-5 text-purple-500" />
							Saatlik Aktivite
					</h3>
				</div>
					<div className="grid grid-cols-12 gap-1">
						{Array.from({ length: 24 }, (_, hour) => {
							const hourData = analyticsData.hourlyData.find(h => h.hour === hour) || { orders: 0 };
							const maxOrders = Math.max(...analyticsData.hourlyData.map(h => h.orders), 1);
							const intensity = (hourData.orders / maxOrders) * 100;
							
							return (
								<div
									key={hour}
									className="relative group"
								>
									<div
										className={`h-8 rounded transition-all cursor-pointer ${
											intensity > 75 ? 'bg-emerald-500' :
											intensity > 50 ? 'bg-emerald-400' :
											intensity > 25 ? 'bg-emerald-300' :
											intensity > 0 ? 'bg-emerald-200' : 'bg-gray-700'
										}`}
										style={{ opacity: Math.max(intensity / 100, 0.1) }}
									>
									</div>
									<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
										{hour}:00 - {hourData.orders} sipariş
									</div>
									<div className="text-xs text-gray-400 text-center mt-1">{hour}</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		);
	}

	// Satış Analizi Görünümü
	function renderSalesView() {
		return (
			<div className="space-y-6">
				{/* Detaylı Satış Grafikleri */}
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
					<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
						<h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
							<BarChart3 className="w-5 h-5 text-emerald-500" />
							Günlük Satış ve Gelir
						</h3>
						<div className="h-80">
							{/* Burada daha detaylı bir grafik olacak */}
							<div className="flex items-end justify-between h-full space-x-1">
								{analyticsData.salesByDay.map((day, index) => (
									<div key={index} className="flex-1 flex flex-col items-center">
										<div className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 rounded-t transition-all relative group"
											style={{ height: `${Math.max((day.amount / Math.max(...analyticsData.salesByDay.map(s => s.amount))) * 100, 5)}%` }}>
											<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
												{day.date}
												<br />₺{day.amount?.toLocaleString()}
											</div>
										</div>
										<div className="text-xs text-gray-400 mt-2 transform -rotate-45 origin-left">
											{day.date?.split('-').slice(1).join('/')}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
						<h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
							<Activity className="w-5 h-5 text-blue-500" />
							Performans Metrikleri
						</h3>
						<div className="space-y-6">
							<div className="flex justify-between items-center p-4 bg-gray-700/30 rounded-lg">
								<span className="text-gray-300">Ortalama Sipariş Değeri</span>
								<span className="text-emerald-400 font-bold text-xl">₺{analyticsData.averageOrderValue?.toLocaleString()}</span>
							</div>
							<div className="flex justify-between items-center p-4 bg-gray-700/30 rounded-lg">
								<span className="text-gray-300">Dönüşüm Oranı</span>
								<span className="text-blue-400 font-bold text-xl">{analyticsData.conversionRate?.toFixed(1)}%</span>
							</div>
							<div className="flex justify-between items-center p-4 bg-gray-700/30 rounded-lg">
								<span className="text-gray-300">Müşteri Sadakati</span>
								<span className="text-purple-400 font-bold text-xl">{analyticsData.customerRetention?.toFixed(1)}%</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Ürün Analizi Görünümü
	function renderProductsView() {
		return (
			<div className="space-y-6">
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
					{/* Kategori Dağılımı */}
					<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
						<h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
							<PieChart className="w-5 h-5 text-emerald-500" />
							Kategori Dağılımı
						</h3>
						<div className="space-y-4">
							{analyticsData.categoryBreakdown.map((category, index) => (
								<div key={index} className="space-y-2">
									<div className="flex justify-between items-center">
										<span className="text-gray-300 capitalize">{category.name}</span>
										<span className="text-white font-medium">{category.percentage}%</span>
									</div>
									<div className="w-full bg-gray-700 rounded-full h-2">
										<div
											className={`h-2 rounded-full ${getCategoryColor(index)}`}
											style={{ width: `${category.percentage}%` }}
										></div>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* En Çok Satan Ürünler Detaylı */}
					<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
						<h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
							<Star className="w-5 h-5 text-amber-500" />
							Ürün Performansı
						</h3>
						<div className="space-y-4 max-h-80 overflow-y-auto">
							{analyticsData.popularProducts.map((product, index) => (
								<div key={index} className="p-4 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-all">
									<div className="flex justify-between items-start mb-2">
										<div className="flex-1">
											<div className="font-medium text-white">{product.name}</div>
											<div className="text-sm text-gray-400 mt-1">
												{product.totalSales} satış • ₺{product.revenue?.toLocaleString()} gelir
											</div>
										</div>
										<div className="bg-amber-500/10 text-amber-500 px-2 py-1 rounded text-sm font-medium">
											#{index + 1}
										</div>
									</div>
									<div className="w-full bg-gray-700 rounded-full h-2">
										<div
											className="h-2 bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full"
											style={{ width: `${(product.totalSales / Math.max(...analyticsData.popularProducts.map(p => p.totalSales))) * 100}%` }}
										></div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Müşteri Analizi Görünümü
	function renderCustomersView() {
		return (
			<div className="space-y-6">
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
					<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
						<h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
							<Users className="w-5 h-5 text-purple-500" />
							Müşteri Büyümesi
						</h3>
						<div className="h-64">
							<div className="flex items-end justify-between h-full">
								{analyticsData.userGrowth.map((growth, index) => (
									<div
										key={index}
										className="w-8 bg-purple-500/20 hover:bg-purple-500/30 rounded-t-lg transition-all relative group"
										style={{ height: `${Math.max((growth.count / Math.max(...analyticsData.userGrowth.map(g => g.count))) * 100, 5)}%` }}
									>
										<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
											{growth._id}
											<br />{growth.count} yeni müşteri
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
						<h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
							<Target className="w-5 h-5 text-emerald-500" />
							Müşteri İstatistikleri
						</h3>
						<div className="space-y-4">
							<div className="p-4 bg-gray-700/30 rounded-lg">
								<div className="text-2xl font-bold text-emerald-400">{analyticsData.totalUsers}</div>
								<div className="text-gray-400">Toplam Müşteri</div>
							</div>
							<div className="p-4 bg-gray-700/30 rounded-lg">
								<div className="text-2xl font-bold text-blue-400">{analyticsData.customerRetention?.toFixed(1)}%</div>
								<div className="text-gray-400">Müşteri Sadakati</div>
							</div>
							<div className="p-4 bg-gray-700/30 rounded-lg">
								<div className="text-2xl font-bold text-purple-400">₺{analyticsData.averageOrderValue?.toLocaleString()}</div>
								<div className="text-gray-400">Ortalama Sipariş Değeri</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Coğrafi Analiz Görünümü
	function renderGeographyView() {
		return (
			<div className="space-y-6">
				<div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
					<h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
						<MapPin className="w-5 h-5 text-emerald-500" />
						Şehir Bazında Satışlar
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{analyticsData.topCities.map((city, index) => (
							<div key={index} className="p-4 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-all">
								<div className="flex justify-between items-center mb-2">
									<span className="font-medium text-white">{city.name}</span>
									<span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded text-sm">
										#{index + 1}
									</span>
								</div>
								<div className="text-sm text-gray-400 mb-2">
									{city.orders} sipariş • ₺{city.revenue?.toLocaleString()}
								</div>
								<div className="w-full bg-gray-700 rounded-full h-2">
									<div
										className="h-2 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
										style={{ width: `${(city.orders / Math.max(...analyticsData.topCities.map(c => c.orders))) * 100}%` }}
									></div>
								</div>
							</div>
						))}
				</div>
			</div>
		</div>
	);
	}

	// Isı Haritası Görünümü
	function renderHeatmapView() {
		return <SalesHeatmap />;
	}
};

// Yardımcı fonksiyonlar
const getStatusColor = (status) => {
	switch (status) {
		case "Hazırlanıyor":
			return "bg-blue-500";
		case "Yolda":
			return "bg-amber-500";
		case "Teslim Edildi":
			return "bg-emerald-500";
		case "İptal Edildi":
			return "bg-red-500";
		default:
			return "bg-gray-500";
	}
};

const getCategoryColor = (index) => {
	const colors = [
		"bg-emerald-500",
		"bg-blue-500",
		"bg-purple-500",
		"bg-amber-500",
		"bg-pink-500",
		"bg-indigo-500",
		"bg-teal-500",
		"bg-orange-500"
	];
	return colors[index % colors.length];
};

const StatCard = ({ title, value, change, icon, color }) => {
	const colors = {
		emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
		blue: "from-blue-500/20 to-blue-500/5 text-blue-500",
		purple: "from-purple-500/20 to-purple-500/5 text-purple-500",
		amber: "from-amber-500/20 to-amber-500/5 text-amber-500",
		pink: "from-pink-500/20 to-pink-500/5 text-pink-500"
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
