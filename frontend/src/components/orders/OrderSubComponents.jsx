import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Clock, Truck, CheckCircle2, XCircle, Package2, Eye, Printer,
    Trash2, Plus, MoreHorizontal, ChevronDown, AlertCircle, Timer,
    User, Mail, Phone, MapPin, Calendar, AlertTriangle, X, Minus,
    RefreshCw, Search, ShoppingBag
} from "lucide-react";
import { statusConfig, getOrderDuration, getWarningLevel, getWaitingMinutes } from "./OrderHelpers";

/* ─── Summary Card ─── */
export const SummaryCard = ({ title, count, icon: Icon, gradient, borderColor, onClick, active }) => (
    <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={`relative text-left w-full rounded-[20px] p-6 border transition-all duration-300 overflow-hidden group ${gradient} ${active ? `${borderColor} ring-1 ring-offset-0` : 'border-white/[0.06]'
            }`}
    >
        <div className="flex items-start justify-between mb-4">
            <div className="w-11 h-11 rounded-2xl bg-white/[0.06] backdrop-blur-sm flex items-center justify-center">
                <Icon className="w-5 h-5 text-gray-300" />
            </div>
        </div>
        <p className="text-[13px] text-gray-400 font-medium tracking-wide mb-1">{title}</p>
        <p className="text-3xl font-bold text-white tabular-nums">{count}</p>
        <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/[0.02] group-hover:bg-white/[0.04] transition-colors" />
    </motion.button>
);

