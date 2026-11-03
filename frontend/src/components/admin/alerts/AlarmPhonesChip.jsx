import { useState } from "react";
import { ArrowRight, RefreshCw, Smartphone, X } from "lucide-react";
import { useSettingsStore } from "../../../stores/useSettingsStore";
import { timeAgo, useNow } from "../ui";
import { alarmTone, countAlarmDevices, isAlarmDeviceOnline, isWithinOrderHours } from "./alertRules";

/**
 * Başlıktaki "Alarm: 2/2 telefon bağlı" çipi ve açıklama paneli. Sipariş saatinde hiçbir telefon bağlı değilse
 * kırmızı, bir kısmı bağlıysa sarı; eşli telefon yoksa ya da sipariş saati dışındaysa nötrdür.
 * alarm: useOrderAlerts durumundaki alarm alanı ({ ready, error, devices, skewMs, checkedAt }).
 * onRefresh: durumu yeniden ister (söz döndürür; sürerken "Yenile" döner ve basılamaz).
 */
export default function AlarmPhonesChip({ alarm, open, onToggle, onClose, onManage, onRefresh, buttonRef }) {
  const now = useNow(30000);
  const settings = useSettingsStore((state) => state.settings);
  const [refreshing, setRefreshing] = useState(false);
  if (!alarm?.ready) return null;

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  };

  const devices = Array.isArray(alarm.devices) ? alarm.devices : [];
  const serverNow = now + (Number(alarm.skewMs) || 0);
  const { paired, connected } = countAlarmDevices(devices, serverNow);
  const inHours = isWithinOrderHours(settings, now);
  const unknown = alarm.error && devices.length === 0;
  const tone = unknown ? "" : alarmTone({ paired, connected, inHours });
  const summary = unknown
    ? "Durum alınamadı"
    : paired === 0
      ? "Eşlenmiş telefon yok"
      : `${paired} telefon eşli · ${connected === paired ? "hepsi bağlı" : connected === 0 ? "hiçbiri bağlı değil" : `${connected} telefon bağlı`}`;
  const title = unknown
    ? "Alarm telefonlarının durumu alınamadı"
    : paired === 0
      ? "Eşlenmiş sipariş alarmı telefonu yok"
      : `Sipariş alarmı: ${connected}/${paired} telefon bağlı`;

  return (
    <div className="app-pop-anchor app-alarm-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="app-status-chip app-alarm-chip"
        data-tone={tone}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={title}
        title={title}
      >
        <Smartphone size={13} aria-hidden="true" />
        {unknown ? (
          <>
            <span>Alarm:</span>
            <b>?</b>
          </>
        ) : paired === 0 ? (
          <>
            <b>Alarm</b>
            <span>telefonu yok</span>
          </>
        ) : (
          <>
            <span>Alarm:</span>
            <b>{connected}/{paired}</b>
            <span>telefon bağlı</span>
          </>
        )}
      </button>
      {open && (
        <section className="app-pop app-pop--alarm" aria-label="Sipariş alarmı telefonları">
          <div className="app-pop-head">
            <div>
              <strong>Sipariş alarmı telefonları</strong>
              <small>{summary}</small>
            </div>
            <button type="button" className="app-icon-btn" aria-label="Kapat" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
          <div className="app-alarm-body">
            {tone === "danger" && (
              <p className="app-alarm-warn" role="alert">
                Sipariş saatindesiniz ama hiçbir alarm telefonu bağlı değil. Telefonun açık, internete bağlı ve Sipariş Alarmı
                uygulamasının çalışır durumda olduğunu kontrol edin.
              </p>
            )}
            {unknown ? (
              <p className="app-alarm-warn" role="alert">
                Alarm telefonlarının durumu alınamadı. İnternet bağlantınızı kontrol edip “Yenile”ye basın.
              </p>
            ) : paired === 0 ? (
              <p>
                Telefona “Sipariş Alarmı” uygulamasını kurup yönetici hesabıyla giriş yapın. Yeni siparişte telefon, biri “Gördüm”
                ya da “Kabul Et” diyene kadar çalar; bir telefondaki onay paneldeki tekrar eden sesi de susturur.
              </p>
            ) : (
              <ul className="app-alarm-list">
                {devices.map((device) => {
                  const online = isAlarmDeviceOnline(device, serverNow);
                  return (
                    <li key={device.id || device.name} data-online={online}>
                      <i className="app-alarm-dot" aria-hidden="true" />
                      <strong>{device.name}</strong>
                      <small>
                        {online ? "Bağlı" : device.lastSeenAt ? `Son bağlantı ${timeAgo(device.lastSeenAt, serverNow)}` : "Hiç bağlanmadı"}
                        {device.appVersion ? ` · v${device.appVersion}` : ""}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="app-alarm-note">
              {"Bağlı telefon yaklaşık 25 sn'de bir sunucuya uğrar; 3 dakikadan uzun süre uğramayan telefon “bağlı değil” görünür."}
              {alarm.error && !unknown ? " Son kontrol başarısız oldu; bilgiler birkaç dakika eski olabilir." : ""}
            </p>
          </div>
          <div className="app-pop-foot">
            <button type="button" onClick={refresh} disabled={refreshing} aria-busy={refreshing || undefined}>
              <RefreshCw size={12} className={refreshing ? "ui-spin" : ""} aria-hidden="true" /> {refreshing ? "Yenileniyor…" : "Yenile"}
            </button>
            <button type="button" onClick={onManage}>
              Telefonları yönet <ArrowRight size={12} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
