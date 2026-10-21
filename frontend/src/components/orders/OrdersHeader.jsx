// Siparişler ekranının sayfa başlığı (C2): canlı durum satırı + "Otomatik yenile" anahtarı, görünüm seçici,
// Toplama listesi, Yenile, "Diğer işlemler" menüsü ve kısayol düğmesi.
// Stil: styles/orders-overview.css (önek so-ov-). Sözleşme: scratchpad/orders-design/CONTRACTS.md §7.1
import { Bell, Calculator, ClipboardList, Download, Keyboard, Printer, RefreshCw } from "lucide-react";
import { PageHeader, Segmented, formatTime, timeAgo, useIsMobile } from "../admin/ui";
import { MenuButton } from "./atoms";
import { VIEWS, formatTimeSeconds, toMs } from "./shared";
import "../../styles/orders-overview.css";

const AUTO_REFRESH_TITLE = "Açıkken liste her 30 sn’de yenilenir";

/** Eşitleme anı (ms) → <time> etiketi için ISO değeri; geçersizse undefined */
const isoOf = (value) => {
  const ms = toMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

/**
 * Başlık altındaki tek satır (yalnızca satır içi öğeler; PageHeader bunu <p> içine koyar).
 * Üç durum: canlı (nabız atan yeşil nokta), otomatik yenileme kapalı (nötr nokta), bağlantı sorunu (kırmızı nokta + "Tekrar dene").
 * Kesin saat (SS:DD:ss) satırın title değerindedir.
 */
const LiveStatus = ({ loading, live }) => {
  const { autoRefresh = true, onToggle, lastSyncAt = null, stale = false, now = Date.now(), onRetry } = live || {};
  const synced = Boolean(lastSyncAt);
  const state = loading && !synced ? "loading" : stale ? "stale" : autoRefresh ? "live" : "paused";
  const at = synced ? <time dateTime={isoOf(lastSyncAt)}>{formatTime(lastSyncAt)}</time> : null;

  let text;
  if (state === "loading") text = "Siparişler yükleniyor…";
  else if (state === "live") {
    text = synced
      ? <>Canlı · <time dateTime={isoOf(lastSyncAt)}>{timeAgo(lastSyncAt, now)}</time> güncellendi</>
      : "Canlı";
  } else if (state === "paused") text = <>Otomatik yenileme kapalı{at && <> · son güncelleme {at}</>}</>;
  else text = <>Bağlantı sorunu{at && <> · son güncelleme {at}</>}</>;

  return (
    <span className="so-ov-live" data-state={state} title={synced ? `Son güncelleme: ${formatTimeSeconds(lastSyncAt)}` : undefined}>
      <span className="so-ov-live-main">
        <i className="so-ov-live-dot" aria-hidden="true" />
        <span className="so-ov-live-text">{text}</span>
        {state === "stale" && onRetry && (
          <button type="button" className="so-ov-live-retry" onClick={onRetry}>Tekrar dene</button>
        )}
      </span>
      <button type="button" className="ui-toggle so-ov-auto" aria-pressed={Boolean(autoRefresh)} onClick={() => onToggle?.()} title={AUTO_REFRESH_TITLE}>
        <i aria-hidden="true" />
        <span>Otomatik yenile</span>
      </button>
    </span>
  );
};

export default function OrdersHeader({
  loading = false, view, onView, prepCount = 0, onOpenPicking, onRefresh, syncing = false, live,
  onExportCsv, onOpenDayClose, unprintedCount = 0, onPrintUnprinted, onHelp, notify,
}) {
  const isMobile = useIsMobile();
  const prep = Math.max(0, Number(prepCount) || 0);
  const unprinted = Math.max(0, Number(unprintedCount) || 0);
  const pickLabel = prep ? `Toplama listesi, ${prep} sipariş` : "Toplama listesi";

  // Telefonda "Yenile" menüye taşınır; veri gerektiren eylemler yükleme bitene kadar kapalıdır
  const menuItems = [
    isMobile && { id: "refresh", label: syncing ? "Yenileniyor…" : "Yenile", icon: RefreshCw, onSelect: () => onRefresh?.(), disabled: loading },
    isMobile && { type: "divider" },
    { id: "dayclose", label: "Gün sonu özeti", icon: Calculator, description: "Ciro, ödemeler ve kasa sayımı", onSelect: () => onOpenDayClose?.(), disabled: loading },
    {
      id: "csv", label: "CSV indir (Excel)", icon: Download,
      description: view === "now" ? "Aktif + bugün tamamlanan siparişler" : "Bu görünümdeki siparişler",
      onSelect: () => onExportCsv?.(), disabled: loading,
    },
    {
      id: "print", label: `Yazdırılmamış fişleri yazdır (${unprinted})`, icon: Printer,
      description: unprinted ? "Hazırlanan ve bu cihazda yazdırılmamış" : "Hazırlananların hepsi yazdırıldı",
      onSelect: () => onPrintUnprinted?.(), disabled: loading || unprinted === 0,
    },
    { type: "divider" },
    notify?.permission === "default" && {
      id: "notify", label: "Tarayıcı bildirimlerini aç", icon: Bell, description: "Yeni sipariş gelince bildirim gösterilir", onSelect: () => notify.onRequest?.(),
    },
    { id: "help", label: "Klavye kısayolları", icon: Keyboard, hint: "?", onSelect: () => onHelp?.() },
  ];

  const actions = (
    <>
      <span className="so-ov-views">
        <Segmented options={VIEWS} value={view} onChange={(v) => onView?.(v)} ariaLabel="Görünüm" size="sm" />
      </span>
      {isMobile ? (
        <button type="button" className="ui-icon-btn so-ov-picking" data-action="picking" onClick={() => onOpenPicking?.()} disabled={loading}
          aria-label={pickLabel} title="Toplama listesi">
          <ClipboardList aria-hidden="true" />
          {prep > 0 && <span className="ui-count so-ov-badge" aria-hidden="true">{prep}</span>}
        </button>
      ) : (
        <button type="button" className="ui-btn so-ov-picking" data-action="picking" onClick={() => onOpenPicking?.()} disabled={loading}
          aria-label={pickLabel} title="Hazırlanan siparişlerin ürünlerini tek listede topla (l)">
          <ClipboardList aria-hidden="true" />
          <span>Toplama listesi</span>
          {prep > 0 && <span className="ui-count" aria-hidden="true">{prep}</span>}
        </button>
      )}
      {!isMobile && (
        <button type="button" className="ui-btn so-ov-refresh" data-action="refresh" onClick={() => onRefresh?.()} disabled={loading}
          aria-busy={syncing ? "true" : undefined} title="Listeyi baştan yükle (r)">
          <RefreshCw className={syncing ? "ui-spin" : undefined} aria-hidden="true" />
          <span>Yenile</span>
        </button>
      )}
      <button type="button" className="ui-icon-btn so-ov-keys" onClick={() => onHelp?.()} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)">
        <Keyboard aria-hidden="true" />
      </button>
      <MenuButton label="Diğer işlemler" iconOnly items={menuItems} buttonClassName="so-ov-more" buttonProps={{ "data-action": "more" }} />
    </>
  );

  return (
    <PageHeader
      className="so-ov-head"
      title="Siparişler"
      description={<LiveStatus loading={loading} live={live} />}
      actions={actions}
    />
  );
}
