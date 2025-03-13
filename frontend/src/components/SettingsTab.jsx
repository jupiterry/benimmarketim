import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Clock, ShoppingBasket } from "lucide-react";
import { useSettingsStore } from "../stores/useSettingsStore";

const SettingsTab = () => {
  const { settings: storeSettings, fetchSettings, updateSettings } = useSettingsStore();
  const [settings, setSettings] = useState({
    orderStartHour: 10,
    orderStartMinute: 0,
    orderEndHour: 1,
    orderEndMinute: 0,
    minimumOrderAmount: 250
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      await fetchSettings();
      setSettings(storeSettings);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const success = await updateSettings(settings);
      if (success) {
        toast.success("Ayarlar başarıyla güncellendi");
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