// Davet sistemi: her müşterinin tek kullanımlık davet kodu, davet ettiği kişi ve ödül durumu.
// Zincir: A → B → C. Liste + ayrıntı çekmecesi, en çok davet edenler ve sistemin nasıl işlediği.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, Copy, Download, Gift, Link2, RefreshCw, Search, Share2, Ticket, TrendingUp, UserPlus, Users,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import {
  Drawer, EmptyState, KpiCard, KpiGrid, PageHeader, ShortcutHelp, SkeletonCards, SkeletonRows,
  fold, formatDate, formatDateTime, initials, useDebounced, useIsMobile, useListShortcuts, usePref,
} from "./admin/ui";
import "../styles/referrals.css";

const INVITED = {
  pending: { label: "Sipariş bekleniyor", tone: "warn", short: "Bekliyor" },
  completed: { label: "Sipariş verdi · ödül bekliyor", tone: "info", short: "Sipariş verdi" },
  rewarded: { label: "Ödül verildi", tone: "ok", short: "Ödül verildi" },
};
const FILTERS = [
  { id: "all", label: "Tümü" },
  { id: "active", label: "Kod aktif", tone: "ok" },
  { id: "waiting", label: "Davetli bekliyor", tone: "warn" },
  { id: "reward", label: "Ödül bekliyor", tone: "info" },
  { id: "used", label: "Kullanılmış", tone: "" },
];
const SORTS = [
  { value: "success", label: "Başarılı davet" },
  { value: "invites", label: "Davet sayısı" },
  { value: "name", label: "Ada göre" },
];
const STEPS = [
  { step: 1, title: "Kod paylaşılır", desc: "Müşteri kendi kodunu bir arkadaşına verir." },
  { step: 2, title: "Arkadaşı kaydolur", desc: "Kodla kaydolan %5 hoş geldin kuponu kazanır." },
  { step: 3, title: "İlk sipariş", desc: "Arkadaşı ilk siparişini verir." },
  { step: 4, title: "Zincir uzar", desc: "Davet eden %5 kupon alır, kodu kapanır; arkadaşı kendi kodunu paylaşabilir." },
];
const PAGE = 50;

// Kodun durumu: kullanılmış (kapalı) / limit doldu / aktif
const codeState = (r) => {
  if (!r.isActive) return { id: "used", label: "Kod kullanıldı", tone: "" };
  if ((r.successfulReferrals || 0) >= (r.maxReferrals || 1)) return { id: "limit", label: "Limit doldu", tone: "warn" };
  return { id: "active", label: "Aktif", tone: "ok" };
};
const userId = (u) => String(u?._id || u || "");

const CodeChip = ({ code, size }) => (
  <button type="button" className={`ref-code${size === "sm" ? " ref-code--sm" : ""}`} title="Kodu kopyala"
    onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(code).then(() => toast.success("Kod kopyalandı")); }}>
    <Link2 aria-hidden="true" /><code>{code}</code><Copy aria-hidden="true" />
  </button>
);

