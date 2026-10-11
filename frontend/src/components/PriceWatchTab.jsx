import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Moon,
  Pencil,
  Radar,
  RefreshCw,
  Search,
  SearchX,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import axios from "../lib/axios";
import { errorMessage, formatPrice, parsePrice } from "../lib/productAssist";
import { useProductStore } from "../stores/useProductStore";
import "../styles/price-watch.css";

const FILTERS = [
  { id: "above", label: "Pahalı", tone: "danger", icon: TrendingUp },
  { id: "below", label: "Ucuz", tone: "warn", icon: TrendingDown },
  { id: "missing", label: "Bulunamadı", tone: "info", icon: SearchX },
  { id: "ok", label: "Uyumlu", tone: "ok", icon: CheckCircle2 },
  { id: "unchecked", label: "Bakılmadı", tone: "", icon: Moon },
  { id: "ignored", label: "Yoksayılan", tone: "", icon: EyeOff },
];

const EMPTY_TEXT = {
  above: "Piyasadan belirgin pahalı ürün yok.",
  below: "Piyasadan belirgin ucuz ürün yok.",
  missing: "Fiyatı bulunamayan ürün yok.",
  ok: "Henüz piyasayla uyumlu ürün yok.",
  unchecked: "Tüm ürünlere en az bir kez bakıldı.",
  ignored: "Yoksayılan ürün yok.",
};

const pad = (value) => String(value).padStart(2, "0");

// 18.5 → "18,50" (fiyat kutusunda Türkçe yazım)
const priceText = (value) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value).toFixed(2).replace(".", ",") : "");

const timeAgo = (date, now = Date.now()) => {
  if (!date) return "";
  const minutes = Math.max(0, Math.round((now - new Date(date).getTime()) / 60000));
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
};

const clock = (date) => new Date(date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

const diffLabel = (diff) => {
  if (diff === null || diff === undefined) return "";
  const percent = Math.round(Math.abs(diff) * 100);
  if (diff > 0) return `%${percent} pahalı`;
  if (diff < 0) return `%${percent} ucuz`;
  return "aynı";
};

const phaseText = (worker) => {
  const { hours } = worker.settings;
  const span = `${pad(hours.start)}:00–${pad(hours.end)}:00`;
  switch (worker.phase) {
    case "running":
      return { tone: "ok", title: "Şu an kontrol ediyor", detail: worker.lastProduct ? `Son bakılan: ${worker.lastProduct}` : "" };
    case "limit":
      return { tone: "info", title: "Bugünkü sınır doldu", detail: `Yarın gece ${span} arasında devam eder.` };
    case "done":
      return { tone: "ok", title: "Vakti gelen ürün kalmadı", detail: "Yeni ürünler ve süresi dolanlar sonraki gece kontrol edilir." };
    case "paused":
      return { tone: "warn", title: "Kısa bir ara verildi", detail: worker.pausedUntil ? `${clock(worker.pausedUntil)} sonra yeniden dener.` : "" };
    case "disabled":
      return { tone: "warn", title: "Bekçi kapalı", detail: worker.settings.searxngConfigured ? "PRICE_WATCH_ENABLED=false ayarlı." : "SEARXNG_URL ayarlı değil." };
    case "offline":
      return { tone: "danger", title: "Bekçi çalışmıyor", detail: "Sunucuda ayrı süreç olarak başlatılmalı (backend/workers/PRICE_WATCH.md)." };
    default:
      return { tone: "info", title: `Her gece ${span} arasında çalışır`, detail: "Her ürün için tek arama yapar, aramalar arasında yarım dakika bekler." };
  }
};

const StatusCard = ({ worker, coverage }) => {
  const phase = phaseText(worker);
  const limit = worker.settings.dailyLimit;
  return (
    <section className="ui-card pw-status" aria-label="Bekçi durumu">
      <div className="pw-status-main">
        <span className={`pw-status-icon pw-tone-${phase.tone}`} aria-hidden="true">
          {worker.phase === "running" ? <Loader2 className="pw-spin" /> : <Radar />}
        </span>
        <div className="ui-grow">
          <p className="pw-status-title">{phase.title}</p>
          {phase.detail && <p className="pw-status-detail">{phase.detail}</p>}
        </div>
      </div>
      <dl className="pw-status-stats">
        <div>
          <dt>Bugün</dt>
          <dd>
            {worker.today}
            <span>/{limit}</span>
          </dd>
        </div>
        <div>
          <dt>Son 7 gün</dt>
          <dd>
            %{coverage.percent}
            <span> · {coverage.fresh}/{coverage.tracked}</span>
          </dd>
          <div className="pw-meter" aria-hidden="true">
            <i style={{ width: `${coverage.percent}%` }} />
          </div>
        </div>
        <div>
          <dt>Son kontrol</dt>
          <dd className="pw-status-last">{worker.lastRunAt ? timeAgo(worker.lastRunAt) : "henüz yok"}</dd>
        </div>
      </dl>
      {worker.lastError?.message && (
        <p className="pw-status-error">
          <AlertTriangle aria-hidden="true" />
          <span>
            {worker.lastError.message}
            {worker.lastError.at && <em> · {timeAgo(worker.lastError.at)}</em>}
          </span>
        </p>
      )}
    </section>
  );
};

const Sources = ({ offers }) => (
  <ul className="pw-sources">
    {offers.slice(0, 4).map((offer, index) => (
      <li key={`${offer.pageUrl}-${index}`}>
        <a href={offer.pageUrl} target="_blank" rel="noopener noreferrer" title={offer.title}>
          <span className="pw-source-name">{offer.source || "Kaynak"}</span>
          <span className="pw-source-price">{formatPrice(offer.price)}</span>
          <ExternalLink aria-hidden="true" />
        </a>
      </li>
    ))}
  </ul>
);

const QueryEditor = ({ row, busy, onSave, onCancel }) => {
  const [value, setValue] = useState(row.customQuery || row.name);
  const submit = (event) => {
    event.preventDefault();
    onSave(value.trim() === row.name ? "" : value);
  };
  return (
    <form className="pw-query" onSubmit={submit}>
      <label className="pw-query-label" htmlFor={`pw-query-${row.id}`}>
        Arama sözcüğü
      </label>
      <div className="pw-query-row">
        <input
          id={`pw-query-${row.id}`}
          className="ui-field"
          value={value}
          maxLength={120}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onCancel()}
          autoFocus
        />
        <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy || value.trim().length < 3}>
          Kaydet ve ara
        </button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
      <p className="ui-hint">Örn. marka + ürün + gramaj: “pınar süt 1 lt”. Boş bırakılırsa ürün adı kullanılır.</p>
    </form>
  );
};

