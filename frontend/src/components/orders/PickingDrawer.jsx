// Siparişler — "Toplama listesi" çekmecesi (C14). Ürünler ada göre toplanır (buildPickingList);
// bir ürünü işaretlemek, o ürünün her siparişteki satırlarını tek per-order depoya
// ('admin-order-picked', konteyner onPicked ile yazar) ekler/çıkarır. Böylece kartlardaki
// PickProgress / "Hazır" ve "Hazır olanları yola çıkar" bu işaretlerden beslenir.
// Tek kaydırma alanı: ilerleme çubuğu gövdenin üstüne yapışır, liste ayrı bir kaydırıcı değildir.
// Sözleşme: scratchpad/orders-design/CONTRACTS.md §7.14
import { useEffect, useId, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ClipboardList, Home, MapPin, Package, PackageCheck, Phone, Printer, RotateCcw } from "lucide-react";
import { Drawer, EmptyState, Segmented, money, undoable } from "../admin/ui";
import { buildPickingList, formatPhoneTR, printPickingList } from "../../lib/orderTools";
import { cloudinaryImage } from "../../lib/image";
import { PaymentChip, PickProgress, SrOnly } from "./atoms";
import { orderCodeTitle, pickProgress, telHref } from "./shared";
import "../../styles/orders-tools.css";

const POPUP_BLOCKED = "Yazdırma penceresi açılamadı. Tarayıcıda bu site için açılır pencerelere izin verin.";

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
// İlk odak: ilk toplama kutusu (boş listede çekmecenin Kapat düğmesi)
const FOCUS_ORDER = ["input[type=checkbox]", "button"];

/** Ürün görseli; yoksa ya da yüklenemezse nötr simge */
const Thumb = ({ src }) => {
  const [failed, setFailed] = useState(null);
  const url = src && failed !== src ? cloudinaryImage(src, 80) : null;
  return (
    <span className="so-t-thumb" aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} /> : <Package />}
    </span>
  );
};

/** Yerel (indeterminate destekli) onay kutusu */
const PickBox = ({ checked, partial, onChange, describedBy }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(partial) && !checked;
  }, [partial, checked]);
  return (
    <input ref={ref} type="checkbox" className="ui-checkbox so-t-pick-check" checked={checked} onChange={onChange}
      aria-describedby={describedBy} />
  );
};

