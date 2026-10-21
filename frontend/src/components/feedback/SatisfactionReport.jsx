// Memnuniyet raporu: GET /feedback/report?days=N
// Haftalık puan eğilimi, 👍/👎, şikâyet etiketleri, 1./3./5. sipariş ortalamaları, kalite uyarıları (ürün),
// teslimat noktası karşılaştırması, tavsiye puanı (NPS), iptal ve vazgeçme nedenleri.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, HeartHandshake, PackageX, RefreshCw, Star, ThumbsDown, ThumbsUp, Truck } from "lucide-react";
import axios from "../../lib/axios";
import { EmptyState, KpiCard, KpiGrid, Segmented, SkeletonCards, formatDateTime } from "../admin/ui";

const RANGES = [
  { value: 28, label: "4 hafta" },
  { value: 56, label: "8 hafta" },
  { value: 90, label: "3 ay" },
];
const POINT_LABELS = { girlsDorm: "Kız KYK Yurdu", boysDorm: "Erkek KYK Yurdu" };
const fmt = (value) => (value == null ? "—" : Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);
const weekLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

/** Yatay oran çubuğu listesi (etiket · çubuk · sayı) */
const BarList = ({ rows, empty, tone }) => {
  if (!rows.length) return <p className="ui-muted ui-text-sm">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="fbr-bars">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="fbr-bars-label ui-truncate" title={row.label}>{row.label}</span>
          <span className="fbr-bars-track"><span className="fbr-bars-fill" data-tone={tone} style={{ width: `${(row.count / max) * 100}%` }} /></span>
          <span className="ui-num fbr-bars-count">{row.count}</span>
        </li>
      ))}
    </ul>
  );
};

const Panel = ({ title, hint, children, className = "" }) => (
  <section className={`ui-panel ${className}`}>
    <div className="ui-panel-head"><h2 className="ui-title">{title}</h2>{hint && <span className="ui-muted ui-text-xs">{hint}</span>}</div>
    <div className="ui-panel-body">{children}</div>
  </section>
);

