import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { 
  Clock, ToggleLeft, ToggleRight,
  AlertTriangle, Save, RefreshCw, ChevronDown, ExternalLink
} from "lucide-react";
import { useSettingsStore } from "../stores/useSettingsStore";
import axios from "../lib/axios";

// Collapsible Section Component
const SettingsSection = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <section className="ui-card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="ui-card-header ui-collapse-toggle"
        style={isOpen ? undefined : { borderBottom: 0 }}
      >
        <h3 className="ui-title">{title}</h3>
        <ChevronDown style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
      </button>
      {isOpen && (
        <div className="ui-card-body">
          {children}
        </div>
      )}
    </section>
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
      latestVersion: "4.0.3",
      minimumVersion: "4.0.3",
      forceUpdate: true,
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app",
      iosStoreUrl: "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr"
    }
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
        appVersion: storeSettings.appVersion || prev.appVersion
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
        await fetchLiveVersion(); // Kaydedilen versiyon bilgisini yenile
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
      <div className="ui-loading">
        <div className="ui-loader"></div>
      </div>
    );
  }

  return (
    <div className="ui-page" style={{ maxWidth: 920 }}>
      {/* Header */}
      <header className="app-pagehead">
        <div>
          <h1>Ayarlar</h1>
          <p>Mağazanızın çalışma düzenini ve tercihlerini belirleyin.</p>
        </div>
        <button
          onClick={loadSettings}
          className="ui-btn"
        >
          <RefreshCw />
          Yenile
        </button>
      </header>
      
      <form onSubmit={handleSubmit} className="ui-stack">
        {/* Sipariş Saatleri */}
        <SettingsSection title="Sipariş Saatleri">
          <div className="ui-grid-2">
            <div>
              <label className="ui-label" htmlFor="settings-start-hour">Başlangıç Saati</label>
              <div className="products-inline">
                <select
                  id="settings-start-hour"
                  name="orderStartHour"
                  value={settings.orderStartHour}
                  onChange={handleChange}
                  className="ui-field"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="ui-strong">:</span>
                <select
                  name="orderStartMinute"
                  aria-label="Başlangıç dakikası"
                  value={settings.orderStartMinute}
                  onChange={handleChange}
                  className="ui-field"
                >
                  <option value={0}>00</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="ui-label" htmlFor="settings-end-hour">Bitiş Saati</label>
              <div className="products-inline">
                <select
                  id="settings-end-hour"
                  name="orderEndHour"
                  value={settings.orderEndHour}
                  onChange={handleChange}
                  className="ui-field"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="ui-strong">:</span>
                <select
                  name="orderEndMinute"
                  aria-label="Bitiş dakikası"
                  value={settings.orderEndMinute}
                  onChange={handleChange}
                  className="ui-field"
                >
                  <option value={0}>00</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="ui-banner" style={{ marginTop: 14, borderRadius: "var(--ui-radius)" }}>
            <Clock />
            <span>
              Sipariş alım saatleri: {getFormattedTime(settings.orderStartHour, settings.orderStartMinute)} - {getFormattedTime(settings.orderEndHour, settings.orderEndMinute)}
              {settings.orderStartHour > settings.orderEndHour && " (Ertesi gün)"}
            </span>
          </div>
        </SettingsSection>

        {/* Minimum Sipariş */}
        <SettingsSection title="Minimum Sipariş Tutarı">
          <div className="ui-field-prefix" style={{ maxWidth: 240 }}>
            <input
              type="number"
              name="minimumOrderAmount"
              aria-label="Minimum sipariş tutarı"
              value={settings.minimumOrderAmount}
              onChange={handleChange}
              min="0"
              step="10"
              className="ui-field"
            />
            <span>₺</span>
          </div>
          <p className="ui-hint">Bu tutarın altındaki siparişler kabul edilmez.</p>
        </SettingsSection>

        {/* Teslimat Noktaları */}
        <SettingsSection title="Teslimat Noktaları">
          <div className="ui-stack ui-stack--sm">
            {/* Kız Yurdu */}
            <div className="ui-row ui-between">
              <div>
                <h4 className="ui-list-title">{settings.deliveryPoints?.girlsDorm?.name || "Kız KYK Yurdu"}</h4>
                <p className="ui-list-sub">Kız öğrenci yurdu</p>
              </div>
              <div className="ui-cluster">
                <span className={`ui-badge ${settings.deliveryPoints?.girlsDorm?.enabled ? 'ui-badge--ok' : 'ui-badge--danger'}`}>
                  {settings.deliveryPoints?.girlsDorm?.enabled ? 'Aktif' : 'Kapalı'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleDeliveryPoint('girlsDorm')}
                  className="ui-icon-btn ui-switch"
                  data-on={!!settings.deliveryPoints?.girlsDorm?.enabled}
                  aria-label="Kız yurdu teslimatını aç/kapat"
                >
                  {settings.deliveryPoints?.girlsDorm?.enabled ? <ToggleRight /> : <ToggleLeft />}
                </button>
              </div>
            </div>

            {/* Erkek Yurdu */}
            <div className="ui-row ui-between">
              <div>
                <h4 className="ui-list-title">{settings.deliveryPoints?.boysDorm?.name || "Erkek KYK Yurdu"}</h4>
                <p className="ui-list-sub">Erkek öğrenci yurdu</p>
              </div>
              <div className="ui-cluster">
                <span className={`ui-badge ${settings.deliveryPoints?.boysDorm?.enabled ? 'ui-badge--ok' : 'ui-badge--danger'}`}>
                  {settings.deliveryPoints?.boysDorm?.enabled ? 'Aktif' : 'Kapalı'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleDeliveryPoint('boysDorm')}
                  className="ui-icon-btn ui-switch"
                  data-on={!!settings.deliveryPoints?.boysDorm?.enabled}
                  aria-label="Erkek yurdu teslimatını aç/kapat"
                >
                  {settings.deliveryPoints?.boysDorm?.enabled ? <ToggleRight /> : <ToggleLeft />}
                </button>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Uygulama Versiyon Yönetimi - Basitleştirilmiş */}
        <SettingsSection title="Uygulama Versiyon Yönetimi" defaultOpen={true}>
          <div className="ui-stack">
            {/* Canlı API Durumu */}
            {liveVersion && (
              <div className="order-detail-box" style={{ background: "var(--ui-surface-2)" }}>
                <div className="ui-between">
                  <span className="ui-stat-label"><span className="ui-dot ui-dot--ok" />Canlı API Durumu</span>
                  <button
                    type="button"
                    onClick={fetchLiveVersion}
                    className="ui-icon-btn ui-icon-btn--sm"
                    title="Yenile"
                    aria-label="Canlı durumu yenile"
                  >
                    <RefreshCw className={loadingLive ? 'ui-spin' : ''} />
                  </button>
                </div>
                <dl className="ui-kv" style={{ border: 0, padding: 0 }}>
                  <div>
                    <dt>Son Versiyon</dt>
                    <dd className="ui-mono">{liveVersion.latest_version}</dd>
                  </div>
                  <div>
                    <dt>Minimum</dt>
                    <dd className="ui-mono">{liveVersion.minimum_version}</dd>
                  </div>
                  <div>
                    <dt>Zorunlu Güncelleme</dt>
                    <dd>
                      <span className={`ui-badge ${liveVersion.force_update ? 'ui-badge--warn' : ''}`}>
                        {liveVersion.force_update ? 'Aktif' : 'Kapalı'}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {/* Versiyon Ayarları */}
            <div>
              <h4 className="ui-overline">Versiyon Numaraları</h4>
              <p className="ui-hint" style={{ marginTop: 2, marginBottom: 10 }}>Hem Android hem iOS için geçerli</p>
              
              <div className="ui-grid-2">
                <div>
                  <label className="ui-label" htmlFor="settings-latest-version">Son Versiyon</label>
                  <input
                    id="settings-latest-version"
                    type="text"
                    value={settings.appVersion?.latestVersion || ""}
                    onChange={(e) => handleVersionChange('latestVersion', e.target.value)}
                    placeholder="2.1.0"
                    className="ui-field ui-mono"
                  />
                </div>
                <div>
                  <label className="ui-label" htmlFor="settings-min-version">Minimum Versiyon</label>
                  <input
                    id="settings-min-version"
                    type="text"
                    value={settings.appVersion?.minimumVersion || ""}
                    onChange={(e) => handleVersionChange('minimumVersion', e.target.value)}
                    placeholder="2.0.0"
                    className="ui-field ui-mono"
                  />
                </div>
              </div>
              
              <div className="ui-note" style={{ marginTop: 14, alignItems: "center" }}>
                <AlertTriangle />
                <div className="ui-grow">
                  <p className="ui-note-label">Zorunlu Güncelleme</p>
                  <p className="ui-text-xs" style={{ color: "#47360f" }}>Açıkken, minimum versiyonun altındaki uygulamalar güncellenmeden kullanılamaz.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleVersionChange('forceUpdate', !settings.appVersion?.forceUpdate)}
                  className="ui-icon-btn ui-switch"
                  data-on={!!settings.appVersion?.forceUpdate}
                  aria-label="Zorunlu güncellemeyi aç/kapat"
                >
                  {settings.appVersion?.forceUpdate ? <ToggleRight /> : <ToggleLeft />}
                </button>
              </div>
            </div>

            {/* Store URL'leri */}
            <div className="ui-grid-2">
              <div>
                <label className="ui-label" htmlFor="settings-android-url">Google Play Store</label>
                <input
                  id="settings-android-url"
                  type="url"
                  value={settings.appVersion?.androidStoreUrl || ""}
                  onChange={(e) => handleVersionChange('androidStoreUrl', e.target.value)}
                  className="ui-field ui-field--sm"
                />
                <a 
                  href={settings.appVersion?.androidStoreUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ui-link"
                >
                  <ExternalLink />
                  Sayfayı Aç
                </a>
              </div>
              
              <div>
                <label className="ui-label" htmlFor="settings-ios-url">App Store</label>
                <input
                  id="settings-ios-url"
                  type="url"
                  value={settings.appVersion?.iosStoreUrl || ""}
                  onChange={(e) => handleVersionChange('iosStoreUrl', e.target.value)}
                  className="ui-field ui-field--sm"
                />
                <a 
                  href={settings.appVersion?.iosStoreUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ui-link"
                >
                  <ExternalLink />
                  Sayfayı Aç
                </a>
              </div>
            </div>
          </div>
        </SettingsSection>
        
        {/* Kaydet Butonu */}
        <div className="ui-cluster" style={{ justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={saving}
            className="ui-btn ui-btn--primary ui-btn--lg"
          >
            {saving ? (
              <>
                <div className="ui-loader" style={{ width: 16, height: 16 }}></div>
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save />
                Ayarları Kaydet
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsTab;
