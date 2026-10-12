import { useMemo, useState } from "react";
import { X, Copy, Pencil, CopyPlus, Trash2, ShoppingBag, Users, ChevronDown } from "lucide-react";
import {
  getStatus, expiryText, discountLabel, discountSub, couponKind, describeRules, dailyUsage,
  money, formatDate, formatDateTime, relativeDays, ORDER_STATUS
} from "./couponUtils";
import { RuleIcon } from "./RuleIcon";
import UsageBars from "./UsageBars";

const HISTORY_PREVIEW = 6;

const CouponDetail = ({ coupon, stats, now, onClose, onEdit, onDuplicate, onToggle, onDelete, onCopy, toggling }) => {
  const [showAll, setShowAll] = useState(false);
  const status = getStatus(coupon, now);
  const rules = describeRules(coupon);
  const usage = useMemo(() => dailyUsage([coupon], 30, now), [coupon, now]);
  const history = useMemo(
    () => [...(coupon.usedBy || [])].sort((a, b) => new Date(b.usedAt || 0) - new Date(a.usedAt || 0)),
    [coupon.usedBy]
  );

  const orders = stats?.usageCount ?? coupon.usageCount ?? 0;
  const revenue = Number(stats?.revenue || 0);
  const discount = Number(stats?.discount || 0);
  const avgBasket = orders > 0 && revenue > 0 ? revenue / orders : 0;
  const perLira = discount > 0 ? revenue / discount : 0;
  const used = coupon.usageCount || 0;
  const limitPct = coupon.usageLimit ? Math.min(100, (used / coupon.usageLimit) * 100) : null;
  const visibleHistory = showAll ? history : history.slice(0, HISTORY_PREVIEW);

  return (
    <div className="cpn-detail" data-status={status.key}>
      <div className="cpn-detail-head">
        <div className="cpn-detail-head-text">
          <span className="ui-overline">{couponKind(coupon)} kupon</span>
          <button type="button" className="cpn-detail-code" onClick={() => onCopy(coupon.code)} title="Kodu kopyala">
            <span>{coupon.code}</span><Copy />
          </button>
        </div>
        <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Detayı kapat"><X /></button>
      </div>

      <div className="cpn-detail-body">
        <div className="cpn-detail-hero">
          <div className="cpn-detail-hero-value">
            <strong>{discountLabel(coupon)}</strong>
            <span>{discountSub(coupon)}</span>
          </div>
          <div className="cpn-detail-hero-meta">
            <span className={`ui-badge ${status.tone ? `ui-badge--${status.tone}` : ""}`}>
              <span className={`ui-dot ${status.tone ? `ui-dot--${status.tone}` : ""}`} />{status.label}
            </span>
            <span className="cpn-detail-desc">{coupon.description || "Açıklama yok"}</span>
          </div>
        </div>

        <div className="cpn-detail-actions">
          <button type="button" className="ui-toggle cpn-detail-switch" aria-pressed={Boolean(coupon.isActive)}
            onClick={() => onToggle(coupon)} disabled={toggling}>
            <i />{coupon.isActive ? "Yayında" : "Kapalı"}
          </button>
          <div className="cpn-detail-actions-btns">
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => onEdit(coupon)}><Pencil />Düzenle</button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => onDuplicate(coupon)}><CopyPlus />Kopyala</button>
            <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={() => onDelete(coupon)} title="Sil" aria-label="Sil"><Trash2 /></button>
          </div>
        </div>

        <div className="cpn-detail-stats">
          <div><span>Sipariş</span><strong>{orders.toLocaleString("tr-TR")}</strong></div>
          <div><span>Sipariş geliri</span><strong>{money(revenue)}</strong></div>
          <div><span>Verilen indirim</span><strong>{money(discount)}</strong></div>
          <div><span>Ort. sepet</span><strong>{avgBasket ? money(avgBasket) : "-"}</strong></div>
        </div>
        {perLira > 0 && (
          <p className="cpn-detail-roi">
            Verilen her <strong>₺1</strong> indirim karşılığında <strong>{money(perLira, 1)}</strong> sipariş geliri.
          </p>
        )}

        {limitPct !== null && (
          <div className="cpn-detail-limit">
            <div className="cpn-detail-limit-top">
              <span>Kullanım limiti</span>
              <span><strong>{used}</strong> / {coupon.usageLimit}</span>
            </div>
            <div className="ui-progress" data-full={limitPct >= 100}><div style={{ width: `${limitPct}%` }} /></div>
          </div>
        )}

        <section className="cpn-detail-block">
          <div className="cpn-detail-block-head">
            <h3>Son 30 gün</h3>
            <span>{usage.current} kullanım{usage.previous ? ` · önceki 30 gün ${usage.previous}` : ""}</span>
          </div>
          <UsageBars buckets={usage.buckets} height={56} />
        </section>

        <section className="cpn-detail-block">
          <div className="cpn-detail-block-head"><h3>Kurallar</h3></div>
          <ul className="cpn-rules">
            {rules.map((r) => <li key={r.key}><RuleIcon name={r.icon} />{r.text}</li>)}
          </ul>
        </section>

        <section className="cpn-detail-block">
          <div className="cpn-detail-block-head"><h3>Zaman çizelgesi</h3></div>
          <ol className="cpn-timeline">
            <li><span>Oluşturuldu</span><strong>{formatDate(coupon.createdAt)}</strong></li>
            {stats?.lastUsedAt && <li><span>Son kullanım</span><strong>{relativeDays(stats.lastUsedAt, now)}</strong></li>}
            <li data-tone={status.key === "soon" ? "warn" : status.key === "expired" ? "danger" : undefined}>
              <span>Son gün</span><strong>{formatDate(coupon.expirationDate)} · {expiryText(coupon, now)}</strong>
            </li>
          </ol>
        </section>

        <section className="cpn-detail-block">
          <div className="cpn-detail-block-head">
            <h3>Kullanım geçmişi</h3>
            <span>{history.length} kayıt</span>
          </div>
          {history.length === 0 ? (
            <div className="cpn-detail-empty"><Users />Henüz kimse kullanmadı</div>
          ) : (
            <ul className="cpn-history">
              {visibleHistory.map((u, i) => {
                const order = u.orderId && typeof u.orderId === "object" ? u.orderId : null;
                const orderNo = String(order?._id || u.orderId || "").slice(-6).toUpperCase();
                const st = order?.status ? ORDER_STATUS[order.status] || { label: order.status, tone: "info" } : null;
                const name = u.user?.name || "Silinmiş kullanıcı";
                return (
                  <li key={`${u.user?._id || u.user}-${u.usedAt}-${i}`}>
                    <span className="cpn-avatar" aria-hidden="true">{name.trim().charAt(0).toLocaleUpperCase("tr-TR")}</span>
                    <span className="cpn-history-main">
                      <strong>{name}</strong>
                      <small>
                        {orderNo && <><ShoppingBag />#{orderNo} · </>}
                        {formatDateTime(u.usedAt)}
                      </small>
                    </span>
                    <span className="cpn-history-side">
                      {order && <strong>{money(order.totalAmount, 2)}</strong>}
                      <span className="cpn-history-sub">
                        {order?.couponDiscount ? <small>−{money(order.couponDiscount, 2)}</small> : null}
                        {st && <span className={`ui-badge ui-badge--${st.tone}`}>{st.label}</span>}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {history.length > HISTORY_PREVIEW && (
            <button type="button" className="cpn-more" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? "Daha az göster" : `Tümünü göster (${history.length})`}
              <ChevronDown data-open={showAll} />
            </button>
          )}
        </section>
      </div>
    </div>
  );
};

export default CouponDetail;
