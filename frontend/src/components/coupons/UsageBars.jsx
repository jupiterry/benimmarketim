// Günlük kullanım çubukları: tek seri, tek renk, çubuk başına ipucu.
const UsageBars = ({ buckets, label = "kullanım", variant = "default", height = 64 }) => {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const first = buckets[0]?.date;
  const last = buckets[buckets.length - 1]?.date;
  const fmt = (d) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

  return (
    <figure className="cpn-bars" data-variant={variant}>
      <div className="cpn-bars-plot" style={{ height }} role="img"
        aria-label={`Son ${buckets.length} gün: toplam ${buckets.reduce((s, b) => s + b.count, 0)} ${label}`}>
        {buckets.map((b, i) => (
          <div key={i} className="cpn-bars-col" tabIndex={-1}>
            <i style={{ height: b.count ? `${Math.max(8, (b.count / max) * 100)}%` : 0 }} data-zero={b.count === 0} />
            <span className="cpn-bars-tip">
              <strong>{b.count} {label}</strong>
              {b.date.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "long" })}
            </span>
          </div>
        ))}
      </div>
      {first && last && (
        <figcaption className="cpn-bars-axis">
          <span>{fmt(first)}</span>
          <span>Bugün</span>
        </figcaption>
      )}
    </figure>
  );
};

export default UsageBars;
