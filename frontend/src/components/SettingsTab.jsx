import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Clock, ShoppingBasket, MapPin, ToggleLeft, ToggleRight, Smartphone, 
  AlertTriangle, Save, RefreshCw, ChevronDown, Globe, Download, ExternalLink, Palette
} from "lucide-react";
import { useSettingsStore } from "../stores/useSettingsStore";
import axios from "../lib/axios";

// Collapsible Section Component
const SettingsSection = ({ icon: Icon, title, color, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <motion.div 
      className={`bg-gradient-to-br ${color} rounded-2xl border border-white/10 overflow-hidden`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-5 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-white/60" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

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
    },
    appVersion: {
      latestVersion: "2.1.0",
      minimumVersion: "2.1.0",
      forceUpdate: false,
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app",
      iosStoreUrl: "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr"
    },
    theme: "normal"
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [liveVersion, setLiveVersion] = useState(null);
  const [loadingLive, setLoadingLive] = useState(false);

  useEffect(() => {
    loadSettings();
    fetchLiveVersion();
  }, []);

  useEffect(() => {
    if (storeSettings) {
      setSettings(prev => ({
        ...prev,
        ...storeSettings,
        deliveryPoints: storeSettings.deliveryPoints || prev.deliveryPoints,
        appVersion: storeSettings.appVersion || prev.appVersion,
        theme: storeSettings.theme || prev.theme
      }));
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

  const fetchLiveVersion = async () => {
    try {
      setLoadingLive(true);
      const response = await axios.get("/version-check?platform=android");
      setLiveVersion(response.data);
    } catch (error) {
      console.error("Canlı versiyon bilgisi alınamadı:", error);
    } finally {
      setLoadingLive(false);
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

  const handleVersionChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      appVersion: {
        ...prev.appVersion,
        [field]: value
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
        fetchLiveVersion(); // Canlı versiyon bilgisini yenile
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
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Sistem Ayarları</h2>
          <p className="text-gray-400 text-sm mt-1">Tüm uygulama ayarlarını buradan yönetebilirsiniz</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={loadSettings}
          className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
        </motion.button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sipariş Saatleri */}
        <SettingsSection icon={Clock} title="Sipariş Saatleri" color="from-blue-500/10 to-indigo-500/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <label className="block text-sm font-medium text-gray-300 mb-3">Başlangıç Saati</label>
              <div className="flex gap-2 items-center">
                <select
                  name="orderStartHour"
                  value={settings.orderStartHour}
                  onChange={handleChange}
                  className="flex-1 bg-gray-800/50 text-white rounded-xl p-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-white text-xl">:</span>
                <select
                  name="orderStartMinute"
                  value={settings.orderStartMinute}
                  onChange={handleChange}
                  className="flex-1 bg-gray-800/50 text-white rounded-xl p-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  <option value={0}>00</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <label className="block text-sm font-medium text-gray-300 mb-3">Bitiş Saati</label>
              <div className="flex gap-2 items-center">
                <select
                  name="orderEndHour"
                  value={settings.orderEndHour}
                  onChange={handleChange}
                  className="flex-1 bg-gray-800/50 text-white rounded-xl p-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-white text-xl">:</span>
                <select
                  name="orderEndMinute"
                  value={settings.orderEndMinute}
                  onChange={handleChange}
                  className="flex-1 bg-gray-800/50 text-white rounded-xl p-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  <option value={0}>00</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <p className="text-emerald-400 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Sipariş alım saatleri: {getFormattedTime(settings.orderStartHour, settings.orderStartMinute)} - {getFormattedTime(settings.orderEndHour, settings.orderEndMinute)}
              {settings.orderStartHour > settings.orderEndHour && " (Ertesi gün)"}
            </p>
          </div>
        </SettingsSection>

        {/* Minimum Sipariş */}
        <SettingsSection icon={ShoppingBasket} title="Minimum Sipariş Tutarı" color="from-emerald-500/10 to-teal-500/10">
          <div className="flex items-center gap-3">
            <input
              type="number"
              name="minimumOrderAmount"
              value={settings.minimumOrderAmount}
              onChange={handleChange}
              min="0"
              step="10"
              className="flex-1 bg-gray-800/50 text-white rounded-xl p-3 border border-white/10 focus:outline-none focus:border-emerald-500 text-lg font-bold"
            />
            <span className="text-emerald-400 text-2xl font-bold">₺</span>
          </div>
          <p className="text-gray-500 text-sm mt-2">Bu tutarın altındaki siparişler kabul edilmez.</p>
        </SettingsSection>

        {/* Teslimat Noktaları */}
        <SettingsSection icon={MapPin} title="Teslimat Noktaları" color="from-violet-500/10 to-purple-500/10">
          <div className="space-y-4">
            {/* Kız Yurdu */}
            <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 p-4 rounded-xl border border-pink-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl flex items-center justify-center">
                    <span className="text-lg">👩</span>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">{settings.deliveryPoints?.girlsDorm?.name || "Kız KYK Yurdu"}</h4>
                    <p className="text-gray-400 text-xs">Kız öğrenci yurdu</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${settings.deliveryPoints?.girlsDorm?.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {settings.deliveryPoints?.girlsDorm?.enabled ? '✅ Aktif' : '❌ Kapalı'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDeliveryPoint('girlsDorm')}
                    className={`p-2 rounded-xl transition-all ${settings.deliveryPoints?.girlsDorm?.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                  >
                    {settings.deliveryPoints?.girlsDorm?.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Erkek Yurdu */}
            <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 p-4 rounded-xl border border-blue-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <span className="text-lg">👨</span>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">{settings.deliveryPoints?.boysDorm?.name || "Erkek KYK Yurdu"}</h4>
                    <p className="text-gray-400 text-xs">Erkek öğrenci yurdu</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${settings.deliveryPoints?.boysDorm?.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {settings.deliveryPoints?.boysDorm?.enabled ? '✅ Aktif' : '❌ Kapalı'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDeliveryPoint('boysDorm')}
                    className={`p-2 rounded-xl transition-all ${settings.deliveryPoints?.boysDorm?.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                  >
                    {settings.deliveryPoints?.boysDorm?.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Uygulama Versiyon Yönetimi - Basitleştirilmiş */}
        <SettingsSection icon={Smartphone} title="Uygulama Versiyon Yönetimi" color="from-orange-500/10 to-red-500/10" defaultOpen={true}>
          <div className="space-y-6">
            {/* Canlı API Durumu */}
            {liveVersion && (
              <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 p-4 rounded-xl border border-emerald-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-emerald-400 font-semibold text-sm">Canlı API Durumu</span>
                  <button
                    type="button"
                    onClick={fetchLiveVersion}
                    className="ml-auto text-gray-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingLive ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-1">Son Versiyon</p>
                    <p className="text-white font-bold">{liveVersion.latest_version}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-1">Minimum</p>
                    <p className="text-white font-bold">{liveVersion.minimum_version}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-1">Zorunlu Güncelleme</p>
                    <p className={`font-bold ${liveVersion.force_update ? 'text-red-400' : 'text-emerald-400'}`}>
                      {liveVersion.force_update ? 'Aktif' : 'Kapalı'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Versiyon Ayarları */}
            <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-bold">Versiyon Numaraları</h4>
                  <p className="text-gray-400 text-xs">Hem Android hem iOS için geçerli</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Son Versiyon</label>
                  <input
                    type="text"
                    value={settings.appVersion?.latestVersion || ""}
                    onChange={(e) => handleVersionChange('latestVersion', e.target.value)}
                    placeholder="2.1.0"
                    className="w-full bg-gray-800/50 text-white rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-blue-500 font-mono text-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Minimum Versiyon</label>
                  <input
                    type="text"
                    value={settings.appVersion?.minimumVersion || ""}
                    onChange={(e) => handleVersionChange('minimumVersion', e.target.value)}
                    placeholder="2.0.0"
                    className="w-full bg-gray-800/50 text-white rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-blue-500 font-mono text-lg"
                  />
                </div>
              </div>
              
              <div className="mt-4 flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-gray-300">Zorunlu Güncelleme</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleVersionChange('forceUpdate', !settings.appVersion?.forceUpdate)}
                  className={`p-2 rounded-xl transition-all ${settings.appVersion?.forceUpdate ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-700 text-gray-400'}`}
                >
                  {settings.appVersion?.forceUpdate ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Store URL'leri */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 p-4 rounded-xl border border-green-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 font-semibold text-sm">Google Play Store</span>
                </div>
                <input
                  type="url"
                  value={settings.appVersion?.androidStoreUrl || ""}
                  onChange={(e) => handleVersionChange('androidStoreUrl', e.target.value)}
                  className="w-full bg-gray-800/50 text-white rounded-xl px-3 py-2 border border-white/10 focus:outline-none focus:border-green-500 text-xs"
                />
                <a 
                  href={settings.appVersion?.androidStoreUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-green-400 text-xs hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Sayfayı Aç
                </a>
              </div>
              
              <div className="bg-gradient-to-r from-gray-500/10 to-slate-500/10 p-4 rounded-xl border border-gray-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-400 font-semibold text-sm">App Store</span>
                </div>
                <input
                  type="url"
                  value={settings.appVersion?.iosStoreUrl || ""}
                  onChange={(e) => handleVersionChange('iosStoreUrl', e.target.value)}
                  className="w-full bg-gray-800/50 text-white rounded-xl px-3 py-2 border border-white/10 focus:outline-none focus:border-gray-500 text-xs"
                />
                <a 
                  href={settings.appVersion?.iosStoreUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-gray-400 text-xs hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Sayfayı Aç
                </a>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Sezonsal Tema Ayarları */}
        <SettingsSection icon={Palette} title="Sezonsal Tema" color="from-pink-500/10 to-rose-500/10" defaultOpen={true}>
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">Site genelinde görünecek tema dekorasyonlarını seçin.</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Normal Tema */}
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, theme: "normal" }))}
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.theme === "normal" 
                    ? "border-emerald-500 bg-emerald-500/10" 
                    : "border-white/10 bg-white/5 hover:border-white/30"
                }`}
              >
                <div className="text-3xl mb-2">🌿</div>
                <div className="text-white font-semibold text-sm">Normal</div>
                <div className="text-gray-400 text-xs">Varsayılan tema</div>
              </button>

              {/* Yılbaşı Teması */}
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, theme: "newyear" }))}
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.theme === "newyear" 
                    ? "border-red-500 bg-red-500/10" 
                    : "border-white/10 bg-white/5 hover:border-white/30"
                }`}
              >
                <div className="text-3xl mb-2">🎄</div>
                <div className="text-white font-semibold text-sm">Yılbaşı</div>
                <div className="text-gray-400 text-xs">Kar taneleri</div>
              </button>

              {/* Ramazan Teması */}
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, theme: "ramadan" }))}
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.theme === "ramadan" 
                    ? "border-purple-500 bg-purple-500/10" 
                    : "border-white/10 bg-white/5 hover:border-white/30"
                }`}
              >
                <div className="text-3xl mb-2">🌙</div>
                <div className="text-white font-semibold text-sm">Ramazan</div>
                <div className="text-gray-400 text-xs">Hilal & yıldızlar</div>
              </button>

              {/* Bayram Teması */}
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, theme: "eid" }))}
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.theme === "eid" 
                    ? "border-yellow-500 bg-yellow-500/10" 
                    : "border-white/10 bg-white/5 hover:border-white/30"
                }`}
              >
                <div className="text-3xl mb-2">🎉</div>
                <div className="text-white font-semibold text-sm">Bayram</div>
                <div className="text-gray-400 text-xs">Şenlik</div>
              </button>
            </div>

            {settings.theme !== "normal" && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <p className="text-amber-400 text-sm flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Aktif tema: {settings.theme === "newyear" ? "🎄 Yılbaşı" : settings.theme === "ramadan" ? "🌙 Ramazan" : "🎉 Bayram"}
                </p>
              </div>
            )}
          </div>
        </SettingsSection>
        
        {/* Kaydet Butonu */}
        <div className="flex justify-end pt-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold flex items-center gap-2 shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Ayarları Kaydet
              </>
            )}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default SettingsTab;