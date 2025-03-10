import { useEffect, useState } from "react";
import axios from "../lib/axios";
import { Package2, Truck, CheckCircle2, Clock, XCircle, RefreshCw, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const UserOrders = () => {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    const fetchUserOrders = async () => {
        try {
            const response = await axios.get("/orders-analytics/user-orders");
            const sortedOrders = (response.data || []).sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            );
            setOrders(sortedOrders);
            setLastRefresh(new Date());
        } catch (error) {
            console.error("Siparişler yüklenirken hata:", error);
            toast.error("Siparişleriniz yüklenirken bir hata oluştu");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUserOrders();
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

    const cancelOrder = async (orderId) => {
        try {
            await axios.put("/orders-analytics/cancel-order", { orderId });
            setOrders(orders.map(order => 
                order._id === orderId 
                    ? { ...order, status: "İptal Edildi" }
                    : order
            ));
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    // Sipariş durumlarına göre grupla
    const activeOrders = orders.filter(order => ["Hazırlanıyor", "Yolda"].includes(order.status));
    const completedOrders = orders.filter(order => order.status === "Teslim Edildi");
    const cancelledOrders = orders.filter(order => order.status === "İptal Edildi");

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
            <div className="flex flex-col gap-4 mb-8 pt-24">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl md:text-3xl font-bold text-white">Siparişlerim</h2>
                        <div className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                            {orders.length} Sipariş
                        </div>
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                autoRefresh 
                                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                            title={autoRefresh ? "Otomatik yenileme açık" : "Otomatik yenileme kapalı"}
                        >
                            <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">
                                {autoRefresh ? "Otomatik" : "Manuel"}
                            </span>
                        </button>
                        <div className="text-sm text-gray-400 whitespace-nowrap">
                            Son: {lastRefresh.toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            </div>

            {orders.length > 0 ? (
                <div className="space-y-8">
                    {/* Aktif Siparişler */}
                    {activeOrders.length > 0 && (
                        <div>
                            <h3 className="text-xl font-semibold text-white mb-4">Aktif Siparişler</h3>
                            <div className="grid gap-6">
                                {activeOrders.map(order => (
                                    <div key={order._id} className="bg-gray-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-gray-700/50">
                                        {/* Sipariş Başlığı */}
                                        <div className="border-b border-gray-700/50 p-6">
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
                                                <div className="flex items-center gap-3">
                                                    <div className={`px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium ${getStatusColor(order.status)}`}>
                                                        {getStatusIcon(order.status)}
                                                        {order.status}
                                                    </div>
                                                    {order.status === "Hazırlanıyor" && (
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm("Siparişinizi iptal etmek istediğinize emin misiniz?")) {
                                                                    cancelOrder(order._id);
                                                                }
                                                            }}
                                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                            İptal Et
                                                        </button>
                                                    )}
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
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tamamlanan Siparişler */}
                    {completedOrders.length > 0 && (
                        <div>
                            <h3 className="text-xl font-semibold text-white mb-4">Tamamlanan Siparişler</h3>
                            <div className="grid gap-6">
                                {completedOrders.map(order => (
                                    <div key={order._id} className="bg-emerald-500/5 backdrop-blur-sm rounded-xl overflow-hidden border border-emerald-500/20">
                                        {/* Sipariş Başlığı */}
                                        <div className="border-b border-emerald-500/20 p-6">
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
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* İptal Edilen Siparişler */}
                    {cancelledOrders.length > 0 && (
                        <div>
                            <h3 className="text-xl font-semibold text-white mb-4">İptal Edilen Siparişler</h3>
                            <div className="grid gap-6">
                                {cancelledOrders.map(order => (
                                    <div key={order._id} className="bg-red-500/5 backdrop-blur-sm rounded-xl overflow-hidden border border-red-500/20 opacity-75">
                                        {/* Sipariş Başlığı */}
                                        <div className="border-b border-red-500/20 p-6">
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
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center bg-gray-800/50 backdrop-blur-sm rounded-xl p-12 text-center">
                    <Package2 className="w-16 h-16 text-gray-500 mb-4" />
                    <h3 className="text-xl font-medium text-white mb-2">Henüz Siparişiniz Bulunmuyor</h3>
                    <p className="text-gray-400">Sipariş geçmişiniz burada görüntülenecektir.</p>
                </div>
            )}
        </div>
    );
};

export default UserOrders;