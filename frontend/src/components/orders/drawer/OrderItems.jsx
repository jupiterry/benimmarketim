// Detay çekmecesinin "Ürünler" bölümü (C12). Satırlar lineKey ile tanınır.
// - Toplama listesi: yalnızca Hazırlanıyor siparişte satır başına onay kutusu (bu cihazda tutulur).
// - Adet: −/+ iyimser güncellenir; kayıt veri kancasında satır başına gecikmeli yapılır (burada toast yok).
// - Çıkarma: geri alınabilir ("{ad} çıkarıldı · Geri al", veri kancası); tek kalan satır çıkarılamaz.
// - Kilit: Teslim edildi / İptal edildi siparişte salt okunur; "Düzenle" onaydan sonra oturum boyunca açar.
import { useId } from "react";
import { ListChecks, Lock, Minus, Package2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { money } from "../../admin/ui";
import { cloudinaryImage } from "../../../lib/image";

const QTY_MAX = 999;
const LAST_LINE_TITLE = "Siparişte en az bir ürün kalmalı; siparişi iptal edin ya da silin";

function ItemLine({ product, editable, disabled, pickable, picked, single, onTogglePicked, onQuantity, onRemove }) {
  const pickId = useId();
  const qty = Number(product.quantity) || 0;
  const price = Number(product.price) || 0;
  const Name = pickable ? "label" : "span";
  const nameProps = pickable ? { htmlFor: pickId } : {};
  return (
    <li className="so-d-line" data-pickable={pickable ? "true" : undefined} data-picked={picked ? "true" : undefined}>
      {pickable && (
        <label className="so-d-pick" title={picked ? "Toplandı" : "Toplandı olarak işaretle"}>
          <input id={pickId} type="checkbox" className="ui-checkbox" checked={picked} disabled={disabled}
            onChange={() => onTogglePicked?.(product.lineKey)} aria-label={`${product.name} toplandı`} />
        </label>
      )}
      <Name className="ui-thumb so-d-thumb" aria-hidden="true" {...nameProps}>
        {product.image
          ? <img src={cloudinaryImage(product.image, 120)} alt="" loading="lazy" decoding="async" />
          : <Package2 />}
      </Name>
      <Name className="so-d-line-name" {...nameProps}>
        <span className="so-d-line-title">{product.name || "Ürün"}</span>
        {product.isManual && <span className="ui-badge so-d-manual" title="Panelden elle eklenen tutar">Elle eklendi</span>}
      </Name>
      <strong className="so-d-line-total ui-num">{money(price * qty)}</strong>
      <span className="so-d-line-meta">
        <span className="so-d-line-unit ui-num">{money(price)} × {qty}</span>
        {editable && (
          <span className="so-d-line-ctrl">
            <span className="ui-stepper so-d-stepper" role="group" aria-label={`${product.name || "Ürün"} adedi`}>
              <button type="button" aria-label="Adedi azalt" title={qty <= 1 ? "En az 1 adet" : "Adedi azalt"}
                disabled={disabled || qty <= 1} onClick={() => onQuantity?.(product.lineKey, qty - 1)}>
                <Minus aria-hidden="true" />
              </button>
              <span className="ui-num" aria-live="polite" aria-atomic="true">{qty}</span>
              <button type="button" aria-label="Adedi artır" title={qty >= QTY_MAX ? `En çok ${QTY_MAX} adet` : "Adedi artır"}
                disabled={disabled || qty >= QTY_MAX} onClick={() => onQuantity?.(product.lineKey, qty + 1)}>
                <Plus aria-hidden="true" />
              </button>
            </span>
            <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger so-d-remove"
              aria-label={`Ürünü çıkar: ${product.name || "Ürün"}`} title={single ? LAST_LINE_TITLE : "Ürünü çıkar"}
              disabled={disabled || single} onClick={() => onRemove?.(product.lineKey)}>
              <Trash2 aria-hidden="true" />
            </button>
          </span>
        )}
      </span>
    </li>
  );
}

export default function OrderItems({
  order, editable, locked, disabled, statusLabel, pickable, pickedKeys, onTogglePicked, onQuantity, onRemove, onAdd, onUnlock, addRef,
}) {
  const headId = useId();
  const products = order.products || [];
  const total = products.length;
  const done = pickable ? products.filter((p) => pickedKeys?.has(p.lineKey)).length : 0;
  const complete = pickable && total > 0 && done === total;
  const coupon = String(order.couponCode || "").trim();
  const subtotal = Number(order.subtotalAmount) || 0;
  const discount = Number(order.couponDiscount) || 0;

  return (
    <section className="so-d-section so-d-items" aria-labelledby={headId}>
      <div className="so-d-section-head">
        <h3 id={headId} className="so-d-h">
          Ürünler
          <span className="so-d-h-meta">· {order.itemCount ?? total} çeşit, {order.unitCount ?? 0} adet</span>
        </h3>
        <div className="so-d-section-tools">
          {pickable && total > 0 && (
            <span className="so-chip so-d-pick-chip" data-tone={complete ? "ok" : undefined} title="Toplama işaretleri yalnızca bu cihazda tutulur">
              <ListChecks aria-hidden="true" />{done}/{total} toplandı
            </span>
          )}
          {locked ? (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onUnlock} disabled={disabled}
              title="Tamamlanmış siparişin ürünlerini düzenle">
              <Pencil aria-hidden="true" />Düzenle
            </button>
          ) : (
            <button type="button" ref={addRef} className="ui-btn ui-btn--sm" onClick={onAdd} disabled={disabled || !editable}
              title="Siparişe ürün ekle (a)">
              <Plus aria-hidden="true" />Ekle
            </button>
          )}
        </div>
      </div>

      {locked && (
        <p className="so-d-lock">
          <Lock aria-hidden="true" />
          <span>Sipariş {statusLabel}; ürünler kilitli. Değişiklik müşteriye bildirilmez.</span>
        </p>
      )}

      {total > 0 ? (
        <ul className="so-d-lines" aria-label="Sipariş ürünleri">
          {products.map((product) => (
            <ItemLine
              key={product.lineKey}
              product={product}
              editable={editable}
              disabled={disabled}
              pickable={pickable}
              picked={Boolean(pickable && pickedKeys?.has(product.lineKey))}
              single={total <= 1}
              onTogglePicked={onTogglePicked}
              onQuantity={onQuantity}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : (
        <p className="so-d-lines-empty ui-muted">Bu siparişte ürün görünmüyor.</p>
      )}

      <dl className="so-d-totals">
        {coupon && subtotal > 0 && (
          <div>
            <dt>Ara toplam</dt>
            <dd className="ui-num">{money(subtotal)}</dd>
          </div>
        )}
        {coupon && (
          <div className="so-d-coupon">
            <dt><span className="ui-badge ui-badge--brand"><Tag aria-hidden="true" />{coupon}</span></dt>
            <dd className="ui-num">−{money(discount)} indirim</dd>
          </div>
        )}
        <div className="so-d-grand">
          <dt>Toplam</dt>
          <dd className="ui-num">{money(order.totalAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}
