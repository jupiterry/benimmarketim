// "Yayına hazırlık" listesi: Devrek'i herkese açmadan önce sınır, ücret, süre, teyit, kurye, uygulama sürümü,
// sipariş saatleri ve pilot tek yerde. Her madde yeşil (hazır), sarı (uyarı) ya da kırmızı (engel); "Düzelt"
// (hazır maddede "Göster") ilgili karta kaydırıp alana odaklanır ya da Mağaza ayarlarındaki bölümü açar.
import { useId } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { Skeleton, formatTime, usePref } from "../admin/ui";
import { CHECK_STATUS } from "./readiness";

const summaryText = ({ ok, warn, block }) => {
  if (block) return `${block} engel${warn ? ` · ${warn} uyarı` : ""}: herkese açmadan önce kırmızı maddeleri giderin.`;
  if (warn) return `Engel yok. ${warn} uyarıya göz atın.`;
  return ok ? "Her şey hazır." : "";
};

const ReadinessChecklist = ({ readiness, loading, error, onRetry, onFix }) => {
  const [open, setOpen] = usePref("dz-ready-open", true);
  const bodyId = useId();
  const counts = readiness?.counts || { ok: 0, warn: 0, block: 0 };
  const total = readiness?.checks.length || 0;
  const state = !readiness ? "idle" : counts.block ? "block" : counts.warn ? "warn" : "ok";

  return (
    <section className="dz-ready" aria-labelledby={`${bodyId}-title`} aria-busy={loading || undefined}>
      <div className="dz-sec-head">
        <button type="button" className="dz-sec-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <span className="dz-sec-icon" data-state={state}><ClipboardCheck aria-hidden="true" /></span>
          <span className="dz-sec-titles">
            <span className="dz-sec-title" id={`${bodyId}-title`}>Yayına hazırlık</span>
            <span className="dz-sec-sub">
              {readiness ? `${counts.ok}/${total} madde hazır${counts.block ? ` · ${counts.block} engel` : ""}${counts.warn ? ` · ${counts.warn} uyarı` : ""}`
                : loading ? "Denetleniyor…" : "Liste yüklenemedi"}
            </span>
          </span>
          <ChevronDown className="dz-sec-chevron" aria-hidden="true" />
        </button>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm dz-sec-refresh" onClick={onRetry} disabled={loading}
          aria-label="Hazırlık listesini yenile" title={readiness?.generatedAt ? `Son denetim ${formatTime(readiness.generatedAt)} · yenile` : "Yenile"}>
          {loading ? <Loader2 className="ui-spin" /> : <RefreshCw />}
        </button>
      </div>

      <div id={bodyId} className="dz-sec-body" hidden={!open}>
        {!readiness ? (
          loading ? (
            <div className="dz-checks-skel" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={34} radius={8} />)}
            </div>
          ) : (
            <div className="ui-banner ui-banner--danger dz-sec-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span className="ui-grow">{error || "Hazırlık listesi yüklenemedi"}</span>
              <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry}><RefreshCw aria-hidden="true" />Tekrar dene</button>
            </div>
          )
        ) : (
          <>
            <p className="dz-ready-hint">{"Devrek'i herkese açmadan önce bu maddeleri kontrol edin. Liste her değişiklikten sonra kendiliğinden yenilenir."}</p>
            {total > 0 && (
              <div className="dz-ready-bar" aria-hidden="true">
                {counts.ok > 0 && <span data-s="ok" style={{ flexGrow: counts.ok }} />}
                {counts.warn > 0 && <span data-s="warn" style={{ flexGrow: counts.warn }} />}
                {counts.block > 0 && <span data-s="block" style={{ flexGrow: counts.block }} />}
              </div>
            )}
            <p className="dz-ready-summary" data-state={state} role="status">{summaryText(counts)}</p>
            {error && (
              <p className="dz-inline-warn dz-ready-stale" role="alert">
                <AlertTriangle aria-hidden="true" />Liste yenilenemedi ({error}). Gösterilen durum son başarılı denetimden.
              </p>
            )}
            <ul className="dz-checks" aria-label="Hazırlık maddeleri">
              {readiness.checks.map((check) => {
                const meta = CHECK_STATUS[check.status];
                const Icon = meta.icon;
                const canGo = Boolean(check.fix?.target || check.fix?.tab);
                const isOk = check.status === "ok";
                return (
                  <li key={check.id} className="dz-check" data-status={check.status}>
                    <span className="dz-check-icon"><Icon aria-hidden="true" /></span>
                    <div className="dz-check-text">
                      <span className="dz-check-title">
                        {check.title}<span className="dz-sr">: {meta.label}</span>
                      </span>
                      <span className="dz-check-detail">{check.detail}</span>
                      {check.status !== "ok" && check.fix?.hint && <span className="dz-check-hint">{check.fix.hint}</span>}
                    </div>
                    {canGo && (
                      <button type="button" className={`ui-btn ui-btn--sm dz-check-fix${isOk ? " ui-btn--ghost" : ""}`} onClick={() => onFix(check)}
                        aria-label={`${check.title}: ${isOk ? "göster" : "düzelt"}`} title={isOk ? undefined : check.fix?.hint || undefined}>
                        {isOk ? "Göster" : "Düzelt"}<ArrowRight aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
};

export default ReadinessChecklist;
