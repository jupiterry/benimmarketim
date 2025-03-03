import { motion } from "framer-motion";
import { useCartStore } from "../stores/useCartStore";
import { useNavigate } from "react-router-dom";
import axios from "../lib/axios";
import { useState } from "react";
import cities from "../data/cities";
import toast from "react-hot-toast";

const OrderSummary = ({ note, setNote }) => {
  const { total, subtotal, coupon, isCouponApplied, cart, clearCart } = useCartStore();
  const [selectedCity, setSelectedCity] = useState("");
  const [phone, setPhone] = useState("");
  const navigate = useNavigate();

  const savings = subtotal - total;
  const formattedSubtotal = subtotal.toFixed(2);
  const formattedTotal = total.toFixed(2);
  const formattedSavings = savings.toFixed(2);

  const handlePayment = async () => {
    try {
      if (cart.length === 0) {
        toast.error("Sepetiniz boş!", { id: "emptyCart" });
        return;
      }
  
      if (!selectedCity.trim()) {
        toast.error("Lütfen il seçin!", { id: "cityDistrict" });
        return;
      }
  
      if (!phone.trim() || phone.length < 10) {
        toast.error("Geçerli bir telefon numarası girin!", { id: "phoneError" });
        return;
      }
  
      const orderItems = cart.map((item) => ({
        product: item._id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      }));
  
      const res = await axios.post("/cart/place-order", {
        products: orderItems,
        city: selectedCity,
        phone: phone,
        note: note,
      });
  
      if (res.data.success) {
        localStorage.removeItem("cart");
        clearCart();
        toast.success("Sipariş başarıyla oluşturuldu!", { id: "orderSuccess" });
        navigate("/siparisolusturuldu", {
          state: {
            orderId: res.data.orderId,
            totalAmount: formattedTotal,
            status: "Hazırlanıyor",
          },
        });
      } else {
        toast.error("Sipariş oluşturulurken hata oluştu!", { id: "orderError" });
      }
    } catch (error) {
      console.error("Sipariş işleminde hata oluştu:", error);
      toast.error(error.response?.data?.error || "Sipariş işleminde hata oluştu.", { id: "orderError" });
    }
  };

  return (
    <motion.div
      className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-sm sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <p className="text-xl font-semibold text-emerald-400">Sipariş Özeti</p>

      <div className="space-y-4">
        <div className="space-y-2">
          <dl className="flex items-center justify-between gap-4">
            <dt className="text-base font-normal text-gray-300">Fiyat</dt>
            <dd className="text-base font-medium text-white">₺{formattedSubtotal}</dd>
          </dl>

          {savings > 0 && (
            <dl className="flex items-center justify-between gap-4">
              <dt className="text-base font-normal text-gray-300">Kazanç</dt>
              <dd className="text-base font-medium text-emerald-400">-₺{formattedSavings}</dd>
            </dl>
          )}

          {coupon && isCouponApplied && (
            <dl className="flex items-center justify-between gap-4">
              <dt className="text-base font-normal text-gray-300">Kupon ({coupon.code})</dt>
              <dd className="text-base font-medium text-emerald-400">-{coupon.discountPercentage}%</dd>
            </dl>
          )}
          <dl className="flex items-center justify-between gap-4 border-t border-gray-600 pt-2">
            <dt className="text-base font-bold text-white">Toplam</dt>
            <dd className="text-base font-bold text-emerald-400">₺{formattedTotal}</dd>
          </dl>
        </div>

        {/* Şehir Seçimi */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Yurt</label>
          <select
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={selectedCity}
            onChange={(e) => {
              setSelectedCity(e.target.value);
            }}
          >
            <option value="">Adres Seçiniz</option>
            {Object.keys(cities).map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        {/* Telefon Numarası */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Telefon Numaranız</label>
          <input
            type="tel"
            placeholder="Telefon Numaranızı Giriniz"
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* Sipariş Notu Alanı */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Sipariş Notu</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            rows="3"
            placeholder="Siparişinizle ilgili not ekleyebilirsiniz..."
          />
        </div>

        {/* Sepeti Onayla Butonu */}
        <motion.button
          className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-300"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handlePayment}
        >
          Sepeti Onayla
        </motion.button>
        <p className="text-sm text-gray-400 text-center mt-2">
          Sepetinizin en az <span className="font-semibold text-emerald-400">250₺</span> olması gerekmektedir.
        </p>
      </div>
    </motion.div>
  );
};

export default OrderSummary;