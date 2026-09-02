import { motion } from "framer-motion";
import { useCartStore } from "../stores/useCartStore";
import { useNavigate } from "react-router-dom";
import axios from "../lib/axios";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Clock, Truck, Info, MapPin, CheckCircle, XCircle } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { isWithinOrderHours, getOrderHoursStatus, getOrderHoursCountdown, getOrderStatus, getDeliveryPointsStatus } from "../lib/orderHours";
import FeedbackForm from "./FeedbackForm";

const OrderSummary = () => {
  const { total, subtotal, coupon, isCouponApplied, cart, clearCart } = useCartStore();
  const { settings, fetchSettings } = useSettingsStore();
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedDeliveryPoint, setSelectedDeliveryPoint] = useState("");
  const [orderHoursStatus, setOrderHoursStatus] = useState(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [orderStatus, setOrderStatus] = useState(null);
  const navigate = useNavigate();
  const { user } = useUserStore();

  useEffect(() => {
    fetchSettings();
    
    // Admin ayarlarını her 5 saniyede bir kontrol et
    const interval = setInterval(() => {
      fetchSettings();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [fetchSettings]);

  // Sipariş durumu kontrolü (saatler + teslimat noktaları)
  useEffect(() => {
    if (settings) {
      const status = getOrderStatus(settings);
      setOrderStatus(status);
      
      // Sipariş saatleri durumunu da ayrıca kontrol et (countdown için)
      const hoursStatus = getOrderHoursStatus(settings);
      setOrderHoursStatus(hoursStatus);
      
      if (hoursStatus.isOutside) {
        const countdownData = getOrderHoursCountdown(settings);
        setCountdown(countdownData);
      }
    }
  }, [settings]);

  // Countdown timer
  useEffect(() => {
    if (orderHoursStatus?.isOutside && settings) {
      const timer = setInterval(() => {
        const countdownData = getOrderHoursCountdown(settings);
        setCountdown(countdownData);
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [orderHoursStatus, settings]);

  const savings = subtotal - total;
  const formattedSubtotal = subtotal.toFixed(2);
  const formattedTotal = total.toFixed(2);
  const formattedSavings = savings.toFixed(2);

  // Minimum sipariş tutarı için ilerleme hesaplama
  const MIN_ORDER_AMOUNT = settings.minimumOrderAmount;
  const progress = (total / MIN_ORDER_AMOUNT) * 100;
  const remainingAmount = MIN_ORDER_AMOUNT - total;

  // Tahmini teslimat süresi hesaplama
  const getEstimatedDeliveryTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    return now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    // Sadece rakam girişine izin ver
    let numericValue = value.replace(/\D/g, '');
    
    // Eğer boşsa, boş bırak
    if (numericValue.length === 0) {
      setPhone('');
      return;
    }
    
    // İlk karakter 0 değilse, 05 ile başlat
    if (numericValue[0] !== '0') {
      numericValue = '05' + numericValue;
    } else if (numericValue.length >= 2 && numericValue[1] !== '5') {
      // İlk karakter 0 ama ikinci karakter 5 değilse, 05 yap
      numericValue = '05' + numericValue.substring(2);
    }
    
    // Maksimum 11 karakter (05XXXXXXXXX formatı)
    if (numericValue.length <= 11) {
      setPhone(numericValue);
    } else {
      // 11 karakterden fazla ise, sadece ilk 11 karakteri al
      setPhone(numericValue.substring(0, 11));
    }
  };

  const validatePhone = (phoneNumber) => {
    // Boş kontrolü
    if (!phoneNumber || phoneNumber.trim().length === 0) {
      return { valid: false, message: "Telefon numarası boş olamaz!" };
    }
    
    // 11 haneli olmalı
    if (phoneNumber.length !== 11) {
      return { valid: false, message: "Telefon numarası 11 haneli olmalıdır!" };
    }
    
    // 05 ile başlamalı
    if (!phoneNumber.startsWith('05')) {
      return { valid: false, message: "Telefon numarası 05 ile başlamalıdır!" };
    }
    
    // Sadece rakam içermeli
    if (!/^\d+$/.test(phoneNumber)) {
      return { valid: false, message: "Telefon numarası sadece rakam içermelidir!" };
    }
    
    return { valid: true };
  };

  const handlePayment = async () => {
    try {
      // Genel sipariş durumu kontrolü (saatler + teslimat noktaları)
      if (!orderStatus?.canOrder) {
        toast.error(orderStatus?.message || "Sipariş alınamıyor!", { id: "orderStatus" });
        return;
      }
      
      if (cart.length === 0) {
        toast.error("Sepetiniz boş!", { id: "emptyCart" });
        return;
      }
  
      if (!selectedDeliveryPoint) {
        toast.error("Lütfen teslimat noktası seçin!", { id: "deliveryPoint" });
        return;
      }
  
      // Telefon numarası validasyonu
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        toast.error(phoneValidation.message, { id: "phoneError" });
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
    try {
    const orderItems = cart.map((item) => ({
      product: item._id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    }));

      const deliveryPointName = selectedDeliveryPoint === 'girlsDorm' 
        ? settings.deliveryPoints?.girlsDorm?.name || 'Kız KYK Yurdu'
        : settings.deliveryPoints?.boysDorm?.name || 'Erkek KYK Yurdu';
    
      console.log("Sipariş gönderiliyor:", {
        products: orderItems,
        city: deliveryPointName,
        phone: phone,
        deliveryPoint: selectedDeliveryPoint,
        deliveryPointName: deliveryPointName
      });
  
    const res = await axios.post("/cart/place-order", {
      products: orderItems,
        city: deliveryPointName,
      phone: phone,
      note: note,
        deliveryPoint: selectedDeliveryPoint,
        deliveryPointName: deliveryPointName,
      // Sadece kupon kodu gönderilir; indirim tutarı backend tarafından hesaplanır.
      couponCode: isCouponApplied && coupon ? coupon.code : null
    });
    
      console.log("Sipariş yanıtı:", res.data);
  
    if (res.data.success) {
      localStorage.removeItem("cart");
      clearCart();
      toast.success("Sipariş başarıyla oluşturuldu!", { id: "orderSuccess", position: "top-center" });
      navigate("/siparisolusturuldu");
    } else {
      toast.error("Sipariş oluşturulurken hata oluştu!", { id: "orderError" });
      }
    } catch (error) {
      console.error("createOrder hatası:", error);
      console.error("Hata yanıtı:", error.response?.data);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || "Sipariş oluşturulurken hata oluştu";
      toast.error(errorMessage, { id: "orderError" });
      throw error;
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
    <div className="relative overflow-hidden">
      {/* Arka Plan Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-green-500/10 to-teal-500/10 rounded-3xl"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/20 to-gray-900/40 rounded-3xl"></div>
      
      <motion.div
        className="relative bg-gray-900/60 rounded-3xl p-8 backdrop-blur-xl border border-emerald-500/20 shadow-2xl space-y-6"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, type: "spring" }}
      >
        {/* Header */}
        <div className="text-center mb-8">
    <motion.div
            className="inline-flex items-center gap-3 mb-4"
            initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-2xl">📋</span>
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 bg-clip-text text-transparent">
              Sipariş Özeti
            </h2>
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-2xl">✨</span>
            </div>
          </motion.div>
        </div>

        {/* Sipariş Durumu */}
        {orderStatus && (
          <motion.div 
            className={`rounded-2xl p-6 border ${
              !orderStatus.canOrder 
                ? 'bg-red-500/5 border-red-500/20' 
                : 'bg-emerald-500/5 border-emerald-500/20'
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                !orderStatus.canOrder 
                  ? 'bg-red-500/20' 
                  : 'bg-emerald-500/20'
              }`}>
                {orderStatus.reason === 'deliveryPoints' ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : orderStatus.reason === 'orderHours' ? (
                  <Clock className="w-4 h-4 text-red-400" />
                ) : (
                  <Clock className={`w-4 h-4 ${!orderStatus.canOrder ? 'text-red-400' : 'text-emerald-400'}`} />
                )}
              </div>
              <h3 className={`text-lg font-semibold ${
                !orderStatus.canOrder ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {!orderStatus.canOrder 
                  ? (orderStatus.reason === 'deliveryPoints' ? 'Teslimat Noktaları Kapalı' : 'Sipariş Saatleri Dışı')
                  : 'Sipariş Alınıyor'
                }
              </h3>
            </div>
            
            <div className="space-y-3">
              <p className={`text-sm ${
                !orderStatus.canOrder ? 'text-red-300' : 'text-emerald-300'
              }`}>
                {orderStatus.message}
              </p>
              
              {orderStatus.reason === 'orderHours' && orderHoursStatus?.isOutside && orderHoursStatus.nextOrderTime && (
                <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                  <p className="text-red-300 text-sm">
                    Bir sonraki sipariş zamanı: <span className="font-semibold">{orderHoursStatus.nextOrderTime}</span>
                  </p>
                </div>
              )}
              
              {orderStatus.reason === 'orderHours' && orderHoursStatus?.isOutside && countdown.totalSeconds > 0 && (
                <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-red-300 text-sm">Kalan süre:</span>
                    <div className="flex items-center gap-1">
                      <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded text-sm font-mono">
                        {countdown.hours.toString().padStart(2, '0')}
                      </span>
                      <span className="text-red-300">:</span>
                      <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded text-sm font-mono">
                        {countdown.minutes.toString().padStart(2, '0')}
                      </span>
                      <span className="text-red-300">:</span>
                      <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded text-sm font-mono">
                        {countdown.seconds.toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

      {/* Minimum Sipariş Tutarı İlerleme Çubuğu */}
        <motion.div 
          className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-emerald-500/20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <span className="text-lg">🎯</span>
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">Minimum Sipariş Tutarı</h3>
          </div>
          
          <div className="space-y-3">
            <div className="relative h-3 w-full bg-gray-700/50 rounded-full overflow-hidden">
          <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full shadow-lg"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 1, delay: 0.5 }}
          />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse"></div>
        </div>
            
        {remainingAmount > 0 ? (
              <div className="text-center space-y-2">
                <p className="text-gray-300">
                  Minimum tutara ulaşmak için
                </p>
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                  <span className="text-2xl font-bold text-emerald-400">₺{remainingAmount.toFixed(2)}</span>
                  <span className="text-emerald-300">daha eklemelisiniz</span>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-4 py-2 rounded-xl border border-emerald-500/30">
                  <span className="text-emerald-400 font-medium">Minimum tutara ulaştınız!</span>
                  <span className="text-xl">✨</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Teslimat Noktası Seçimi */}
        <motion.div 
          className={`rounded-2xl p-6 border ${
            !orderStatus?.canOrder 
              ? 'bg-gray-800/30 border-gray-600/30 opacity-60' 
              : 'bg-gradient-to-br from-gray-800/50 to-gray-900/50 border-emerald-500/20'
          }`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              !orderStatus?.canOrder 
                ? 'bg-gray-500/20' 
                : 'bg-emerald-500/20'
            }`}>
              <MapPin className={`w-4 h-4 ${
                !orderStatus?.canOrder ? 'text-gray-400' : 'text-emerald-400'
              }`} />
            </div>
            <h3 className={`text-lg font-semibold ${
              !orderStatus?.canOrder ? 'text-gray-400' : 'text-emerald-400'
            }`}>
              Teslimat Noktası Seçin
              {!orderStatus?.canOrder && (
                <span className="text-sm text-red-400 ml-2">
                  ({orderStatus?.reason === 'deliveryPoints' ? 'Teslimat noktaları kapalı' : 'Sipariş saatleri dışı'})
                </span>
              )}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Kız Yurdu */}
            <motion.button
              type="button"
              onClick={() => orderStatus?.canOrder && settings.deliveryPoints?.girlsDorm?.enabled && setSelectedDeliveryPoint('girlsDorm')}
              disabled={!orderStatus?.canOrder || !settings.deliveryPoints?.girlsDorm?.enabled}
              whileHover={orderStatus?.canOrder && settings.deliveryPoints?.girlsDorm?.enabled ? { scale: 1.02, y: -2 } : {}}
              whileTap={orderStatus?.canOrder && settings.deliveryPoints?.girlsDorm?.enabled ? { scale: 0.98 } : {}}
              className={`relative p-6 rounded-2xl border-2 transition-all duration-300 ${
                !orderStatus?.canOrder
                  ? 'border-gray-500/30 bg-gradient-to-br from-gray-700/30 to-gray-800/30 cursor-not-allowed opacity-50'
                  : selectedDeliveryPoint === 'girlsDorm'
                  ? 'border-emerald-500 bg-gradient-to-br from-emerald-500/20 to-green-500/20 shadow-lg shadow-emerald-500/25'
                  : settings.deliveryPoints?.girlsDorm?.enabled
                  ? 'border-gray-600/50 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:border-emerald-500/50 hover:shadow-lg'
                  : 'border-red-500/50 bg-gradient-to-br from-red-500/10 to-red-600/10 cursor-not-allowed opacity-60'
              }`}
            >
              {selectedDeliveryPoint === 'girlsDorm' && (
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-2xl animate-pulse"></div>
              )}
              
              <div className="relative flex flex-col items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  !orderStatus?.canOrder
                    ? 'bg-gray-500/20 border-2 border-gray-500/50'
                    : selectedDeliveryPoint === 'girlsDorm' 
                    ? 'bg-emerald-500/20 border-2 border-emerald-500/50' 
                    : settings.deliveryPoints?.girlsDorm?.enabled
                    ? 'bg-gray-700/50 border-2 border-gray-600/50'
                    : 'bg-red-500/20 border-2 border-red-500/50'
                }`}>
                  {!orderStatus?.canOrder ? (
                    <Clock className="w-6 h-6 text-gray-400" />
                  ) : settings.deliveryPoints?.girlsDorm?.enabled ? (
                    <CheckCircle className={`w-6 h-6 ${selectedDeliveryPoint === 'girlsDorm' ? 'text-emerald-400' : 'text-gray-400'}`} />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400" />
                  )}
                </div>
                
                <div className="text-center">
                  <span className={`text-sm font-semibold block ${
                    !orderStatus?.canOrder 
                      ? 'text-gray-400' 
                      : settings.deliveryPoints?.girlsDorm?.enabled ? 'text-white' : 'text-red-400'
                  }`}>
                    {settings.deliveryPoints?.girlsDorm?.name || 'Kız KYK Yurdu'}
                  </span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full mt-2 inline-block ${
                    !orderStatus?.canOrder
                      ? 'text-gray-400 bg-gray-500/10'
                      : settings.deliveryPoints?.girlsDorm?.enabled 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-red-400 bg-red-500/10'
                  }`}>
                    {!orderStatus?.canOrder 
                      ? (orderStatus?.reason === 'deliveryPoints' ? '❌ Kapalı' : '⏰ Saat Dışı')
                      : settings.deliveryPoints?.girlsDorm?.enabled ? '✅ Aktif' : '❌ Kapalı'}
                  </span>
                </div>
              </div>
            </motion.button>

            {/* Erkek Yurdu */}
            <motion.button
              type="button"
              onClick={() => orderStatus?.canOrder && settings.deliveryPoints?.boysDorm?.enabled && setSelectedDeliveryPoint('boysDorm')}
              disabled={!orderStatus?.canOrder || !settings.deliveryPoints?.boysDorm?.enabled}
              whileHover={orderStatus?.canOrder && settings.deliveryPoints?.boysDorm?.enabled ? { scale: 1.02, y: -2 } : {}}
              whileTap={orderStatus?.canOrder && settings.deliveryPoints?.boysDorm?.enabled ? { scale: 0.98 } : {}}
              className={`relative p-6 rounded-2xl border-2 transition-all duration-300 ${
                !orderStatus?.canOrder
                  ? 'border-gray-500/30 bg-gradient-to-br from-gray-700/30 to-gray-800/30 cursor-not-allowed opacity-50'
                  : selectedDeliveryPoint === 'boysDorm'
                  ? 'border-emerald-500 bg-gradient-to-br from-emerald-500/20 to-green-500/20 shadow-lg shadow-emerald-500/25'
                  : settings.deliveryPoints?.boysDorm?.enabled
                  ? 'border-gray-600/50 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:border-emerald-500/50 hover:shadow-lg'
                  : 'border-red-500/50 bg-gradient-to-br from-red-500/10 to-red-600/10 cursor-not-allowed opacity-60'
              }`}
            >
              {selectedDeliveryPoint === 'boysDorm' && (
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-2xl animate-pulse"></div>
              )}
              
              <div className="relative flex flex-col items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  !orderStatus?.canOrder
                    ? 'bg-gray-500/20 border-2 border-gray-500/50'
                    : selectedDeliveryPoint === 'boysDorm' 
                    ? 'bg-emerald-500/20 border-2 border-emerald-500/50' 
                    : settings.deliveryPoints?.boysDorm?.enabled
                    ? 'bg-gray-700/50 border-2 border-gray-600/50'
                    : 'bg-red-500/20 border-2 border-red-500/50'
                }`}>
                  {!orderStatus?.canOrder ? (
                    <Clock className="w-6 h-6 text-gray-400" />
                  ) : settings.deliveryPoints?.boysDorm?.enabled ? (
                    <CheckCircle className={`w-6 h-6 ${selectedDeliveryPoint === 'boysDorm' ? 'text-emerald-400' : 'text-gray-400'}`} />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400" />
                  )}
                </div>
                
                <div className="text-center">
                  <span className={`text-sm font-semibold block ${
                    !orderStatus?.canOrder 
                      ? 'text-gray-400' 
                      : settings.deliveryPoints?.boysDorm?.enabled ? 'text-white' : 'text-red-400'
                  }`}>
                    {settings.deliveryPoints?.boysDorm?.name || 'Erkek KYK Yurdu'}
                  </span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full mt-2 inline-block ${
                    !orderStatus?.canOrder
                      ? 'text-gray-400 bg-gray-500/10'
                      : settings.deliveryPoints?.boysDorm?.enabled 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-red-400 bg-red-500/10'
                  }`}>
                    {!orderStatus?.canOrder 
                      ? (orderStatus?.reason === 'deliveryPoints' ? '❌ Kapalı' : '⏰ Saat Dışı')
                      : settings.deliveryPoints?.boysDorm?.enabled ? '✅ Aktif' : '❌ Kapalı'}
                  </span>
                </div>
              </div>
            </motion.button>
          </div>
        </motion.div>

      {/* Teslimat Bilgileri */}
        <motion.div 
          className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-emerald-500/20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <Truck className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">Teslimat Bilgileri</h3>
        </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <Clock className="w-5 h-5 text-emerald-400" />
              <span className="text-emerald-300 font-medium">Tahmini Teslimat: {getEstimatedDeliveryTime()}</span>
        </div>
            <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <Info className="w-5 h-5 text-blue-400" />
              <span className="text-blue-300 font-medium">₺{MIN_ORDER_AMOUNT} üzeri siparişlerde ücretsiz teslimat</span>
        </div>
      </div>
        </motion.div>

        {/* Fiyat Özeti */}
        <motion.div 
          className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-emerald-500/20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <span className="text-lg">💰</span>
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">Fiyat Özeti</h3>
      </div>

          <div className="space-y-3">
            <dl className="flex items-center justify-between gap-4 p-3 bg-gray-700/30 rounded-xl">
              <dt className="text-base font-medium text-gray-300">Ara Toplam</dt>
              <dd className="text-base font-semibold text-white">₺{formattedSubtotal}</dd>
          </dl>

          {savings > 0 && (
              <dl className="flex items-center justify-between gap-4 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <dt className="text-base font-medium text-emerald-300">💸 Toplam Kazanç</dt>
                <dd className="text-base font-semibold text-emerald-400">-₺{formattedSavings}</dd>
            </dl>
          )}

          {coupon && isCouponApplied && (
              <dl className="flex items-center justify-between gap-4 p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                <dt className="text-base font-medium text-purple-300">🎟️ Kupon ({coupon.code})</dt>
                <dd className="text-base font-semibold text-purple-400">
                  {coupon.discountType === 'fixed' 
                    ? `-₺${coupon.discountAmount || coupon.calculatedDiscount || 0}`
                    : `-${coupon.discountPercentage || 0}%`
                  }
                </dd>
            </dl>
          )}
            
            <div className="border-t border-emerald-500/30 pt-4">
              <dl className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-xl border border-emerald-500/30">
                <dt className="text-xl font-bold text-white">🎯 Toplam Tutar</dt>
                <dd className="text-2xl font-bold text-emerald-400">₺{formattedTotal}</dd>
          </dl>
        </div>
        </div>
        </motion.div>


        {/* İletişim Bilgileri */}
        <motion.div 
          className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-emerald-500/20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <span className="text-lg">📞</span>
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">İletişim Bilgileri</h3>
          </div>
          
          <div className="space-y-6">
            {/* Telefon Numarası */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                Telefon Numaranız
              </label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="05XX XXX XX XX"
                  maxLength={11}
                  className={`w-full rounded-xl border px-4 py-3 text-white focus:outline-none focus:ring-2 transition-all duration-300 placeholder-gray-400 ${
                    phone.length > 0 && phone.length < 11
                      ? 'border-yellow-500/50 bg-yellow-500/10 focus:ring-yellow-500 focus:border-yellow-500'
                      : phone.length === 11 && !phone.startsWith('05')
                      ? 'border-red-500/50 bg-red-500/10 focus:ring-red-500 focus:border-red-500'
                      : phone.length === 11 && phone.startsWith('05')
                      ? 'border-emerald-500/50 bg-emerald-500/10 focus:ring-emerald-500 focus:border-emerald-500'
                      : 'border-gray-600/50 bg-gray-700/50 focus:ring-emerald-500 focus:border-emerald-500'
                  }`}
                  value={phone}
                  onChange={handlePhoneChange}
                  pattern="[0-9]*"
                  inputMode="numeric"
                />
                <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
                  <span className={`text-xs ${
                    phone.length === 11 && phone.startsWith('05')
                      ? 'text-emerald-400'
                      : phone.length > 0
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                  }`}>
                    {phone.length}/11
                  </span>
                  <span className={`text-sm ${
                    phone.length === 11 && phone.startsWith('05')
                      ? 'text-emerald-400'
                      : phone.length > 0
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                  }`}>
                    📱
                  </span>
                </div>
              </div>
              {phone.length > 0 && phone.length < 11 && (
                <p className="text-xs text-yellow-400">Telefon numarası 11 haneli olmalıdır</p>
              )}
              {phone.length === 11 && !phone.startsWith('05') && (
                <p className="text-xs text-red-400">Telefon numarası 05 ile başlamalıdır</p>
              )}
              {phone.length === 11 && phone.startsWith('05') && (
                <p className="text-xs text-emerald-400">✓ Geçerli telefon numarası</p>
              )}
            </div>

            {/* Sipariş Notu */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                Sipariş Notu
                <span className="text-xs text-gray-400">(İsteğe bağlı)</span>
              </label>
              <div className="relative">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-xl border border-gray-600/50 bg-gray-700/50 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 placeholder-gray-400 resize-none"
                  rows="3"
                  placeholder="Siparişinizle ilgili özel notlarınızı buraya yazabilirsiniz..."
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-1">
                  <span className="text-emerald-400 text-sm">✍️</span>
                  <span className="text-xs text-gray-400">{note.length}/200</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Sepeti Onayla Butonu */}
        <motion.button
          className={`flex w-full items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed ${
            !orderStatus?.canOrder || total < MIN_ORDER_AMOUNT
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-300'
          }`}
          whileHover={orderStatus?.canOrder && total >= MIN_ORDER_AMOUNT ? { scale: 1.02 } : {}}
          whileTap={orderStatus?.canOrder && total >= MIN_ORDER_AMOUNT ? { scale: 0.98 } : {}}
          onClick={handlePayment}
          disabled={!orderStatus?.canOrder || total < MIN_ORDER_AMOUNT}
        >
          {!orderStatus?.canOrder 
            ? orderStatus?.message || 'Sipariş Alınamıyor'
            : total < MIN_ORDER_AMOUNT 
            ? `Minimum Tutar ${MIN_ORDER_AMOUNT}₺` 
            : 'Sepeti Onayla'
          }
        </motion.button>
      </motion.div>
      </div>
  );
};

export default OrderSummary;