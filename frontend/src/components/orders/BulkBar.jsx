// Seçili siparişler için yapışkan toplu işlem çubuğu (tüm görünümlerde, içeriğin üstünde).
// Masaüstü: "{n} seçili" · Yola çıkar (k) · Teslim et (m) · Fişleri yazdır · Toplama listesi · "Diğer durum" menüsü
// (4 durumun hepsi, etkilenen sayılarıyla — eski "Diğer durum…" seçicisinin karşılığı) · Seçimi bırak.
// ≤760 px: alt sekme çubuğunun üstünde sabit; sayı, iki ana düğme ve ⋯ (yazdır, toplama, durumlar, seçimi bırak).
// Sözleşme: CONTRACTS.md §7.8. Stil: styles/orders-list.css (önek so-bulk-).
import { useRef } from "react";
import { AlertTriangle, Bike, CheckCircle2, Eye, EyeOff, ListChecks, Printer, Shuffle, Truck, UserMinus, Users, X } from "lucide-react";
import { useIsMobile } from "../admin/ui";
import { MenuButton, SrOnly } from "./atoms";
import { BULK_MAX, ORDER_STATUSES, STATUS, moveLabel } from "./shared";
import "../../styles/orders-list.css";

const PREP = "Hazırlanıyor";
const ROAD = "Yolda";
const DELIVERED = "Teslim Edildi";
const CANCELLED = "İptal Edildi";
// Menü sırası (sözleşme): Yola çıkar · Teslim edildi olarak işaretle · Hazırlanıyor’a geri al · İptal et
const MENU_TARGETS = [ROAD, DELIVERED, PREP, CANCELLED];

const countByStatus = (orders) => {
  const out = {};
  for (const o of orders) out[o.status] = (out[o.status] || 0) + 1;
  return out;
};

/** "Hazırlanıyor: 5 · Teslim edildi: 2" — hedef durumda olmayanların dağılımı */
const breakdown = (by, target) => ORDER_STATUSES
  .filter((s) => s !== target && by[s])
  .map((s) => `${STATUS[s].label}: ${by[s]}`)
  .join(" · ");

/** Çubuk kapanınca odak kaybolmasın: imleçteki öğe → liste başlığındaki seçim kutusu → ilk öğe */
const focusTargetIn = (root) =>
  root?.querySelector('.so-item[data-cursor="true"] .so-open')
  || root?.querySelector(".so-l-head .so-check input")
  || root?.querySelector(".so-item .so-open")
  || null;

/**
 * Props (CONTRACTS §7.8): orders (tüm seçililer, filtre dışındakiler dahil), hiddenCount, max (100),
 * onAdvance(to: 'Yolda'|'Teslim Edildi'), onSetStatus(to), onPrint(), onPicking(), onKeepVisible(), onClear().
 */
