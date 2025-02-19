import { useEffect, useState } from "react";
import axios from "../lib/axios";

const UserOrders = () => {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchUserOrders = async () => {
            try {
                const response = await axios.get("/orders-analytics/user-orders");
                setOrders(response.data || []);
            } catch (error) {
                console.error("Siparişler yüklenirken hata:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserOrders();
    }, []);

    if (isLoading) {
        return <div className="text-white text-center">Veriler yükleniyor...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-white mb-4">Siparişlerim</h2>

            {orders.length > 0 ? (
                orders.map(order => (
                    <div key={order._id} className="bg-gray-800 p-6 rounded-lg mb-6 shadow-lg">
                        <p className="text-gray-300 font-semibold">Sipariş ID: {order._id}</p>
                        <p className="text-gray-300">
                            Toplam Tutar: <span className="text-green-400 font-bold">₺{order.totalAmount}</span>
                        </p>
                        <p className="text-gray-300">
                            Sipariş Durumu: <span className="text-blue-400 font-bold">{order.status}</span>
                        </p>
                        <p className="text-gray-300">
                            Sipariş Tarihi: {new Date(order.createdAt).toLocaleString("tr-TR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                            })}
                        </p>

                        <h5 className="text-white font-semibold mt-2">Ürünler:</h5>
                        <ul className="list-disc ml-6 text-gray-300">
                            {order.products.map((product, index) => (
                                <li key={index}>
                                    <span className="font-bold text-white">{product.name}</span> - {product.quantity} Adet - 
                                    <span className="text-green-400 font-bold"> ₺{product.price}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            ) : (
                <div className="text-white text-center">Henüz siparişiniz bulunmamaktadır.</div>
            )}
        </div>
    );
};

export default UserOrders;