const PriceRow = ({ row, busy, onApply, onCheck, onIgnore, onQuery }) => {
  const [price, setPrice] = useState(priceText(row.price));
  const [editingQuery, setEditingQuery] = useState(false);
  useEffect(() => setPrice(priceText(row.price)), [row.price]);

  const value = parsePrice(price);
  const changed = Number.isFinite(value) && value >= 0 && value !== row.price;
  const suggestion = row.median ? Math.round(row.median * 100) / 100 : null;
  const apply = () => changed && onApply(row, value);
  const levelClass = row.filter === "above" ? "pw-diff--above" : row.filter === "below" ? "pw-diff--below" : "pw-diff--ok";

  return (
    <li className={`pw-row${row.ignored ? " pw-row--ignored" : ""}`}>
      <div className="ui-thumb pw-thumb">{row.image ? <img src={row.image} alt="" loading="lazy" /> : <Radar aria-hidden="true" />}</div>

      <div className="pw-product">
        <p className="pw-name" title={row.name}>
          {row.name}
        </p>
        <p className="pw-meta">
          <span>
            Bizim: <strong>{formatPrice(row.price)}</strong>
          </span>
          {row.isDiscounted && <span className="ui-badge ui-badge--brand">İndirimde {formatPrice(row.discountedPrice)}</span>}
          {row.isOutOfStock && <span className="ui-badge">Stokta yok</span>}
          {row.customQuery && <span className="ui-badge ui-badge--info">Arama: {row.customQuery}</span>}
        </p>
      </div>

      <div className="pw-market">
        {row.median ? (
          <>
            <p className="pw-median">
              <span className="pw-label">Piyasa</span>
              <strong>{formatPrice(row.median)}</strong>
              {row.min !== row.max && (
                <span className="pw-range">
                  {formatPrice(row.min)} – {formatPrice(row.max)}
                </span>
              )}
              {row.diff !== null && row.filter !== "ignored" && <span className={`pw-diff ${levelClass}`}>{diffLabel(row.diff)}</span>}
            </p>
            <Sources offers={row.offers} />
            <p className="pw-checked">
              {row.offerCount} kaynak{row.offerCount === 1 && " · tek kaynak, dikkatli olun"} · {timeAgo(row.checkedAt)}
              {row.stale && " · eski bilgi"}
              {row.status === "not-found" && " · son aramada bulunamadı"}
              {row.status === "error" && " · son arama başarısız"}
            </p>
          </>
        ) : row.checkedAt ? (
          <p className="pw-missing">
            <SearchX aria-hidden="true" />
            <span>
              {row.status === "error" ? `Arama yapılamadı: ${row.error || "bilinmeyen hata"}` : "İnternette fiyatı bulunamadı."}
              <em> {timeAgo(row.checkedAt)} · aranan: “{row.query}”</em>
            </span>
          </p>
        ) : (
          <p className="pw-missing">
            <Moon aria-hidden="true" />
            <span>Henüz bakılmadı; sıradaki gecelerde kontrol edilecek.</span>
          </p>
        )}
        {editingQuery && (
          <QueryEditor
            row={row}
            busy={busy}
            onCancel={() => setEditingQuery(false)}
            onSave={async (query) => {
              if (await onQuery(row, query)) setEditingQuery(false);
            }}
          />
        )}
      </div>

      <div className="pw-actions">
        <div className="pw-price">
          <div className="pw-price-input">
            <span aria-hidden="true">₺</span>
            <input
              className="ui-field"
              inputMode="decimal"
              aria-label={`${row.name} yeni fiyat`}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && apply()}
            />
          </div>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={!changed || busy} onClick={apply}>
            Kaydet
          </button>
        </div>
        {suggestion && suggestion !== row.price && (
          <button type="button" className="pw-suggest" onClick={() => setPrice(priceText(suggestion))}>
            Piyasa fiyatını yaz: {formatPrice(suggestion)}
          </button>
        )}
        <div className="pw-tools">
          <button type="button" className="ui-icon-btn ui-icon-btn--sm" title="Şimdi yeniden kontrol et" aria-label="Şimdi yeniden kontrol et" disabled={busy} onClick={() => onCheck(row)}>
            {busy ? <Loader2 className="pw-spin" /> : <RefreshCw />}
          </button>
          <button type="button" className="ui-icon-btn ui-icon-btn--sm" title="Arama sözcüğünü düzenle" aria-label="Arama sözcüğünü düzenle" disabled={busy} onClick={() => setEditingQuery((open) => !open)}>
            <Pencil />
          </button>
          <button
            type="button"
            className="ui-icon-btn ui-icon-btn--sm"
            title={row.ignored ? "Takibe geri al" : "Bu ürünü yoksay"}
            aria-label={row.ignored ? "Takibe geri al" : "Bu ürünü yoksay"}
            disabled={busy}
            onClick={() => onIgnore(row, !row.ignored)}
          >
            {row.ignored ? <Eye /> : <EyeOff />}
          </button>
        </div>
      </div>
    </li>
  );
};

