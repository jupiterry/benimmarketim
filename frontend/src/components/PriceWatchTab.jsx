import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  X,
  HelpCircle,
  Eye,
  EyeOff,
  Globe,
  Landmark,
  Loader2,
  MapPin,
  Moon,
  Pencil,
  Play,
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
import { useConfirm } from "./ConfirmModal";
import { Drawer, EmptyState, PageHeader, ShortcutHelp, SkeletonRows, useListShortcuts } from "./admin/ui";
import "../styles/price-watch.css";

const FILTERS = [
  { id: "above", label: "Pahalı", tone: "danger", icon: TrendingUp },
  { id: "below", label: "Ucuz", tone: "warn", icon: TrendingDown },
  { id: "unsure", label: "Emin değil", tone: "info", icon: HelpCircle },
  { id: "missing", label: "Bulunamadı", tone: "info", icon: SearchX },
  { id: "ok", label: "Uyumlu", tone: "ok", icon: CheckCircle2 },
  { id: "unchecked", label: "Bakılmadı", tone: "", icon: Moon },
  { id: "ignored", label: "Yoksayılan", tone: "", icon: EyeOff },
];

const EMPTY_TEXT = {
  above: "Piyasadan belirgin pahalı ürün yok.",
  below: "Piyasadan belirgin ucuz ürün yok.",
  unsure: "Kontrol edilmesi gereken şüpheli sonuç yok.",
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

const shortDate = (date) => new Date(date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

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
  const allDay = (hours.end - hours.start + 24) % 24 === 0;
  const span = `${pad(hours.start)}:00–${pad(hours.end)}:00`;
  const when = allDay ? "Yarın" : `Yarın gece ${span} arasında`;
  switch (worker.phase) {
    case "running":
      return { tone: "ok", title: "Şu an kontrol ediyor", detail: worker.lastProduct ? `Son bakılan: ${worker.lastProduct}` : "" };
    case "limit":
      return {
        tone: "info",
        title: "Bugünkü sınır doldu",
        detail: worker.camgoz?.exhausted
          ? `Market sayfası sınırı ve Camgöz kredisi doldu${worker.marketfiyati?.enabled ? ", Market Fiyatı'nın sorabileceği ürün kalmadı" : ""}. ${when} devam eder.`
          : `Market sayfası sınırı doldu. ${when} devam eder.`,
      };
    case "done":
      return { tone: "ok", title: "Vakti gelen ürün kalmadı", detail: "Yeni ürünler ve süresi dolanlar sonraki gece kontrol edilir." };
    case "paused":
      return { tone: "warn", title: "Kaynaklar ara verdi", detail: `${worker.pausedUntil ? `En erken ${clock(worker.pausedUntil)} sonra yeniden dener. ` : ""}Nedeni aşağıdaki Kaynaklar satırında yazar.` };
    case "disabled":
      return { tone: "warn", title: "Bekçi kapalı", detail: "PRICE_WATCH_ENABLED=false ayarlı ya da üç kaynak da kapalı (Market Fiyatı, Camgöz, SEARXNG_URL)." };
    case "offline":
      return { tone: "danger", title: "Bekçi çalışmıyor", detail: "Sunucuda ayrı süreç olarak başlatılmalı (backend/workers/PRICE_WATCH.md)." };
    default:
      return {
        tone: "info",
        title: allDay ? "Gün boyu çalışır" : `Her gece ${span} arasında çalışır`,
        detail: worker.marketfiyati?.enabled
          ? `Önce Market Fiyatı'ndan (TÜBİTAK, ücretsiz) yakın şubelerin fiyatlarını alır${worker.camgoz?.enabled ? ", bulamazsa Camgöz'e sorar" : ""}${worker.settings.searxngConfigured ? ", o da bulamazsa Şok, Trendyol ve Hepsiburada sayfalarını okur" : ""}.`
          : worker.camgoz?.enabled
            ? "Önce Camgöz'den zincir market fiyatlarını alır, bulamazsa Şok, Trendyol ve Hepsiburada sayfalarını okur."
            : "Ürünün Şok, Trendyol ve Hepsiburada sayfalarını açıp güncel fiyatı okur; ürünler arasında yarım dakika bekler.",
      };
  }
};

const PROVIDER_ICONS = { marketfiyati: Landmark, camgoz: KeyRound, pages: Globe };
const PROVIDER_STATUS = {
  ok: { tone: "ok", label: "Çalışıyor" },
  idle: { tone: "info", label: "Henüz denenmedi" },
  error: { tone: "danger", label: "Hata" },
  paused: { tone: "warn", label: "Ara verdi" },
  limit: { tone: "warn", label: "Kredi/pay doldu" },
  disabled: { tone: "", label: "Kapalı" },
};
const LIMIT_TEXT = { monthly: "aylık kredi bitti", daily: "bugünkü kredi payı doldu", paused: "ara verildi", disabled: "anahtar yok" };

// Kaynak denemesi sonucunun kısa özeti (ham yanıt değil; yöneticinin okuyabileceği cümle)
const testSummary = (result) => {
  if (!result) return "";
  if (!result.ok) return `Başarısız (${result.ms} ms): ${result.error || "bilinmeyen hata"}${result.detail ? ` — "${result.detail}"` : ""}`;
  const s = result.summary || {};
  if (result.provider === "marketfiyati") {
    if (!result.found) return `Ulaşıldı (${result.ms} ms) ama "${result.query}" bulunamadı. ${s.note || ""}`.trim();
    // Uzak şubeden okunan zincirlerde mesafe de yazılır (fiyatlar ülke genelinde benzer; yönetici görsün)
    const offers = s.offers.map((offer) => `${offer.source} ${formatPrice(offer.price)}${offer.near === false && offer.distanceKm != null ? ` (${Math.round(offer.distanceKm)} km)` : ""}`);
    return `Ulaşıldı (${result.ms} ms): ${s.matchedName} → ${offers.join(", ")} (ortanca ${formatPrice(s.median)}).${s.note ? ` ${s.note}` : ""}`;
  }
  if (result.provider === "camgoz") return `Anahtar kabul edildi (${result.ms} ms). ${s.note || ""}`.trim();
  if (!result.found) return `SearXNG yanıt verdi (${result.ms} ms, ${s.results ?? 0} sonuç) ama market ürün sayfası yok. ${s.note || ""}`.trim();
  return `SearXNG çalışıyor (${result.ms} ms): ${s.pages.map((page) => page.source).join(", ")} sayfası bulundu.`;
};

const ProvidersRow = ({ providers, testing, results, onTest, onCamgoz, onMarketfiyati }) => (
  <div className="pw-providers" aria-label="Fiyat kaynakları">
    <p className="pw-providers-head">Kaynaklar <span className="ui-muted">· sıra: Market Fiyatı → Camgöz → market sayfaları</span></p>
    <ul className="pw-provider-list">
      {providers.map((provider) => {
        const Icon = PROVIDER_ICONS[provider.id] || Radar;
        const status = PROVIDER_STATUS[provider.status] || PROVIDER_STATUS.idle;
        const result = results[provider.id];
        return (
          <li key={provider.id} className="pw-provider">
            <span className={`pw-provider-icon pw-tone-${status.tone || "none"}`} aria-hidden="true"><Icon /></span>
            <div className="pw-provider-body">
              <p className="pw-provider-title">
                <strong>{provider.label}</strong>
                <span className={`ui-badge${status.tone ? ` ui-badge--${status.tone}` : ""}`}>{status.label}</span>
                <span className="ui-muted">{provider.detail}</span>
              </p>
              <p className="pw-provider-meta">
                {provider.info && <span>{provider.info}</span>}
                {provider.lastOkAt && <span>son başarı {timeAgo(provider.lastOkAt)}</span>}
                {provider.lastErrorAt && <span>son hata {timeAgo(provider.lastErrorAt)}</span>}
                {provider.nextRetryAt && <span>yeniden deneme {clock(provider.nextRetryAt)}</span>}
                {provider.limitReason && LIMIT_TEXT[provider.limitReason] && <span>{LIMIT_TEXT[provider.limitReason]}</span>}
                {provider.consecutiveMisses > 2 && <span>arka arkaya {provider.consecutiveMisses} ürün bulunamadı</span>}
              </p>
              {provider.lastError?.message && (provider.status === "error" || provider.status === "paused") && (
                <p className="pw-provider-error">
                  {provider.lastError.status ? `HTTP ${provider.lastError.status} · ` : ""}{provider.lastError.message}
                  {provider.lastError.detail && provider.lastError.detail !== provider.lastError.message && <em> · “{provider.lastError.detail}”</em>}
                </p>
              )}
              {result && <p className={`pw-provider-result${result.ok ? "" : " pw-provider-result--bad"}`} role="status">{testSummary(result)}</p>}
            </div>
            <div className="pw-provider-actions">
              {provider.id === "marketfiyati" && (
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onMarketfiyati}><MapPin aria-hidden="true" />Ayarlar</button>
              )}
              {provider.id === "camgoz" && (
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onCamgoz}><KeyRound aria-hidden="true" />Anahtar</button>
              )}
              <button type="button" className="ui-btn ui-btn--sm" disabled={Boolean(testing[provider.id])} onClick={() => onTest(provider.id)} title="Bu kaynağa şimdi tek bir canlı istek gönderir">
                {testing[provider.id] ? <Loader2 className="ui-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
                Şimdi dene
              </button>
            </div>
          </li>
        );
      })}
    </ul>
    <p className="ui-hint pw-legal">
      Market Fiyatı verisi TÜBİTAK BİLGEM&apos;in halka açık platformundan okunur; resmî API değildir, kullanım koşullarına uyum işletmenin sorumluluğundadır.{" "}
      <a href="https://marketfiyati.org.tr/kullanim-kosullari" target="_blank" rel="noopener noreferrer">Kullanım koşulları<ExternalLink aria-hidden="true" /></a>
    </p>
  </div>
);