// ── Ayrıntı çekmecesi ──────────────────────────────────────────────────
const ReferralDrawer = ({ referral, invitedBy, byUser, onClose, onOpen }) => {
  const state = codeState(referral);
  const referred = referral.referredUsers || [];
  return (
    <Drawer title={referral.referrer?.name || "Bilinmeyen müşteri"} subtitle={referral.referrer?.email} icon={Share2} width={500} onClose={onClose}
      footer={<button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>Kapat</button>}>
      <section className="ref-section">
        <div className="ref-section-head"><h3>Davet kodu</h3><span className={`ui-badge ${state.tone ? `ui-badge--${state.tone}` : ""}`}>{state.label}</span></div>
        <CodeChip code={referral.referralCode} />
        <dl className="ui-kv">
          <div><dt>Davet</dt><dd>{referral.totalReferrals || 0}</dd></div>
          <div><dt>Başarılı</dt><dd>{referral.successfulReferrals || 0} / {referral.maxReferrals || 1}</dd></div>
          <div><dt>Kazanılan ödül</dt><dd>{referral.totalRewardsEarned || 0} kupon</dd></div>
          <div><dt>Kod oluşturuldu</dt><dd>{formatDate(referral.createdAt, { year: "numeric" })}</dd></div>
        </dl>
      </section>

      <section className="ref-section">
        <div className="ref-section-head"><h3>Zincir</h3></div>
        <div className="ref-chain">
          {invitedBy ? (
            <button type="button" className="ref-chain-node ref-chain-node--link" onClick={() => onOpen(invitedBy._id)} title="Davet edenin kaydını aç">
              <span className="ui-avatar">{initials(invitedBy.referrer?.name)}</span>
              <span className="ref-chain-text">
                <span className="ref-chain-role">Davet eden</span>
                <strong className="ui-truncate">{invitedBy.referrer?.name || "Bilinmeyen"}</strong>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          ) : (
            <div className="ref-chain-node ref-chain-node--muted">
              <span className="ui-avatar">—</span>
              <span className="ref-chain-text"><span className="ref-chain-role">Davet eden</span><strong>Kodsuz kaydoldu (zincir başı)</strong></span>
            </div>
          )}
          <span className="ref-chain-arrow" aria-hidden="true"><ChevronDown /></span>
          <div className="ref-chain-node ref-chain-node--current">
            <span className="ui-avatar">{initials(referral.referrer?.name)}</span>
            <span className="ref-chain-text"><span className="ref-chain-role">Bu müşteri</span><strong className="ui-truncate">{referral.referrer?.name || "Bilinmeyen"}</strong></span>
          </div>
          <span className="ref-chain-arrow" aria-hidden="true"><ChevronDown /></span>
          {referred.length ? referred.map((item, index) => {
            const meta = INVITED[item.status] || INVITED.pending;
            const next = byUser.get(userId(item.user));
            const Tag = next ? "button" : "div";
            return (
              <Tag key={index} type={next ? "button" : undefined} className={`ref-chain-node${next ? " ref-chain-node--link" : ""}`}
                onClick={next ? () => onOpen(next._id) : undefined} title={next ? "Davet edilenin kendi kaydını aç" : undefined}>
                <span className="ui-avatar">{initials(item.user?.name)}</span>
                <span className="ref-chain-text">
                  <span className="ref-chain-role">Davet edilen</span>
                  <strong className="ui-truncate">{item.user?.name || "Kullanıcı"}</strong>
                  <span className={`ui-badge ui-badge--${meta.tone}`}>{meta.label}</span>
                </span>
                {next && <ChevronRight aria-hidden="true" />}
              </Tag>
            );
          }) : (
            <div className="ref-chain-node ref-chain-node--muted">
              <span className="ui-avatar"><UserPlus /></span>
              <span className="ref-chain-text"><span className="ref-chain-role">Davet edilen</span><strong>Henüz kimse bu kodla kaydolmadı</strong></span>
            </div>
          )}
        </div>
      </section>

      {referred.length > 0 && (
        <section className="ref-section">
          <div className="ref-section-head"><h3>Ödül akışı</h3></div>
          {referred.map((item, index) => (
            <div key={index} className="ref-timeline">
              <p className="ref-timeline-name">{item.user?.name || "Kullanıcı"} <span className="ui-muted">{item.user?.email}</span></p>
              <ol>
                <li data-done="true"><span>Kayıt oldu</span><em>{formatDateTime(item.signedUpAt)}</em></li>
                <li data-done={Boolean(item.firstOrderAt)}><span>İlk sipariş</span><em>{item.firstOrderAt ? formatDateTime(item.firstOrderAt) : "bekleniyor"}</em></li>
                <li data-done={Boolean(item.rewardGivenAt)}><span>Ödül kuponu</span><em>{item.rewardGivenAt ? formatDateTime(item.rewardGivenAt) : item.status === "completed" ? "sırada" : "henüz değil"}</em></li>
              </ol>
            </div>
          ))}
        </section>
      )}
    </Drawer>
  );
};

