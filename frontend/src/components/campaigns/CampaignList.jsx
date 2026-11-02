// Kampanya merkezi: "Şimdi yayında" listesi. Türlere göre bölümler; her satır kampanyanın ekranını açar,
// birden çok ürünlü flaş kampanyası ve haftalık fırsat grubu ürün ürün açılır (ürün → ürün çekmecesi).
import { useState } from "react";
import { ArrowRight, CalendarRange, ChevronDown, ChevronRight, Megaphone, Package } from "lucide-react";
import { EmptyState, money } from "../admin/ui";
import { cloudinaryImage } from "../../lib/image";
import {
  TYPE_META, TYPE_ORDER, TYPE_TARGET, count, inferredNote, itemStats, itemSubtitle, openTarget, performanceParts,
  progressOf, statusBadge, statusOf, targetLabel, targetTitle, toMs,
} from "./campaignUtils";

const NOT_APPLIED_GRACE_MS = 3 * 60 * 1000; // sunucudaki dikkat kuralıyla aynı
const pctText = (value) => `%${(Number(value) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

const StatsLine = ({ parts, stats, className = "cc-stats" }) => {
  if (!parts.length) return null;
  const note = inferredNote(stats);
  return (
    <span className={className}>
      {parts.map((part, index) => <span key={`${index}-${part}`}>{part}</span>)}
      {note && <span className="cc-estimate" title={note}>tahmini</span>}
    </span>
  );
};

const ChildRow = ({ child, type, now, onNavigate }) => {
  const flags = [
    child.missing && "Silinmiş",
    !child.missing && child.isHidden && "Gizli",
    !child.missing && child.isOutOfStock && "Stokta yok",
  ].filter(Boolean);
  const notApplied = type === "flash" && child.applied === false && !child.missing &&
    statusOf(child, now) !== "upcoming" && now - toMs(child.startsAt) > NOT_APPLIED_GRACE_MS;
  const hasPrice = child.price !== null && child.price !== undefined;
  const price = type === "flash"
    ? [pctText(child.discountPercentage), hasPrice ? (child.listPrice ? `${money(child.listPrice)} → ${money(child.price)}` : money(child.price)) : null]
    : [child.weeklyPrice !== null && child.weeklyPrice !== undefined ? money(child.weeklyPrice) : null,
      child.listPrice ? `liste ${money(child.listPrice)}` : null, child.discountPercentage ? pctText(child.discountPercentage) : null];
  const perf = child.stats ? performanceParts(child.stats) : [];
  return (
    <li>
      <button type="button" className="cc-child" onClick={() => openTarget(child.target, onNavigate)} disabled={child.missing}
        title={child.missing ? "Ürün silinmiş" : "Ürünü aç"}>
        <span className="ui-thumb cc-thumb" aria-hidden="true">
          {child.image ? <img src={cloudinaryImage(child.image, 96)} alt="" loading="lazy" /> : <Package />}
        </span>
        <span className="cc-child-body">
          <span className="cc-child-name">
            <span className="ui-truncate">{child.name}</span>
            {flags.map((flag) => <span key={flag} className="ui-badge ui-badge--danger">{flag}</span>)}
            {notApplied && <span className="ui-badge ui-badge--danger">İndirim uygulanmadı</span>}
            {type === "weekly" && child.ineffective && !child.missing && <span className="ui-badge ui-badge--warn">Fırsat etkisiz</span>}
          </span>
          <span className="cc-child-sub">
            <span className="cc-child-price">{price.filter(Boolean).join(" · ")}</span>
            {child.stats && (perf.length
              ? <StatsLine parts={perf} stats={child.stats} className="cc-stats cc-stats--child" />
              : <span className="cc-stats cc-stats--child"><span>Henüz satış yok</span></span>)}
          </span>
        </span>
      </button>
    </li>
  );
};

const CampaignRow = ({ item, now, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[item.type] || TYPE_META.flash;
  const Icon = meta.icon;
  const badge = statusBadge(item, now);
  const subtitle = itemSubtitle(item);
  const stats = itemStats(item);
  const progress = progressOf(item);
  const children = Array.isArray(item.children) ? item.children : [];
  const expandable = children.length > 1 || (item.type === "weekly" && children.length > 0);
  const listId = `cc-children-${item.id}`;
  const image = item.type === "banner" ? item.details?.image : null;
  return (
    <li className="cc-row" data-status={badge.status}>
      <div className="cc-row-line">
        <button type="button" className="cc-row-open" onClick={() => openTarget(item.target, onNavigate)} title={targetTitle(item.target)}>
          <span className="cc-row-icon" data-type={item.type} aria-hidden="true">
            {image ? <img src={cloudinaryImage(image, 120)} alt="" loading="lazy" /> : <Icon />}
          </span>
          <span className="cc-row-body">
            <span className="cc-row-title">{item.title}</span>
            {subtitle && <span className="cc-row-sub">{subtitle}</span>}
            <span className="cc-row-meta">
              <span className={`ui-badge${badge.tone ? ` ui-badge--${badge.tone}` : ""}`} title={badge.title}>{badge.label}</span>
              <span className="cc-row-when" title={badge.title}>{badge.detail}</span>
            </span>
          </span>
          <span className="cc-row-side">
            <StatsLine parts={stats} stats={item.type === "flash" || item.type === "weekly" ? item.stats : null} />
            {progress !== null && (
              <span className="cc-progress" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </span>
            )}
          </span>
          <ChevronRight className="cc-row-go" aria-hidden="true" />
        </button>
        {expandable && (
          <button type="button" className="ui-icon-btn cc-row-toggle" aria-expanded={open} aria-controls={listId}
            aria-label={open ? "Ürünleri gizle" : `${count(children.length)} ürünü göster`} title={open ? "Ürünleri gizle" : "Ürünleri göster"}
            onClick={() => setOpen((value) => !value)}>
            <ChevronDown />
          </button>
        )}
      </div>
      {expandable && open && (
        <ul id={listId} className="cc-children" aria-label={`${item.title} ürünleri`}>
          {children.map((child) => <ChildRow key={child.id} child={child} type={item.type} now={now} onNavigate={onNavigate} />)}
        </ul>
      )}
    </li>
  );
};

const TypeSection = ({ type, items, now, onNavigate }) => {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const target = TYPE_TARGET[type];
  return (
    <section className="cc-group" aria-labelledby={`cc-group-${type}`}>
      <header className="cc-group-head">
        <h3 id={`cc-group-${type}`}>
          <Icon aria-hidden="true" />{meta.plural}<span className="ui-count">{count(items.length)}</span>
        </h3>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm cc-group-link" onClick={() => openTarget(target, onNavigate)}
          title={targetTitle(target)}>
          <span className="ui-truncate">{targetLabel(target)}</span><ArrowRight aria-hidden="true" />
        </button>
      </header>
      <ul className="cc-rows">
        {items.map((item) => <CampaignRow key={item.id} item={item} now={now} onNavigate={onNavigate} />)}
      </ul>
    </section>
  );
};

const CampaignList = ({ groups, now, onNavigate, upcomingCount = 0, onShowCalendar }) => {
  const sections = TYPE_ORDER
    .map((type) => ({ type, items: (groups?.[type] || []).filter((item) => statusOf(item, now) !== "upcoming") }))
    .filter((section) => section.items.length);

  if (!sections.length) {
    return (
      <EmptyState icon={Megaphone} title="Şu an yayında kampanya yok"
        description="Flaş indirim, haftalık fırsat ya da kupon başlattığınızda burada görünür."
        action={upcomingCount > 0 && onShowCalendar ? (
          <button type="button" className="ui-btn" onClick={onShowCalendar}><CalendarRange aria-hidden="true" />{count(upcomingCount)} planlı kampanyayı göster</button>
        ) : null} />
    );
  }
  return (
    <div className="cc-list">
      {sections.map(({ type, items }) => <TypeSection key={type} type={type} items={items} now={now} onNavigate={onNavigate} />)}
      {upcomingCount > 0 && onShowCalendar && (
        <button type="button" className="ui-panel-link cc-list-foot" onClick={onShowCalendar}>
          <CalendarRange aria-hidden="true" />{count(upcomingCount)} planlı kampanya var · takvimde görün
        </button>
      )}
    </div>
  );
};

export default CampaignList;