const PriceWatchTab = () => {
  const updateProductPrice = useProductStore((state) => state.updateProductPrice);
  const [filter, setFilter] = useState("above");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const request = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const id = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ filter, page: String(page) });
      if (search) params.set("q", search);
      const response = await axios.get(`/price-watch?${params}`);
      if (id !== request.current) return;
      setData(response.data);
      setError("");
      if (response.data.page !== page) setPage(response.data.page);
    } catch (err) {
      if (id === request.current) setError(errorMessage(err, "Fiyat bekçisi listesi alınamadı."));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [filter, page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const withBusy = async (id, job) => {
    setBusy((current) => ({ ...current, [id]: true }));
    try {
      return await job();
    } finally {
      setBusy((current) => ({ ...current, [id]: false }));
    }
  };

  const replaceRow = (row) =>
    setData((current) => current && { ...current, items: current.items.map((item) => (item.id === row.id ? row : item)) });

  const handleApply = (row, price) =>
    withBusy(row.id, async () => {
      try {
        await updateProductPrice(row.id, price);
        toast.success(`${row.name}: ${formatPrice(price)}`);
        await load({ quiet: true });
      } catch (err) {
        toast.error(errorMessage(err, err?.message || "Fiyat güncellenemedi."));
      }
    });

  const handleCheck = (row) =>
    withBusy(row.id, async () => {
      try {
        const response = await axios.post(`/price-watch/${row.id}/check`);
        const next = response.data.row;
        replaceRow(next);
        toast.success(next.median ? `Piyasa: ${formatPrice(next.median)} (${next.offerCount} kaynak)` : "İnternette fiyatı bulunamadı.");
      } catch (err) {
        if (err?.response?.data?.row) replaceRow(err.response.data.row);
        toast.error(errorMessage(err, "Kontrol yapılamadı."));
      }
    });

  const handleIgnore = (row, ignored) =>
    withBusy(row.id, async () => {
      try {
        await axios.patch(`/price-watch/${row.id}`, { ignored });
        toast.success(ignored ? "Ürün yoksayıldı; gece kontrol edilmeyecek." : "Ürün yeniden takipte.");
        await load({ quiet: true });
      } catch (err) {
        toast.error(errorMessage(err, "Kayıt güncellenemedi."));
      }
    });

  const handleQuery = (row, customQuery) =>
    withBusy(row.id, async () => {
      try {
        await axios.patch(`/price-watch/${row.id}`, { customQuery });
      } catch (err) {
        toast.error(errorMessage(err, "Arama sözcüğü kaydedilemedi."));
        return false;
      }
      try {
        const response = await axios.post(`/price-watch/${row.id}/check`);
        replaceRow(response.data.row);
        toast.success(response.data.row.median ? `Piyasa: ${formatPrice(response.data.row.median)}` : "Bu sözcükle de bulunamadı.");
      } catch (err) {
        if (err?.response?.data?.row) replaceRow(err.response.data.row);
        toast.error(errorMessage(err, "Kontrol yapılamadı."));
      }
      return true;
    });

  const counts = data?.counts || {};
  const threshold = data?.worker?.settings?.threshold ?? 20;

  return (
    <div className="ui-page pw">
      {data?.worker && <StatusCard worker={data.worker} coverage={data.coverage} />}

      <div className="pw-toolbar">
        <div className="ui-chips pw-filters" role="group" aria-label="Fiyat durumu">
          {FILTERS.map(({ id, label, tone, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              data-tone={tone}
              onClick={() => {
                setFilter(id);
                setPage(1);
              }}
            >
              <Icon aria-hidden="true" />
              {label}
              <span className="pw-chip-count">{counts[id] ?? "–"}</span>
            </button>
          ))}
        </div>
        <label className="ui-search pw-search">
          <Search aria-hidden="true" />
          <input
            className="ui-field"
            type="search"
            placeholder="Ürün ara"
            aria-label="Ürün ara"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      {(filter === "above" || filter === "below") && (
        <p className="pw-explain">
          {filter === "above"
            ? `Fiyatı internetteki ortanca fiyattan %${threshold}'den fazla yüksek ürünler. En büyük fark üstte.`
            : `Fiyatı internetteki ortanca fiyattan %${threshold}'den fazla düşük ürünler; kâr kaçırıyor olabilirsiniz.`}{" "}
          İnternet fiyatları market, kargo ve paket farkı içerebilir; kaynaklara bakıp siz karar verin. Hiçbir fiyat kendiliğinden değişmez.
        </p>
      )}

      {error && (
        <div className="ui-banner ui-banner--danger pw-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>
            Tekrar dene
          </button>
        </div>
      )}

      <section className="ui-card pw-list-card" aria-busy={loading}>
        {loading && !data ? (
          <ul className="pw-list">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="pw-row pw-row--skeleton">
                <span className="ui-skeleton pw-thumb" />
                <span className="ui-skeleton" style={{ height: 14, width: "60%" }} />
                <span className="ui-skeleton" style={{ height: 14, width: "80%" }} />
                <span className="ui-skeleton" style={{ height: 30, width: "100%" }} />
              </li>
            ))}
          </ul>
        ) : data?.items?.length ? (
          <ul className={`pw-list${loading ? " pw-list--loading" : ""}`}>
            {data.items.map((row) => (
              <PriceRow key={row.id} row={row} busy={Boolean(busy[row.id])} onApply={handleApply} onCheck={handleCheck} onIgnore={handleIgnore} onQuery={handleQuery} />
            ))}
          </ul>
        ) : data ? (
          <div className="ui-empty">
            <CheckCircle2 aria-hidden="true" />
            <p className="ui-strong">{search ? "Aramaya uyan ürün yok." : EMPTY_TEXT[filter]}</p>
          </div>
        ) : null}
      </section>

      {data && data.pages > 1 && (
        <nav className="ui-pagination" aria-label="Sayfalar">
          <button type="button" aria-label="Önceki sayfa" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
          </button>
          <span className="pw-page">
            {data.page} / {data.pages} · {data.total} ürün
          </span>
          <button type="button" aria-label="Sonraki sayfa" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            <ChevronRight />
          </button>
        </nav>
      )}
    </div>
  );
};

export default PriceWatchTab;
