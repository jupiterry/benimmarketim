import { motion } from "framer-motion";
import { BarChart3, Package, ShoppingCart, Users, TrendingUp, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import axios from "../lib/axios";

const StatCard = ({ icon: Icon, label, value, color, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        className={`bg-gray-900/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 hover:border-${color}-500/20 transition-all`}
    >
        <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl bg-${color}-500/10 border border-${color}-500/15 flex items-center justify-center`}>
                <Icon className={`w-5 h-5 text-${color}-400`} />
            </div>
        </div>
        <div className="text-2xl font-black text-white mb-1">{value}</div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
    </motion.div>
);

const DashboardWidgets = () => {
    const [stats, setStats] = useState({ products: 0, orders: 0, users: 0, revenue: 0 });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const { data } = await axios.get("/analytics");
                if (data) {
                    setStats({
                        products: data.analyticsData?.products || 0,
                        orders: data.analyticsData?.totalOrders || 0,
                        users: data.analyticsData?.users || 0,
                        revenue: data.analyticsData?.totalRevenue || 0,
                    });
                }
            } catch (e) {
                console.error("Dashboard stats error:", e);
            }
        };
        fetchStats();
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-black text-white mb-1">Dashboard</h2>
                <p className="text-gray-500 text-sm">Genel bakış ve istatistikler</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Package} label="Toplam Ürün" value={stats.products} color="emerald" delay={0} />
                <StatCard icon={ShoppingCart} label="Toplam Sipariş" value={stats.orders} color="cyan" delay={0.05} />
                <StatCard icon={Users} label="Toplam Kullanıcı" value={stats.users} color="violet" delay={0.1} />
                <StatCard icon={TrendingUp} label="Toplam Gelir" value={`₺${stats.revenue?.toLocaleString()}`} color="amber" delay={0.15} />
            </div>
        </div>
    );
};

export default DashboardWidgets;
