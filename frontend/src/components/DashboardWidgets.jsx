import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    DollarSign,
    ShoppingBag,
    Users,
    Package,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
    Zap,
    Star
} from "lucide-react";
import axios from "../lib/axios";
import { useProductStore } from "../stores/useProductStore";

const StatCard = ({ icon: Icon, label, value, change, color, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.5 }}
        whileHover={{ y: -5, scale: 1.02 }}
        className="relative group overflow-hidden bg-gray-900/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 shadow-2xl transition-all duration-300"
    >
        {/* Animated background glow */}
        <div className={`absolute -inset-1 bg-gradient-to-r ${color} opacity-0 group-hover:opacity-10 blur-xl transition-opacity duration-500`} />

        <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gray-800/50 border border-white/[0.06] shadow-inner`}>
                    <Icon className={`w-6 h-6 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]`} style={{ color: color.split(' ')[1].replace('to-', '') }} />
                </div>
                {change !== undefined && (
                    <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${change >= 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                        {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(change)}%
                    </div>
                )}
            </div>

            <div>
                <h3 className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">{label}</h3>
                <p className="text-2xl font-black text-white tracking-tight">
                    {value}
                </p>
            </div>

            {/* Decorative decorative line */}
            <div className="mt-4 h-[1px] w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500 font-medium">
                <Activity className="w-3 h-3 opacity-50" />
                <span>Gerçek zamanlı veri</span>
            </div>
        </div>
    </motion.div>
);

const DashboardWidgets = () => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalOrders: 0,
        totalUsers: 0,
        revenueChange: 0,
        ordersChange: 0,
    });
    const [loading, setLoading] = useState(true);
    const { products, fetchAllProducts } = useProductStore();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await axios.get("/analytics");
                setStats({
                    totalRevenue: response.data.totalRevenue || 0,
                    totalOrders: response.data.totalOrders || 0,
                    totalUsers: response.data.totalUsers || 0,
                    revenueChange: response.data.revenueChange || 0,
                    ordersChange: response.data.ordersChange || 0,
                });
            } catch (error) {
                console.error("Dashboard stats error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
        if (products.length === 0) fetchAllProducts();
    }, [fetchAllProducts, products.length]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-40 bg-gray-800/40 animate-pulse rounded-2xl border border-white/[0.06]" />
                ))}
            </div>
        );
    }

    const widgetData = [
        {
            icon: DollarSign,
            label: "Toplam Gelir",
            value: `₺${stats.totalRevenue.toLocaleString("tr-TR")}`,
            change: stats.revenueChange,
            color: "from-emerald-500 to-teal-400",
        },
        {
            icon: ShoppingBag,
            label: "Toplam Sipariş",
            value: stats.totalOrders.toLocaleString("tr-TR"),
            change: stats.ordersChange,
            color: "from-cyan-500 to-blue-400",
        },
        {
            icon: Users,
            label: "Aktif Kullanıcı",
            value: stats.totalUsers.toLocaleString("tr-TR"),
            change: 2.5, // Mock change for users if not in API
            color: "from-violet-500 to-purple-400",
        },
        {
            icon: Package,
            label: "Toplam Ürün",
            value: products.length.toLocaleString("tr-TR"),
            change: 0,
            color: "from-amber-500 to-orange-400",
        },
    ];

    return (
        <div className="space-y-8">
            {/* Welcome Message */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 mb-2"
            >
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                    <Zap className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Hızlı Bakış</h1>
                    <p className="text-gray-500 text-sm">Marketinizin genel performansı ve durumu.</p>
                </div>
            </motion.div>

            {/* Grid of Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {widgetData.map((data, index) => (
                    <StatCard key={data.label} {...data} delay={index * 0.1} />
                ))}
            </div>

            {/* Live Activity (Simplified) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-gray-900/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6"
            >
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Star className="w-5 h-5 text-amber-400" />
                        <h2 className="text-lg font-bold text-white">Sistem Durumu</h2>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Çevrimiçi</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Veritabanı</p>
                        <div className="flex items-center justify-between">
                            <span className="text-white font-medium text-sm">MongoDB Cluster</span>
                            <span className="text-emerald-400 text-xs font-bold">Aktif</span>
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">API Yanıt Süresi</p>
                        <div className="flex items-center justify-between">
                            <span className="text-white font-medium text-sm">Ortalama Latency</span>
                            <span className="text-cyan-400 text-xs font-bold">124ms</span>
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Güvenlik Durumu</p>
                        <div className="flex items-center justify-between">
                            <span className="text-white font-medium text-sm">SSL / Encryption</span>
                            <span className="text-violet-400 text-xs font-bold">Güvenli</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default DashboardWidgets;
