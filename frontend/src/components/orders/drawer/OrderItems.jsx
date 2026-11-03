// Detay çekmecesinin "Ürünler" bölümü (C12). Satırlar lineKey ile tanınır.
// - Toplama listesi: yalnızca Hazırlanıyor siparişte satır başına onay kutusu (bu cihazda tutulur).
// - Adet: −/+ iyimser güncellenir; kayıt veri kancasında satır başına gecikmeli yapılır (burada toast yok).
// - Çıkarma: geri alınabilir ("{ad} çıkarıldı · Geri al", veri kancası); tek kalan satır çıkarılamaz.
// - Kilit: Teslim edildi / İptal edildi siparişte salt okunur; "Düzenle" onaydan sonra oturum boyunca açar.
// - Hazırlanıyor siparişinde her satırın menüsü: "Muadille değiştir" (eksik ürün; aynı adet, tek "Geri al") ve "Çıkar".
//   Kaydedilmeyi bekleyen muadil satırında "… yerine" rozeti çıkar, satır düzenlenemez.
import { useId } from "react";
import { CalendarDays, ListChecks, Lock, Minus, MoreHorizontal, Package2, Pencil, Percent, Plus, Replace, Tag, Trash2, Zap } from "lucide-react";
import { money } from "../../admin/ui";
import { MenuButton } from "../atoms";
import { deliveryFeeLabel, hasDeliveryFeeLine, orderDeliveryFee, orderProductTotal } from "../shared";
import { cloudinaryImage } from "../../../lib/image";

const QTY_MAX = 999;

/** Satırın fiyat etiketi: flaş indirim / haftalık fırsat / ürün indirimi (yalnızca liste fiyatından düşükse) */
function PriceTag({ product }) {
  const original = Number(product.originalPrice);
  const price = Number(product.price) || 0;
  const discounted = Number.isFinite(original) && original - price >= 0.005;
  const guess = product.pricingInferred ? " (kampanya kaydından eşleştirildi)" : "";
  if (product.priceSource === "flash") {
    const pct = Number(product.flashDiscountPercentage);
    return (
      <span className="ui-badge ui-badge--warn so-d-price-tag" title={`Flaş indirimle alındı${discounted ? `: liste fiyatı ${money(original)}` : ""}${guess}`}>
        <Zap aria-hidden="true" />Flaş{pct > 0 ? ` %${pct}` : ""}
      </span>
    );
  }
  if (!discounted) return null;
  if (product.priceSource === "weekly") {
    return <span className="ui-badge ui-badge--info so-d-price-tag" title={`Haftalık fırsat fiyatıyla alındı: liste fiyatı ${money(original)}`}><CalendarDays aria-hidden="true" />Haftalık fırsat</span>;
  }
  if (product.priceSource === "discount") {
    return <span className="ui-badge ui-badge--ok so-d-price-tag" title={`İndirimli fiyatla alındı: liste fiyatı ${money(original)}`}><Percent aria-hidden="true" />İndirimli</span>;
  }
  return null;
}
const LAST_LINE_TITLE = "Siparişte en az bir ürün kalmalı; siparişi iptal edin ya da silin";

