// Siparişler — "Gün sonu" çekmecesi (C16). "Bugün" = İŞ GÜNÜ: İstanbul saatiyle 05:00'ten ertesi gün 05:00'e
// (mağaza 10:00 – 01:00 açık; gece 01:20'de kapanış yapılınca dünkü vardiyanın tamamı görünür). Sayılar ve ciro
// bu aralıkta verilen siparişlerden; kasa sayımı son "Teslim Edildi" kaydı bu aralıkta olan nakit siparişlerden
// hesaplanır (gece yarısını geçen teslimat aynı vardiyaya yazılır). Sayılan nakit yalnızca bu ekranda tutulur, kaydedilmez.
// Sözleşme: scratchpad/orders-design/CONTRACTS.md §7.15
import { useEffect, useId, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle, Banknote, Bike, Calculator, ChevronDown, ChevronRight, CreditCard, Download, Home, Landmark, MapPin, Printer, Timer, Wallet,
} from "lucide-react";
import { Drawer, EmptyState, formatTime, money } from "../admin/ui";
import { buildDayCloseSummary, printDayClose } from "../../lib/orderTools";
import { OrderCode, SlaChip, StatusBadge } from "./atoms";
import { HOUR, TZ, customerName, formatMinutes, parseAmount, startOfDay } from "./shared";
import "../../styles/orders-tools.css";

const POPUP_BLOCKED = "Yazdırma penceresi açılamadı. Tarayıcıda bu site için açılır pencerelere izin verin.";
const OPEN_PREVIEW = 5;
const PAYMENT_ICONS = { cash: Banknote, card: CreditCard, bank_transfer: Landmark, none: Wallet };
// İş günü sınırı: mağaza 01:00 – 10:00 arası sipariş almaz; 05:00'ten önce açılan gün sonu önceki vardiyayı gösterir
const BUSINESS_DAY_CUTOFF = 5 * HOUR;
/** İş gününün başlangıcı (İstanbul 05:00) */
const businessDayStart = (now) => startOfDay(now - BUSINESS_DAY_CUTOFF) + BUSINESS_DAY_CUTOFF;

