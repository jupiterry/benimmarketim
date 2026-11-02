// Kampanya merkezi: dikkat gerektirenler şeridi (stoksuz/gizli ürün, uygulanmamış flaş, etkisiz haftalık fırsat,
// bu gece biten kampanya, flaş + haftalık çakışması, bugün biten ya da sınırı dolmuş kupon). Her madde ilgili ekranı açar.
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeftRight, BadgePercent, Ban, CheckCircle2, ChevronRight, Clock, EyeOff, Hourglass, PackageX, Trash2, ZapOff,
} from "lucide-react";
import { attentionMessage, count, isAttentionCurrent, openTarget, targetTitle } from "./campaignUtils";

const VISIBLE = 6;
const REASON_ICON = { out_of_stock: PackageX, hidden: EyeOff, deleted: Trash2 };
const KIND_ICON = {
  weekly_ineffective: BadgePercent,
  flash_not_applied: ZapOff,
  ending_today: Hourglass,
  coupon_ending: Clock,
  flash_weekly_overlap: ArrowLeftRight,
  coupon_exhausted: Ban,
};

const CampaignAttention = ({ items, now, onNavigate, incomplete = false }) => {
  const [expanded, setExpanded] = useState(false);
  const current = useMemo(() => (items || []).filter((entry) => isAttentionCurrent(entry, now)), [items, now]);

  if (!current.length) {
    return incomplete ? (
      <div className="cc-attn-ok" data-tone="warn" role="status">
        <AlertTriangle aria-hidden="true" />
        <span>Bazı bölümler yüklenemediği için dikkat gerektiren kampanyalar eksik görünebilir.</span>
      </div>
    ) : (
      <div className="cc-attn-ok" role="status">
        <CheckCircle2 aria-hidden="true" />
        <span>Dikkat gerektiren kampanya yok.</span>
      </div>
    );
  }

  const shown = expanded ? current : current.slice(0, VISIBLE);
  const hidden = current.length - shown.length;
  return (
    <section className="cc-attn" aria-labelledby="cc-attn-title">
      <header className="cc-attn-head">
        <AlertTriangle aria-hidden="true" />
        <h2 id="cc-attn-title">Dikkat gerektirenler</h2>
        <span className="ui-count">{count(current.length)}</span>
      </header>
      <ul className="cc-attn-list">
        {shown.map((entry) => {
          const Icon = (entry.kind === "product_unavailable" ? REASON_ICON[entry.reason] : KIND_ICON[entry.kind]) || AlertTriangle;
          const message = attentionMessage(entry, now);
          return (
            <li key={entry.id}>
              <button type="button" className="cc-attn-item" data-tone={entry.severity} onClick={() => openTarget(entry.target, onNavigate)}
                title={targetTitle(entry.target)}>
                <Icon aria-hidden="true" />
                <span className="cc-attn-text">
                  <strong>{entry.title}</strong>
                  <small>{message}</small>
                </span>
                <ChevronRight aria-hidden="true" className="cc-attn-go" />
              </button>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || expanded) && current.length > VISIBLE && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm cc-attn-more" aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Daha az göster" : `${count(hidden)} madde daha göster`}
        </button>
      )}
    </section>
  );
};

export default CampaignAttention;