const StatusCard = ({ worker, coverage, onCamgoz, onMarketfiyati, testing, testResults, onTest }) => {
  const phase = phaseText(worker);
  const limit = worker.settings.dailyLimit;
  return (
    <section className="ui-card pw-status" aria-label="Bekçi durumu">
      <div className="pw-status-main">
        <span className={`pw-status-icon pw-tone-${phase.tone}`} aria-hidden="true">
          {worker.phase === "running" ? <Loader2 className="ui-spin" /> : <Radar />}
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
            <span> ürün</span>
          </dd>
          <p className="pw-status-sub">
            Sayfa {worker.pagesToday ?? 0}/{limit}
          </p>
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
        {worker.camgoz && (
          <div>
            <dt className="pw-camgoz-head">
              Camgöz kredisi (bu ay)
              <button type="button" className="pw-link-btn" onClick={onCamgoz}>
                <KeyRound aria-hidden="true" />
                Anahtar
              </button>
            </dt>
            {worker.camgoz.enabled ? (
              <>
                <dd>
                  {worker.camgoz.used}
                  <span>/{worker.camgoz.monthlyCredits}</span>
                </dd>
                <div className={`pw-meter${worker.camgoz.exhausted ? " pw-meter--full" : ""}`} aria-hidden="true">
                  <i style={{ width: `${Math.min(100, Math.round((worker.camgoz.used / Math.max(1, worker.camgoz.monthlyCredits)) * 100))}%` }} />
                </div>
              </>
            ) : (
              <dd className="pw-status-last">Kapalı</dd>
            )}
          </div>
        )}
      </dl>
      {worker.camgoz?.exhausted && (
        <div className="pw-status-alert">
          <KeyRound aria-hidden="true" />
          <span className="ui-grow">Camgöz kredisi bitti. Yeni bir JoJ API anahtarı girerek hemen devam edebilirsiniz; o zamana kadar market sayfaları kullanılır.</span>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={onCamgoz}>
            Yeni anahtar gir
          </button>
        </div>
      )}
      {worker.camgoz?.keyError && (
        <p className="pw-status-error">
          <AlertTriangle aria-hidden="true" />
          <span>{worker.camgoz.keyError}</span>
        </p>
      )}
      {worker.camgoz?.lastError?.message && (worker.camgoz.pausedUntil || Date.now() - new Date(worker.camgoz.lastError.at).getTime() < 86400000) && (
        <p className="pw-status-error">
          <AlertTriangle aria-hidden="true" />
          <span>
            {worker.camgoz.lastError.message}
            {worker.camgoz.pausedUntil && ` · Camgöz saat ${clock(worker.camgoz.pausedUntil)} sonrasına kadar beklemede, bu arada Market Fiyatı ve market sayfaları kullanılıyor`}
          </span>
        </p>
      )}
      {worker.lastError?.message && (
        <p className="pw-status-error">
          <AlertTriangle aria-hidden="true" />
          <span>
            {worker.lastError.message}
            {worker.lastError.at && <em> · {timeAgo(worker.lastError.at)}</em>}
          </span>
        </p>
      )}
      {worker.providers?.length > 0 && (
        <ProvidersRow providers={worker.providers} testing={testing} results={testResults} onTest={onTest} onCamgoz={onCamgoz} onMarketfiyati={onMarketfiyati} />
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
          {offer.readAt && <span className="pw-source-date">{shortDate(offer.readAt)}</span>}
          {offer.pageUrl && <ExternalLink aria-hidden="true" />}
        </a>
      </li>
    ))}
  </ul>
);

