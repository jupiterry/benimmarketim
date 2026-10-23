// Pasif hesap listesinin satırı: geniş ekranda tablo satırı, ≤760 px'te kart (CSS ile dönüşür).
// Silinemeyen (aktif siparişi olan / çok yeni) hesapların seçim kutusu kapalıdır ve nedeni durum sütununda yazar.
import { memo } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { money } from "../admin/ui";
import { avatarTone, initials } from "../../lib/customers";
import { BLOCK_REASONS, addMonths, ago, longDate, num, sourceOf } from "./shared";

/** Son etkinliğin kaynağı: simge + ad ("Yalnızca kayıt" uyarı renginde) */
const SourceTag = ({ source }) => {
  const info = sourceOf(source);
  if (!info) return null;
  const Icon = info.icon;
  return (
    <span className="ac-source" data-tone={info.tone} title={info.hint}>
      <Icon aria-hidden="true" /><span className="ac-source-text">{info.label}</span>
    </span>
  );
};

const Status = ({ user, months }) => {
  if (user.deletable) {
    return (
      <span className="ac-state" data-state="deletable">
        <span className="ac-state-label"><span className="ui-dot ui-dot--danger" aria-hidden="true" />Silinebilir</span>
        <span className="ac-sub">{user.orderCount > 0 ? "Siparişleri korunur" : "Siparişi yok"}</span>
      </span>
    );
  }
  const reason = BLOCK_REASONS[user.blockReason];
  const sub = user.blockReason === "active_order"
    ? `${num(user.activeOrderCount || 1)} sipariş teslim bekliyor`
    : user.blockReason === "too_new" && user.createdAt
      ? `${longDate(addMonths(user.createdAt, months))} sonrası silinebilir`
      : "Şu an silinemez";
  return (
    <span className="ac-state" data-state="blocked">
      <span className={`ui-badge ui-badge--${reason?.tone || "warn"}`}>{reason?.label || "Silinemez"}</span>
      <span className="ac-sub">{sub}</span>
    </span>
  );
};

const CleanupRow = memo(function CleanupRow({
  user, index, segment, months, now, selected, cursor, onToggle, onOpenProfile, onDelete,
}) {
  const name = user.name || "İsimsiz müşteri";
  const contact = [user.email, user.phone].filter(Boolean).join(" · ");
  const blockedTitle = user.deletable ? undefined : `${BLOCK_REASONS[user.blockReason]?.label || "Silinemez"}: seçilemez`;
  return (
    <div className="ac-row" role="row" data-id={user._id} data-selected={selected || undefined} data-cursor={cursor || undefined}
      data-blocked={!user.deletable || undefined} aria-selected={user.deletable ? selected : undefined}>
      <span className="ac-cell ac-cell--check" role="cell">
        <label className="ac-check" title={blockedTitle}>
          <input type="checkbox" className="ui-checkbox" checked={selected} disabled={!user.deletable}
            onClick={(e) => onToggle(user._id, index, e.shiftKey)} onChange={() => {}}
            aria-label={user.deletable ? `${name} seç` : `${name} silinemez`} />
        </label>
      </span>
      <span className="ac-cell ac-cell--person" role="cell">
        <span className="ui-avatar ac-avatar" data-tone={avatarTone(user.name)} aria-hidden="true">{initials(user.name)}</span>
        <span className="ac-person-text">
          <button type="button" className="ac-person-name" onClick={() => onOpenProfile(user)} title="Müşteri profilini aç">
            <span className="ui-truncate">{name}</span>
          </button>
          <span className="ac-sub ui-truncate" title={contact || undefined}>{contact || "İletişim bilgisi yok"}</span>
        </span>
      </span>
      <span className="ac-cell ac-cell--created" role="cell">
        <span className="ui-cell-label">Kayıt</span>
        <span className="ac-main ui-num">{longDate(user.createdAt)}</span>
        <span className="ac-sub">{ago(user.createdAt, now) || "—"}</span>
      </span>
      {segment === "inactive" && (
        <span className="ac-cell ac-cell--seen" role="cell">
          <span className="ui-cell-label">Son görülme</span>
          <span className="ac-main ui-num">{longDate(user.lastSeenAt)}</span>
          <span className="ac-sub ac-seen-sub">
            <span className="ac-seen-ago">{ago(user.lastSeenAt, now) || "—"}</span>
            <SourceTag source={user.lastSeenSource} />
          </span>
        </span>
      )}
      {segment === "inactive" && (
        <span className="ac-cell ac-cell--orders" role="cell">
          <span className="ui-cell-label">Siparişler</span>
          {user.orderCount > 0 ? (
            <>
              <span className="ac-main ui-num"><strong>{num(user.orderCount)}</strong> sipariş · {money(user.totalSpent)}</span>
              <span className="ac-sub ui-num">Son sipariş {longDate(user.lastOrderAt)}</span>
            </>
          ) : (
            <>
              <span className="ac-main ui-muted">Sipariş yok</span>
              <span className="ac-sub">Hiç sipariş vermedi</span>
            </>
          )}
        </span>
      )}
      <span className="ac-cell ac-cell--status" role="cell">
        <span className="ui-cell-label">Durum</span>
        <Status user={user} months={months} />
      </span>
      <span className="ac-cell ac-cell--actions" role="cell">
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => onOpenProfile(user)}
          aria-label={`${name} profilini Müşteriler ekranında aç`} title="Profili aç"><ExternalLink /></button>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" disabled={!user.deletable}
          onClick={() => onDelete(user)} aria-label={`${name} hesabını sil`} title={user.deletable ? "Bu hesabı sil" : blockedTitle}><Trash2 /></button>
      </span>
    </div>
  );
});

export default CleanupRow;
