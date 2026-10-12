import { useEffect, useRef } from "react";
import { X, Check, RefreshCw } from "lucide-react";
import { useConfirm } from "../ConfirmModal";

// Form bölümü: solda başlık/ipucu, sağda alanlar
export const Section = ({ title, hint, children }) => (
  <section className="cpn-cmp-section">
    <header>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
    </header>
    <div className="cpn-cmp-section-body">{children}</div>
  </section>
);

/**
 * Sağdan açılan geniş form çekmecesi: solda form, sağda önizleme.
 * Kaydedilmemiş değişiklik varken kapatmadan önce onay ister; Esc ile kapanır.
 */
const FormDrawer = ({
  title, subtitle, dirty, saving, submitLabel, submitDisabled, onSubmit, onClose, preview, children
}) => {
  const { confirm } = useConfirm();

  const requestClose = async () => {
    if (dirty && !saving) {
      const ok = await confirm({
        title: "Değişiklikler kaydedilmedi",
        message: "Formdan çıkarsanız yaptığınız değişiklikler kaybolur.",
        confirmText: "Çık",
        cancelText: "Forma dön",
        type: "warning"
      });
      if (!ok) return;
    }
    onClose();
  };

  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector(".ui-modal-backdrop")) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="ui-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <aside className="ui-drawer cpn-cmp" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ui-drawer-head">
          <div className="cpn-cmp-title">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" onClick={requestClose} className="ui-icon-btn" aria-label="Kapat"><X /></button>
        </div>
        <form onSubmit={onSubmit} className="ui-drawer-form">
          <div className="cpn-cmp-grid">
            <div className="cpn-cmp-form">{children}</div>
            <aside className="cpn-cmp-preview" aria-label="Önizleme">
              <div className="cpn-cmp-preview-inner">{preview}</div>
            </aside>
          </div>
          <div className="ui-drawer-foot cpn-cmp-foot">
            <span className="cpn-cmp-foot-note">{dirty ? "Kaydedilmemiş değişiklikler var" : ""}</span>
            <button type="button" onClick={requestClose} className="ui-btn">İptal</button>
            <button type="submit" disabled={saving || submitDisabled} className="ui-btn ui-btn--primary">
              {saving ? <RefreshCw className="ui-spin" /> : <Check />}
              {submitLabel}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
};

export default FormDrawer;