function ItemLine({ product, editable, disabled: disabledProp, pickable, picked, single, substitutable, onTogglePicked, onQuantity, onRemove, onSubstitute }) {
  const pickId = useId();
  const qty = Number(product.quantity) || 0;
  const price = Number(product.price) || 0;
  const Name = pickable ? "label" : "span";
  const nameProps = pickable ? { htmlFor: pickId } : {};
  const replacing = product.replacing || null;
  const disabled = disabledProp || Boolean(replacing);
  const label = product.name || "Ürün";
  return (
    <li className="so-d-line" data-line-key={product.lineKey} data-pickable={pickable ? "true" : undefined} data-picked={picked ? "true" : undefined}
      data-replacing={replacing ? "true" : undefined}>
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
        {replacing && (
          <span className="ui-badge ui-badge--info so-d-replacing" title="Muadil birkaç saniye içinde kaydedilecek; bildirimden geri alabilirsiniz">
            <Replace aria-hidden="true" />{replacing.from} yerine
          </span>
        )}
        <PriceTag product={product} />
      </Name>
      <strong className="so-d-line-total ui-num">{money(price * qty)}</strong>
      <span className="so-d-line-meta">
        <span className="so-d-line-unit ui-num">
          {Number(product.unitDiscount) > 0 && <s className="so-d-line-was" title="Liste fiyatı">{money(product.originalPrice)}</s>}
          {money(price)} × {qty}
        </span>
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
            {substitutable ? (
              <MenuButton
                iconOnly
                size="sm"
                icon={MoreHorizontal}
                label={`${label}: ürün işlemleri`}
                menuLabel={label}
                className="so-d-line-menu"
                title="Muadille değiştir ya da çıkar"
                disabled={disabled}
                buttonProps={{ "aria-label": `${label}: muadille değiştir ya da çıkar` }}
                items={[
                  {
                    id: "substitute", label: "Muadille değiştir", icon: Replace,
                    description: product.isManual
                      ? "Elle eklenen tutarın muadili olmaz"
                      : product.lineId ? "Aynı kategoriden öneri; aynı adet" : "Eski satır: çıkarıp muadilini ekleyin",
                    disabled: !product.lineId || Boolean(product.isManual), onSelect: () => onSubstitute?.(product.lineKey),
                  },
                  {
                    id: "remove", label: "Çıkar", icon: Trash2, danger: true, disabled: single,
                    description: single ? LAST_LINE_TITLE : "5 sn içinde geri alabilirsiniz", onSelect: () => onRemove?.(product.lineKey),
                  },
                ]}
              />
            ) : (
              <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger so-d-remove"
                aria-label={`Ürünü çıkar: ${label}`} title={single ? LAST_LINE_TITLE : "Ürünü çıkar"}
                disabled={disabled || single} onClick={() => onRemove?.(product.lineKey)}>
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </span>
    </li>
  );
}

export default function OrderItems({
  order, editable, locked, disabled, statusLabel, pickable, pickedKeys, onTogglePicked, onQuantity, onRemove, onAdd, onUnlock, addRef,
  onSubstitute,
}) {
  const headId = useId();
  const products = order.products || [];
  const total = products.length;
  const done = pickable ? products.filter((p) => pickedKeys?.has(p.lineKey)).length : 0;
  const complete = pickable && total > 0 && done === total;
  const coupon = String(order.couponCode || "").trim();
  const subtotal = Number(order.subtotalAmount) || 0;
  const discount = Number(order.couponDiscount) || 0;
  // Adresli/ücretli siparişte ürün tutarı ve teslimat ücreti ayrı satırda (eski yurt siparişi bugünkü gibi)
  const feeLine = hasDeliveryFeeLine(order);
  const fee = orderDeliveryFee(order);
  // Liste fiyatına göre kampanyalı ürün indirimi (ödenen fiyata zaten dahil; toplamdan ayrıca düşülmez)
  const productDiscount = Number(order.productDiscountTotal) || 0;

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
              substitutable={order.status === "Hazırlanıyor" && editable && typeof onSubstitute === "function"}
              onTogglePicked={onTogglePicked}
              onQuantity={onQuantity}
              onRemove={onRemove}
              onSubstitute={onSubstitute}
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
        {feeLine && (
          <>
            <div className="so-d-subtotal">
              <dt>Ürün tutarı</dt>
              <dd className="ui-num">{money(orderProductTotal(order))}</dd>
            </div>
            <div className="so-d-fee" data-free={fee > 0 ? undefined : "true"}>
              <dt>Teslimat ücreti</dt>
              <dd className="ui-num">{deliveryFeeLabel(order)}</dd>
            </div>
          </>
        )}
        {productDiscount > 0 && (
          <div className="so-d-product-discount">
            <dt title="Flaş indirim, haftalık fırsat ve ürün indirimleri; fiyatlara dahildir">Kampanyalı ürün indirimi</dt>
            <dd className="ui-num">{money(productDiscount)}</dd>
          </div>
        )}
        <div className="so-d-grand">
          <dt>{feeLine ? "Genel toplam" : "Toplam"}</dt>
          <dd className="ui-num">{money(order.totalAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}
