import { useEffect, useState } from "react";
import axios from "../lib/axios";

const OrdersTab = () => {
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await axios.get("/orders-analytics");
                setOrders(response.data.orderAnalyticsData.usersOrders || []);
            } catch (error) {
                console.error("Siparişler yüklenirken hata:", error);
            }
        };

        fetchOrders();
    }, []);

    const updateOrderStatus = async (orderId, status) => {
        try {
            await axios.put("/orders-analytics/update-status", { orderId, status });

            // Güncellenen siparişi UI'da da güncelle
            setOrders(prevOrders =>
                prevOrders.map(userOrder => ({
                    ...userOrder,
                    orders: userOrder.orders.map(order =>
                        order.orderId === orderId ? { ...order, status } : order
                    ),
                }))
            );
        } catch (error) {
            console.error("Sipariş durumu güncellenirken hata:", error);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-white mb-4">Siparişler</h2>

            {orders.map(userOrder => (
                <div key={userOrder.user.id} className="bg-gray-800 p-6 rounded-lg mb-6 shadow-lg">
                    <h3 className="text-xl font-bold text-white">{userOrder.user.name}</h3>
                    <p className="text-gray-400">E-Posta: {userOrder.user.email}</p>

                    <h4 className="text-lg font-bold text-white mt-4">Siparişler:</h4>
                    {userOrder.orders.map(order => (
                        <div key={order.orderId} className="bg-gray-700 p-4 rounded-lg mt-2 shadow">
                            <p className="text-gray-300 font-semibold">Sipariş ID: {order.orderId}</p>
                            <p className="text-gray-300">
                                Toplam Tutar: <span className="text-green-400 font-bold">${order.totalAmount}</span>
                            </p>

                            {/* Admin sipariş durumunu değiştirebilecek */}
                            <label className="text-gray-300">Durum:</label>
                            <select
                                className="bg-gray-600 text-white p-2 rounded-md ml-2"
                                value={order.status}
                                onChange={(e) => updateOrderStatus(order.orderId, e.target.value)}
                            >
                                <option value="Hazırlanıyor">Hazırlanıyor</option>
                                <option value="Yolda">Yolda</option>
                                <option value="Teslim Edildi">Teslim Edildi</option>
                            </select>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

export default OrdersTab;