/* ─── Status Badge ─── */
export const StatusBadge = ({ status, size = "sm" }) => {
    const cfg = statusConfig[status] || statusConfig["Hazırlanıyor"];
    const sizes = {
        sm: "px-3 py-1 text-xs",
        md: "px-4 py-1.5 text-[13px]",
    };
    const isPreparing = status === "Hazırlanıyor";
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${cfg.color} ${sizes[size]} ${isPreparing ? 'animate-pulse' : ''}`}>
            <span className={`inline-flex ${isPreparing ? 'animate-[spin_3s_linear_infinite]' : ''}`}>
                {cfg.icon}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
            {status}
        </span>
    );
};

/* ─── Quick Action Dropdown ─── */
export const QuickActionMenu = ({ order, onStatusUpdate, onPrint, onViewDetail, onAddItem, onDelete }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        if (open) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    const statuses = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];
    const [showStatusSub, setShowStatusSub] = useState(false);

    return (
        <div className="relative" ref={ref}>
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); setOpen(!open); setShowStatusSub(false); }}
                className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white transition-all"
            >
                <MoreHorizontal className="w-4 h-4" />
            </motion.button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-10 z-50 w-56 rounded-2xl bg-[#1a1a2e]/95 backdrop-blur-2xl border border-white/[0.08] shadow-2xl shadow-black/40 overflow-hidden"
                    >
                        <div className="p-1.5">
                            <button onClick={(e) => { e.stopPropagation(); onViewDetail(order); setOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all">
                                <Eye className="w-4 h-4 text-sky-400" /> Detay Görüntüle
                            </button>
                            <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setShowStatusSub(!showStatusSub); }}
                                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all">
                                    <span className="flex items-center gap-3"><RefreshCw className="w-4 h-4 text-amber-400" /> Durumu Güncelle</span>
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showStatusSub ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                    {showStatusSub && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden">
                                            <div className="pl-6 pr-1 pb-1 space-y-0.5">
                                                {statuses.map(s => (
                                                    <button key={s} onClick={(e) => { e.stopPropagation(); onStatusUpdate(order.orderId, s); setOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${order.status === s ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                                                            }`}>
                                                        {statusConfig[s]?.icon} {s}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); onAddItem(order.orderId); setOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all">
                                <Plus className="w-4 h-4 text-emerald-400" /> Ürün Ekle
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onPrint(order); setOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all">
                                <Printer className="w-4 h-4 text-violet-400" /> Yazdır
                            </button>
                            <div className="my-1 mx-3 border-t border-white/[0.06]" />
                            <button onClick={(e) => { e.stopPropagation(); onDelete(order.orderId); setOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-rose-400 hover:bg-rose-500/10 transition-all">
                                <Trash2 className="w-4 h-4" /> Siparişi Sil
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════
   ORDER DETAIL MODAL — Apple/Stripe Premium Design
   ═══════════════════════════════════════════════════════════ */
export const OrderDetailModal = ({ order, isOpen, onClose, onStatusUpdate, onPrint, onDelete }) => {
    if (!isOpen || !order) return null;
    const duration = getOrderDuration(order.createdAt, order.updatedAt, order.status);
    const warningLevel = getWarningLevel(order.createdAt, order.status);
    const initials = (order.user?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-xl" />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                    transition={{ type: "spring", damping: 32, stiffness: 400 }}
                    className="relative bg-[#0e0e20] border border-white/[0.07] rounded-[28px] w-full max-w-[640px] max-h-[88vh] overflow-hidden shadow-[0_32px_80px_-12px_rgba(0,0,0,0.7)]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ─── HEADER ─── */}
                    <div className="px-7 pt-7 pb-5">
                        <div className="flex items-start justify-between">
                            {/* Left: Avatar + Name + ID */}
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-violet-500/25 to-fuchsia-500/25 border border-violet-500/15 flex items-center justify-center shadow-lg shadow-violet-500/10">
                                    <span className="text-white font-bold text-lg tracking-tight">{initials}</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">{order.user?.name}</h2>
                                    <p className="text-[13px] text-gray-500 font-mono mt-0.5">#{order.orderId.slice(-8).toUpperCase()}</p>
                                </div>
                            </div>

                            {/* Right: Status Badge + Close */}
                            <div className="flex items-center gap-3">
                                <StatusBadge status={order.status} size="md" />
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Meta tags under header */}
                        <div className="flex items-center gap-2 mt-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.03] text-gray-500 border border-white/[0.05]">
                                <Timer className="w-3 h-3" /> {duration}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.03] text-gray-500 border border-white/[0.05]">
                                <ShoppingBag className="w-3 h-3" /> {order.products?.length || 0} ürün
                            </span>
                            {warningLevel && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${warningLevel === 'critical'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/15 animate-pulse'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                                    }`}>
                                    <AlertCircle className="w-3 h-3" /> {getWaitingMinutes(order.createdAt)}dk bekliyor
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="mx-7 border-t border-white/[0.05]" />

                    {/* ─── CONTENT ─── */}
                    <div className="px-7 py-5 overflow-y-auto max-h-[52vh] space-y-5 scrollbar-thin scrollbar-thumb-white/5">

                        {/* Customer Note — visually separated, at top of content */}
                        {order.note && (
                            <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-400/10">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold text-amber-500/50 uppercase tracking-[0.15em] mb-1.5">MÜŞTERİ NOTU</p>
                                        <p className="text-[13px] text-amber-200/70 leading-relaxed">{order.note}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Info Cards Grid — Glassmorphism */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Customer Card */}
                            <div className="p-4 rounded-2xl bg-white/[0.025] backdrop-blur-sm border border-white/[0.06] shadow-sm">
                                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3">Müşteri</h3>
                                <div className="space-y-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <User className="w-4 h-4 text-violet-400 flex-shrink-0" />
                                        <span className="text-[13px] text-white font-medium">{order.user?.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <Mail className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                        <span className="text-[13px] text-gray-400">{order.user?.email || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <Phone className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                        <span className="text-[13px] text-gray-400">{order.phone || order.user?.phone || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Delivery Card */}
                            <div className="p-4 rounded-2xl bg-white/[0.025] backdrop-blur-sm border border-white/[0.06] shadow-sm">
                                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3">Teslimat</h3>
                                <div className="space-y-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                        <span className="text-[13px] text-white font-medium">{order.deliveryPointName || order.deliveryPoint || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <Calendar className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                        <span className="text-[13px] text-gray-400">{new Date(order.createdAt).toLocaleString('tr-TR')}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <Clock className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                        <span className="text-[13px] text-gray-400">Süre: {duration}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── Products List ─── */}
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3">Ürünler</h3>
                            <div className="space-y-1.5">
                                {order.products?.map((product, idx) => (
                                    <div key={idx} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.02] transition-colors group">
                                        {/* Quantity Circle */}
                                        <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                                            <span className="text-[11px] font-bold text-gray-400 group-hover:text-white transition-colors">{product.quantity}x</span>
                                        </div>

                                        {/* Product image or icon */}
                                        <div className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {product.image
                                                ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                                : <Package2 className="w-4 h-4 text-gray-600" />
                                            }
                                        </div>

                                        {/* Name */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] text-white font-medium truncate">{product.name}</p>
                                            <p className="text-[11px] text-gray-600">₺{Number(product.price).toFixed(2)} / adet</p>
                                        </div>

                                        {/* Price aligned right */}
                                        <p className="text-[13px] font-bold text-white tabular-nums">₺{(product.price * product.quantity).toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Divider line */}
                            <div className="border-t border-dashed border-white/[0.06] my-3" />

                            {/* Coupon Row */}
                            {order.couponCode && (
                                <div className="flex justify-between items-center px-3 py-1.5">
                                    <span className="text-[13px] text-violet-400 flex items-center gap-2">🎟️ Kupon ({order.couponCode})</span>
                                    <span className="text-[13px] text-violet-400 font-medium">-₺{(order.couponDiscount || 0).toFixed(2)}</span>
                                </div>
                            )}

                            {/* Total */}
                            <div className="flex justify-between items-center px-4 py-3.5 rounded-2xl bg-emerald-500/[0.05] border border-emerald-500/10 mt-2">
                                <span className="text-[13px] text-gray-400 font-medium">Toplam Tutar</span>
                                <span className="text-xl font-extrabold text-emerald-400 tabular-nums">₺{order.totalAmount?.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* ─── FOOTER ─── */}
                    <div className="px-7 py-5 border-t border-white/[0.05]">
                        <div className="flex items-center gap-3">
                            {/* Status Update */}
                            <select
                                className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white text-[13px] font-medium focus:outline-none focus:border-violet-500/30 cursor-pointer appearance-none"
                                value={order.status}
                                onChange={(e) => { onStatusUpdate(order.orderId, e.target.value); onClose(); }}
                            >
                                <option value="Hazırlanıyor">⏳ Hazırlanıyor</option>
                                <option value="Yolda">🚚 Yolda</option>
                                <option value="Teslim Edildi">✓ Teslim Edildi</option>
                                <option value="İptal Edildi">✕ İptal Edildi</option>
                            </select>

                            {/* Print */}
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => { onPrint(order); onClose(); }}
                                className="px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] text-gray-300 text-[13px] font-medium flex items-center gap-2 transition-colors border border-white/[0.06]"
                            >
                                <Printer className="w-4 h-4" /> Yazdır
                            </motion.button>

                            {/* Delete — Pastel Red */}
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => { onDelete(order.orderId); onClose(); }}
                                className="px-5 py-2.5 rounded-xl bg-rose-500/[0.08] hover:bg-rose-500/[0.15] text-rose-400 text-[13px] font-medium flex items-center gap-2 transition-colors border border-rose-500/10"
                            >
                                <Trash2 className="w-4 h-4" /> Sil
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

/* ─── Add Item Modal ─── */
export const AddItemModal = ({ isOpen, onClose, addItemTab, setAddItemTab, productSearch, setProductSearch, filteredProducts, loadingProducts, selectedProduct, setSelectedProduct, productQuantity, setProductQuantity, onAddFromCatalog, customItemAmount, setCustomItemAmount, customItemName, setCustomItemName, onAddCustom }) => {
    if (!isOpen) return null;
    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
                onClick={onClose}>
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#111125] border border-white/[0.08] rounded-3xl p-6 w-full max-w-md shadow-2xl">

                    <div className="flex justify-between items-center mb-5">
                        <h3 className="text-lg font-bold text-white">Siparişe Ürün Ekle</h3>
                        <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mb-5 p-1 bg-white/[0.03] rounded-2xl">
                        <button onClick={() => setAddItemTab("catalog")}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${addItemTab === "catalog" ? "bg-white/[0.08] text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>
                            📦 Katalog
                        </button>
                        <button onClick={() => setAddItemTab("manual")}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${addItemTab === "manual" ? "bg-white/[0.08] text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>
                            ✏️ Manuel
                        </button>
                    </div>

                    {addItemTab === "catalog" && (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input type="text" placeholder="Ürün ara..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                                    className="w-full bg-white/[0.03] border border-white/[0.06] text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500/40 placeholder-gray-600" />
                            </div>
                            <div className="max-h-56 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-gray-700">
                                {loadingProducts ? (
                                    <div className="text-center py-8 text-gray-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" /> Yükleniyor...</div>
                                ) : filteredProducts.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 text-sm">Ürün bulunamadı</div>
                                ) : (
                                    filteredProducts.slice(0, 20).map((product) => (
                                        <motion.div key={product._id} whileHover={{ scale: 1.01 }} onClick={() => setSelectedProduct(product)}
                                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedProduct?._id === product._id ? "bg-violet-500/10 border border-violet-500/20" : "bg-white/[0.02] hover:bg-white/[0.04] border border-transparent"
                                                }`}>
                                            <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" /> : <Package2 className="w-4 h-4 text-gray-600" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{product.name}</p>
                                                <p className="text-xs text-gray-500">{product.category}</p>
                                            </div>
                                            <p className="text-sm font-bold text-emerald-400">₺{product.price}</p>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                            {selectedProduct && (
                                <div className="bg-violet-500/[0.06] border border-violet-500/15 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-white font-medium">{selectedProduct.name}</span>
                                        <span className="text-emerald-400 font-bold text-sm">₺{(selectedProduct.price * productQuantity).toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-400">Adet:</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))}
                                                className="w-7 h-7 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg flex items-center justify-center text-white transition-colors">
                                                <Minus className="w-3 h-3" />
                                            </button>
                                            <span className="w-7 text-center text-white font-bold text-sm">{productQuantity}</span>
                                            <button onClick={() => setProductQuantity(productQuantity + 1)}
                                                className="w-7 h-7 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg flex items-center justify-center text-white transition-colors">
                                                <Plus className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <button onClick={onClose} className="flex-1 px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 rounded-xl text-sm transition-colors border border-white/[0.06]">İptal</button>
                                <button onClick={onAddFromCatalog} disabled={!selectedProduct}
                                    className="flex-1 px-4 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed">Ekle</button>
                            </div>
                        </div>
                    )}

                    {addItemTab === "manual" && (
                        <form onSubmit={onAddCustom} className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-xs font-medium mb-2 uppercase tracking-wider">Tutar (TL) *</label>
                                <input type="number" step="0.01" min="0" required value={customItemAmount} onChange={(e) => setCustomItemAmount(e.target.value)}
                                    className="w-full bg-white/[0.03] border border-white/[0.06] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500/40 placeholder-gray-600" placeholder="0.00" />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs font-medium mb-2 uppercase tracking-wider">Ürün Adı (Opsiyonel)</label>
                                <input type="text" value={customItemName} onChange={(e) => setCustomItemName(e.target.value)}
                                    className="w-full bg-white/[0.03] border border-white/[0.06] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500/40 placeholder-gray-600" placeholder="Özel Ekleme" />
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 rounded-xl text-sm transition-colors border border-white/[0.06]">İptal</button>
                                <button type="submit" className="flex-1 px-4 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-semibold transition-all">Ekle</button>
                            </div>
                        </form>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
