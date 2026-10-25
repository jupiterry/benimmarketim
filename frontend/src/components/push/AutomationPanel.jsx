import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, RefreshCw, Save, Send, ShieldCheck, TrendingUp, Wallet, Zap } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import { KpiCard, KpiGrid, SkeletonBlock, SkeletonCards, formatTime, money } from "../admin/ui";
import AutomationCard from "./AutomationCard";
import { INFO, SKIP_LABELS, TYPES } from "./automationShared";
import "../../styles/automations.css";

const RULES = [
  "Yalnızca gönderim saatleri içinde gider (İstanbul saati).",
  "Bir müşteriye belirlenen süre içinde en fazla 1 otomatik bildirim gider.",
  "Bildirimleri ya da kampanya bildirimlerini kapatan müşteriye gitmez.",
  "Yöneticilere ve uygulamada bildirim alabilecek cihazı görünmeyen hesaplara gitmez.",
  "Aynı bildirim aynı müşteriye iki kez gitmez; kontrol 10 dakikada bir yapılır.",
  "Bildirimden sonraki 72 saat içinde verilen sipariş “dönüşüm” sayılır.",
];

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/** "Bildirim gönder" ekranındaki "Otomatik bildirimler" sekmesi */
export default function AutomationPanel() {
  const { confirm } = useConfirm();
  const [data, setData] = useState({ loading: true, error: "", settings: null, meta: null, configured: true });
  const [stats, setStats] = useState(null);
  const [globalDraft, setGlobalDraft] = useState(null);
  const [savingKey, setSavingKey] = useState("");

  const load = useCallback(async () => {
    setData((current) => ({ ...current, loading: true, error: "" }));
    const [settingsRes, statsRes] = await Promise.allSettled([
      axios.get("/notification-automations/settings"),
      axios.get("/notification-automations/stats"),
    ]);
    if (settingsRes.status === "rejected") {
      setData((current) => ({ ...current, loading: false, error: settingsRes.reason?.response?.data?.message || "Otomatik bildirim ayarları alınamadı." }));
      return;
    }
    const body = settingsRes.value.data;
    setData({ loading: false, error: "", settings: body.settings, meta: body.meta, configured: body.configured !== false });
    setGlobalDraft({ start: body.settings.window.start, end: body.settings.window.end, minHoursBetween: body.settings.minHoursBetween });
    setStats(statsRes.status === "fulfilled" ? statsRes.value.data : null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (patch) => {
    const { data: body } = await axios.put("/notification-automations/settings", patch);
    setData((current) => ({ ...current, settings: body.settings }));
    return body;
  };

  const saveCard = async (type, payload) => {
    try {
      setSavingKey(type);
      const body = await save({ [type]: payload });
      toast.success(body.changed ? "Kaydedildi" : "Değişiklik yok");
    } catch (error) {
      toast.error(error.response?.data?.message || "Kaydedilemedi");
    } finally {
      setSavingKey("");
    }
  };

  const toggle = async (type, next, payload) => {
    const label = INFO[type].label;
    if (next) {
      // Açmadan önce şu an kaç kişinin uygun olduğu gösterilir
      let count = null;
      try {
        const { data: preview } = await axios.post(`/notification-automations/${type}/preview`, { config: payload });
        count = preview.count;
      } catch {
        /* sayı alınamazsa yine de onay sorulur */
      }
      const sendWindow = data.settings?.window;
      const ok = await confirm({
        title: `“${label}” açılsın mı?`,
        message: `Açılınca kurallara uyan müşterilere kendiliğinden bildirim gider${count !== null ? `; şu an ${count} kişi uygun` : ""}. Gönderim saatleri: ${sendWindow?.start}–${sendWindow?.end}. Karttaki kaydedilmemiş değişiklikler de kaydedilir.`,
        confirmText: "Aç",
        cancelText: "Vazgeç",
        type: "warning",
      });
      if (!ok) return;
    }
    try {
      setSavingKey(type);
      await save({ [type]: next ? { ...payload, enabled: true } : { enabled: false } });
      toast.success(next ? `${label} açıldı` : `${label} kapatıldı`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Değiştirilemedi");
    } finally {
      setSavingKey("");
    }
  };

  const globalDirty = Boolean(globalDraft && data.settings) && (
    globalDraft.start !== data.settings.window.start
    || globalDraft.end !== data.settings.window.end
    || Number(globalDraft.minHoursBetween) !== data.settings.minHoursBetween
  );
  const globalError = !globalDraft ? "" : !globalDraft.start || !globalDraft.end ? "Başlangıç ve bitiş saatini girin"
    : globalDraft.start >= globalDraft.end ? "Başlangıç bitişten önce olmalı"
      : !Number.isInteger(Number(globalDraft.minHoursBetween)) || Number(globalDraft.minHoursBetween) < 24 || Number(globalDraft.minHoursBetween) > 168 ? "Bekleme süresi 24–168 saat olmalı" : "";

  const saveGlobal = async (event) => {
    event.preventDefault();
    if (!globalDirty || globalError) return;
    try {
      setSavingKey("global");
      await save({ window: { start: globalDraft.start, end: globalDraft.end }, minHoursBetween: Number(globalDraft.minHoursBetween) });
      toast.success("Gönderim kuralları kaydedildi");
    } catch (error) {
      toast.error(error.response?.data?.message || "Kaydedilemedi");
    } finally {
      setSavingKey("");
    }
  };

  if (data.loading && !data.settings) {
    return (
      <div className="au-panel" aria-busy="true">
        <SkeletonCards count={4} />
        <div className="au-grid">
          <SkeletonBlock height={420} />
          <SkeletonBlock height={420} />
        </div>
      </div>
    );
  }

  if (data.error && !data.settings) {
    return (
      <div className="au-panel">
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle />
          <span className="ui-grow">{data.error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}>Tekrar dene</button>
        </div>
      </div>
    );
  }

  const settings = data.settings;
  const totals = stats?.totals || {};
  const enabledCount = TYPES.filter((type) => settings[type]?.enabled).length;
  const lastTick = stats?.lastTick;
  const lastTickSent = lastTick ? Object.values(lastTick.types || {}).reduce((sum, item) => sum + (item.sent || 0), 0) : 0;

  return (
    <div className="au-panel">
      <div className="au-toolbar">
        <p className="au-intro">
          Kurallara uyan müşterilere bildirim kendiliğinden gider. Hepsi başlangıçta kapalıdır; açmadan önce “Kaç kişiye gider?” ile kontrol edip kendinize test gönderin.
        </p>
        <div className="au-toolbar-actions">
          {lastTick?.at && (
            <span className="ui-hint au-last-tick">
              Son kontrol {formatTime(lastTick.at)} · {lastTick.skipped ? SKIP_LABELS[lastTick.skipped] || "atlandı" : `${lastTickSent} bildirim`}
            </span>
          )}
          <button type="button" className="ui-btn ui-btn--sm" onClick={load} disabled={data.loading} aria-label="Otomatik bildirimleri yenile">
            <RefreshCw className={data.loading ? "ui-spin" : ""} />Yenile
          </button>
        </div>
      </div>

      {!data.configured && (
        <div className="ui-banner ui-banner--warn" role="status">
          <AlertTriangle />
          <span className="ui-grow">Bildirim servisi yapılandırılmamış. OneSignal anahtarları eklenene kadar otomatik bildirimler gönderilmez.</span>
        </div>
      )}

      <KpiGrid>
        <KpiCard icon={Zap} label="Açık otomasyon" value={<span className="ui-num">{enabledCount}/4</span>} note={enabledCount ? "Kurallara göre çalışıyor" : "Hepsi kapalı"} tone={enabledCount ? "ok" : undefined} />
        <KpiCard icon={Send} label="Son 7 gün gönderilen" value={<span className="ui-num">{totals.sent7 ?? "–"}</span>} note={`30 günde ${totals.sent30 ?? 0}`} />
        <KpiCard icon={TrendingUp} label="Siparişe dönüşen (30 gün)" value={<span className="ui-num">{totals.conversions30 ?? "–"}</span>} note={`Dönüşüm %${percent(totals.conversions30 || 0, totals.sent30 || 0)}`} tone="info" />
        <KpiCard icon={Wallet} label="Getirdiği ciro (30 gün)" value={<span className="ui-num">{money(totals.revenue30 || 0)}</span>} note="Bildirimden sonraki 72 saat" tone="brand" />
      </KpiGrid>

      <section className="ui-panel au-global" aria-labelledby="au-global-title">
        <form className="au-global-form" onSubmit={saveGlobal}>
          <div className="au-global-head">
            <span className="au-card-icon"><Clock aria-hidden="true" /></span>
            <div>
              <h3 id="au-global-title">Gönderim kuralları</h3>
              <p className="ui-hint">Dört otomasyon için ortak.</p>
            </div>
          </div>
          <div className="au-global-fields">
            <div className="au-field">
              <label className="ui-label" htmlFor="au-win-start">Gönderim başlangıcı</label>
              <input id="au-win-start" className="ui-field" type="time" step={300} value={globalDraft?.start || ""}
                onChange={(event) => setGlobalDraft((current) => ({ ...current, start: event.target.value }))} />
            </div>
            <div className="au-field">
              <label className="ui-label" htmlFor="au-win-end">Gönderim bitişi</label>
              <input id="au-win-end" className="ui-field" type="time" step={300} value={globalDraft?.end || ""}
                onChange={(event) => setGlobalDraft((current) => ({ ...current, end: event.target.value }))} />
            </div>
            <div className="au-field">
              <label className="ui-label" htmlFor="au-gap">Kişi başı iki bildirim arası</label>
              <div className="au-input-unit">
                <input id="au-gap" className="ui-field" type="number" inputMode="numeric" min={24} max={168} step={1} value={globalDraft?.minHoursBetween ?? ""}
                  onChange={(event) => setGlobalDraft((current) => ({ ...current, minHoursBetween: event.target.value }))} />
                <span aria-hidden="true">saat</span>
              </div>
            </div>
            <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm au-global-save" disabled={!globalDirty || Boolean(globalError) || savingKey === "global"}>
              <Save />{savingKey === "global" ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
          {globalError && globalDirty && <span className="au-error" role="alert">{globalError}</span>}
        </form>
        <ul className="au-rules">
          {RULES.map((rule) => (
            <li key={rule}><ShieldCheck aria-hidden="true" />{rule}</li>
          ))}
        </ul>
      </section>

      <div className="au-grid">
        {TYPES.map((type) => (
          <AutomationCard
            key={type}
            type={type}
            saved={settings[type]}
            stats={stats?.types?.[type]}
            defaults={data.meta?.defaults?.[type] || settings[type]}
            configured={data.configured}
            saving={savingKey === type}
            onSave={saveCard}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
