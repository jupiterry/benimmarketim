import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Power, Trash2, Users, ChevronDown, Search, Megaphone, Gift, Timer, TrendingUp,
  AlertTriangle, RefreshCw, CopyPlus, Target, Trophy
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import CouponRequestComposer from "./coupons/CouponRequestComposer";
import UsageBars from "./coupons/UsageBars";
import {
  DAY_MS, money, formatDuration, formatShortDate, formatShortDateTime, dailyCounts, scheduleStatus
} from "./coupons/couponUtils";
import "../styles/coupons.css";

const REQUIREMENT_SHORT = {
  none: "Şart yok",
  any: "En az 1 sipariş",
  delivered: "1 teslim edilmiş sipariş"
};

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "open", label: "Yayında / planlı", match: (s) => s === "live" || s === "scheduled" },
  { key: "rewarded", label: "Ödül dağıtıldı", match: (s) => s === "rewarded" },
  { key: "closed", label: "Pasif / bitti", match: (s) => s === "inactive" || s === "ended" }
];

const progressOf = (c) => Math.min(100, Math.round(((c.weightedCount || 0) / Math.max(1, c.targetCount)) * 100));

// Bugünkü hızla hedefe ulaşma tahmini
const paceOf = (c, now) => {
  const start = new Date(c.startsAt).getTime();
  const end = new Date(c.endsAt).getTime();
  const remaining = Math.max(0, c.targetCount - (c.weightedCount || 0));
  if (remaining === 0) return { tone: "ok", text: "Hedef doldu" };
  if (now < start) return { tone: "", text: `${formatShortDateTime(c.startsAt)} tarihinde başlıyor` };
  const elapsedDays = Math.max(1 / 24, (now - start) / DAY_MS);
  const rate = (c.weightedCount || 0) / elapsedDays;
  const daysLeft = Math.max(0, (end - now) / DAY_MS);
  if (rate === 0) return { tone: "warn", text: "Henüz talep yok" };
  const eta = remaining / rate;
  if (eta <= daysLeft) return { tone: "ok", text: `Bu hızla yaklaşık ${formatDuration(eta * DAY_MS)} içinde dolar` };
  const needed = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  return { tone: "warn", text: `Bu hızla süre bitmeden dolmayabilir · günde ~${needed} puan gerekli` };
};

const Participants = ({ requesters }) => {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return [...(requesters || [])]
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
      .filter((r) => !q || `${r.user?.name || ""} ${r.user?.email || ""}`.toLocaleLowerCase("tr-TR").includes(q));
  }, [requesters, query]);

  if (!requesters?.length) {
    return <div className="cpg-participants-empty"><Users />Henüz talep bırakan yok.</div>;
  }
  return (
    <div className="cpg-participants">
      {requesters.length > 8 && (
        <div className="ui-search cpg-participants-search">
          <Search />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Katılımcı ara" aria-label="Katılımcı ara" className="ui-field" />
        </div>
      )}
      <div className="cpg-ptable" role="table" aria-label="Katılımcılar">
        <div className="cpg-ptr cpg-pthead" role="row">
          <span role="columnheader">Müşteri</span>
          <span role="columnheader">Talep</span>
          <span role="columnheader">Puan</span>
          <span role="columnheader" className="ui-right">Sipariş</span>
          <span role="columnheader" className="ui-right">Teslim</span>
        </div>
        {list.map((r, i) => {
          const name = r.user?.name || "Silinmiş kullanıcı";
          return (
            <div key={r.user?._id || i} className="cpg-ptr" role="row">
              <span className="cpg-person" role="cell">
                <span className="cpn-avatar" aria-hidden="true">{name.trim().charAt(0).toLocaleUpperCase("tr-TR")}</span>
                <span><strong>{name}</strong><small>{r.user?.email || "-"}</small></span>
              </span>
              <span role="cell" className="cpn-num">{formatShortDateTime(r.requestedAt)}</span>
              <span role="cell">
                {r.weight > 1
                  ? <span className="ui-badge ui-badge--brand" title="Arkadaş davet ettiği için 2 puan">{r.weight} puan · davetçi</span>
                  : <span className="ui-badge">{r.weight || 1} puan</span>}
              </span>
              <span role="cell" className="ui-right cpn-num" data-label="Sipariş">{r.totalOrders}</span>
              <span role="cell" className="ui-right cpn-num" data-label="Teslim">{r.deliveredOrders}</span>
            </div>
          );
        })}
        {list.length === 0 && <div className="cpg-participants-empty">Aramayla eşleşen katılımcı yok.</div>}
      </div>
    </div>
  );
};

