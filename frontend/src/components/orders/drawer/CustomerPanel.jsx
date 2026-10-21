// Detay çekmecesinin "Müşteri" bölümü (C19). Sunucu ömür boyu istatistik gönderdiyse (user.stats)
// gerçek sipariş / harcama / ortalama sepet / iptal sayıları; göndermediyse yüklü siparişlerden hesap
// ("Son 30 gün" etiketiyle). Yüklü diğer siparişlerden en fazla 4'ü açılabilir düğme olarak listelenir.
// "Profili aç" silinmiş hesaplarda gösterilmez.
import { useId } from "react";
import { ArrowUpRight, UserRound, UserX } from "lucide-react";
import { formatDate, money, timeAgo } from "../../admin/ui";
import { MINUTE, isDeletedCustomer, orderCode, orderCodeTitle, shortWhen, statusUi } from "../shared";

const OTHERS_MAX = 4;

export default function CustomerPanel({ order, customer, now, onOpenOrder, onOpenProfile }) {
  const headId = useId();
  if (!order || !customer) return null;
  const deleted = isDeletedCustomer(order);
  const canOpenProfile = !deleted && Boolean(order.user?.id) && typeof onOpenProfile === "function";
  const lifetime = customer.source === "stats";
  const others = customer.others || [];
  const shown = others.slice(0, OTHERS_MAX);
  // "İlk sipariş" yalnızca kesinken (ömür boyu istatistik ya da enrichOrders'ın kesin bayrağı)
  const firstOrder = order.isFirstOrder === true || (lifetime && customer.count === 1);
  // Son sipariş bu siparişin kendisiyse bilgi vermez: yüklü bir önceki sipariş varsa onu yaz
  const createdMs = Number(order.createdMs) || 0;
  const lastMs = customer.lastAt ? new Date(customer.lastAt).getTime() : NaN;
  const lastIsThis = Number.isFinite(lastMs) && createdMs > 0 && lastMs <= createdMs + MINUTE;
  const previous = others.find((o) => (Number(o.createdMs) || 0) < createdMs) || null;
  const recency = lastIsThis
    ? (previous ? `Önceki siparişi ${timeAgo(previous.createdAt, now)}` : null)
    : (customer.lastAt ? `Son siparişi ${timeAgo(customer.lastAt, now)}` : null);
  const hint = firstOrder
    ? "Bu, müşterinin ilk siparişi."
    : [customer.firstAt && `İlk siparişi ${formatDate(customer.firstAt, { month: "long", year: "numeric" })}`, recency].filter(Boolean).join(" · ");

  return (
    <section className="so-d-section so-d-cust" aria-labelledby={headId}>
      <div className="so-d-section-head">
        <h3 id={headId} className="so-d-h">
          <UserRound aria-hidden="true" />
          Müşteri
          {!lifetime && <span className="so-d-h-meta">· Son 30 gün</span>}
        </h3>
        {canOpenProfile && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost so-d-profile" onClick={() => onOpenProfile(order.user)}>
            Profili aç<ArrowUpRight aria-hidden="true" />
          </button>
        )}
        {deleted && <span className="ui-badge so-d-deleted"><UserX aria-hidden="true" />Hesap silinmiş</span>}
      </div>

      <dl className="so-d-stats">
        <div>
          <dt>Sipariş</dt>
          <dd className="ui-num">{customer.count}</dd>
        </div>
        <div>
          <dt>Harcama</dt>
          <dd className="ui-num">{money(customer.spent)}</dd>
        </div>
        <div>
          <dt>Ort. sepet</dt>
          <dd className="ui-num">{money(customer.average)}</dd>
        </div>
        <div data-alert={customer.cancelled > 0 ? "true" : undefined}>
          <dt>İptal</dt>
          <dd className="ui-num">{customer.cancelled}</dd>
        </div>
      </dl>

      {(hint || !lifetime) && (
        <p className="ui-hint so-d-cust-hint">
          {hint && <span>{hint}</span>}
          {!lifetime && <span className="so-d-cust-scope">Daha eski siparişler hesaba katılmadı.</span>}
        </p>
      )}

      {shown.length > 0 && (
        <div className="so-d-others-wrap">
          <p className="so-d-sub">Diğer siparişleri</p>
          <ul className="so-d-others">
            {shown.map((item) => {
              const ui = statusUi(item.status);
              const count = Number(item.itemCount ?? item.products?.length) || 0;
              return (
                <li key={item.orderId}>
                  <button type="button" className="so-d-other" onClick={() => onOpenOrder?.(item)}
                    aria-label={`${orderCode(item)} siparişini aç, ${ui.label}, ${money(item.totalAmount)}`}>
                    <i className={`ui-dot${ui.tone ? ` ui-dot--${ui.tone}` : ""}`} aria-hidden="true" title={ui.label} />
                    <span className="so-code" title={orderCodeTitle(item)}>{orderCode(item)}</span>
                    <span className="so-d-other-date">{shortWhen(item.createdAt, now)}</span>
                    <span className="so-d-other-count">{count} ürün</span>
                    <strong className="so-d-other-total ui-num">{money(item.totalAmount)}</strong>
                  </button>
                </li>
              );
            })}
          </ul>
          {others.length > shown.length && (
            <p className="ui-hint">ve {others.length - shown.length} sipariş daha (yüklü olanlar)</p>
          )}
        </div>
      )}
    </section>
  );
}