export default function SatisfactionReport() {
  const [days, setDays] = useState(56);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/feedback/report", { params: { days } });
      setReport(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const head = (
    <div className="ui-between fbr-head">
      <Segmented ariaLabel="Dönem" value={days} onChange={setDays} options={RANGES} />
      <button type="button" className="ui-btn ui-btn--sm" onClick={load} disabled={loading}><RefreshCw className={loading ? "ui-spin" : undefined} />Yenile</button>
    </div>
  );

  if (loading && !report) return <div className="ui-stack">{head}<SkeletonCards count={4} /></div>;
  if (error) {
    return (
      <div className="ui-stack">
        {head}
        <div className="ui-banner ui-banner--danger" role="alert"><span>{error}</span><button type="button" className="ui-btn ui-btn--sm" onClick={load}>Tekrar dene</button></div>
      </div>
    );
  }
  if (!report) return null;

  const { totals, weekly, complaintTags, byMilestone, problemProducts, byDeliveryPoint, nps, cancelReasons, abandonReasons } = report;
  const quickTotal = totals.up + totals.down;
  const maxWeekCount = Math.max(1, ...weekly.map((w) => w.ratingCount + w.up + w.down));

  return (
    <div className="ui-stack fbr">
      {head}
      <KpiGrid columns={4}>
        <KpiCard icon={Star} label="Ürün memnuniyeti" value={fmt(totals.averageRating)} note="5 üzerinden ortalama"
          tone={totals.averageRating >= 4 ? "ok" : totals.averageRating != null && totals.averageRating < 3 ? "danger" : undefined} />
        <KpiCard icon={Truck} label="Teslimat puanı" value={fmt(totals.averageDelivery)} note="Kurye ve teslimat hızı"
          tone={totals.averageDelivery >= 4 ? "ok" : totals.averageDelivery != null && totals.averageDelivery < 3 ? "danger" : undefined} />
        <KpiCard icon={ThumbsUp} label="Sipariş sonrası 👍" value={quickTotal ? `%${pct(totals.up, quickTotal)}` : "—"} note={`${totals.up} 👍 · ${totals.down} 👎`}
          tone={quickTotal && pct(totals.up, quickTotal) < 80 ? "warn" : undefined} />
        <KpiCard icon={HeartHandshake} label="Tavsiye puanı (NPS)" value={nps.score == null ? "—" : nps.score > 0 ? `+${nps.score}` : String(nps.score)}
          note={nps.count ? `${nps.count} yanıt · ${nps.promoters} destekçi, ${nps.detractors} eleştirmen` : "Henüz yanıt yok"}
          tone={nps.score == null ? undefined : nps.score >= 30 ? "ok" : nps.score < 0 ? "danger" : "warn"} />
      </KpiGrid>

      {report.qualityAlerts?.length > 0 && (
        <div className="ui-banner ui-banner--danger" role="status">
          <AlertTriangle aria-hidden="true" />
          <span><strong>Kalite uyarısı:</strong> {report.qualityAlerts.map((row) => `${row.name} (${row.count})`).join(", ")} için birden fazla sorun bildirildi.</span>
        </div>
      )}

      <Panel title="Haftalık eğilim" hint="Ortalama puan · teslimat puanı · 👍/👎">
        {weekly.every((w) => !w.ratingCount && !w.up && !w.down) ? (
          <p className="ui-muted ui-text-sm">Bu dönemde değerlendirme yok.</p>
        ) : (
          <div className="fbr-weeks" role="table" aria-label="Haftalık memnuniyet">
            {weekly.map((w) => {
              const count = w.ratingCount + w.up + w.down;
              return (
                <div key={w.week} className="fbr-week" role="row" title={`${weekLabel(w.week)} haftası: ${count} değerlendirme`}>
                  <span className="fbr-week-bar" style={{ height: `${Math.max(4, (count / maxWeekCount) * 100)}%` }} data-tone={w.averageRating != null && w.averageRating < 3 ? "danger" : undefined} />
                  <strong className="ui-num" role="cell">{fmt(w.averageRating)}</strong>
                  <span className="ui-muted ui-text-xs ui-num" role="cell">{w.averageDelivery != null ? `🚚 ${fmt(w.averageDelivery)}` : "🚚 —"}</span>
                  <span className="ui-muted ui-text-xs ui-num" role="cell">{w.up}👍 {w.down}👎</span>
                  <span className="ui-text-xs fbr-week-label" role="cell">{weekLabel(w.week)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="fbr-grid">
        <Panel title="En sık şikâyetler" hint="Seçilen hazır etiketler">
          <BarList tone="danger" empty="Şikâyet etiketi seçilmedi." rows={complaintTags.map((row) => ({ key: row.tag, label: row.label, count: row.count }))} />
        </Panel>

        <Panel title="Sipariş sayısına göre" hint="1., 3. ve 5. sipariş anketi">
          {byMilestone.length ? (
            <table className="ui-table fbr-table">
              <thead><tr><th>Anket</th><th className="ui-num">Yanıt</th><th className="ui-num">Ürün</th><th className="ui-num">Teslimat</th></tr></thead>
              <tbody>
                {byMilestone.map((row) => (
                  <tr key={row.milestone}><td>{row.milestone}. sipariş</td><td className="ui-num">{row.count}</td><td className="ui-num">{fmt(row.averageRating)}</td><td className="ui-num">{fmt(row.averageDelivery)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="ui-muted ui-text-sm">Bu dönemde anket yanıtı yok.</p>}
        </Panel>

        <Panel title="Sorun bildirilen ürünler" hint="Bozuk · eksik · yanlış" className="fbr-wide">
          {problemProducts.length ? (
            <ul className="fbr-products">
              {problemProducts.map((row) => (
                <li key={row.productId || row.name} data-alert={row.alert || undefined}>
                  <PackageX aria-hidden="true" />
                  <span className="ui-strong ui-truncate">{row.name}</span>
                  <span className="fbr-issues">{row.issueLabels.map((issue) => <span key={issue.issue} className="ui-badge ui-badge--danger">{issue.label} · {issue.count}</span>)}</span>
                  <span className="ui-muted ui-text-xs">{row.lastAt ? formatDateTime(row.lastAt) : ""}</span>
                  {row.alert && <span className="ui-badge ui-badge--danger"><AlertTriangle />Kalite uyarısı</span>}
                </li>
              ))}
            </ul>
          ) : <EmptyState compact icon={PackageX} title="Ürün sorunu bildirilmedi" description="Müşteri bozuk, eksik ya da yanlış ürün işaretlediğinde burada listelenir." />}
        </Panel>

        <Panel title="Teslimat noktasına göre" hint="Ürün ve teslimat puanı ayrı">
          {byDeliveryPoint.length ? (
            <table className="ui-table fbr-table">
              <thead><tr><th>Nokta</th><th className="ui-num">Ürün</th><th className="ui-num">Teslimat</th><th className="ui-num">👍/👎</th><th className="ui-num">Geç geldi</th></tr></thead>
              <tbody>
                {byDeliveryPoint.map((row) => (
                  <tr key={row.deliveryPoint}>
                    <td>{POINT_LABELS[row.deliveryPoint] || row.deliveryPoint}</td>
                    <td className="ui-num">{fmt(row.averageRating)}</td>
                    <td className="ui-num">{fmt(row.averageDelivery)}</td>
                    <td className="ui-num">{row.up}/{row.down}</td>
                    <td className="ui-num">{row.lateComplaints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="ui-muted ui-text-sm">Henüz veri yok.</p>}
        </Panel>

        <Panel title="Tavsiye puanı (aylık)" hint="Destekçi % − eleştirmen %">
          {nps.monthly?.length ? (
            <table className="ui-table fbr-table">
              <thead><tr><th>Ay</th><th className="ui-num">Yanıt</th><th className="ui-num">NPS</th></tr></thead>
              <tbody>
                {nps.monthly.map((row) => (
                  <tr key={row.month}>
                    <td>{new Date(`${row.month}-01T00:00:00`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</td>
                    <td className="ui-num">{row.count}</td>
                    <td className="ui-num ui-strong">{row.score > 0 ? `+${row.score}` : row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="ui-muted ui-text-sm">Müşterilere ayda bir “Bizi bir arkadaşına önerir misin?” sorulur; yanıtlar burada toplanır.</p>}
        </Panel>

        <Panel title="İptal nedenleri" hint={`${totals.cancelledWithReason}/${totals.cancelled} iptalde neden seçildi`}>
          <BarList tone="warn" empty="Bu dönemde nedenli iptal yok." rows={cancelReasons.map((row) => ({ key: row.code, label: row.label, count: row.count }))} />
        </Panel>

        <Panel title="Sepetten vazgeçme" hint="“Neden vazgeçtin?” yanıtları">
          <BarList tone="warn" empty="Henüz yanıt yok." rows={abandonReasons.map((row) => ({ key: row.code, label: row.label, count: row.count }))} />
        </Panel>
      </div>
      {totals.down > 0 && <p className="ui-hint"><ThumbsDown aria-hidden="true" /> 👎 veren ve 2 yıldız ve altı puan veren müşteriler için destek kuyruğunda otomatik kayıt açılır.</p>}
    </div>
  );
}
