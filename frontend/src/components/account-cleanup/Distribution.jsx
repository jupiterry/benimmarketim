// Son görülme dağılımı: tüm müşterilerin son etkinlik zamanına göre sütun grafiği (ya da tablo).
// Kesim çizgisi seçili ay sınırına çizilir; sağındaki sütunlar (kesimden eski) pasif bölgedir.
// Sayılar summary.distribution ve summary.totals'tan gelir; istemci yalnızca oranları biçimler.
import { Fragment } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Segmented, usePref } from "../admin/ui";
import { bucketShort, bucketSide, longDate, num, pct } from "./shared";

const SIDE_LABEL = { active: "Aktif", inactive: "Pasif", split: "Kesim bu aralıkta", never: "Etkinlik kaydı yok" };

const CutMarker = ({ months, inside = false }) => (
  <span className="ac-cut" data-inside={inside || undefined} aria-hidden="true">
    <span className="ac-cut-pill">Kesim · {months} ay</span>
    <span className="ac-cut-line" />
  </span>
);

const Column = ({ bucket, max, total, months }) => {
  const side = bucketSide(bucket.key, months);
  const count = Number(bucket.count) || 0;
  const height = max > 0 ? (count / max) * 100 : 0;
  const short = bucketShort(bucket.key, bucket.label);
  const share = pct(count, total);
  return (
    <div className="ac-col" data-side={side} role="listitem" tabIndex={0}
      aria-label={`${bucket.label || short}: ${num(count)} müşteri, ${share}. ${SIDE_LABEL[side]}.`}>
      <span className="ac-col-value ui-num" aria-hidden="true"><span>{num(count)}</span></span>
      <span className="ac-col-track" aria-hidden="true">
        <i style={{ height: `${height}%` }} data-empty={count === 0 || undefined} />
        {side === "split" && <CutMarker months={months} inside />}
      </span>
      <span className="ac-col-label" aria-hidden="true">{short}</span>
      <span className="ac-tip" aria-hidden="true">
        <strong>{bucket.label || short}</strong>
        <span className="ui-num">{num(count)} müşteri · {share}</span>
        <span>{side === "split" ? `Kesim (${months} ay) bu aralığın içinde; kesin sayılar kartlarda` : SIDE_LABEL[side]}</span>
      </span>
    </div>
  );
};

export default function Distribution({ summary }) {
  const [view, setView] = usePref("ac-dist-view", "chart");
  const months = Number(summary?.months) || 10;
  const totals = summary?.totals || {};
  const customers = Number(totals.customers) || 0;
  const buckets = Array.isArray(summary?.distribution) ? summary.distribution : [];
  const timeline = buckets.filter((b) => b.key !== "never");
  const never = buckets.find((b) => b.key === "never");
  const max = Math.max(0, ...buckets.map((b) => Number(b.count) || 0));
  // Kesim iki sütun arasına düşüyorsa işaret araya girer; bir sütunun içine düşüyorsa o sütunda çizilir
  const cutIndex = timeline.findIndex((b) => bucketSide(b.key, months) !== "active");
  const cutBetween = cutIndex >= 0 && bucketSide(timeline[cutIndex].key, months) === "inactive";
  const active = Math.max(0, customers - (Number(totals.inactive) || 0) - (Number(totals.never) || 0));

  const legend = [
    { side: "active", label: `Son ${months} ayda gelen`, value: active },
    { side: "inactive", label: `${months}+ ay pasif`, value: totals.inactive },
    { side: "never", label: "Etkinlik kaydı yok", value: totals.never },
  ];

  return (
    <section className="ui-panel ac-dist" aria-labelledby="ac-dist-title">
      <div className="ui-panel-head">
        <div className="ac-panel-title">
          <h2 id="ac-dist-title">Son görülme dağılımı</h2>
          <p>
            Tüm müşteriler (<span className="ui-num">{num(customers)}</span>) · kesim tarihi <strong>{longDate(summary?.cutoff)}</strong>
          </p>
        </div>
        <Segmented size="sm" ariaLabel="Görünüm" value={view} onChange={setView}
          options={[{ value: "chart", label: "Grafik", icon: BarChart3 }, { value: "table", label: "Tablo", icon: Table2 }]} />
      </div>
      <div className="ui-panel-body">
        {view === "table" ? (
          <div className="ui-table-wrap ac-dist-table">
            <table className="ui-table">
              <caption className="ac-sr">Son görülme aralıklarına göre müşteri sayıları</caption>
              <thead>
                <tr><th scope="col">Son görülme</th><th scope="col" className="ui-right">Müşteri</th><th scope="col" className="ui-right">Oran</th><th scope="col">Kesime göre</th></tr>
              </thead>
              <tbody>
                {buckets.map((b) => {
                  const side = bucketSide(b.key, months);
                  return (
                    <tr key={b.key} data-side={side}>
                      <td><span className="ac-swatch" data-side={side} aria-hidden="true" />{b.label || bucketShort(b.key)}</td>
                      <td className="ui-right ui-num">{num(b.count)}</td>
                      <td className="ui-right ui-num">{pct(b.count, customers)}</td>
                      <td>{side === "split" ? `Kesim (${months} ay) bu aralıkta` : SIDE_LABEL[side]}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><th scope="row">Toplam müşteri</th><td className="ui-right ui-num"><strong>{num(customers)}</strong></td><td className="ui-right ui-num">%100</td><td /></tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="ac-chart">
            <div className="ac-plot" role="list" aria-label={`Son görülme dağılımı, kesim ${months} ay`}>
              {timeline.map((b, i) => (
                <Fragment key={b.key}>
                  {cutBetween && i === cutIndex && <CutMarker months={months} />}
                  <Column bucket={b} max={max} total={customers} months={months} />
                </Fragment>
              ))}
              {cutIndex < 0 && timeline.length > 0 && <CutMarker months={months} />}
              {never && (
                <>
                  <span className="ac-plot-gap" aria-hidden="true" />
                  <Column bucket={never} max={max} total={customers} months={months} />
                </>
              )}
            </div>
            <ul className="ac-legend">
              {legend.map((item) => (
                <li key={item.side}>
                  <span className="ac-swatch" data-side={item.side} aria-hidden="true" />
                  <span className="ac-legend-label">{item.label}</span>
                  <strong className="ui-num">{num(item.value)}</strong>
                  <span className="ui-muted ui-num">{pct(item.value, customers)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