const QueryEditor = ({ row, busy, onSave, onCancel }) => {
  const [value, setValue] = useState(row.customQuery || row.name);
  const [barcode, setBarcode] = useState(row.barcode || "");
  const cleanBarcode = barcode.replace(/\s+/g, "");
  const barcodeValid = !cleanBarcode || /^\d{8,14}$/.test(cleanBarcode);
  const submit = (event) => {
    event.preventDefault();
    const changes = { customQuery: value.trim() === row.name ? "" : value };
    if (cleanBarcode !== (row.barcode || "")) changes.barcode = cleanBarcode;
    onSave(changes);
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
      </div>
      <label className="pw-query-label" htmlFor={`pw-barcode-${row.id}`}>
        Barkod <span className="pw-optional">(isteğe bağlı; yazılırsa ürün kesin eşleşir)</span>
      </label>
      <div className="pw-query-row">
        <input
          id={`pw-barcode-${row.id}`}
          className="ui-field pw-barcode-field"
          inputMode="numeric"
          placeholder="ör. 8690526019222"
          value={barcode}
          maxLength={16}
          aria-invalid={!barcodeValid}
          onChange={(event) => setBarcode(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onCancel()}
        />
        <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy || value.trim().length < 3 || !barcodeValid}>
          Kaydet ve ara
        </button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
      <p className="ui-hint">
        Arama: marka + ürün + gramaj, ör. “pınar süt 1 lt”. Barkod 8–14 rakam; ürünün arkasındaki çizgilerin altında yazar.
        {row.barcode && row.barcodeSource === "auto" && " Şu anki barkod otomatik bulundu; yanlışsa düzeltin."}
      </p>
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
  const levelClass = { above: "pw-diff--above", below: "pw-diff--below", unsure: "pw-diff--unsure" }[row.filter] || "pw-diff--ok";

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
          {row.barcode && (
            <span className="ui-badge" title={row.barcodeSource === "manual" ? "Barkodu siz yazdınız" : "Barkod Camgöz'de otomatik bulundu"}>
              {row.barcodeSource === "manual" ? "Barkod" : "Oto. barkod"} {row.barcode}
            </span>
          )}
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
            {row.note && (
              <p className="pw-note">
                <HelpCircle aria-hidden="true" />
                <span>{row.note}</span>
              </p>
            )}
            <p className="pw-checked">
              {row.provider === "marketfiyati" ? `Market Fiyatı · ${row.offerCount} zincir market` : row.provider === "camgoz" ? `Camgöz · ${row.offerCount} zincir market` : `${row.offerCount} market sayfasından okundu`} · kontrol {timeAgo(row.checkedAt)}
              {row.stale && " · eski bilgi"}
              {row.status === "error" && " · son kontrol başarısız, önceki sonuç gösteriliyor"}
            </p>
          </>
        ) : row.checkedAt ? (
          <p className="pw-missing">
            <SearchX aria-hidden="true" />
            <span>
              {row.status === "error" ? `Arama yapılamadı: ${row.error || "bilinmeyen hata"}` : row.note || "Kaynaklarda bulunamadı."}
              <em> {timeAgo(row.checkedAt)} · aranan: “{row.query}”</em>
              {row.rejected?.length > 0 && (
                <span className="pw-rejected">
                  {row.rejected.map((item, index) => (
                    <a key={`${item.pageUrl}-${index}`} href={item.pageUrl} target="_blank" rel="noopener noreferrer" title={item.title}>
                      {item.source}: {item.reason}
                    </a>
                  ))}
                </span>
              )}
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
            onSave={async (changes) => {
              if (await onQuery(row, changes)) setEditingQuery(false);
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
            {busy ? <Loader2 className="ui-spin" /> : <RefreshCw />}
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

// Camgöz API anahtarı: panelden değiştirilir, sunucuda şifreli saklanır (.env dosyasına dokunulmaz)
const CamgozDrawer = ({ onClose, onSaved }) => {
  const { confirm } = useConfirm();
  const [config, setConfig] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [monthly, setMonthly] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    axios
      .get("/price-watch/camgoz")
      .then((response) => {
        if (!active) return;
        setConfig(response.data.camgoz);
        setMonthly(String(response.data.camgoz.monthlyCredits ?? ""));
      })
      .catch((err) => active && setError(errorMessage(err, "Camgöz ayarları okunamadı.")));
    return () => {
      active = false;
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    const body = {};
    if (apiKey.trim()) body.apiKey = apiKey.trim();
    if (monthly !== "" && Number(monthly) !== config?.monthlyCredits) body.monthlyCredits = Number(monthly);
    if (!Object.keys(body).length) return onClose();
    setSaving(true);
    setError("");
    try {
      const response = await axios.put("/price-watch/camgoz", body);
      setConfig(response.data.camgoz);
      setApiKey("");
      toast.success(body.apiKey ? "Yeni anahtar denendi ve kaydedildi; kredi sayacı sıfırlandı." : "Camgöz ayarı kaydedildi.");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Kaydedilemedi."));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const removePanelKey = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await axios.delete("/price-watch/camgoz");
      setConfig(response.data.camgoz);
      toast.success("Panel anahtarı silindi; .env'deki anahtar kullanılacak.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Silinemedi."));
    } finally {
      setSaving(false);
    }
  };

  const sourceText = !config
    ? "Yükleniyor…"
    : config.source === "panel"
      ? `Panelden girilen anahtar (…${config.last4})${config.setAt ? ` · ${shortDate(config.setAt)}` : ""}`
      : config.source === "env"
        ? `Sunucudaki .env anahtarı (…${config.last4})`
        : "Anahtar yok";

  return (
    <Drawer title="Camgöz API anahtarı" subtitle={sourceText} icon={KeyRound} width={460} onClose={onClose} dirty={Boolean(apiKey.trim())}
      onDirtyClose={() => confirm({ title: "Anahtar kaydedilmedi", message: "Girilen anahtar kaydedilmedi. Yine de kapatılsın mı?", confirmText: "Kapat", cancelText: "Geri dön", type: "warning" })}
      footer={(
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="pw-camgoz-form" className="ui-btn ui-btn--primary" disabled={saving || !config}>
            {saving ? <Loader2 className="ui-spin" aria-hidden="true" /> : null}
            {apiKey.trim() ? "Dene ve kaydet" : "Kaydet"}
          </button>
        </>
      )}>
      <form id="pw-camgoz-form" className="pw-camgoz-body" onSubmit={save}>
        {config && (
          <p className="pw-camgoz-usage">
            Bu ay {config.used} / {config.monthlyCredits} kredi kullanıldı{config.exhausted ? " — kredi bitti." : "."}
          </p>
        )}
        <label className="pw-query-label" htmlFor="pw-camgoz-key">
          Yeni API anahtarı
        </label>
        <input
          id="pw-camgoz-key"
          className="ui-field"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="JoJ panelindeki anahtarı yapıştırın"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoFocus
        />
        <p className="ui-hint">
          Kaydetmeden önce anahtar Camgöz&apos;ün ücretsiz ucuyla denenir (kredi harcamaz). Anahtar sunucuda şifreli saklanır, bir daha
          gösterilmez; .env&apos;deki anahtarın yerine geçer ve bu ayın kredi sayacı sıfırlanır. Anahtarın JoJ panelinde Product Barcode API
          planına abone olması gerekir.
        </p>
        <label className="pw-query-label" htmlFor="pw-camgoz-monthly">
          Aylık kredi
        </label>
        <input
          id="pw-camgoz-monthly"
          className="ui-field pw-barcode-field"
          inputMode="numeric"
          value={monthly}
          onChange={(event) => setMonthly(event.target.value.replace(/[^\d]/g, ""))}
        />
        <p className="ui-hint">Ücretsiz paket 500, Başlangıç paketi 10.000. Bekçi bu sayıya gelince Camgöz&apos;ü durdurur.</p>
        {error && (
          <p className="pw-status-error" role="alert">
            <AlertTriangle aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        {config?.source === "panel" && (
          <div className="pw-camgoz-remove">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={saving} onClick={removePanelKey}>
              <X aria-hidden="true" />Panel anahtarını sil (.env&apos;e dön)
            </button>
          </div>
        )}
      </form>
    </Drawer>
  );
};

// Market Fiyatı ayarları: konum (şubeler buna göre seçilir), yarıçap, fiyat yaşı, istekler arası bekleme. Anahtar gerekmez.
const MarketfiyatiDrawer = ({ onClose, onSaved }) => {
  const { confirm } = useConfirm();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    axios
      .get("/price-watch/marketfiyati")
      .then((response) => {
        if (!active) return;
        const mf = response.data.marketfiyati;
        setConfig(mf);
        setForm({ enabled: mf.enabled, latitude: String(mf.latitude), longitude: String(mf.longitude), distanceKm: String(mf.distanceKm), maxAgeDays: String(mf.maxAgeDays), intervalSec: String(mf.minIntervalMs / 1000) });
      })
      .catch((err) => active && setError(errorMessage(err, "Market Fiyatı ayarları okunamadı.")));
    return () => {
      active = false;
    };
  }, []);

  const dirty = Boolean(config && form) && (
    form.enabled !== config.enabled || Number(form.latitude) !== config.latitude || Number(form.longitude) !== config.longitude ||
    Number(form.distanceKm) !== config.distanceKm || Number(form.maxAgeDays) !== config.maxAgeDays || Number(form.intervalSec) * 1000 !== config.minIntervalMs
  );

  const save = async (event, extra = {}) => {
    event?.preventDefault();
    const body = { ...extra };
    if (form.enabled !== config.enabled) body.enabled = form.enabled;
    if (Number(form.latitude) !== config.latitude) body.latitude = Number(form.latitude.replace(",", "."));
    if (Number(form.longitude) !== config.longitude) body.longitude = Number(form.longitude.replace(",", "."));
    if (Number(form.distanceKm) !== config.distanceKm) body.distanceKm = Number(form.distanceKm);
    if (Number(form.maxAgeDays) !== config.maxAgeDays) body.maxAgeDays = Number(form.maxAgeDays);
    if (Number(form.intervalSec) * 1000 !== config.minIntervalMs) body.minIntervalMs = Math.round(Number(form.intervalSec.replace(",", ".")) * 1000);
    if (!Object.keys(body).length) return onClose();
    setSaving(true);
    setError("");
    try {
      const response = await axios.put("/price-watch/marketfiyati", body);
      setConfig(response.data.marketfiyati);
      toast.success(body.resume ? "Ara kaldırıldı; bekçi bir sonraki adımda Market Fiyatı'nı yeniden dener." : "Market Fiyatı ayarı kaydedildi.");
      onSaved();
      if (!body.resume) onClose();
    } catch (err) {
      setError(errorMessage(err, "Kaydedilemedi."));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const field = (key, label, hint, props = {}) => (
    <>
      <label className="pw-query-label" htmlFor={`pw-mf-${key}`}>{label}</label>
      <input id={`pw-mf-${key}`} className="ui-field pw-barcode-field" inputMode="decimal" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} {...props} />
      {hint && <p className="ui-hint">{hint}</p>}
    </>
  );

  return (
    <Drawer title="Market Fiyatı" subtitle={config ? `${config.source === "panel" ? "Panel ayarı" : "Varsayılan ayar"} · ${config.enabled ? "açık" : "kapalı"}` : "Yükleniyor…"} icon={Landmark} width={460} onClose={onClose} dirty={dirty}
      onDirtyClose={() => confirm({ title: "Ayar kaydedilmedi", message: "Değişiklikler kaydedilmedi. Yine de kapatılsın mı?", confirmText: "Kapat", cancelText: "Geri dön", type: "warning" })}
      footer={(
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="pw-mf-form" className="ui-btn ui-btn--primary" disabled={saving || !form || !dirty}>
            {saving ? <Loader2 className="ui-spin" aria-hidden="true" /> : null}
            Kaydet
          </button>
        </>
      )}>
      {form && (
        <form id="pw-mf-form" className="pw-camgoz-body" onSubmit={save}>
          <p className="pw-camgoz-usage">
            TÜBİTAK BİLGEM&apos;in halka açık Market Fiyatı platformundan A101, BİM, Migros, Şok, CarrefourSA, Hakmar ve Tarım Kredi şubelerinin fiyatları okunur. Ücretsizdir, anahtar gerekmez.
            {config?.pausedUntil && ` Şu an ${clock(config.pausedUntil)} sonrasına kadar ara verilmiş.`}
          </p>
          <button type="button" className="ui-toggle" aria-pressed={form.enabled} onClick={() => setForm({ ...form, enabled: !form.enabled })}>
            <i /><span>{form.enabled ? "Açık · ilk sorulan kaynak" : "Kapalı · yalnızca Camgöz ve market sayfaları kullanılır"}</span>
          </button>
          {field("latitude", "Enlem", null)}
          {field("longitude", "Boylam", "Şubeler bu noktaya göre seçilir. Varsayılan Devrek merkezi (41,2207 / 31,9563). Haritada sağ tık → koordinatı kopyala.")}
          {field("distanceKm", "Yarıçap (km)", "Varsayılan 60 km (Devrek çevresi). Bu alanda şube yoksa bir kez 150 km ile denenir.", { inputMode: "numeric" })}
          {field("maxAgeDays", "En eski fiyat (gün)", "Bundan eski şube fiyatları sayılmaz (varsayılan 14).", { inputMode: "numeric" })}
          {field("intervalSec", "İstekler arası bekleme (sn)", "Platformu yormamak için en az 2,5 sn önerilir; 429/403 gelirse kaynak kendiliğinden 15 dk–6 sa ara verir.")}
          {error && (
            <p className="pw-status-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
          {config?.pausedUntil && (
            <div className="pw-camgoz-remove">
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={saving} onClick={(event) => save(event, { resume: true })}>
                <Play aria-hidden="true" />Arayı kaldır, hemen yeniden dene
              </button>
            </div>
          )}
          <p className="ui-hint pw-legal">
            Market Fiyatı verisi TÜBİTAK BİLGEM&apos;in halka açık platformundan okunur; resmî API değildir, kullanım koşullarına uyum işletmenin sorumluluğundadır.{" "}
            <a href={config?.termsUrl || "https://marketfiyati.org.tr/kullanim-kosullari"} target="_blank" rel="noopener noreferrer">Kullanım koşulları<ExternalLink aria-hidden="true" /></a>
          </p>
        </form>
      )}
    </Drawer>
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
  const [camgozOpen, setCamgozOpen] = useState(false);
  const [marketfiyatiOpen, setMarketfiyatiOpen] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const closeCamgoz = useCallback(() => setCamgozOpen(false), []);
  const closeMarketfiyati = useCallback(() => setMarketfiyatiOpen(false), []);
  const request = useRef(0);
  const searchRef = useRef(null);
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    searchEscape: () => { setQuery(""); setPage(1); searchRef.current?.blur(); },
  });

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

  const handleQuery = (row, changes) =>
    withBusy(row.id, async () => {
      try {
        await axios.patch(`/price-watch/${row.id}`, changes);
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

  // Kaynağa tek canlı istek: üretimde kaynağa ulaşılıyor mu, ne yanıt veriyor? (kaydedilmez, ürünlere yazılmaz)
  const handleTest = async (id) => {
    setTesting((current) => ({ ...current, [id]: true }));
    try {
      const response = await axios.post(`/price-watch/providers/${id}/test`, {});
      setTestResults((current) => ({ ...current, [id]: response.data }));
      if (response.data.ok) toast.success(response.data.found === false ? "Kaynağa ulaşıldı ama örnek ürün bulunamadı." : "Kaynak yanıt verdi.");
      else toast.error(response.data.error || "Kaynak yanıt vermedi.");
    } catch (err) {
      setTestResults((current) => ({ ...current, [id]: { ok: false, provider: id, ms: 0, error: errorMessage(err, "Deneme yapılamadı.") } }));
      toast.error(errorMessage(err, "Deneme yapılamadı."));
    } finally {
      setTesting((current) => ({ ...current, [id]: false }));
    }
  };

  const counts = data?.counts || {};
  const threshold = data?.worker?.settings?.threshold ?? 20;

  return (
    <div className="ui-page pw">
      <PageHeader
        title="Fiyat bekçisi"
        description="Ürünlerinizin internetteki piyasa fiyatıyla karşılaştırması. Gece kendiliğinden kontrol edilir, fiyatı siz değiştirirsiniz."
        meta={counts.above !== undefined ? `${counts.above} pahalı` : undefined}
        actions={(
          <>
            <button type="button" className="ui-btn" onClick={() => setMarketfiyatiOpen(true)}><Landmark aria-hidden="true" />Market Fiyatı</button>
            <button type="button" className="ui-btn" onClick={() => setCamgozOpen(true)}><KeyRound aria-hidden="true" />Camgöz anahtarı</button>
            <button type="button" className="ui-btn" onClick={() => load()} disabled={loading}><RefreshCw className={loading ? "ui-spin" : ""} aria-hidden="true" />Yenile</button>
          </>
        )}
      />
      {loading && !data ? (
        <span className="ui-skeleton pw-status-skeleton" aria-hidden="true" />
      ) : (
        data?.worker && (
          <StatusCard
            worker={data.worker}
            coverage={data.coverage}
            onCamgoz={() => setCamgozOpen(true)}
            onMarketfiyati={() => setMarketfiyatiOpen(true)}
            testing={testing}
            testResults={testResults}
            onTest={handleTest}
          />
        )
      )}
      {camgozOpen && <CamgozDrawer onClose={closeCamgoz} onSaved={() => load({ quiet: true })} />}
      {marketfiyatiOpen && <MarketfiyatiDrawer onClose={closeMarketfiyati} onSaved={() => load({ quiet: true })} />}

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
            ref={searchRef}
            className="ui-field"
            type="search"
            placeholder="Ürün ara"
            aria-label="Ürün ara"
            data-esc-clear="true"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      {(filter === "above" || filter === "below" || filter === "unsure") && (
        <p className="pw-explain">
          {filter === "above" && `Fiyatı market fiyatından %${threshold}'den fazla yüksek ürünler. En büyük fark üstte.`}
          {filter === "below" && `Fiyatı market fiyatından %${threshold}'den fazla düşük ürünler; kâr kaçırıyor olabilirsiniz.`}
          {filter === "unsure" &&
            "Ürün adında gramaj olmadığı ya da fark çok büyük olduğu için emin olunamayan sonuçlar. Kalemle arama sözcüğüne gramaj ekleyin (ör. “eti sütlü kare çikolata 65 g”), ürün hemen yeniden aranır."}{" "}
          Fiyatlar önce Market Fiyatı&apos;ndan (TÜBİTAK; A101, BİM, Migros, Şok, CarrefourSA, Hakmar, Tarım Kredi şubelerinin son 14 gündeki fiyatları), bulunamazsa Camgöz&apos;den, o da bulamazsa Şok, Trendyol ve Hepsiburada ürün sayfalarından o gün okunur. Hiçbir fiyat kendiliğinden değişmez.
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
          <SkeletonRows rows={5} height={72} />
        ) : data?.items?.length ? (
          <ul className={`pw-list${loading ? " pw-list--loading" : ""}`}>
            {data.items.map((row) => (
              <PriceRow key={row.id} row={row} busy={Boolean(busy[row.id])} onApply={handleApply} onCheck={handleCheck} onIgnore={handleIgnore} onQuery={handleQuery} />
            ))}
          </ul>
        ) : data ? (
          search ? (
            <EmptyState icon={SearchX} title="Aramaya uyan ürün yok" description={`“${search}” için bu listede sonuç bulunamadı.`}
              action={<button type="button" className="ui-btn" onClick={() => { setQuery(""); setPage(1); }}>Aramayı temizle</button>} />
          ) : (
            <EmptyState icon={CheckCircle2} title={EMPTY_TEXT[filter]} description="Başka bir filtre seçin ya da bekçinin gece kontrolünü bekleyin." />
          )
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
      <footer className="pw-foot">
        <span className="ui-muted">{data ? `${data.total} ürün` : ""}</span>
        <span className="ui-muted pw-kbd"><kbd>/</kbd> ara · <kbd>?</kbd> yardım</span>
      </footer>
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
};

export default PriceWatchTab;
