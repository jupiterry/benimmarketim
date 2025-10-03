import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Clock, ShoppingBasket, MapPin, ToggleLeft, ToggleRight } from "lucide-react";
import { useSettingsStore } from "../stores/useSettingsStore";

const SettingsTab = () => {
  const { settings: storeSettings, fetchSettings, updateSettings } = useSettingsStore();
  const [settings, setSettings] = useState({
    orderStartHour: 10,
    orderStartMinute: 0,
    orderEndHour: 1,
    orderEndMinute: 0,
    minimumOrderAmount: 250,
    deliveryPoints: {
      girlsDorm: {
        name: "Kız KYK Yurdu",
        enabled: true,
        startHour: 10,
        startMinute: 0,
        endHour: 1,
        endMinute: 0
      },
      boysDorm: {
        name: "Erkek KYK Yurdu",
        enabled: true,
        startHour: 10,
        startMinute: 0,
        endHour: 1,
        endMinute: 0
      }
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (storeSettings) {
      setSettings({
        ...storeSettings,
        deliveryPoints: storeSettings.deliveryPoints || {
          girlsDorm: {
            name: "Kız KYK Yurdu",
            enabled: true,
            startHour: 10,
            startMinute: 0,
            endHour: 1,
            endMinute: 0
          },
          boysDorm: {
            name: "Erkek KYK Yurdu",
            enabled: true,
            startHour: 10,
            startMinute: 0,
            endHour: 1,
            endMinute: 0
          }
        }
      });
    }
  }, [storeSettings]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      await fetchSettings();
    } catch (error) {
      console.error("Ayarlar getirilirken hata oluştu:", error);
      toast.error("Ayarlar getirilirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const parsedValue = name === "minimumOrderAmount" ? parseFloat(value) : parseInt(value, 10);
    setSettings(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleDeliveryPointChange = (point, field, value) => {
    setSettings(prev => ({
      ...prev,
      deliveryPoints: {
        ...prev.deliveryPoints,
        [point]: {
          ...prev.deliveryPoints[point],
          [field]: field === 'enabled' ? value : parseInt(value, 10)
        }
      }
    }));
  };

  const toggleDeliveryPoint = (point) => {
    handleDeliveryPointChange(point, 'enabled', !settings.deliveryPoints[point].enabled);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const success = await updateSettings(settings);
      if (success) {
        toast.success("Ayarlar başarıyla güncellendi!");
      } else {
        toast.error("Ayarlar güncellenirken hata oluştu");
      }
    } catch (error) {
      console.error("Ayarlar güncellenirken hata oluştu:", error);
      toast.error("Ayarlar güncellenirken hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const getFormattedTime = (hour, minute) => {
    const safeHour = hour !== undefined && hour !== null ? hour : 0;
    const safeMinute = minute !== undefined && minute !== null ? minute : 0;
    
    return `${safeHour}:${safeMinute.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="bg-gray-800 rounded-lg p-6 shadow-lg"
    >
      <h2 className="text-2xl font-bold text-white mb-6">Sistem Ayarları</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <Clock className="w-5 h-5 mr-2 text-emerald-400" />
            Sipariş Saatleri
          </h3>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-full sm:w-1/2 space-y-2">
              <label className="block text-sm font-medium text-gray-300">Başlangıç Saati</label>
              <div className="flex gap-2">
                <select
                  name="orderStartHour"
                  value={settings.orderStartHour}
                  onChange={handleChange}
                  className="bg-gray-700 text-white rounded-md p-2 w-full"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
                <span className="text-white flex items-center">:</span>
                <select
                  name="orderStartMinute"
                  value={settings.orderStartMinute}
                  onChange={handleChange}
                  className="bg-gray-700 text-white rounded-md p-2 w-full"
                >
                  <option value={0}>00</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>
            
            <div className="w-full sm:w-1/2 space-y-2">
              <label className="block text-sm font-medium text-gray-300">Bitiş Saati</label>
              <div className="flex gap-2">
                <select
                  name="orderEndHour"
                  value={settings.orderEndHour}
                  onChange={handleChange}
                  className="bg-gray-700 text-white rounded-md p-2 w-full"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
                <span className="text-white flex items-center">:</span>
                <select
                  name="orderEndMinute"
                  value={settings.orderEndMinute}
                  onChange={handleChange}
                  className="bg-gray-700 text-white rounded-md p-2 w-full"
                >
                  <option value={0}>00</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>
          </div>

          <div className="text-sm text-emerald-400 bg-emerald-900/20 rounded-md p-2 mt-2">
            Sipariş alım saatleri: {getFormattedTime(settings.orderStartHour, settings.orderStartMinute)} - {getFormattedTime(settings.orderEndHour, settings.orderEndMinute)}
            {settings.orderStartHour > settings.orderEndHour && " (Ertesi gün)"}
          </div>
        </div>
        
        <div className="bg-gray-700/50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
            <ShoppingBasket className="w-5 h-5 mr-2 text-emerald-400" />
            Minimum Sipariş Tutarı
          </h3>
          
          <div className="w-full space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                name="minimumOrderAmount"
                value={settings.minimumOrderAmount}
                onChange={handleChange}
                min="0"
                step="10"
                className="bg-gray-700 text-white rounded-md p-2 w-full"
              />
              <span className="text-white">₺</span>
            </div>
          </div>
        </div>

        {/* Teslimat Noktaları */}
        <div className="bg-gradient-to-br from-gray-700/50 to-gray-800/50 p-6 rounded-xl border border-gray-600/30 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white">Teslimat Noktaları</h3>
          </div>

          {/* Kız Yurdu */}
          <motion.div 
            className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 p-6 rounded-xl border border-pink-500/20"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <span className="text-xl">👩</span>
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">
                    {settings.deliveryPoints?.girlsDorm?.name || "Kız KYK Yurdu"}
                  </h4>
                  <p className="text-sm text-gray-400">Kız öğrenci yurdu teslimat noktası</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  settings.deliveryPoints?.girlsDorm?.enabled 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}>
                  {settings.deliveryPoints?.girlsDorm?.enabled ? "✅ Aktif" : "❌ Kapalı"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleDeliveryPoint('girlsDorm')}
                  className={`p-3 rounded-xl transition-all duration-300 ${
                    settings.deliveryPoints?.girlsDorm?.enabled
                      ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:scale-105"
                      : "bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:scale-105"
                  }`}
                >
                  {settings.deliveryPoints?.girlsDorm?.enabled ? (
                    <ToggleRight className="w-6 h-6" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>


          {/* Erkek Yurdu */}
          <motion.div 
            className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 p-6 rounded-xl border border-blue-500/20"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                  <span className="text-xl">👨</span>
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">
                    {settings.deliveryPoints?.boysDorm?.name || "Erkek KYK Yurdu"}
                  </h4>
                  <p className="text-sm text-gray-400">Erkek öğrenci yurdu teslimat noktası</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  settings.deliveryPoints?.boysDorm?.enabled 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}>
                  {settings.deliveryPoints?.boysDorm?.enabled ? "✅ Aktif" : "❌ Kapalı"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleDeliveryPoint('boysDorm')}
                  className={`p-3 rounded-xl transition-all duration-300 ${
                    settings.deliveryPoints?.boysDorm?.enabled
                      ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:scale-105"
                      : "bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:scale-105"
                  }`}
                >
                  {settings.deliveryPoints?.boysDorm?.enabled ? (
                    <ToggleRight className="w-6 h-6" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>

        </div>
        
        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium flex items-center"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Kaydediliyor...
              </>
            ) : (
              'Ayarları Kaydet'
            )}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default SettingsTab;