// ── Ana ekran ─────────────────────────────────────────────────────────
const ReferralsTab = () => {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = usePref("admin-referrals-sort", "success");
  const [guideOpen, setGuideOpen] = usePref("admin-referrals-guide", true);
  const [limit, setLimit] = useState(PAGE);
  const [cursor, setCursor] = useState(-1);
  const [selectedId, setSelectedId] = useState(null);
  const searchRef = useRef(null);
  const search = useDebounced(query, 200);
  const isMobile = useIsMobile();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/referrals/stats");
      setStats(data.stats || null);
      setReferrals(data.referrals || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Davet verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Kullanıcı → kendi davet kaydı (zincirde ileri gitmek için) ve kullanıcı → onu davet eden kayıt
  const byUser = useMemo(() => new Map(referrals.map((r) => [userId(r.referrer), r])), [referrals]);
  const invitedByMap = useMemo(() => {
    const map = new Map();
    for (const r of referrals) for (const item of r.referredUsers || []) map.set(userId(item.user), r);
    return map;
  }, [referrals]);

  const classify = useCallback((r) => {
    const state = codeState(r);
    const referred = r.referredUsers || [];
    return {
      active: state.id === "active",
      used: state.id !== "active",
      waiting: referred.some((i) => i.status === "pending"),
      reward: referred.some((i) => i.status === "completed"),
    };
  }, []);
  const counts = useMemo(() => {
    const c = { all: referrals.length, active: 0, waiting: 0, reward: 0, used: 0 };
    for (const r of referrals) {
      const k = classify(r);
      for (const key of ["active", "waiting", "reward", "used"]) if (k[key]) c[key] += 1;
    }
    return c;
  }, [referrals, classify]);

  const visible = useMemo(() => {
    const q = fold(search);
    const list = referrals.filter((r) => {
      if (filter !== "all" && !classify(r)[filter]) return false;
      if (!q) return true;
      const invited = (r.referredUsers || []).map((i) => `${i.user?.name || ""} ${i.user?.email || ""}`).join(" ");
      return fold(`${r.referrer?.name || ""} ${r.referrer?.email || ""} ${r.referralCode || ""} ${invited}`).includes(q);
    });
    return [...list].sort((a, b) => {
      if (sort === "name") return String(a.referrer?.name || "").localeCompare(String(b.referrer?.name || ""), "tr");
      if (sort === "invites") return (b.totalReferrals || 0) - (a.totalReferrals || 0) || new Date(b.createdAt) - new Date(a.createdAt);
      return (b.successfulReferrals || 0) - (a.successfulReferrals || 0) || (b.totalReferrals || 0) - (a.totalReferrals || 0);
    });
  }, [referrals, filter, search, sort, classify]);
  const shown = visible.slice(0, limit);
  const selected = referrals.find((r) => r._id === selectedId) || null;
  const hasFilters = filter !== "all" || Boolean(search);
  useEffect(() => { setLimit(PAGE); setCursor(-1); }, [filter, search, sort]);

  const totalInvites = stats?.totalReferrals ?? referrals.reduce((s, r) => s + (r.totalReferrals || 0), 0);
  const totalSuccess = stats?.totalSuccessful ?? referrals.reduce((s, r) => s + (r.successfulReferrals || 0), 0);
  const conversion = totalInvites ? Math.round((totalSuccess / totalInvites) * 100) : 0;
  const topReferrers = (stats?.topReferrers || []).filter((t) => (t.totalReferrals || 0) > 0).slice(0, 10);

  const exportCsv = () => {
    const rows = [["Davet eden", "E-posta", "Kod", "Durum", "Davet", "Başarılı", "Ödül", "Davet edilenler"]];
    for (const r of referrals) {
      rows.push([
        r.referrer?.name || "", r.referrer?.email || "", r.referralCode || "", codeState(r).label,
        r.totalReferrals || 0, r.successfulReferrals || 0, r.totalRewardsEarned || 0,
        (r.referredUsers || []).map((i) => `${i.user?.name || "?"} (${INVITED[i.status]?.short || i.status})`).join("; "),
      ]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `davetler-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: (dir) => setCursor((c) => Math.max(0, Math.min(shown.length - 1, c + dir))),
    open: () => { if (cursor >= 0 && shown[cursor]) setSelectedId(shown[cursor]._id); },
    escape: () => setCursor(-1),
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
  });
  useEffect(() => {
    if (cursor < 0) return;
    document.querySelector(`.ref-row[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="ui-page ref">
      <PageHeader
        title="Davet sistemi"
        description="Davetleri, kazanılan ödülleri ve müşteri bağlantılarını inceleyin."
        meta={referrals.length ? `${referrals.length} kod` : undefined}
        actions={(
          <>
            <button type="button" className="ui-btn" onClick={exportCsv} disabled={!referrals.length}><Download aria-hidden="true" />CSV indir</button>
            <button type="button" className="ui-btn" onClick={load} disabled={loading}><RefreshCw className={loading ? "ui-spin" : ""} aria-hidden="true" />Yenile</button>
          </>
        )}
      />

      {loading && !referrals.length ? <SkeletonCards count={4} /> : (
        <KpiGrid>
          <KpiCard icon={Users} label="Davet kodu olan müşteri" value={referrals.length} note={`${counts.active} kod aktif`} tone="brand" active={filter === "active"} onClick={() => setFilter(filter === "active" ? "all" : "active")} />
          <KpiCard icon={UserPlus} label="Toplam davet" value={totalInvites} note={`${counts.waiting} kişi ilk siparişini bekliyor`} tone="warn" active={filter === "waiting"} onClick={() => setFilter(filter === "waiting" ? "all" : "waiting")} />
          <KpiCard icon={TrendingUp} label="Başarılı zincir" value={totalSuccess} note={`%${conversion} dönüşüm`} tone="ok" />
          <KpiCard icon={Ticket} label="Verilen kupon" value={totalSuccess * 2} note="hoş geldin + teşekkür" tone="info" />
        </KpiGrid>
      )}

      <div className="ref-toolbar">
        <label className="ui-search ref-search">
          <Search aria-hidden="true" />
          <input ref={searchRef} className="ui-field" type="search" placeholder="Ad, e-posta, kod ya da davet edilen…" aria-label="Davetlerde ara"
            value={query} data-esc-clear="true" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="ui-chips ref-chips" role="group" aria-label="Davet filtresi">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.tone && <span className={`ui-dot ui-dot--${item.tone}`} aria-hidden="true" />}
              {item.label}<span className="ref-chip-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <select className="ui-field ui-field--sm ui-field--auto ref-sort" aria-label="Sıralama" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle aria-hidden="true" /><span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}>Tekrar dene</button>
        </div>
      )}

      <div className="ref-layout">
        {/* Liste */}
        <div className="ref-main">
          {loading && !referrals.length ? <SkeletonRows rows={6} /> : !visible.length ? (
            <section className="ui-panel">
              {hasFilters ? (
                <EmptyState icon={Search} title="Bu filtreye uyan davet yok" description="Arama ya da filtreyi değiştirin."
                  action={<button type="button" className="ui-btn" onClick={() => { setFilter("all"); setQuery(""); }}>Filtreleri temizle</button>} />
              ) : (
                <EmptyState icon={Gift} title="Henüz davet kodu oluşturulmadı" description="Müşteriler uygulamada davet kodunu açtığında burada görünür." />
              )}
            </section>
          ) : (
            <section className="ui-panel ref-list">
              {!isMobile && (
                <div className="ref-head" aria-hidden="true"><span>Davet eden</span><span>Kod</span><span>Davet edilen</span><span className="ui-right">Başarılı</span><span>Durum</span></div>
              )}
              {shown.map((r, index) => {
                const state = codeState(r);
                const referred = r.referredUsers || [];
                return (
                  <article key={r._id} className="ref-row" data-index={index} data-active={cursor === index} tabIndex={0} role="button"
                    aria-label={`${r.referrer?.name || "Müşteri"} davet ayrıntısı`} onClick={() => setSelectedId(r._id)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelectedId(r._id); }}>
                    <div className="ref-cell-user">
                      <span className="ui-avatar">{initials(r.referrer?.name)}</span>
                      <div className="ui-grow ref-user-text">
                        <p className="ui-list-title ui-truncate">{r.referrer?.name || "Bilinmeyen"}</p>
                        <p className="ui-list-sub ui-truncate">{r.referrer?.email || "—"}</p>
                      </div>
                    </div>
                    <div className="ref-cell-code"><CodeChip code={r.referralCode} size="sm" /></div>
                    <div className="ref-cell-invited">
                      {referred.length ? referred.slice(0, 3).map((item, i) => {
                        const meta = INVITED[item.status] || INVITED.pending;
                        return (
                          <span key={i} className="ref-invited" title={meta.label}>
                            <span className={`ui-dot ui-dot--${meta.tone}`} aria-hidden="true" />
                            <span className="ui-truncate">{item.user?.name || "Kullanıcı"}</span>
                            <span className="ref-invited-state">{meta.short}</span>
                          </span>
                        );
                      }) : <span className="ui-muted ref-none">Henüz davet yok</span>}
                      {referred.length > 3 && <span className="ui-muted">+{referred.length - 3}</span>}
                    </div>
                    <div className="ref-cell-num ui-right">
                      <strong className="ui-num">{r.successfulReferrals || 0}</strong>
                      <span className="ui-muted">/ {r.totalReferrals || 0} davet</span>
                    </div>
                    <div className="ref-cell-state">
                      <span className={`ui-badge ${state.tone ? `ui-badge--${state.tone}` : ""}`}>{state.label}</span>
                    </div>
                  </article>
                );
              })}
              {visible.length > shown.length && (
                <div className="ref-more">
                  <button type="button" className="ui-btn" onClick={() => setLimit((l) => l + PAGE)}>Daha fazla göster <span className="ui-muted">({visible.length - shown.length} kaldı)</span></button>
                </div>
              )}
            </section>
          )}
          <footer className="ref-foot">
            <span className="ui-muted">{visible.length} kayıt{hasFilters ? " (filtreli)" : ""}</span>
            {!isMobile && <span className="ui-muted ref-kbd"><kbd>/</kbd> ara · <kbd>j</kbd><kbd>k</kbd> gezin · <kbd>↵</kbd> aç · <kbd>?</kbd> yardım</span>}
          </footer>
        </div>

        {/* Yan sütun: en çok davet edenler + sistemin işleyişi */}
        <aside className="ref-side">
          <section className="ui-panel">
            <header className="ui-panel-head"><div><h2>En çok davet edenler</h2><p>Başarılı davet sayısına göre</p></div></header>
            {loading && !referrals.length ? <div className="ui-panel-body"><SkeletonRows rows={4} avatar={false} height={36} /></div> : topReferrers.length ? (
              <div className="ui-table-wrap ref-top-wrap">
                <table className="ui-table ref-top">
                  <thead><tr><th>#</th><th>Müşteri</th><th className="ui-right">Davet</th><th className="ui-right">Başarılı</th></tr></thead>
                  <tbody>
                    {topReferrers.map((t, i) => {
                      const own = byUser.get(userId(t.user));
                      return (
                        <tr key={`${t.code}-${i}`} className={own ? "ref-top-row" : ""} onClick={own ? () => setSelectedId(own._id) : undefined} tabIndex={own ? 0 : undefined}
                          onKeyDown={own ? (e) => { if (e.key === "Enter") setSelectedId(own._id); } : undefined}>
                          <td><span className="ui-rank">{i + 1}</span></td>
                          <td className="ref-top-name"><span className="ui-truncate">{t.user?.name || "Bilinmeyen"}</span><span className="ui-list-sub ui-truncate">{t.code}</span></td>
                          <td className="ui-right ui-num">{t.totalReferrals || 0}</td>
                          <td className="ui-right ui-num"><strong>{t.successfulReferrals || 0}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState compact icon={TrendingUp} title="Henüz davet yapılmadı" />}
          </section>

          <section className="ui-panel ref-guide" data-open={guideOpen}>
            <button type="button" className="ref-guide-toggle" aria-expanded={guideOpen} onClick={() => setGuideOpen(!guideOpen)}>
              <Share2 aria-hidden="true" /><span className="ui-grow">Zincir sistemi nasıl işler?</span><ChevronDown aria-hidden="true" />
            </button>
            {guideOpen && (
              <div className="ui-panel-body ref-guide-body">
                <div className="ui-note">
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <p className="ui-note-label">Tek seferlik davet hakkı</p>
                    <p className="ui-note-body">Her müşteri yalnızca 1 kişiyi başarılı şekilde davet edebilir. Başarılı davetten sonra kod kapanır; davet edilen kişi kendi koduyla zinciri sürdürür.</p>
                  </div>
                </div>
                <ol className="ref-steps">
                  {STEPS.map((item) => (
                    <li key={item.step}><span className="ui-rank">{item.step}</span><div><strong>{item.title}</strong><p>{item.desc}</p></div></li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </aside>
      </div>

      {selected && (
        <ReferralDrawer referral={selected} invitedBy={invitedByMap.get(userId(selected.referrer)) || null} byUser={byUser}
          onClose={() => setSelectedId(null)} onOpen={(id) => setSelectedId(id)} />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
};

export default ReferralsTab;
