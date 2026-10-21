// Müşteri listesi satırı: geniş ekranda tablo satırı, mobilde kart (CSS ile dönüşür).
import { memo } from "react";
import { Eye, Key, Pencil, Trash2 } from "lucide-react";
import { formatDateTime, money } from "../admin/ui";
import { relativeTime } from "../../lib/customers";
import { APP_STAGE_BADGES, Avatar, DeviceIcon, TagBadges, appStage, customerTags, deviceLabel, isInAppNow, lastSeenAt, orderInfoOf, registeredAt } from "./shared";

const CustomerRow = memo(function CustomerRow({ user, orderMap, ordersLoaded, now, appSince, selected, cursor, onSelect, onOpen, onEdit, onResetPw, onDelete }) {
  const tags = customerTags(user, orderMap, now);
  const info = orderInfoOf(orderMap, user);
  const seen = lastSeenAt(user);
  const joined = registeredAt(user);
  const online = isInAppNow(user, now) || (seen && now - seen.getTime() < 5 * 60000);
  const stage = APP_STAGE_BADGES[appStage(user, appSince)];
  const name = user.name || "İsimsiz";
  return (
    <div className="cus-row" data-selected={selected || undefined} data-cursor={cursor || undefined} data-id={user._id} role="row">
      <label className="cus-check" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="ui-checkbox" checked={selected} onChange={() => onSelect(user._id)} aria-label={`${name} seç`} />
      </label>
      <button type="button" className="cus-person" onClick={() => onOpen(user)} title="Profili aç">
        <Avatar name={user.name} src={user.avatar} />
        <span className="cus-person-text">
          <span className="cus-person-name">
            <span className="ui-truncate">{name}</span>
            <TagBadges tags={tags} />
          </span>
          <span className="cus-person-sub ui-truncate">{user.phone ? `${user.phone} · ${user.email}` : user.email}</span>
        </span>
      </button>
      <div className="cus-cell">
        <span className="ui-cell-label">Kayıt</span>
        <span className="cus-when" title={joined ? formatDateTime(joined) : undefined}>
          <span>{joined ? formatDateTime(joined) : "—"}</span>
          {joined && <span className="cus-when-sub">{relativeTime(joined, now)}</span>}
        </span>
      </div>
      <div className="cus-cell">
        <span className="ui-cell-label">Son görülme</span>
        {seen ? (
          <span className="cus-when" title={formatDateTime(seen)}>
            <span className="cus-seen">{online && <span className="ui-dot ui-dot--ok" />}{online ? "Şu an aktif" : relativeTime(seen, now)}</span>
            <span className="cus-when-sub">{formatDateTime(seen)}</span>
          </span>
        ) : (
          <span className="ui-muted">Hiç görülmedi</span>
        )}
      </div>
      <div className="cus-cell">
        <span className="ui-cell-label">Siparişler</span>
        {!ordersLoaded ? (
          <span className="ui-skeleton cus-skel" aria-hidden="true" />
        ) : info ? (
          <span className="cus-when">
            <span className="ui-num"><strong>{info.orderCount}</strong> sipariş</span>
            <span className="cus-when-sub ui-num">{money(info.totalSpent)}</span>
          </span>
        ) : (
          <span className="ui-muted">Sipariş yok</span>
        )}
      </div>
      <div className="cus-cell cus-cell--device">
        <span className="ui-cell-label">Cihaz / uygulama</span>
        <span className="cus-device">
          {user.deviceType && user.deviceType !== "unknown" && (
            <span className="cus-device-type" title={deviceLabel(user.deviceType)}><DeviceIcon type={user.deviceType} />{deviceLabel(user.deviceType)}</span>
          )}
          {stage ? (
            <span className={`ui-badge ui-badge--${stage.tone}`}>{stage.label}</span>
          ) : user.appActivity?.lastSeenAt ? (
            <span className="cus-when-sub">Uygulama: {relativeTime(user.appActivity.lastSeenAt, now)}</span>
          ) : (
            <span className="cus-when-sub ui-muted">Uygulama yok</span>
          )}
        </span>
      </div>
      <div className="cus-actions">
        <button type="button" onClick={() => onOpen(user)} className="ui-icon-btn ui-icon-btn--sm" title="Profil" aria-label={`${name} profilini aç`}><Eye /></button>
        <button type="button" onClick={() => onEdit(user)} className="ui-icon-btn ui-icon-btn--sm" title="Düzenle" aria-label={`${name} düzenle`}><Pencil /></button>
        <button type="button" onClick={() => onResetPw(user)} className="ui-icon-btn ui-icon-btn--sm" title="Şifre sıfırla" aria-label={`${name} şifresini sıfırla`}><Key /></button>
        <button type="button" onClick={() => onDelete(user)} className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" title="Sil" aria-label={`${name} sil`}><Trash2 /></button>
      </div>
    </div>
  );
});

export default CustomerRow;
