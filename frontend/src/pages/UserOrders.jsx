import { useEffect, useState } from "react";
import axios from "../lib/axios";
import { Package2, Truck, CheckCircle2, Clock, XCircle, RefreshCw, AlertCircle, Search, Filter, Calendar, DollarSign, RotateCcw, Star, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import CancelOrderModal from "../components/CancelOrderModal";
import socketService from "../lib/socket.js";
import { isWithinOrderHours, getOrderHoursStatus } from "../lib/orderHours";
import { useSettingsStore } from "../stores/useSettingsStore";

const UserOrders = () => {
    const [orders, setOrders] = useState([]);
    const [filteredOrders, setFilteredOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
    
    // Filtreleme ve arama state'leri
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortBy, setSortBy] = useState("newest");
    const [showFilters, setShowFilters] = useState(false);
    
    // Socket.IO state
    const [socket, setSocket] = useState(null);
    
    // Settings store
    const { settings, fetchSettings } = useSettingsStore();

    const fetchUserOrders = async () => {
        try {
            const response = await axios.get("/orders-analytics/user-orders");
            // İptal edilen siparişleri filtrele (veritabanında tutulur ama görünmez)
            const nonCancelledOrders = (response.data || []).filter(
                order => order.status !== "İptal Edildi"
            );
            const sortedOrders = nonCancelledOrders.sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            );
            setOrders(sortedOrders);
            setFilteredOrders(sortedOrders);
            setLastRefresh(new Date());
        } catch (error) {
            console.error("Siparişler yüklenirken hata:", error);
            toast.error("Siparişleriniz yüklenirken bir hata oluştu");
        } finally {
            setIsLoading(false);
        }
    };

    // Filtreleme ve arama fonksiyonu
    const applyFilters = () => {
        let filtered = [...orders];

        // Arama filtresi
        if (searchTerm) {
            filtered = filtered.filter(order => 
                order._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.products.some(product => 
                    product.name.toLowerCase().includes(searchTerm.toLowerCase())
                ) ||
                order.deliveryPointName?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Durum filtresi
        if (statusFilter !== "all") {
            filtered = filtered.filter(order => order.status === statusFilter);
        }

        // Sıralama
        switch (sortBy) {
            case "newest":
                filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case "oldest":
                filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case "amount-high":
                filtered.sort((a, b) => b.totalAmount - a.totalAmount);
                break;
            case "amount-low":
                filtered.sort((a, b) => a.totalAmount - b.totalAmount);
                break;
        }

        setFilteredOrders(filtered);
    };

    // Filtreleme değişikliklerini izle
    useEffect(() => {
        applyFilters();
    }, [searchTerm, statusFilter, sortBy, orders]);

    useEffect(() => {
        fetchUserOrders();
        fetchSettings(); // Ayarları yükle
        
        // Socket.IO bağlantısı
        const newSocket = socketService.connect();
        setSocket(newSocket);
        
        // Sipariş durumu güncellemelerini dinle
        const handleStatusUpdate = (data) => {
            console.log("Sipariş durumu güncellendi:", data);
            
            // Eğer sipariş iptal edildiyse, listeden kaldır
            if (data.newStatus === "İptal Edildi") {
                setOrders(prevOrders => prevOrders.filter(order => order._id !== data.orderId));
                toast.success("Siparişiniz iptal edildi! ❌");
                return;
            }
            
            // Diğer durumlar için siparişleri güncelle
            setOrders(prevOrders => {
                const updatedOrders = prevOrders.map(order => 
                    order._id === data.orderId 
                        ? { ...order, status: data.newStatus }
                        : order
                );
                return updatedOrders;
            });
            
            // Toast bildirimi
            const statusMessages = {
                "Hazırlanıyor": "Siparişiniz hazırlanmaya başlandı! 🍳",
                "Yolda": "Siparişiniz yolda! 🚚",
                "Teslim Edildi": "Siparişiniz teslim edildi! ✅"
            };
            
            toast.success(statusMessages[data.newStatus] || "Sipariş durumu güncellendi!");
        };

        newSocket.on("orderStatusUpdated", handleStatusUpdate);
        
        return () => {
            newSocket.off("orderStatusUpdated", handleStatusUpdate);
            // newSocket.close(); // Singleton olduğu için kapatmıyoruz, sadece listener kaldırıyoruz
        };
    }, []);

    useEffect(() => {
        let interval;
        if (autoRefresh) {
            interval = setInterval(() => {
                fetchUserOrders();
            }, 30000); // Her 30 saniyede bir yenile
        }
        return () => clearInterval(interval);
    }, [autoRefresh]);

    const handleCancelClick = (order) => {
        setOrderToCancel(order);
        setCancelModalOpen(true);
    };

    const cancelOrder = async () => {
        if (!orderToCancel) return;
        
        try {
            await axios.put("/orders-analytics/cancel-order", { orderId: orderToCancel._id });
            // İptal edilen siparişi listeden kaldır (veritabanında tutulur ama UI'da gizli)
            setOrders(orders.filter(order => order._id !== orderToCancel._id));
            toast.success("Siparişiniz başarıyla iptal edildi");
        } catch (error) {
            console.error("Sipariş iptal edilirken hata:", error);
            toast.error("Sipariş iptal edilirken bir hata oluştu");
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case "Hazırlanıyor":
                return <Package2 className="w-5 h-5" />;
            case "Yolda":
                return <Truck className="w-5 h-5" />;
            case "Teslim Edildi":
                return <CheckCircle2 className="w-5 h-5" />;
            case "İptal Edildi":
                return <XCircle className="w-5 h-5" />;
            default:
                return <Clock className="w-5 h-5" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "Hazırlanıyor":
                return "bg-emerald-500/10 text-emerald-500";
            case "Yolda":
                return "bg-yellow-500/10 text-yellow-500";
            case "Teslim Edildi":
                return "bg-blue-500/10 text-blue-500";
            case "İptal Edildi":
                return "bg-red-500/10 text-red-500";
            default:
                return "bg-gray-500/10 text-gray-500";
        }
    };

    // Sipariş durumu timeline'ı
    const getOrderTimeline = (order) => {
        const timeline = [
            { status: "Sipariş Alındı", completed: true, date: order.createdAt },
            { status: "Hazırlanıyor", completed: ["Hazırlanıyor", "Yolda", "Teslim Edildi"].includes(order.status), date: order.createdAt },
            { status: "Yolda", completed: ["Yolda", "Teslim Edildi"].includes(order.status), date: order.createdAt },
            { status: "Teslim Edildi", completed: order.status === "Teslim Edildi", date: order.createdAt }
        ];

        if (order.status === "İptal Edildi") {
            timeline[1] = { ...timeline[1], completed: false, cancelled: true };
        }

        return timeline;
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <motion.div
                    className="relative"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                    <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full"></div>
                </motion.div>
                <motion.p
                    className="text-gray-400 text-lg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    Siparişleriniz yükleniyor...
                </motion.p>
            </div>
        );
    }

    // Filtrelenmiş siparişleri grupla (iptal edilen siparişler zaten filtrelenmiş durumda)
    const activeOrders = filteredOrders.filter(order => ["Hazırlanıyor", "Yolda"].includes(order.status));
    const completedOrders = filteredOrders.filter(order => order.status === "Teslim Edildi");
    // İptal edilen siparişler artık gösterilmiyor (veritabanında tutulur ama UI'da gizli)

    return (
        <>
            <CancelOrderModal
                isOpen={cancelModalOpen}
                onClose={() => {
                    setCancelModalOpen(false);
                    setOrderToCancel(null);
                }}
                onConfirm={cancelOrder}
                orderInfo={{
                    orderId: orderToCancel?._id,
                    totalAmount: orderToCancel?.totalAmount
                }}
            />
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
                <motion.div 
                    className="flex flex-col gap-6 mb-8 pt-24"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <motion.h2 
                                className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                            >
                                Siparişlerim
                            </motion.h2>
                            <motion.div 
                                className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-full text-sm font-medium border border-emerald-500/20"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.4, type: "spring" }}
                            >
                                {filteredOrders.length} Sipariş
                            </motion.div>
                        </div>
                        
                        {/* Sipariş Saatleri Durumu */}
                        {settings && (
                            <motion.div 
                                className="flex items-center gap-2"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.6 }}
                            >
                                {(() => {
                                    const orderStatus = getOrderHoursStatus(settings);
                                    return (
                                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                                            orderStatus.isOutside 
                                                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        }`}>
                                            <Clock className="w-4 h-4" />
                                            <span>
                                                {orderStatus.isOutside ? 'Sipariş Saatleri Dışı' : 'Sipariş Alınıyor'}
                                            </span>
                                        </div>
                                    );
                                })()}
                            </motion.div>
                        )}
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                            <motion.button
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                                    autoRefresh 
                                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg' 
                                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                }`}
                                title={autoRefresh ? "Otomatik yenileme açık" : "Otomatik yenileme kapalı"}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">
                                    {autoRefresh ? "Otomatik" : "Manuel"}
                                </span>
                            </motion.button>
                            <div className="text-sm text-gray-400 whitespace-nowrap">
                                Son: {lastRefresh.toLocaleTimeString()}
                            </div>
                        </div>
                    </div>

                    {/* Arama ve Filtreleme */}
                    <motion.div 
                        className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                    >
                        <div className="flex flex-col lg:flex-row gap-4">
                            {/* Arama */}
                            <div className="flex-1">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        placeholder="Sipariş ID, ürün adı veya teslimat noktası ara..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-700/30 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-300"
                                    />
                                </div>
                            </div>

                            {/* Filtre Butonu */}
                            <motion.button
                                onClick={() => setShowFilters(!showFilters)}
                                className="flex items-center gap-2 px-4 py-3 bg-gray-700/30 hover:bg-gray-700/50 text-white rounded-xl transition-all duration-300 border border-gray-600/50"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <Filter className="w-5 h-5" />
                                <span>Filtreler</span>
                            </motion.button>
                        </div>

                        {/* Filtre Seçenekleri */}
                        <AnimatePresence>
                            {showFilters && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-4 pt-4 border-t border-gray-700/50"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Durum Filtresi */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Durum</label>
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => setStatusFilter(e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-700/30 border border-gray-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                            >
                                                <option value="all">Tümü</option>
                                                <option value="Hazırlanıyor">Hazırlanıyor</option>
                                                <option value="Yolda">Yolda</option>
                                                <option value="Teslim Edildi">Teslim Edildi</option>
                                            </select>
                                        </div>

                                        {/* Sıralama */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Sıralama</label>
                                            <select
                                                value={sortBy}
                                                onChange={(e) => setSortBy(e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-700/30 border border-gray-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                            >
                                                <option value="newest">En Yeni</option>
                                                <option value="oldest">En Eski</option>
                                                <option value="amount-high">Tutar (Yüksek)</option>
                                                <option value="amount-low">Tutar (Düşük)</option>
                                            </select>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>

                {filteredOrders.length > 0 ? (
                    <motion.div 
                        className="space-y-8"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                    >
                        {/* Aktif Siparişler */}
                        {activeOrders.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                    <div className="w-2 h-8 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-full"></div>
                                    Aktif Siparişler
                                    <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-sm font-medium">
                                        {activeOrders.length}
                                    </span>
                                </h3>
                                <div className="grid gap-6">
                                    <AnimatePresence>
                                        {activeOrders.map((order, index) => (
                                            <motion.div 
                                                key={order._id} 
                                                className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-sm rounded-2xl overflow-hidden border border-gray-700/50 shadow-xl hover:shadow-2xl transition-all duration-300"
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                                whileHover={{ y: -5, scale: 1.02 }}
                                                exit={{ opacity: 0, y: -20 }}
                                            >
                                                {/* Sipariş Başlığı */}
                                                <div className="border-b border-gray-700/50 p-6">
                                                    <div className="flex flex-wrap items-center gap-4 justify-between mb-6">
                                                        <div className="flex items-center gap-4">
                                                            <motion.div 
                                                                className={`p-3 rounded-xl ${getStatusColor(order.status)} shadow-lg`}
                                                                whileHover={{ scale: 1.1, rotate: 5 }}
                                                                transition={{ type: "spring", stiffness: 300 }}
                                                            >
                                                                {getStatusIcon(order.status)}
                                                            </motion.div>
                                                            <div>
                                                                <p className="text-sm text-gray-400">Sipariş ID</p>
                                                                <p className="text-white font-bold text-lg">{order._id}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <motion.div 
                                                                className={`px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium ${getStatusColor(order.status)} shadow-lg`}
                                                                whileHover={{ scale: 1.05 }}
                                                            >
                                                                {getStatusIcon(order.status)}
                                                                {order.status}
                                                            </motion.div>
                                                            {order.status === "Hazırlanıyor" && (
                                                                <motion.button
                                                                    onClick={() => handleCancelClick(order)}
                                                                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-300 border border-red-500/20"
                                                                    whileHover={{ scale: 1.05 }}
                                                                    whileTap={{ scale: 0.95 }}
                                                                >
                                                                    <XCircle className="w-4 h-4" />
                                                                    İptal Et
                                                                </motion.button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Sipariş Timeline */}
                                                    <div className="mb-6">
                                                        <h4 className="text-sm font-medium text-gray-300 mb-3">Sipariş Durumu</h4>
                                                        <div className="flex items-center space-x-4">
                                                            {getOrderTimeline(order).map((step, stepIndex) => (
                                                                <div key={stepIndex} className="flex items-center">
                                                                    <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                                                                        step.completed 
                                                                            ? 'bg-emerald-500 border-emerald-500 text-white' 
                                                                            : step.cancelled
                                                                            ? 'bg-red-500 border-red-500 text-white'
                                                                            : 'bg-gray-700 border-gray-600 text-gray-400'
                                                                    }`}>
                                                                        {step.completed ? (
                                                                            <CheckCircle2 className="w-4 h-4" />
                                                                        ) : step.cancelled ? (
                                                                            <XCircle className="w-4 h-4" />
                                                                        ) : (
                                                                            <Clock className="w-4 h-4" />
                                                                        )}
                                                                    </div>
                                                                    <span className={`ml-2 text-sm ${
                                                                        step.completed 
                                                                            ? 'text-emerald-400 font-medium' 
                                                                            : step.cancelled
                                                                            ? 'text-red-400 font-medium'
                                                                            : 'text-gray-400'
                                                                    }`}>
                                                                        {step.status}
                                                                    </span>
                                                                    {stepIndex < getOrderTimeline(order).length - 1 && (
                                                                        <div className={`w-8 h-0.5 mx-2 ${
                                                                            step.completed ? 'bg-emerald-500' : 'bg-gray-600'
                                                                        }`} />
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-6 text-sm">
                                                        <div>
                                                            <p className="text-gray-400">Sipariş Tarihi</p>
                                                            <p className="text-white">{new Date(order.createdAt).toLocaleString("tr-TR", {
                                                                day: "2-digit",
                                                                month: "2-digit",
                                                                year: "numeric",
                                                                hour: "2-digit",
                                                                minute: "2-digit"
                                                            })}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-400">Teslimat Noktası</p>
                                                            <p className="text-white">📍 {order.deliveryPointName || order.city || "Belirtilmemiş"}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-400">Toplam Tutar</p>
                                                            <p className="text-emerald-400 font-bold text-lg">₺{order.totalAmount}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Ürünler Listesi */}
                                                <div className="p-6">
                                                    <h3 className="text-white font-medium mb-4">Sipariş Detayı</h3>
                                                    <div className="space-y-3">
                                                        {order.products.map((product, index) => (
                                                            <div key={index} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="bg-gray-700 h-16 w-16 rounded-lg flex items-center justify-center overflow-hidden">
                                                                        {product.image ? (
                                                                            <img
                                                                                src={product.image}
                                                                                alt={product.name}
                                                                                className="h-full w-full object-contain"
                                                                            />
                                                                        ) : (
                                                                            <Package2 className="w-6 h-6 text-gray-400" />
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-white font-medium">{product.name}</p>
                                                                        <p className="text-sm text-gray-400">{product.quantity} Adet</p>
                                                                    </div>
                                                                </div>
                                                                <p className="text-emerald-400 font-bold">₺{product.price}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Sipariş Notu */}
                                                {order.note && (
                                                    <div className="px-6 pb-6">
                                                        <div className="p-3 bg-gray-700/30 rounded-lg">
                                                            <div className="flex items-center gap-2 text-yellow-500 mb-2">
                                                                <AlertCircle className="w-4 h-4" />
                                                                <span className="text-sm font-medium">Sipariş Notu</span>
                                                            </div>
                                                            <p className="text-gray-300 text-sm">{order.note}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}

                        {/* Tamamlanan Siparişler */}
                        {completedOrders.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                    <div className="w-2 h-8 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full"></div>
                                    Tamamlanan Siparişler
                                    <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
                                        {completedOrders.length}
                                    </span>
                                </h3>
                                <div className="grid gap-6">
                                    <AnimatePresence>
                                        {completedOrders.map((order, index) => (
                                            <motion.div 
                                                key={order._id} 
                                                className="bg-gradient-to-br from-blue-500/5 to-emerald-500/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-blue-500/20 shadow-xl hover:shadow-2xl transition-all duration-300"
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                                whileHover={{ y: -5, scale: 1.02 }}
                                                exit={{ opacity: 0, y: -20 }}
                                            >
                                                {/* Sipariş Başlığı */}
                                                <div className="border-b border-blue-500/20 p-6">
                                                    <div className="flex flex-wrap items-center gap-4 justify-between mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${getStatusColor(order.status)}`}>
                                                                {getStatusIcon(order.status)}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm text-gray-400">Sipariş ID</p>
                                                                <p className="text-white font-medium">{order._id}</p>
                                                            </div>
                                                        </div>
                                                        <div className={`px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium ${getStatusColor(order.status)}`}>
                                                            {getStatusIcon(order.status)}
                                                            {order.status}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-6 text-sm">
                                                        <div>
                                                            <p className="text-gray-400">Sipariş Tarihi</p>
                                                            <p className="text-white">{new Date(order.createdAt).toLocaleString("tr-TR", {
                                                                day: "2-digit",
                                                                month: "2-digit",
                                                                year: "numeric",
                                                                hour: "2-digit",
                                                                minute: "2-digit"
                                                            })}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-400">Teslimat Noktası</p>
                                                            <p className="text-white">📍 {order.deliveryPointName || order.city || "Belirtilmemiş"}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-400">Toplam Tutar</p>
                                                            <p className="text-emerald-400 font-bold text-lg">₺{order.totalAmount}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Ürünler Listesi */}
                                                <div className="p-6">
                                                    <h3 className="text-white font-medium mb-4">Sipariş Detayı</h3>
                                                    <div className="space-y-3">
                                                        {order.products.map((product, index) => (
                                                            <div key={index} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="bg-gray-700 h-16 w-16 rounded-lg flex items-center justify-center overflow-hidden">
                                                                        {product.image ? (
                                                                            <img
                                                                                src={product.image}
                                                                                alt={product.name}
                                                                                className="h-full w-full object-contain"
                                                                            />
                                                                        ) : (
                                                                            <Package2 className="w-6 h-6 text-gray-400" />
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-white font-medium">{product.name}</p>
                                                                        <p className="text-sm text-gray-400">{product.quantity} Adet</p>
                                                                    </div>
                                                                </div>
                                                                <p className="text-emerald-400 font-bold">₺{product.price}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Sipariş Notu */}
                                                {order.note && (
                                                    <div className="px-6 pb-6">
                                                        <div className="p-3 bg-gray-700/30 rounded-lg">
                                                            <div className="flex items-center gap-2 text-yellow-500 mb-2">
                                                                <AlertCircle className="w-4 h-4" />
                                                                <span className="text-sm font-medium">Sipariş Notu</span>
                                                            </div>
                                                            <p className="text-gray-300 text-sm">{order.note}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}

                    </motion.div>
                ) : (
                    <motion.div 
                        className="flex flex-col items-center justify-center bg-gray-800/50 backdrop-blur-sm rounded-xl p-12 text-center"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <Package2 className="w-16 h-16 text-gray-500 mb-4" />
                        <h3 className="text-xl font-medium text-white mb-2">Henüz Siparişiniz Bulunmuyor</h3>
                        <p className="text-gray-400">Sipariş geçmişiniz burada görüntülenecektir.</p>
                    </motion.div>
                )}
            </div>
        </>
    );
};

export default UserOrders;