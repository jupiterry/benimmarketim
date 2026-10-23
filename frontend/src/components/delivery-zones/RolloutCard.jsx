// "Adrese teslimat" anahtarı (Kapalı / Pilot / Herkese açık) ve "Her yerde ücretsiz teslimat" kampanyası.
import { useRef } from "react";
import { AlertTriangle, Gift, Loader2, Lock, RefreshCw, Rocket, ToggleLeft, ToggleRight, Users } from "lucide-react";
import { Skeleton } from "../admin/ui";
import PilotPicker from "./PilotPicker";
import { MODES, num } from "./shared";

const MODE_INFO = {
  off: {
    icon: Lock,
    title: "Kapalı",
    text: "Bugünkü gibi: sipariş yalnızca yurtlara. Mevcut uygulamada hiçbir şey değişmez.",
    status: "Adrese teslimat kapalı. Mevcut uygulama bugünkü gibi çalışıyor; müşteriler yalnızca yurtlara sipariş verebiliyor. Bölgeleri ve ücretleri şimdiden hazırlayabilirsiniz.",
  },
  pilot: {
    icon: Users,
    title: "Pilot",
    text: "Yalnızca seçtiğiniz kullanıcılar açık bölgelere adrese sipariş verebilir.",
    status: "Pilot açık: yalnızca aşağıdaki kullanıcılar adrese sipariş verebiliyor. Diğer herkes için uygulama bugünkü gibi.",
  },
  public: {
    icon: Rocket,
    title: "Herkese açık",
    text: "Tüm müşteriler açık bölgelere adres girerek sipariş verebilir.",
    status: "Adrese teslimat herkese açık: güncel uygulamayı kullanan tüm müşteriler açık bölgelere sipariş verebiliyor.",
  },
};

const RolloutCard = ({
  settings, loading, error, busy, users, usersLoading, openZones, pilotBusyId,
  onRetry, onChangeMode, onToggleCampaign, onAddPilot, onRemovePilot, onNeedUsers,
}) => {
  const groupRef = useRef(null);
  if (loading && !settings) {
    return (
      <section className="ui-panel dz-rollout" aria-busy="true" aria-label="Adrese teslimat">
        <div className="dz-rollout-main"><Skeleton width="40%" height={18} /><Skeleton height={72} radius={10} /><Skeleton width="70%" /></div>
        <div className="dz-rollout-side"><Skeleton width="60%" height={18} /><Skeleton height={60} radius={10} /></div>
      </section>
    );
  }
  if (!settings) {
    return (
      <div className="ui-banner ui-banner--danger" role="alert">
        <AlertTriangle />
        <span className="ui-grow">Adrese teslimat ayarları yüklenemedi{error ? `: ${error}` : ""}.</span>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry}><RefreshCw />Tekrar dene</button>
      </div>
    );
  }
  const mode = settings.addressOrdering;
  const info = MODE_INFO[mode] || MODE_INFO.off;
  const campaign = settings.freeDeliveryEverywhere;

  // Ok tuşlarıyla seçenekler arasında gezinme (radiogroup)
  const onGroupKey = (e) => {
    const i = MODES.findIndex((m) => m.value === mode);
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = MODES[(i + 1) % MODES.length];
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = MODES[(i - 1 + MODES.length) % MODES.length];
    if (!next) return;
    e.preventDefault();
    groupRef.current?.querySelector(`[data-mode="${next.value}"]`)?.focus();
  };

  return (
    <section className="ui-panel dz-rollout" aria-label="Adrese teslimat ve kampanya">
      <div className="dz-rollout-main">
        <div className="dz-rollout-head">
          <h2 className="dz-h2" id="dz-mode-label">Adrese teslimat</h2>
          <span className="dz-mode-pill" data-mode={mode}>
            <span className="dz-mode-dot" aria-hidden="true" />{info.title}
          </span>
          {busy === "mode" && <Loader2 className="ui-spin dz-busy" aria-label="Kaydediliyor" />}
        </div>
        <p className="dz-status-text">{info.status}</p>
        <div className="dz-modes" role="radiogroup" aria-labelledby="dz-mode-label" ref={groupRef} onKeyDown={onGroupKey}>
          {MODES.map((m) => {
            const mi = MODE_INFO[m.value];
            const Icon = mi.icon;
            const checked = mode === m.value;
            return (
              <button key={m.value} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} data-mode={m.value}
                className="dz-mode" disabled={Boolean(busy)} onClick={() => { if (!checked) onChangeMode(m.value); }}>
                <span className="dz-mode-icon"><Icon aria-hidden="true" /></span>
                <span className="dz-mode-text">
                  <strong>{mi.title}</strong>
                  <span>{mi.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        {mode !== "off" && openZones === 0 && (
          <p className="dz-inline-warn" role="status"><AlertTriangle aria-hidden="true" />Açık bölge yok: müşteriler adres girse de sipariş veremez. Aşağıdan bir bölgeyi açın.</p>
        )}
        {mode === "pilot" && settings.pilotUsers.length === 0 && (
          <p className="dz-inline-warn" role="status"><AlertTriangle aria-hidden="true" />Pilot açık ama listede kimse yok. Aşağıdan kullanıcı ekleyin.</p>
        )}
        <PilotPicker users={users} usersLoading={usersLoading} pilotUsers={settings.pilotUsers} busyId={pilotBusyId}
          onAdd={onAddPilot} onRemove={onRemovePilot} onNeedUsers={onNeedUsers} disabled={busy === "mode"} />
        {mode !== "pilot" && settings.pilotUsers.length > 0 && (
          <p className="ui-hint dz-pilot-note">Pilot listesi yalnızca “Pilot” seçiliyken kullanılır{mode === "public" ? "; şu an herkes sipariş verebiliyor" : ""}.</p>
        )}
      </div>

      <div className="dz-rollout-side" data-on={campaign || undefined}>
        <div className="dz-campaign">
          <span className="dz-campaign-icon"><Gift aria-hidden="true" /></span>
          <div className="dz-campaign-text">
            <h2 className="dz-h2" id="dz-campaign-label">Her yerde ücretsiz teslimat</h2>
            <p className="ui-hint">Kampanya dönemleri için: açıkken tüm bölgelerde teslimat ücreti alınmaz. Bölge ücretleri silinmez; kapatınca geri gelir.</p>
          </div>
          <button type="button" className="ui-icon-btn ui-switch dz-campaign-switch" role="switch" aria-checked={campaign} data-on={campaign}
            aria-labelledby="dz-campaign-label" disabled={Boolean(busy)} onClick={onToggleCampaign}>
            {busy === "campaign" ? <Loader2 className="ui-spin" /> : campaign ? <ToggleRight /> : <ToggleLeft />}
          </button>
        </div>
        <p className="dz-campaign-state" data-on={campaign || undefined}>
          {campaign ? <>Kampanya <strong>açık</strong> · {num(openZones)} açık bölgede ücretsiz</> : "Kampanya kapalı · bölge ücretleri geçerli"}
        </p>
      </div>
    </section>
  );
};

export default RolloutCard;