export default function BulkBar({
  orders = [], hiddenCount = 0, max = BULK_MAX, onAdvance, onSetStatus, onPrint, onPicking, onKeepVisible, onClear,
  couriers = [], onAssignCourier,
}) {
  const isMobile = useIsMobile();
  const rootRef = useRef(null);
  const clearRef = useRef(null);
  const n = orders.length;
  if (!n) return null;

  const by = countByStatus(orders);
  const k = by[PREP] || 0;
  const m = by[ROAD] || 0;
  const over = n > max;
  const hidden = Math.max(0, Number(hiddenCount) || 0);

  const clear = () => {
    const target = focusTargetIn(rootRef.current?.closest(".so"));
    onClear?.();
    if (target) requestAnimationFrame(() => { if (target.isConnected) target.focus({ preventScroll: true }); });
  };
  const keepVisible = () => {
    onKeepVisible?.();
    // "Yalnız görünenler" düğmesi kaybolur; odak "Seçimi bırak"a geçer (mobilde menü düğmesine döner)
    requestAnimationFrame(() => clearRef.current?.focus({ preventScroll: true }));
  };

  const statusItems = MENU_TARGETS.map((to) => {
    const affected = n - (by[to] || 0);
    return {
      id: `status-${to}`,
      label: `${moveLabel(to, to === ROAD ? PREP : undefined)} (${affected})`,
      icon: STATUS[to].icon,
      danger: to === CANCELLED,
      disabled: over || affected === 0,
      description: affected === 0 ? "Seçililerin hepsi zaten bu durumda" : breakdown(by, to),
      onSelect: () => onSetStatus?.(to),
    };
  });
  const statusMenu = [
    { type: "label", label: over ? `En fazla ${max} sipariş için durum değiştirilebilir` : "Seçililerin tümüne uygula" },
    ...statusItems.slice(0, 3),
    { type: "divider" },
    statusItems[3],
  ];

  // Kuryeye ata: aktif kuryeler (her birinde zaten o kuryede olan seçili sayısı) + atamayı kaldır
  const assigned = orders.filter((o) => o.courier?.id).length;
  const courierItems = onAssignCourier ? [
    { type: "label", label: couriers.length ? "Seçililerin tümünü ata" : "Kurye yok — Teslimat bölgeleri ekranından ekleyin" },
    ...couriers.map((c) => {
      const already = orders.filter((o) => String(o.courier?.id || "") === c._id).length;
      return {
        id: `courier-${c._id}`, label: c.name, icon: Bike, disabled: over || already === n,
        description: already ? `${already} sipariş zaten bu kuryede` : undefined,
        onSelect: () => onAssignCourier(c),
      };
    }),
    { type: "divider" },
    { id: "courier-none", label: `Kurye atamasını kaldır (${assigned})`, icon: UserMinus, disabled: over || assigned === 0, onSelect: () => onAssignCourier(null) },
  ] : [];

  const wayTitle = k ? `Hazırlanıyor durumundaki ${k} seçili siparişi yola çıkar` : "Seçimde Hazırlanıyor durumunda sipariş yok";
  const doneTitle = m ? `Yolda olan ${m} seçili siparişi teslim et` : "Seçimde Yolda durumunda sipariş yok";
  const hiddenTitle = "Bu siparişler şu anki filtre ya da görünümde görünmüyor; toplu işlemler onları da kapsar";

  const wayButton = (
    <button type="button" className="ui-btn ui-btn--sm so-bulk-btn" data-kind="way" disabled={over || !k}
      onClick={() => onAdvance?.(ROAD)} title={wayTitle}>
      <Truck aria-hidden="true" /><span className="so-bulk-btn-label">Yola çıkar</span><span className="so-bulk-n">({k})</span>
    </button>
  );
  const doneButton = (
    <button type="button" className="ui-btn ui-btn--sm so-bulk-btn" data-kind="done" disabled={over || !m}
      onClick={() => onAdvance?.(DELIVERED)} title={doneTitle}>
      <CheckCircle2 aria-hidden="true" /><span className="so-bulk-btn-label">Teslim et</span><span className="so-bulk-n">({m})</span>
    </button>
  );

  // ── Mobil: tek satır, sabit ──
  if (isMobile) {
    const moreItems = [
      hidden > 0 && { type: "label", label: `${hidden} sipariş filtre dışında` },
      hidden > 0 && { id: "keep", label: "Yalnız görünenler", icon: Eye, onSelect: () => onKeepVisible?.() },
      hidden > 0 && { type: "divider" },
      { id: "print", label: "Fişleri yazdır", icon: Printer, onSelect: () => onPrint?.() },
      { id: "picking", label: "Toplama listesi", icon: ListChecks, onSelect: () => onPicking?.() },
      ...(courierItems.length ? [{ type: "divider" }, ...courierItems.map((item) => (item.type === "label" ? { ...item, label: "Kuryeye ata" } : item))] : []),
      { type: "divider" },
      ...statusMenu,
      { type: "divider" },
      { id: "clear", label: "Seçimi bırak", icon: X, onSelect: clear },
    ];
    return (
      <section ref={rootRef} className="ui-bulkbar so-bulk" data-mobile="true" data-hidden={hidden ? "true" : undefined}
        aria-label="Seçili siparişler için toplu işlemler">
        <span className="so-bulk-count" title={hidden ? hiddenTitle : undefined} aria-live="polite">
          <strong className="ui-num" aria-hidden="true">{n}</strong>
          <small aria-hidden="true">{hidden ? `${hidden} gizli` : "seçili"}</small>
          <SrOnly>{hidden ? `${n} sipariş seçili, ${hidden} tanesi filtre dışında` : `${n} sipariş seçili`}</SrOnly>
        </span>
        {wayButton}
        {doneButton}
        <MenuButton
          iconOnly
          label="Diğer toplu işlemler"
          items={moreItems}
          placement="top"
          align="end"
          className="so-bulk-more"
          menuLabel="Toplu işlemler"
        />
      </section>
    );
  }

  // ── Masaüstü / tablet: yapışkan, sarabilen satır ──
  return (
    <section ref={rootRef} className="ui-bulkbar so-bulk" data-over={over ? "true" : undefined}
      data-hidden={hidden ? "true" : undefined} aria-label="Seçili siparişler için toplu işlemler">
      <div className="so-bulk-info">
        <span className="ui-bulkbar-count so-bulk-total" aria-live="polite">
          <Users aria-hidden="true" />{n} seçili
        </span>
        {hidden > 0 && (
          <>
            <span className="ui-badge ui-badge--warn so-bulk-hidden" title={hiddenTitle}>
              <EyeOff aria-hidden="true" />{hidden} sipariş filtre dışında
            </span>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost so-bulk-keep" onClick={keepVisible}
              title="Görünmeyen siparişleri seçimden çıkar">
              <Eye aria-hidden="true" />Yalnız görünenler
            </button>
          </>
        )}
        {over && (
          <span className="ui-badge ui-badge--danger so-bulk-over" role="alert">
            <AlertTriangle aria-hidden="true" />En fazla {max} sipariş
          </span>
        )}
      </div>

      <div className="so-bulk-actions">
        {wayButton}
        {doneButton}
        <span className="so-bulk-sep" aria-hidden="true" />
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => onPrint?.()} title="Seçili siparişlerin fişlerini tek seferde yazdır (en eskiden yeniye)">
          <Printer aria-hidden="true" />Fişleri yazdır
        </button>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => onPicking?.()} title="Seçili siparişlerin ürünlerini topla">
          <ListChecks aria-hidden="true" />Toplama listesi
        </button>
        {courierItems.length > 0 && (
          <MenuButton
            label="Kuryeye ata"
            icon={Bike}
            caret
            size="sm"
            items={courierItems}
            align="start"
            className="so-bulk-courier"
            menuLabel="Seçili siparişleri kuryeye ata"
            title="Seçili siparişleri bir kuryeye ata"
          />
        )}
        <MenuButton
          label="Diğer durum"
          icon={Shuffle}
          caret
          size="sm"
          items={statusMenu}
          align="start"
          className="so-bulk-status"
          menuLabel="Seçili siparişlerin durumunu değiştir"
          title="Seçili siparişlerin tümünü başka bir duruma al"
        />
      </div>

      <button ref={clearRef} type="button" className="ui-btn ui-btn--sm ui-btn--ghost so-bulk-clear" onClick={clear}
        aria-label="Seçimi bırak" title="Seçimi bırak (Esc)">
        <X aria-hidden="true" /><span className="so-bulk-clear-label">Seçimi bırak</span>
      </button>
    </section>
  );
}
