import { motion, AnimatePresence } from "framer-motion";
import {
    Package, ShoppingCart, Users, TrendingUp, Clock,
    ArrowUpRight, ArrowDownRight, Activity, Zap,
    DollarSign, Eye, Repeat, ChevronRight
} from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";
import axios from "../lib/axios";

// ═══════════════════════════════════════════════════════
//  §  HELPERS
// ═══════════════════════════════════════════════════════

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 6) return "İyi Geceler";
    if (h < 12) return "Günaydın";
    if (h < 18) return "İyi Günler";
    return "İyi Akşamlar";
};

const statusColors = {
    "Hazırlanıyor": { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400", pulse: true, shadow: "shadow-[0_0_6px_rgba(245,158,11,0.5)]" },
    "Yolda": { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400", pulse: false, shadow: "" },
    "Teslim Edildi": { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400", pulse: false, shadow: "" },
    "İptal Edildi": { bg: "bg-rose-500/10", text: "text-rose-400", dot: "bg-rose-400", pulse: false, shadow: "" },
    "Beklemede": { bg: "bg-gray-500/10", text: "text-gray-400", dot: "bg-gray-400", pulse: false, shadow: "" },
};

// ═══════════════════════════════════════════════════════
//  §1  LIVE CLOCK — Monospace neon display
// ═══════════════════════════════════════════════════════
const LiveClock = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const fmt = (n) => String(n).padStart(2, "0");
    const h = fmt(time.getHours());
    const m = fmt(time.getMinutes());
    const s = fmt(time.getSeconds());

    return (
        <div className="flex items-center gap-1 font-mono">
            {[h, ":", m, ":", s].map((c, i) => (
                <span
                    key={i}
                    className={c === ":"
                        ? "text-cyan-500/50 text-lg font-bold animate-pulse"
                        : "bg-gray-900/80 border border-cyan-500/15 rounded-md px-1.5 py-0.5 text-cyan-300 text-sm font-bold tracking-wider shadow-[0_0_8px_rgba(6,182,212,0.1)]"
                    }
                >
                    {c}
                </span>
            ))}
        </div>
    );
};

// ═══════════════════════════════════════════════════════
//  §2  STAT CARD — Frosted glass + neon bottom border
// ═══════════════════════════════════════════════════════
const neonMap = {
    emerald: { border: "border-b-emerald-400", glow: "shadow-[0_4px_15px_rgba(16,185,129,0.2)]", iconBg: "bg-emerald-500/10", iconBorder: "border-emerald-500/20", iconColor: "text-emerald-400", textShadow: "drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
    cyan: { border: "border-b-cyan-400", glow: "shadow-[0_4px_15px_rgba(6,182,212,0.2)]", iconBg: "bg-cyan-500/10", iconBorder: "border-cyan-500/20", iconColor: "text-cyan-400", textShadow: "drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]" },
    violet: { border: "border-b-violet-400", glow: "shadow-[0_4px_15px_rgba(139,92,246,0.2)]", iconBg: "bg-violet-500/10", iconBorder: "border-violet-500/20", iconColor: "text-violet-400", textShadow: "drop-shadow-[0_0_8px_rgba(139,92,246,0.4)]" },
    amber: { border: "border-b-amber-400", glow: "shadow-[0_4px_15px_rgba(245,158,11,0.2)]", iconBg: "bg-amber-500/10", iconBorder: "border-amber-500/20", iconColor: "text-amber-400", textShadow: "drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
    rose: { border: "border-b-rose-400", glow: "shadow-[0_4px_15px_rgba(244,63,94,0.2)]", iconBg: "bg-rose-500/10", iconBorder: "border-rose-500/20", iconColor: "text-rose-400", textShadow: "drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]" },
    blue: { border: "border-b-blue-400", glow: "shadow-[0_4px_15px_rgba(59,130,246,0.2)]", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/20", iconColor: "text-blue-400", textShadow: "drop-shadow-[0_0_8px_rgba(59,130,246,0.4)]" },
};

const StatCard = ({ icon: Icon, label, value, color, change, delay }) => {
    const n = neonMap[color] || neonMap.emerald;
    const isPositive = change >= 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: "spring", stiffness: 300, damping: 25 }}
            whileHover={{ y: -4 }}
            className={`bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] border-b-[3px] ${n.border} ${n.glow} rounded-2xl p-5 transition-all duration-300 group`}
        >
            <div className="flex items-center justify-between mb-4">
                <motion.div
                    whileHover={{ scale: 1.15, rotate: 8 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className={`w-11 h-11 rounded-xl ${n.iconBg} border ${n.iconBorder} flex items-center justify-center`}
                >
                    <Icon className={`w-5 h-5 ${n.iconColor} drop-shadow-[0_0_6px_currentColor]`} />
                </motion.div>
                {change !== undefined && (
                    <div className={`flex items-center gap-0.5 text-[11px] font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {Math.abs(change).toFixed(1)}%
                    </div>
                )}
            </div>
            <div className={`text-2xl font-black text-white font-mono tracking-tight mb-1 ${n.textShadow}`}>
                {value}
            </div>
            <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">{label}</div>
        </motion.div>
    );
};

// ═══════════════════════════════════════════════════════
//  §3  MINI SVG AREA CHART — Pure CSS/SVG
// ═══════════════════════════════════════════════════════
const AreaChart = ({ data, color = "cyan" }) => {
    const colorMap = {
        cyan: { stroke: "#22d3ee", fill: "rgba(6,182,212,0.15)", gradient: ["rgba(6,182,212,0.3)", "rgba(6,182,212,0)"] },
        emerald: { stroke: "#34d399", fill: "rgba(16,185,129,0.15)", gradient: ["rgba(16,185,129,0.3)", "rgba(16,185,129,0)"] },
    };
    const c = colorMap[color] || colorMap.cyan;

    if (!data || data.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-700 text-sm">
                Veri yükleniyor...
            </div>
        );
    }

    const W = 600, H = 200, PAD = 20;
    const amounts = data.map(d => d.amount || 0);
    const maxVal = Math.max(...amounts, 1);
    const minVal = Math.min(...amounts, 0);
    const range = maxVal - minVal || 1;

    const points = data.map((d, i) => {
        const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
        const y = H - PAD - ((d.amount - minVal) / range) * (H - PAD * 2);
        return { x, y, ...d };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;
    const gradientId = `grad-${color}`;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={c.gradient[0]} />
                    <stop offset="100%" stopColor={c.gradient[1]} />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = PAD + ratio * (H - PAD * 2);
                return <line key={ratio} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />;
            })}

            {/* Area fill */}
            <path d={areaPath} fill={`url(#${gradientId})`} />

            {/* Main line with glow */}
            <path d={linePath} fill="none" stroke={c.stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />

            {/* Data points */}
            {points.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r="4" fill="transparent" stroke={c.stroke} strokeWidth="0" className="hover:stroke-[2]" />
                    {/* Show dots on first, last, and every 2nd point */}
                    {(i === 0 || i === points.length - 1 || i % 2 === 0) && (
                        <circle cx={p.x} cy={p.y} r="3" fill={c.stroke} opacity="0.6" />
                    )}
                </g>
            ))}

            {/* X labels (dates) */}
            {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0 || i === points.length - 1).map((p, i) => (
                <text key={i} x={p.x} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="monospace">
                    {p.date?.slice(5) || ""}
                </text>
            ))}
        </svg>
    );
};

// ═══════════════════════════════════════════════════════
//  §4  ORDER ROW — Mini glass pill
// ═══════════════════════════════════════════════════════
const OrderRow = ({ order, index }) => {
    const st = statusColors[order.status] || statusColors["Beklemede"];

    return (
        <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
            whileHover={{ x: -4 }}
            className="group flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-cyan-500/15 hover:shadow-[0_0_12px_rgba(6,182,212,0.05)] transition-all duration-300 cursor-pointer"
        >
            {/* Status dot */}
            <div className="relative flex-shrink-0">
                <span className={`block w-2.5 h-2.5 rounded-full ${st.dot} ${st.shadow}`} />
                {st.pulse && (
                    <span className={`absolute inset-0 rounded-full ${st.dot} animate-ping opacity-50`} />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-semibold truncate">{order.customer}</span>
                    <span className="text-gray-600 text-[10px] font-mono">#{String(order.id).slice(-6)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                    <span className={`text-[10px] font-bold ${st.text}`}>{order.status}</span>
                    <span className="text-gray-400 text-[10px] font-semibold font-mono">₺{order.total?.toLocaleString()}</span>
                </div>
            </div>

            {/* Chevron */}
            <ChevronRight size={14} className="text-gray-700 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
        </motion.div>
    );
};

// ═══════════════════════════════════════════════════════
//  §5  POPULAR PRODUCT ROW
// ═══════════════════════════════════════════════════════
const PopularProductRow = ({ product, index, maxSales }) => {
    const pct = maxSales > 0 ? (product.totalSales / maxSales) * 100 : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="flex items-center gap-3 p-2.5"
        >
            <span className="text-[10px] text-gray-600 font-bold font-mono w-4 text-right">{index + 1}</span>
            <div className="flex-1 min-w-0">
                <span className="text-xs text-white font-medium truncate block">{product.name || "Ürün"}</span>
                <div className="mt-1.5 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.3 + index * 0.08, duration: 0.6 }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                    />
                </div>
            </div>
            <div className="text-right flex-shrink-0">
                <span className="text-xs text-gray-300 font-bold font-mono">{product.totalSales}</span>
                <span className="text-[10px] text-gray-600 ml-1">adet</span>
            </div>
        </motion.div>
    );
};

// ═══════════════════════════════════════════════════════
//  §  MAIN COMPONENT
// ═══════════════════════════════════════════════════════
const DashboardWidgets = () => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data } = await axios.get("/analytics?timeRange=week");
                if (data) setAnalytics(data);
            } catch (e) {
                console.error("Dashboard fetch error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const a = analytics?.analyticsData || {};
    const greeting = useMemo(getGreeting, []);

    const popularMax = useMemo(() => {
        const list = a.popularProducts || [];
        return list.length > 0 ? Math.max(...list.map(p => p.totalSales || 0)) : 0;
    }, [a.popularProducts]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="text-cyan-500"
                >
                    <Activity size={28} />
                </motion.div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ─── Header & Welcome ─── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
                <div>
                    <h2 className="text-xl font-black text-white mb-0.5 flex items-center gap-2">
                        {greeting}, <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">Emirhan</span>
                        <motion.span
                            animate={{ rotate: [0, 14, -8, 0] }}
                            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                            className="inline-block"
                        >
                            👋
                        </motion.span>
                    </h2>
                    <p className="text-gray-500 text-xs flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        Sistem aktif — Gerçek zamanlı izleme
                    </p>
                </div>
                <LiveClock />
            </motion.div>

            {/* ─── Stat Cards ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <StatCard icon={ShoppingCart} label="Toplam Sipariş" value={a.totalOrders || 0} color="emerald" change={a.ordersChange} delay={0} />
                <StatCard icon={DollarSign} label="Toplam Gelir" value={`₺${(a.totalRevenue || 0).toLocaleString()}`} color="cyan" change={a.revenueChange} delay={0.04} />
                <StatCard icon={Users} label="Kullanıcı" value={a.users || 0} color="violet" delay={0.08} />
                <StatCard icon={Package} label="Ürün" value={a.products || 0} color="amber" delay={0.12} />
                <StatCard icon={Eye} label="Dönüşüm" value={`%${(a.conversionRate || 0).toFixed(1)}`} color="blue" delay={0.16} />
                <StatCard icon={Repeat} label="Sadakat" value={`%${(a.customerRetention || 0).toFixed(1)}`} color="rose" delay={0.2} />
            </div>

            {/* ─── Main Content: Chart + Orders ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Sales Chart (2 cols) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-2 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 shadow-[0_0_30px_rgba(6,182,212,0.04)]"
                >
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-white font-bold text-sm flex items-center gap-2">
                                <Activity size={15} className="text-cyan-400" />
                                Satış Trendi
                            </h3>
                            <p className="text-gray-600 text-[10px] mt-0.5">Son 7 gün</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                <span className="text-[10px] text-gray-500">Gelir</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-48">
                        <AreaChart data={a.salesByDay || []} color="cyan" />
                    </div>
                </motion.div>

                {/* Recent Orders (1 col) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 flex flex-col"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-white font-bold text-sm flex items-center gap-2">
                            <Zap size={14} className="text-amber-400" />
                            Canlı Sipariş Akışı
                        </h3>
                        <span className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                            </span>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Live</span>
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1 max-h-[320px]">
                        {(a.recentOrders || []).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-gray-700">
                                <ShoppingCart size={24} className="mb-2 opacity-30" />
                                <p className="text-xs">Henüz sipariş yok</p>
                            </div>
                        ) : (
                            (a.recentOrders || []).map((order, i) => (
                                <OrderRow key={order.id || i} order={order} index={i} />
                            ))
                        )}
                    </div>
                </motion.div>
            </div>

            {/* ─── Bottom Row: Popular Products + Quick Stats ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Popular Products */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5"
                >
                    <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4">
                        <TrendingUp size={15} className="text-emerald-400" />
                        En Çok Satan Ürünler
                    </h3>
                    <div className="space-y-1">
                        {(a.popularProducts || []).map((p, i) => (
                            <PopularProductRow key={i} product={p} index={i} maxSales={popularMax} />
                        ))}
                        {(a.popularProducts || []).length === 0 && (
                            <p className="text-gray-700 text-xs text-center py-4">Veri bulunamadı</p>
                        )}
                    </div>
                </motion.div>

                {/* Quick Metrics */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5"
                >
                    <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4">
                        <Activity size={15} className="text-violet-400" />
                        Hızlı Bakış
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: "Ort. Sipariş", value: `₺${(a.averageOrderValue || 0).toFixed(0)}`, icon: DollarSign, color: "cyan" },
                            { label: "Bu Hafta Gelir", value: `₺${((a.salesByDay || []).reduce((s, d) => s + (d.amount || 0), 0)).toLocaleString()}`, icon: TrendingUp, color: "emerald" },
                            { label: "Aktif Ürün", value: a.products || 0, icon: Package, color: "amber" },
                            { label: "Yeni Üye (Hafta)", value: (a.userGrowth || []).reduce((s, d) => s + (d.count || 0), 0), icon: Users, color: "violet" },
                        ].map((m, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.45 + i * 0.05 }}
                                className={`p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-${m.color}-500/15 transition-all`}
                            >
                                <m.icon size={14} className={`text-${m.color}-400 mb-2 opacity-60`} />
                                <div className="text-lg font-black text-white font-mono">{m.value}</div>
                                <div className="text-[10px] text-gray-600 font-semibold mt-0.5">{m.label}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default DashboardWidgets;