const CouponRequestCampaignPanel = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [composer, setComposer] = useState(null); // { campaign | null }
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const { confirm } = useConfirm();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get("/coupon-requests/admin");
      setCampaigns(data.campaigns || []);
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      toast.error(error.response?.data?.message || "Talep kampanyaları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = useMemo(() => Date.now(), [campaigns]); // eslint-disable-line react-hooks/exhaustive-deps
  const withStatus = useMemo(
    () => campaigns.map((c) => ({ ...c, status: scheduleStatus(c, now) })),
    [campaigns, now]
  );
  // Aynı anda yalnız bir kampanya aktif olabilir; öne çıkan kart onu gösterir
  const spotlight = withStatus.find((c) => c.status.key === "live" || c.status.key === "scheduled") || null;
  const liveCampaign = withStatus.find((c) => c.isActive) || null;

  const stats = useMemo(() => {
    const rewarded = withStatus.filter((c) => c.rewardIssued);
    return {
      total: withStatus.length,
      rewarded: rewarded.length,
      participants: withStatus.reduce((s, c) => s + (c.requestCount || 0), 0),
      coupons: rewarded.reduce((s, c) => s + (c.requestCount || 0), 0)
    };
  }, [withStatus]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.match ? withStatus.filter((c) => f.match(c.status.key)).length : withStatus.length])),
    [withStatus]
  );
  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter);
    return f?.match ? withStatus.filter((c) => f.match(c.status.key)) : withStatus;
  }, [withStatus, filter]);

  const postState = async (campaign, isActive) => {
    setBusyId(campaign._id);
    try {
      await axios.post("/coupon-requests/admin", {
        ...campaign,
        isActive,
        startsAt: new Date(campaign.startsAt).toISOString(),
        endsAt: new Date(campaign.endsAt).toISOString()
      });
      toast.success(isActive ? "Kampanya yayına alındı" : "Kampanya pasife alındı");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || (isActive ? "Kampanya yayına alınamadı" : "Kampanya pasife alınamadı"));
    } finally {
      setBusyId(null);
    }
  };

  const activate = async (campaign) => {
    if (liveCampaign && liveCampaign._id !== campaign._id) {
      const ok = await confirm({
        title: "Kampanya yayına alınsın mı?",
        message: `Aynı anda yalnız bir kampanya yayında olabilir. "${liveCampaign.title}" pasife alınacak.`,
        confirmText: "Yayına al",
        cancelText: "Vazgeç",
        type: "warning"
      });
      if (!ok) return;
    }
    postState(campaign, true);
  };

  const remove = async (campaign) => {
    const ok = await confirm({
      title: "Kampanyayı sil",
      message: campaign.rewardIssued
        ? `"${campaign.title}" silinecek. Dağıtılmış kişisel kuponlar geçerli kalır.`
        : `"${campaign.title}" ve ${campaign.requestCount || 0} katılımcının talebi silinecek.`,
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!ok) return;
    try {
      await axios.delete(`/coupon-requests/admin/${campaign._id}`);
      toast.success("Kampanya silindi");
      if (expandedId === campaign._id) setExpandedId(null);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Kampanya silinemedi");
    }
  };

  // Biten bir kampanyayı aynı ayarlarla yeniden başlatmak için yeni form
  const duplicate = (campaign) => {
    const { _id, requestCount, ...rest } = campaign; // eslint-disable-line no-unused-vars
    const length = Math.max(DAY_MS, new Date(campaign.endsAt) - new Date(campaign.startsAt));
    setComposer({
      campaign: {
        ...rest,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + length).toISOString(),
        isActive: true,
        rewardIssued: false
      },
      duplicate: true
    });
  };

  if (loading) {
    return (
      <div className="cpg" aria-busy="true">
        <div className="ui-skeleton cpg-skel-hero" />
        <div className="cpg-skel-rows">{[0, 1, 2].map((i) => <div key={i} className="ui-skeleton" />)}</div>
      </div>
    );
  }

  const renderSpotlight = () => {
    if (!spotlight) {
      return (
        <section className="cpg-empty-hero">
          <div className="cpg-empty-hero-text">
            <span className="cpg-eyebrow"><Megaphone />Yayında kampanya yok</span>
            <h3>Müşterilerin birlikte kupon kazandığı bir kampanya başlat</h3>
            <ol className="cpg-steps">
              <li><b>1</b>Müşteriler uygulamada “Ben de istiyorum” der.</li>
              <li><b>2</b>Toplanan puan hedefe ulaşınca kampanya kapanır.</li>
              <li><b>3</b>Talep bırakan herkesin cüzdanına kişisel kupon düşer.</li>
            </ol>
          </div>
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setComposer({ campaign: null })}><Plus />Kampanya oluştur</button>
        </section>
      );
    }
    const c = spotlight;
    const pct = progressOf(c);
    const remaining = Math.max(0, c.targetCount - (c.weightedCount || 0));
    const isScheduled = c.status.key === "scheduled";
    const timeText = isScheduled
      ? `Başlamasına ${formatDuration(new Date(c.startsAt) - now)}`
      : `Bitişe ${formatDuration(new Date(c.endsAt) - now)}`;
    const pace = paceOf(c, now);
    const days = Math.min(14, Math.max(1, Math.ceil((now - new Date(c.startsAt)) / DAY_MS)));
    const buckets = dailyCounts((c.requesters || []).map((r) => r.requestedAt), Math.max(7, days), now);
    const open = expandedId === c._id;

    return (
      <section className="cpg-spot" data-status={c.status.key}>
        <div className="cpg-spot-main">
          <div className="cpg-spot-head">
            <span className={`ui-badge ui-badge--${c.status.tone}`}><span className={`ui-dot ui-dot--${c.status.tone}`} />{isScheduled ? "Planlandı" : "Yayında"}</span>
            <span className="cpg-spot-time"><Timer />{timeText}</span>
          </div>
          <h3 className="cpg-spot-title">{c.title}</h3>
          <p className="cpg-spot-desc">{c.description}</p>

          <div className="cpg-goal">
            <div className="cpg-goal-top">
              <span><strong>{c.weightedCount || 0}</strong> / {c.targetCount} puan</span>
              <span className="cpg-goal-pct">%{pct}</span>
            </div>
            <div className="cpg-goal-bar"><i style={{ width: `${Math.max(pct, 2)}%` }} /></div>
            <div className="cpg-goal-meta">
              <span><Users />{c.requestCount || 0} kişi katıldı</span>
              <span><Target />{remaining ? `${remaining} puan kaldı` : "Hedef doldu"}</span>
              <span data-tone={pace.tone}><TrendingUp />{pace.text}</span>
            </div>
          </div>

          <div className="cpg-chips">
            <span className="cpg-chip cpg-chip--brand"><Gift />%{c.discountPercentage} kişisel kupon</span>
            <span className="cpg-chip">{c.minimumOrderAmount > 0 ? `${money(c.minimumOrderAmount)} üzeri sepet` : "Alt sepet yok"}</span>
            <span className="cpg-chip">{c.rewardValidityDays || 14} gün geçerli</span>
            <span className="cpg-chip">{REQUIREMENT_SHORT[c.orderRequirement] || "-"}</span>
            <span className="cpg-chip">{formatShortDate(c.startsAt)} – {formatShortDate(c.endsAt)}</span>
          </div>

          <div className="cpg-spot-actions">
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setComposer({ campaign: c })}><Pencil />Düzenle</button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setExpandedId(open ? null : c._id)} aria-expanded={open}>
              <Users />Katılımcılar<ChevronDown className="cpg-chevron" data-open={open} />
            </button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--warn" onClick={() => postState(c, false)} disabled={busyId === c._id}><Power />Pasife al</button>
          </div>
        </div>
        <div className="cpg-spot-side">
          <div className="cpg-spot-side-head">
            <span>Günlük talepler</span>
            <strong>{buckets.reduce((s, b) => s + b.count, 0)}</strong>
          </div>
          <UsageBars buckets={buckets} label="talep" height={92} />
        </div>
        {open && <div className="cpg-spot-participants"><Participants requesters={c.requesters} /></div>}
      </section>
    );
  };

  return (
    <div className="cpg">
      <div className="cpg-head">
        <div>
          <h2>Kupon isteği kampanyası</h2>
          <p>Hedef puana ulaşılınca talep bırakan herkese otomatik kişisel kupon tanımlanır.</p>
        </div>
        <div className="cpg-head-actions">
          <button type="button" className="ui-icon-btn" onClick={load} title="Yenile" aria-label="Yenile"><RefreshCw /></button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setComposer({ campaign: null })}><Plus />Yeni kampanya</button>
        </div>
      </div>

      {loadError && campaigns.length === 0 ? (
        <div className="ui-panel ui-empty">
          <AlertTriangle />
          <p>Kampanyalar yüklenemedi.</p>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}><RefreshCw />Tekrar dene</button>
        </div>
      ) : (
        <>
          {renderSpotlight()}

          {campaigns.length > 0 && (
            <div className="cpg-kpis">
              <div className="cpg-kpi"><span>Toplam kampanya</span><strong>{stats.total}</strong></div>
              <div className="cpg-kpi"><span>Ödül dağıtılan</span><strong>{stats.rewarded}</strong></div>
              <div className="cpg-kpi"><span>Toplam katılım</span><strong>{stats.participants.toLocaleString("tr-TR")}</strong></div>
              <div className="cpg-kpi"><span>Dağıtılan kişisel kupon</span><strong>{stats.coupons.toLocaleString("tr-TR")}</strong></div>
            </div>
          )}

          {campaigns.length > 0 && (
            <section className="ui-panel cpg-list">
              <div className="cpg-list-head">
                <h3>Tüm kampanyalar</h3>
                <div className="ui-chips cpn-filters" role="group" aria-label="Kampanya filtresi">
                  {FILTERS.map((f) => (
                    <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                      {f.label}<span className="cpn-chip-count">{counts[f.key]}</span>
                    </button>
                  ))}
                </div>
              </div>
              {visible.length === 0 && <div className="cpg-participants-empty">Bu filtrede kampanya yok.</div>}
              {visible.map((c) => {
                const pct = progressOf(c);
                const open = expandedId === c._id && c._id !== spotlight?._id;
                const st = c.status;
                const ended = new Date(c.endsAt).getTime() <= now;
                return (
                  <article key={c._id} className="cpg-row" data-status={st.key}>
                    <div className="cpg-row-main">
                      <div className="cpg-row-info">
                        <div className="cpg-row-title">
                          <strong>{c.title}</strong>
                          <span className={`ui-badge ${st.tone ? `ui-badge--${st.tone}` : ""}`}>{st.label}</span>
                        </div>
                        <span className="cpg-row-sub">
                          {formatShortDate(c.startsAt)} – {formatShortDate(c.endsAt)} · %{c.discountPercentage} kupon · {REQUIREMENT_SHORT[c.orderRequirement]}
                          {c.rewardIssuedAt ? ` · ödül ${formatShortDate(c.rewardIssuedAt)}` : ""}
                        </span>
                      </div>
                      <div className="cpg-row-progress">
                        <div className="cpg-row-progress-top">
                          <span><strong>{c.weightedCount || 0}</strong>/{c.targetCount} puan</span>
                          <span>{c.requestCount || 0} kişi</span>
                        </div>
                        <div className="cpg-mini-bar" data-done={pct >= 100}><i style={{ width: `${pct}%` }} /></div>
                      </div>
                      <div className="cpg-row-actions">
                        {c.rewardIssued ? (
                          <span className="cpg-done"><Trophy />Tamamlandı</span>
                        ) : c.isActive ? (
                          <button type="button" className="ui-btn ui-btn--sm ui-btn--warn" onClick={() => postState(c, false)} disabled={busyId === c._id}><Power />Pasife al</button>
                        ) : (
                          <button type="button" className="ui-btn ui-btn--sm" onClick={() => activate(c)} disabled={busyId === c._id || ended}
                            title={ended ? "Bitiş tarihi geçmiş; düzenleyip tarihi ileri alın" : "Yayına al"}><Power />Yayına al</button>
                        )}
                        {c.rewardIssued || ended ? (
                          <button type="button" className="ui-icon-btn" onClick={() => duplicate(c)} title="Aynı ayarlarla yeniden başlat" aria-label="Aynı ayarlarla yeniden başlat"><CopyPlus /></button>
                        ) : null}
                        <button type="button" className="ui-icon-btn" onClick={() => setComposer({ campaign: c })} title="Düzenle" aria-label="Düzenle"><Pencil /></button>
                        {c._id !== spotlight?._id && (
                          <button type="button" className="ui-icon-btn" onClick={() => setExpandedId(open ? null : c._id)} aria-expanded={open} title="Katılımcılar" aria-label="Katılımcılar"><Users /></button>
                        )}
                        <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={() => remove(c)} title="Sil" aria-label="Sil"><Trash2 /></button>
                      </div>
                    </div>
                    {open && <div className="cpg-row-expand"><Participants requesters={c.requesters} /></div>}
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}

      {composer && (
        <CouponRequestComposer
          campaign={composer.duplicate ? { ...composer.campaign, _id: undefined } : composer.campaign}
          otherLive={liveCampaign}
          onClose={() => setComposer(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
};

export default CouponRequestCampaignPanel;