// Çekmece açılınca odak, sıradaki seçicilerden ilk eşleşene (hiçbiri yoksa çekmecenin Kapat düğmesine)
// gider; kapanınca odak kaybolduysa çekmeceyi açan düğmeye döner
const useDrawerFocus = (ref, selectors) => {
  useEffect(() => {
    const opener = document.activeElement;
    const root = ref.current;
    const target = root
      && (selectors.map((selector) => root.querySelector(selector)).find(Boolean)
        || root.closest(".ui-drawer")?.querySelector(".ui-drawer-head button"));
    target?.focus({ preventScroll: true });
    return () => {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && opener?.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [ref, selectors]);
};
// İlk odak: ilk açık sipariş ya da kasa sayımı alanı
const FOCUS_ORDER = ["button, input"];

const signedMoney = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (n === 0) return money(0);
  return `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
};
const minutesText = (m) => (m === null || m === undefined ? "—" : formatMinutes(m));

/** Pay çubuklu satır listesi (ödeme / teslimat noktası) */
const ShareRows = ({ rows, total, label }) => (
  <ul className="so-t-rows" aria-label={label}>
    {rows.map((row) => {
      const share = total > 0 ? Math.round((row.total / total) * 100) : 0;
      const Icon = row.icon;
      return (
        <li key={row.key} className="so-t-row" data-empty={row.count ? undefined : "true"}>
          <span className="so-t-row-label">
            {Icon && <Icon aria-hidden="true" />}
            <span className="ui-truncate">{row.label}</span>
          </span>
          <span className="so-t-row-count ui-num">{row.count} sipariş</span>
          <span className="so-t-row-total ui-num">{money(row.total)}</span>
          <span className="so-t-row-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
        </li>
      );
    })}
  </ul>
);

export default function DayCloseDrawer({ orders = [], now = Date.now(), onClose, onOpenOrder, onExportCsv }) {
  const uid = useId();
  const bodyRef = useRef(null);
  const [counted, setCounted] = useState("");
  const [showAllOpen, setShowAllOpen] = useState(false);
  const dayStart = businessDayStart(now);
  const summary = useMemo(() => buildDayCloseSummary(orders, now, { dayStart }), [orders, now, dayStart]);
  useDrawerFocus(bodyRef, FOCUS_ORDER);

  // Başlıkta iş gününün tarihi; gece yarısından sonra açıldıysa saat "ertesi gün" olarak yazılır
  const weekday = new Date(dayStart).toLocaleDateString("tr-TR", { timeZone: TZ, weekday: "long" });
  const date = new Date(dayStart).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
  const nextDay = startOfDay(now) > startOfDay(dayStart);
  const subtitle = `${weekday}, ${date} · ${nextDay ? "ertesi gün " : ""}${formatTime(now)} itibarıyla`;

  const s = summary;
  const nothing = s.count === 0 && s.open.length === 0 && s.deliveredToday === 0;
  const countedAmount = parseAmount(counted);
  const countedValid = countedAmount !== null && countedAmount >= 0;
  const countedInvalid = counted.trim() !== "" && !countedValid;
  const diff = countedValid ? Math.round((countedAmount - s.deliveredCash) * 100) / 100 : null;
  const openShown = showAllOpen ? s.open : s.open.slice(0, OPEN_PREVIEW);

  const paymentRows = s.byPayment
    .filter((row) => row.method !== "none" || row.count > 0)
    .map((row) => ({ key: row.method, label: row.label, count: row.count, total: row.total, icon: PAYMENT_ICONS[row.method] }));
  // Teslimat ücreti yalnızca adresli/ücretli sipariş varken ayrı gösterilir (yalnızca yurt siparişli gün bugünkü gibi)
  const hasFees = Number(s.deliveryFeeTotal) > 0 || Number(s.addressCount) > 0;
  const DORM_NAMES = new Set(["Kız KYK Yurdu", "Erkek KYK Yurdu"]);
  const pointRows = s.byPoint.map((row) => ({
    key: row.name, label: row.name, count: row.count, total: row.total, icon: hasFees && !DORM_NAMES.has(row.name) ? Home : MapPin,
  }));

  const print = () => {
    try {
      if (!printDayClose(s, { counted: countedValid ? countedAmount : null })) toast.error(POPUP_BLOCKED);
    } catch (e) {
      console.error("Gün sonu yazdırılamadı:", e);
      toast.error("Yazdırma sırasında hata oluştu");
    }
  };

  const footer = (
    <>
      <button type="button" className="ui-btn so-t-foot-secondary" onClick={() => onExportCsv?.(s.todayOrders, { dayStart: s.dayStart })}
        disabled={!s.count}
        title={s.count ? "Bu iş gününde (05:00'ten beri) verilen siparişleri CSV olarak indir" : "Bu iş gününde verilen sipariş yok"}>
        <Download aria-hidden="true" />Bugünün CSV’si
      </button>
      <button type="button" className="ui-btn ui-btn--primary so-t-foot-primary" onClick={print} disabled={nothing}>
        <Printer aria-hidden="true" />Yazdır
      </button>
    </>
  );

  return (
    <Drawer
      title="Gün sonu"
      subtitle={subtitle}
      icon={Calculator}
      width={500}
      onClose={onClose}
      className="so-t-drawer so-t-day"
      bodyClassName="so-t-body"
      footer={footer}
    >
      <div className="so-t-stack" ref={bodyRef}>
        {nothing ? (
          <EmptyState
            icon={Calculator}
            title="Bugün henüz sipariş yok"
            description="Gün içinde gelen siparişlerin cirosu, ödeme dağılımı ve kasa sayımı burada görünür."
          />
        ) : (
          <>
            {s.open.length > 0 && (
              <section className="so-t-open" aria-labelledby={`${uid}-open`}>
                <div className="ui-banner ui-banner--warn so-banner so-t-open-banner">
                  <AlertTriangle aria-hidden="true" />
                  <span className="so-banner-text" id={`${uid}-open`}>
                    <strong>Hâlâ açık {s.open.length} sipariş:</strong> {s.openPrep} hazırlanıyor, {s.openRoad} yolda
                  </span>
                </div>
                <ul className="so-t-open-list">
                  {openShown.map((order) => (
                    <li key={order.orderId}>
                      <button type="button" className="so-t-open-row" onClick={() => onOpenOrder?.(order)}
                        aria-label={`${customerName(order)}, ${order.status} — siparişi aç`}>
                        <StatusBadge status={order.status} />
                        <OrderCode order={order} />
                        <span className="so-t-open-name ui-truncate">{customerName(order)}</span>
                        <SlaChip order={order} now={now} />
                        <ChevronRight className="so-t-open-go" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                {s.open.length > OPEN_PREVIEW && (
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost so-t-open-more" aria-expanded={showAllOpen}
                    onClick={() => setShowAllOpen((v) => !v)}>
                    {showAllOpen ? "Daha az göster" : `Tümünü göster (${s.open.length})`}
                    <ChevronDown className="so-t-open-more-icon" data-open={showAllOpen} aria-hidden="true" />
                  </button>
                )}
              </section>
            )}

            {s.count === 0 ? (
              <EmptyState compact icon={Calculator} title="Bugün henüz sipariş yok"
                description="Açık siparişler ve bugün teslim edilenlerin kasası aşağıda." />
            ) : (
              <>
                <div className="so-t-hero" title={hasFees ? "Ürün tutarı; teslimat ücreti ayrı · iptaller hariç" : "İptal edilen siparişler hariç"}>
                  <span className="so-t-hero-label">{hasFees ? "Bugünkü ciro (ürün)" : "Bugünkü ciro"}</span>
                  <strong className="so-t-hero-value ui-num">{money(s.revenue)}</strong>
                  <span className="so-t-hero-note ui-num">
                    {s.valid} geçerli sipariş{s.pendingToday > 0 ? ` · ${s.pendingToday} henüz tamamlanmadı` : ""} · iptaller hariç
                  </span>
                  {hasFees && (
                    <span className="so-t-hero-fee ui-num">
                      <Bike aria-hidden="true" />
                      <span>Teslimat ücreti <strong>{money(s.deliveryFeeTotal)}</strong></span>
                      <span className="so-t-hero-fee-meta">
                        {s.paidDeliveryCount} ücretli{s.freeAddressCount ? ` · ${s.freeAddressCount} ücretsiz` : ""} · toplam tahsilat {money(s.grossTotal)}
                      </span>
                    </span>
                  )}
                </div>

                <section className="so-t-sec" aria-labelledby={`${uid}-today`}>
                  <h3 className="so-t-h" id={`${uid}-today`}>Bugün verilen siparişler</h3>
                  <dl className="so-t-stats">
                    <div><dt>Sipariş</dt><dd className="ui-num">{s.count}</dd></div>
                    <div><dt>Teslim edildi</dt><dd className="ui-num">{s.delivered}</dd></div>
                    <div data-tone={s.cancelled ? "danger" : undefined}>
                      <dt>İptal</dt>
                      <dd className="ui-num">{s.cancelled}{s.cancelled > 0 && <small>{money(s.cancelledTotal)}</small>}</dd>
                    </div>
                    <div><dt>Ort. sepet</dt><dd className="ui-num">{money(s.avgBasket)}</dd></div>
                    <div><dt>Kupon indirimi</dt><dd className="ui-num">{s.couponTotal ? `−${money(s.couponTotal)}` : money(0)}</dd></div>
                    <div><dt>Elle eklenen tutar</dt><dd className="ui-num">{money(s.manualTotal)}</dd></div>
                  </dl>
                </section>

                <section className="so-t-sec" aria-labelledby={`${uid}-pay`}>
                  <h3 className="so-t-h" id={`${uid}-pay`}>Ödeme yöntemine göre</h3>
                  <ShareRows rows={paymentRows} total={hasFees ? s.grossTotal : s.revenue}
                    label={hasFees ? "Ödeme yöntemine göre tahsilat (teslimat ücreti dahil)" : "Ödeme yöntemine göre ciro"} />
                  {hasFees && <p className="ui-hint so-t-hint">Tutarlar müşterinin ödediği toplamdır (teslimat ücreti dahil).</p>}
                </section>

                {pointRows.length > 0 && (
                  <section className="so-t-sec" aria-labelledby={`${uid}-point`}>
                    <h3 className="so-t-h" id={`${uid}-point`}>{hasFees ? "Bölgeye göre" : "Teslimat noktasına göre"}</h3>
                    <ShareRows rows={pointRows} total={s.revenue} label={hasFees ? "Bölgeye göre ürün cirosu" : "Teslimat noktasına göre ciro"} />
                  </section>
                )}

                <section className="so-t-sec" aria-labelledby={`${uid}-time`}>
                  <h3 className="so-t-h" id={`${uid}-time`}><Timer aria-hidden="true" />Süreler</h3>
                  <dl className="so-t-stats so-t-stats--3">
                    <div><dt>Ort. hazırlık</dt><dd className="ui-num">{minutesText(s.avgPrep)}</dd></div>
                    <div><dt>Ort. yol</dt><dd className="ui-num">{minutesText(s.avgRoad)}</dd></div>
                    <div><dt>Ort. toplam</dt><dd className="ui-num">{minutesText(s.avgTotal)}</dd></div>
                  </dl>
                  <p className="ui-hint so-t-hint">Hazırlık: sipariş → yola çıkış · Yol: yola çıkış → teslim · Bugün verilen siparişlerden.</p>
                </section>
              </>
            )}

            <section className="so-t-sec so-t-cash" aria-labelledby={`${uid}-cash`}>
              <h3 className="so-t-h" id={`${uid}-cash`}><Banknote aria-hidden="true" />Kasa sayımı</h3>
              <div className="so-t-cash-box">
                <div className="so-t-cash-expected">
                  <span>Beklenen nakit</span>
                  <strong className="ui-num">{money(s.deliveredCash)}</strong>
                  <small className="ui-num">Bugün teslim edilen {s.deliveredCashCount} nakit sipariş (teslim saatine göre)</small>
                </div>
                <div className="so-t-field">
                  <label className="ui-label" htmlFor={`${uid}-counted`}>Sayılan nakit (₺)</label>
                  <input id={`${uid}-counted`} className="ui-field so-t-cash-input ui-num" type="text" inputMode="decimal" autoComplete="off"
                    placeholder="0,00" value={counted} onChange={(e) => setCounted(e.target.value)}
                    aria-invalid={countedInvalid ? "true" : undefined} aria-describedby={`${uid}-diff`} />
                </div>
                <p className="so-t-cash-diff ui-num" id={`${uid}-diff`} role="status"
                  data-tone={countedInvalid ? "warn" : diff === null ? undefined : diff === 0 ? "ok" : diff > 0 ? "ok" : "danger"}>
                  {countedInvalid
                    ? "Geçerli bir tutar girin (örn. 1.250 ya da 1.250,50)."
                    : diff === null
                      ? "Kasadaki nakdi sayıp girin; fark burada hesaplanır."
                      : diff === 0
                        ? "Kasa tutuyor · fark yok"
                        : `Fark: ${signedMoney(diff)}${diff > 0 ? " (fazla)" : " (eksik)"}`}
                </p>
              </div>
              <ul className="so-t-cash-more">
                <li><CreditCard aria-hidden="true" /><span>POS ile tahsil</span><span className="ui-num">{s.deliveredCardCount} işlem · {money(s.deliveredCard)}</span></li>
                <li><Landmark aria-hidden="true" /><span>Havale / EFT</span><span className="ui-num">{s.deliveredTransferCount} sipariş · {money(s.deliveredTransfer)}</span></li>
                {s.openCashCount > 0 && (
                  <li data-tone="info"><Banknote aria-hidden="true" /><span>Yoldaki nakit</span><span className="ui-num">{s.openCashCount} sipariş · {money(s.openCash)}</span></li>
                )}
              </ul>
              <p className="ui-hint so-t-hint">Sayım kaydedilmez; yalnızca bu ekranda hesaplanır ve yazdırılan rapora eklenir.</p>
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