export default function PickingDrawer({ orders = [], scope, scopes = [], onScope, onClose, picked, onPicked }) {
  const uid = useId();
  const bodyRef = useRef(null);
  const picking = useMemo(() => buildPickingList(orders), [orders]);
  const byId = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);
  const hasAddress = useMemo(() => picking.points.some((point) => point.orders.some((entry) => entry.address)), [picking]);
  const pickedMap = picked instanceof Map ? picked : new Map();
  useDrawerFocus(bodyRef, FOCUS_ORDER);

  const keysOf = (orderId) => new Set(pickedMap.get(orderId)?.keys || []);

  // Her ürün için: tüm siparişlerdeki satırları işaretli mi, bir kısmı mı
  const rows = picking.items.map((item) => {
    let doneRefs = 0;
    let anyKey = false;
    for (const ref of item.orders) {
      const keys = keysOf(ref.orderId);
      const hits = ref.lineKeys.filter((k) => keys.has(k)).length;
      if (hits === ref.lineKeys.length) doneRefs += 1;
      if (hits) anyKey = true;
    }
    const done = item.orders.length > 0 && doneRefs === item.orders.length;
    return { item, done, partial: !done && anyKey, doneRefs };
  });
  const doneCount = rows.filter((r) => r.done).length;
  const total = rows.length;
  const readyCount = orders.filter((o) => {
    const keys = keysOf(o.orderId);
    return o.products?.length > 0 && o.products.every((p) => keys.has(p.lineKey));
  }).length;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;

  const toggleItem = (row) => {
    const tick = !row.done;
    for (const ref of row.item.orders) {
      const order = byId.get(ref.orderId);
      const current = pickedMap.get(ref.orderId)?.keys || [];
      const next = tick
        ? [...new Set([...current, ...ref.lineKeys])]
        : current.filter((k) => !ref.lineKeys.includes(k));
      onPicked?.(ref.orderId, next, order?.products?.length || 0);
    }
  };

  const resetAll = () => {
    const before = orders
      .map((o) => [o.orderId, pickedMap.get(o.orderId)?.keys || [], o.products?.length || 0])
      .filter(([, keys]) => keys.length);
    if (!before.length) return;
    for (const [id, , count] of before) onPicked?.(id, [], count);
    undoable({
      message: "Toplama işaretleri temizlendi",
      commit: () => {},
      undo: () => { for (const [id, keys, count] of before) onPicked?.(id, keys, count); },
    });
  };

  const print = () => {
    if (!picking.items.length) return;
    try {
      if (!printPickingList(picking)) toast.error(POPUP_BLOCKED);
    } catch (e) {
      console.error("Toplama listesi yazdırılamadı:", e);
      toast.error("Yazdırma sırasında hata oluştu");
    }
  };

  const showScopes = scopes.length > 1;
  const scopeLabel = scopes.find((s) => s.value === scope)?.label;
  const empty = picking.items.length === 0;

  return (
    <Drawer
      title="Toplama listesi"
      subtitle={`${picking.orderCount} sipariş · ${picking.items.length} çeşit · ${picking.unitCount} adet`}
      icon={ClipboardList}
      width={500}
      onClose={onClose}
      className="so-t-drawer so-t-pick"
      bodyClassName="so-t-body"
      tabs={showScopes ? (
        <div className="so-t-scope">
          <Segmented
            options={scopes.map((s) => ({ value: s.value, label: s.label, count: s.count }))}
            value={scope}
            onChange={(v) => onScope?.(v)}
            ariaLabel="Toplama kapsamı"
          />
        </div>
      ) : null}
      footer={(
        <>
          <button type="button" className="ui-btn so-t-foot-secondary" onClick={() => onClose?.()}>Kapat</button>
          <button type="button" className="ui-btn ui-btn--primary so-t-foot-primary" onClick={print} disabled={empty}>
            <Printer aria-hidden="true" />Yazdır
          </button>
        </>
      )}
    >
      <div className="so-t-stack so-t-stack--tight" ref={bodyRef}>
        {empty ? (
          <EmptyState
            icon={CheckCircle2}
            title="Toplanacak ürün yok"
            description={scope === "preparing" || !scope
              ? "Hazırlanıyor durumunda sipariş bulunmuyor."
              : `${scopeLabel || "Bu kapsam"} için toplanacak ürün bulunmuyor.`}
          />
        ) : (
          <>
            <div className="so-t-progress" data-complete={doneCount === total ? "true" : undefined}>
              <div className="so-t-progress-top">
                <strong className="ui-num" aria-live="polite">
                  {doneCount === total ? <PackageCheck aria-hidden="true" /> : null}
                  {doneCount}/{total} toplandı
                </strong>
                <span className="so-t-progress-meta ui-num">{readyCount}/{orders.length} sipariş hazır</span>
                {doneCount > 0 && (
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost so-t-progress-reset" onClick={resetAll}
                    title="Bu listedeki siparişlerin toplama işaretlerini kaldır">
                    <RotateCcw aria-hidden="true" />Temizle
                  </button>
                )}
              </div>
              <div className="ui-progress" aria-hidden="true"><div style={{ width: `${percent}%` }} /></div>
            </div>

            <ul className="so-t-pick-list" aria-label="Toplanacak ürünler">
              {rows.map((row, index) => {
                const { item } = row;
                const refsId = `${uid}-ref-${index}`;
                return (
                  <li key={item.key} className="so-t-pick-row" data-done={row.done ? "true" : undefined} data-partial={row.partial ? "true" : undefined}>
                    <label className="so-t-pick-label">
                      <PickBox checked={row.done} partial={row.partial} onChange={() => toggleItem(row)} describedBy={refsId} />
                      <Thumb src={item.image} />
                      <b className="so-t-pick-qty ui-num">{item.quantity}×</b>
                      <span className="so-t-pick-text">
                        <span className="so-t-pick-name">{item.name}</span>
                        <small className="so-t-pick-refs ui-num" id={refsId}>
                          {item.orders.map((ref) => `#${ref.shortId}${ref.quantity > 1 ? ` ×${ref.quantity}` : ""}`).join(" · ")}
                          {row.partial && <span className="so-t-pick-partial"> · {row.doneRefs}/{item.orders.length} siparişte toplandı</span>}
                        </small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <section className="so-t-sec" aria-labelledby={`${uid}-points`}>
              <h3 className="so-t-h" id={`${uid}-points`}><MapPin aria-hidden="true" />{hasAddress ? "Teslimat bölgeleri ve adresler" : "Teslimat noktaları"}</h3>
              <div className="so-t-points">
                {picking.points.map((point) => (
                  <div key={point.name} className="so-t-point">
                    <div className="so-t-point-head">
                      <strong className="ui-truncate">{point.name}</strong>
                      <span className="ui-num">{point.orders.length} sipariş · {money(point.total)}</span>
                    </div>
                    <ul className="so-t-point-list">
                      {point.orders.map((entry) => {
                        const order = byId.get(entry.orderId);
                        const tel = order ? telHref(order) : null;
                        const phone = formatPhoneTR(entry.phone);
                        const progress = order ? pickProgress(order, pickedMap.get(entry.orderId)) : null;
                        return (
                          <li key={entry.orderId} className="so-t-point-row" data-addr={entry.address ? "true" : undefined}>
                            <span className="so-code" title={orderCodeTitle(entry.orderId)}>#{entry.shortId}</span>
                            <span className="so-t-point-name ui-truncate">{entry.customer}</span>
                            {phone && tel ? (
                              <a className="so-t-point-phone ui-num" href={tel} aria-label={`${entry.customer} ara: ${phone}`}>
                                <Phone aria-hidden="true" />{phone}
                              </a>
                            ) : (
                              <span className="so-t-point-phone ui-num" data-empty="true">{phone || "Telefon yok"}</span>
                            )}
                            <span className="so-t-point-tags">
                              {order && <PaymentChip order={order} amount={order.paymentMethod === "cash"} />}
                              <PickProgress info={progress} />
                            </span>
                            {entry.address && (
                              <span className="so-t-point-addr" title={entry.directions ? `Tarif: ${entry.directions}` : undefined}>
                                <Home aria-hidden="true" />
                                <span>{entry.address}{entry.directions ? ` · ${entry.directions}` : ""}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
            <SrOnly>İşaretler bu cihazda saklanır ve sipariş kartlarındaki toplama ilerlemesini günceller.</SrOnly>
          </>
        )}
      </div>
    </Drawer>
  );
}
