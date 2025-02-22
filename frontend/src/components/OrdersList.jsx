import { useEffect, useState } from "react";
import axios from "../lib/axios";

const AnalyticsTab = () => {
  const [orderAnalyticsData, setOrderAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrderAnalyticsData = async () => {
      try {
        const response = await axios.get("/orders-analytics"); // API çağrısı
        console.log("API’den gelen veri:", response.data);

        // Siparişleri ters çevirerek en son sipariş verenin üstte olmasını sağlıyoruz
        const sortedUsersOrders = response.data.orderAnalyticsData?.usersOrders?.reverse() || [];

        setOrderAnalyticsData({
          totalOrders: response.data.orderAnalyticsData?.totalOrders || 0,
          usersOrders: sortedUsersOrders,
        });
      } catch (error) {
        console.error("API isteği sırasında hata:", error.response || error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderAnalyticsData();
  }, []);

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put("/orders-analytics/update-status", { orderId, status });

      // Sipariş durumunu frontend'de güncelle
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.map((order) =>
            order.orderId === orderId ? { ...order, status } : order
          ),
        })),
      }));
    } catch (error) {
      console.error("Sipariş durumu güncellenirken hata:", error);
    }
  };

  if (isLoading) {
    return <div className='text-white text-center'>Veriler yükleniyor...</div>;
  }

  if (!orderAnalyticsData || !orderAnalyticsData.usersOrders || orderAnalyticsData.usersOrders.length === 0) {
    return <div className='text-white text-center'>Henüz sipariş bulunmamaktadır.</div>;
  }

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
      <h2 className='text-2xl font-bold text-white mb-4'>Müşteri Siparişleri</h2>

      {orderAnalyticsData.usersOrders.map((userOrder) => (
        <div key={userOrder.user.id} className='bg-gray-800 p-6 rounded-lg mb-6 shadow-lg'>
          {/* Kullanıcı Bilgileri */}
          <div className='mb-4'>
            <h3 className='text-xl font-bold text-white'>{userOrder.user.name}</h3>
            <p className='text-gray-400'>E-Posta: {userOrder.user.email}</p>
            <p className='text-gray-400'>Telefon: {userOrder.user.phone || "Bilinmiyor"}</p>
            <p className='text-gray-400'>Adres: {userOrder.user.address || "Bilinmiyor"}</p>
          </div>

          {/* Sipariş Kartları */}
          <h4 className='text-lg font-bold text-white mt-4'>Siparişler:</h4>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {userOrder.orders
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // En yeni siparişleri en üste getiriyoruz
              .map((order) => (
                <div key={order.orderId} className='bg-gray-700 p-4 rounded-lg shadow'>
                  <p className='text-gray-300 font-semibold'>Sipariş ID: {order.orderId}</p>
                  <p className='text-gray-300'>
                    Toplam Tutar: <span className='text-green-400 font-bold'>₺{order.totalAmount}</span>
                  </p>
                  {/* 📌 Sipariş Tarihini Saat & Dakika ile gösterme */}
                  <p className='text-gray-300'>
                    Sipariş Tarihi: {new Date(order.createdAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>

                  {/* Sipariş Notu */}
                  {order.note && (
                    <p className='text-gray-300'>
                      Not: <span className='text-white font-semibold'>{order.note}</span>
                    </p>
                  )}

                  {/* Sipariş Durumu Değiştirme */}
                  <label className='text-gray-300'>Durum:</label>
                  <select
                    className='bg-gray-600 text-white p-2 rounded-md ml-2'
                    value={order.status}
                    onChange={(e) => updateOrderStatus(order.orderId, e.target.value)}
                  >
                    <option value='Hazırlanıyor'>Hazırlanıyor</option>
                    <option value='Yolda'>Yolda</option>
                    <option value='Teslim Edildi'>Teslim Edildi</option>
                  </select>

                  <h5 className='text-white font-semibold mt-2'>Ürünler:</h5>
                  <ul className='list-disc ml-6 text-gray-300'>
                    {order.products?.map((product, index) => (
                      <li key={index}>
                        <span className='font-bold text-white'>{product.name}</span> - {product.quantity} Adet -
                        <span className='text-green-400 font-bold'> ₺{product.price}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AnalyticsTab;