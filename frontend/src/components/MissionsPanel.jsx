import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Users, ChevronDown, CopyPlus, RefreshCw, AlertTriangle, Timer, ArrowRight,
  Gift, ShoppingBag, Flag, Copy
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import MissionComposer from "./coupons/MissionComposer";
import UsageBars from "./coupons/UsageBars";
import {
  DAY_MS, money, formatDuration, formatShortDate, formatShortDateTime, periodProgress, dailyCounts, scheduleStatus
} from "./coupons/couponUtils";
import "../styles/coupons.css";

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "live", label: "Yayında", tone: "ok" },
  { key: "scheduled", label: "Başlamadı", tone: "info" },
  { key: "ended", label: "Süresi doldu", tone: "warn" },
  { key: "inactive", label: "Pasif" }
];

const timeNote = (m, status, now) => {
  if (status.key === "scheduled") return `Başlamasına ${formatDuration(new Date(m.startsAt) - now)}`;
  if (status.key === "live") return `Bitişe ${formatDuration(new Date(m.endsAt) - now)}`;
  if (new Date(m.endsAt).getTime() <= now) return `${formatShortDate(m.endsAt)} tarihinde bitti`;
  return `${formatShortDate(m.startsAt)} – ${formatShortDate(m.endsAt)}`;
};

// Sipariş görevleri: "X TL üzeri N sipariş ver, Y TL kupon kazan".
export default function MissionsPanel() {
  const { confirm } = useConfirm();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [composer, setComposer] = useState(null); // { mission | null }
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get("/missions/admin");
      setMissions(data.missions || []);
      setLoadError(false);
    } catch {
      setLoadError(true);
      toast.error("Görevler alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = useMemo(() => Date.now(), [missions]); // eslint-disable-line react-hooks/exhaustive-deps
  const withStatus = useMemo(() => missions.map((m) => ({ ...m, status: scheduleStatus(m, now) })), [missions, now]);

  const stats = useMemo(() => ({
    live: withStatus.filter((m) => m.status.key === "live").length,
    scheduled: withStatus.filter((m) => m.status.key === "scheduled").length,
    completions: withStatus.reduce((s, m) => s + (m.completionCount || 0), 0),
    reward: withStatus.reduce((s, m) => s + Number(m.totalReward || 0), 0)
  }), [withStatus]);

  const buckets = useMemo(
    () => dailyCounts(withStatus.flatMap((m) => (m.completions || []).map((c) => c.completedAt)), 30, now),
    [withStatus, now]
  );
  const recent = buckets.reduce((s, b) => s + b.count, 0);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.key === "all" ? withStatus.length : withStatus.filter((m) => m.status.key === f.key).length])),
    [withStatus]
  );
  const visible = filter === "all" ? withStatus : withStatus.filter((m) => m.status.key === filter);

  const toggle = async (mission) => {
    setBusyId(mission._id);
    setMissions((prev) => prev.map((m) => (m._id === mission._id ? { ...m, isActive: !m.isActive } : m)));
    try {
      await axios.patch(`/missions/admin/${mission._id}`, { isActive: !mission.isActive });
      toast.success(mission.isActive ? "Görev pasife alındı" : "Görev yayına alındı");
      await load();
    } catch (error) {
      setMissions((prev) => prev.map((m) => (m._id === mission._id ? { ...m, isActive: mission.isActive } : m)));
      toast.error(error.response?.data?.message || "Görev güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (mission) => {
    const ok = await confirm({
      title: "Görevi sil",
      message: `"${mission.title}" silinecek. ${mission.completionCount ? `${mission.completionCount} müşteriye verilmiş kuponlar geçerli kalır.` : ""}`,
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!ok) return;
    try {
      await axios.delete(`/missions/admin/${mission._id}`);
      toast.success("Görev silindi");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Görev silinemedi");
    }
  };

  const duplicate = (mission) => {
    const length = Math.max(DAY_MS, new Date(mission.endsAt) - new Date(mission.startsAt));
    const { _id, ...rest } = mission; // eslint-disable-line no-unused-vars
    setComposer({
      mission: { ...rest, title: `${mission.title} (yeni)`.slice(0, 60), startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + length).toISOString(), isActive: true }
    });
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`${code} kopyalandı`);
    } catch {
      toast.error("Kod kopyalanamadı");
    }
  };

  if (loading) {
    return (
      <div className="cpg" aria-busy="true">
        <div className="cpg-skel-rows">{[0, 1].map((i) => <div key={i} className="ui-skeleton" />)}</div>
        <div className="msn-grid">{[0, 1, 2].map((i) => <div key={i} className="ui-skeleton cpg-skel-card" />)}</div>
      </div>
    );
  }

  return (
    <div className="cpg">
      <div className="cpg-head">
        <div>
          <h2>Sipariş görevleri</h2>
          <p>Belirlenen sayıda teslim edilmiş sipariş veren müşteriye kupon otomatik tanımlanır.</p>
        </div>
        <div className="cpg-head-actions">
          <button type="button" className="ui-icon-btn" onClick={load} title="Yenile" aria-label="Yenile"><RefreshCw /></button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setComposer({ mission: null })}><Plus />Yeni görev</button>
        </div>
      </div>

      {loadError && missions.length === 0 ? (
        <div className="ui-panel ui-empty">
          <AlertTriangle />
          <p>Görevler yüklenemedi.</p>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}><RefreshCw />Tekrar dene</button>
        </div>
      ) : missions.length === 0 ? (
        <section className="cpg-empty-hero">
          <div className="cpg-empty-hero-text">
            <span className="cpg-eyebrow"><Flag />Henüz görev yok</span>
            <h3>Müşterilerini tekrar sipariş vermeye teşvik et</h3>
            <ol className="cpg-steps">
              <li><b>1</b>Kuralı belirle: örn. ₺300 üzeri 3 sipariş.</li>
              <li><b>2</b>Müşteri uygulamada ilerlemesini görür.</li>
              <li><b>3</b>Son sipariş teslim edilince kupon cüzdanına düşer.</li>
            </ol>
          </div>
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setComposer({ mission: null })}><Plus />İlk görevi oluştur</button>
        </section>
      ) : (
        <>
          <div className="msn-summary">
            <div className="cpg-kpis msn-kpis">
              <div className="cpg-kpi"><span>Yayındaki görev</span><strong>{stats.live}</strong></div>
              <div className="cpg-kpi"><span>Başlamayı bekleyen</span><strong>{stats.scheduled}</strong></div>
              <div className="cpg-kpi"><span>Toplam tamamlanma</span><strong>{stats.completions.toLocaleString("tr-TR")}</strong></div>
              <div className="cpg-kpi"><span>Tanımlanan kupon</span><strong>{money(stats.reward)}</strong></div>
            </div>
            <div className="ui-panel msn-chart">
              <div className="cpg-spot-side-head">
                <span>Son 30 gün tamamlanma</span>
                <strong>{recent}</strong>
              </div>
              <UsageBars buckets={buckets} label="tamamlanma" height={52} />
            </div>
          </div>

          <div className="cpg-filterbar">
            <div className="ui-chips cpn-filters" role="group" aria-label="Görev filtresi">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.tone && <span className={`ui-dot ui-dot--${f.tone}`} />}
                  {f.label}<span className="cpn-chip-count">{counts[f.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="ui-panel cpg-participants-empty">Bu filtrede görev yok.</div>
          ) : (
            <div className="msn-grid">
              {visible.map((m) => {
                const st = m.status;
                const open = expandedId === m._id;
                const elapsed = periodProgress(m.startsAt, m.endsAt, now);
                return (
                  <article key={m._id} className="msn-card" data-status={st.key}>
                    <div className="msn-card-head">
                      <span className={`ui-badge ${st.tone ? `ui-badge--${st.tone}` : ""}`}>
                        <span className={`ui-dot ${st.tone ? `ui-dot--${st.tone}` : ""}`} />{st.label}
                      </span>
                      <span className="msn-time"><Timer />{timeNote(m, st, now)}</span>
                      <button type="button" className="ui-toggle msn-switch" aria-pressed={Boolean(m.isActive)} onClick={() => toggle(m)} disabled={busyId === m._id}
                        aria-label={m.isActive ? `${m.title} pasife al` : `${m.title} yayına al`} title={m.isActive ? "Pasife al" : "Yayına al"}>
                        <i />
                      </button>
                    </div>

                    <div className="msn-card-body">
                      <h3>{m.title}</h3>
                      {m.description && <p>{m.description}</p>}
                    </div>

                    <div className="msn-rule" aria-label={m.rule}>
                      <div className="msn-rule-step">
                        <ShoppingBag />
                        <strong>{m.targetOrders}</strong>
                        <span>sipariş</span>
                      </div>
                      <ArrowRight className="msn-rule-arrow" />
                      <div className="msn-rule-step">
                        <Flag />
                        <strong>{m.minOrderAmount > 0 ? `${money(m.minOrderAmount)}+` : "Serbest"}</strong>
                        <span>{m.minOrderAmount > 0 ? "her biri" : "sipariş tutarı"}</span>
                      </div>
                      <ArrowRight className="msn-rule-arrow" />
                      <div className="msn-rule-step msn-rule-step--reward">
                        <Gift />
                        <strong>{money(m.rewardAmount)}</strong>
                        <span>kupon</span>
                      </div>
                    </div>

                    <div className="msn-period">
                      <div className="msn-period-bar" data-status={st.key}><i style={{ width: `${elapsed}%` }} /></div>
                      <div className="msn-period-dates">
                        <span>{formatShortDateTime(m.startsAt)}</span>
                        <span>{formatShortDateTime(m.endsAt)}</span>
                      </div>
                    </div>

                    <div className="msn-card-stats">
                      <span><strong>{m.completionCount || 0}</strong> kişi tamamladı</span>
                      <span><strong>{money(m.totalReward)}</strong> kupon</span>
                      <span>{m.rewardMinimumOrderAmount > 0 ? `${money(m.rewardMinimumOrderAmount)} üzeri` : "Alt sepet yok"} · {m.rewardValidityDays} gün</span>
                    </div>

                    <div className="msn-card-actions">
                      <button type="button" className="ui-btn ui-btn--sm" onClick={() => setComposer({ mission: m })}><Pencil />Düzenle</button>
                      <button type="button" className="ui-btn ui-btn--sm" onClick={() => setExpandedId(open ? null : m._id)} aria-expanded={open} disabled={!m.completionCount}>
                        <Users />Tamamlayanlar<ChevronDown className="cpg-chevron" data-open={open} />
                      </button>
                      <span className="msn-card-actions-end">
                        <button type="button" className="ui-icon-btn" onClick={() => duplicate(m)} title="Kopyasını oluştur" aria-label="Kopyasını oluştur"><CopyPlus /></button>
                        <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={() => remove(m)} title="Sil" aria-label="Sil"><Trash2 /></button>
                      </span>
                    </div>

                    {open && (
                      <ul className="msn-completions">
                        {m.completions.map((entry) => (
                          <li key={entry.couponCode}>
                            <span className="cpn-avatar" aria-hidden="true">{(entry.name || "M").trim().charAt(0).toLocaleUpperCase("tr-TR")}</span>
                            <span className="msn-completion-main">
                              <strong>{entry.name}</strong>
                              <small>{formatShortDateTime(entry.completedAt)}</small>
                            </span>
                            <button type="button" className="msn-code" onClick={() => copyCode(entry.couponCode)} title="Kodu kopyala">
                              {entry.couponCode}<Copy />
                            </button>
                          </li>
                        ))}
                        {m.completionCount > m.completions.length && (
                          <li className="msn-completions-more">Son {m.completions.length} tamamlama gösteriliyor.</li>
                        )}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {composer && (
        <MissionComposer
          mission={composer.mission}
          onClose={() => setComposer(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
