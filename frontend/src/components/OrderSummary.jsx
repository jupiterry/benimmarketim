import { motion } from "framer-motion";
import { useCartStore } from "../stores/useCartStore";
import { useNavigate } from "react-router-dom";
import axios from "../lib/axios";
import { useState } from "react";
import cities from "../data/cities";
import toast from "react-hot-toast";
import { Clock, Truck, Info } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";
import FeedbackForm from "./FeedbackForm";

const OrderSummary = () => {
  const { total, subtotal, coupon, isCouponApplied, cart, clearCart } = useCartStore();
  const [selectedCity, setSelectedCity] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const navigate = useNavigate();
  const { user } = useUserStore();

  const savings = subtotal - total;
  const formattedSubtotal = subtotal.toFixed(2);
  const formattedTotal = total.toFixed(2);
  const formattedSavings = savings.toFixed(2);

  // Minimum sipariş tutarı için ilerleme hesaplama
  const MIN_ORDER_AMOUNT = 250;
  const progress = (total / MIN_ORDER_AMOUNT) * 100;
  const remainingAmount = MIN_ORDER_AMOUNT - total;

  // Tahmini teslimat süresi hesaplama
  const getEstimatedDeliveryTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    return now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

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
  
      // Kullanıcının geri bildirim durumunu kontrol et
      const userResponse = await axios.get(`/users/${user._id}`);
      if (!userResponse.data.hasFeedback) {
        setShowFeedback(true);
        return;
      }
  
      await createOrder();
    } catch (error) {
      console.error("Sipariş işleminde hata oluştu:", error);
      toast.error(error.response?.data?.message || "Sipariş işleminde hata oluştu.", { id: "orderError" });
    }
  };

  const createOrder = async () => {
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
      toast.success("Sipariş başarıyla oluşturuldu!", { id: "orderSuccess", position: "top-center" });
      navigate("/siparisolusturuldu");
    } else {
      toast.error("Sipariş oluşturulurken hata oluştu!", { id: "orderError" });
    }
  };

  const handleFeedbackComplete = async () => {
    setShowFeedback(false);
    await createOrder();
  };

  if (showFeedback) {
    return (
      <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-emerald-400 mb-4">Geri Bildirim</h2>
        <p className="text-gray-300 mb-4">
          Siparişinizi tamamlamadan önce lütfen deneyiminizi değerlendirin.
        </p>
        <FeedbackForm onComplete={handleFeedbackComplete} />
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-4 rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm p-4 shadow-sm sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <p className="text-xl font-semibold text-emerald-400">Sipariş Özeti</p>

      {/* Minimum Sipariş Tutarı İlerleme Çubuğu */}
      <div className="space-y-2">
        <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        {remainingAmount > 0 ? (
          <p className="text-sm text-gray-400 text-center">
            Minimum sipariş tutarına ulaşmak için <span className="text-emerald-400 font-semibold">₺{remainingAmount.toFixed(2)}</span> daha eklemelisiniz
          </p>
        ) : (
          <p className="text-sm text-emerald-400 text-center font-medium">
            Minimum sipariş tutarına ulaştınız! ✨
          </p>
        )}
      </div>

      {/* Teslimat Bilgileri */}
      <div className="bg-gray-700/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Truck className="w-5 h-5" />
          <span className="font-medium">Teslimat Bilgileri</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Clock className="w-4 h-4" />
          <span>Tahmini Teslimat: {getEstimatedDeliveryTime()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Info className="w-4 h-4" />
          <span>₺250 üzeri siparişlerde ücretsiz teslimat</span>
        </div>
      </div>

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
            placeholder="05XX XXX XX XX"
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
          className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handlePayment}
          disabled={total < MIN_ORDER_AMOUNT}
        >
          {total < MIN_ORDER_AMOUNT ? 'Minimum Tutar 250₺' : 'Sepeti Onayla'}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default OrderSummary;