/* eslint-disable react-refresh/only-export-components */
// Siparişler ekranının seçim penceresi: birkaç seçenekli kısa sorular ("İlk sipariş henüz teyit edilmedi",
// "Ayşe’nin #CD34EF siparişi de hazırlanıyor", kurye seçimi). Ortak useConfirm iki düğmelidir; bu pencere istenen
// sayıda seçenek gösterir. useChoiceDialog().ask(spec) seçilen seçeneğin kimliğiyle, vazgeçilirse null ile çözülür.
// Erişilebilirlik: role="dialog" + aria-modal, başlık ve açıklama bağlı; açılınca autoFocus (yoksa ilk) seçeneğe odak;
// Tab pencere içinde döner; Esc, arka plan ve X vazgeçer; kapanınca odak açan öğeye döner. Seçimden sonra kısa süre
// görünmez bir kalkan kalır: çift tıklamanın ikinci tıklaması alttaki karta / düğmeye düşmez.
// Stil: orders.css (so-choice-). .so içinde ui-modal-backdrop z 97: detay çekmecesinin üstünde, onay penceresinin altında.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Bike, Info, PhoneCall, X } from "lucide-react";

const TONE_ICON = { warn: AlertTriangle, danger: AlertTriangle, info: Info, call: PhoneCall, courier: Bike };
const SHIELD_MS = 320;

/**
 * spec: {
 *   title, message?, tone?: "warn"|"danger"|"info"|"call"|"courier",
 *   link?: { href, label, icon? } (ör. "Ara · 0555 …"; pencereyi kapatmaz),
 *   options: [{ id, label, description?, icon?, variant?: "primary"|"warn"|"default", autoFocus? }],
 *   cancelLabel? (varsayılan "Vazgeç")
 * }
 */
function ChoiceDialog({ spec, onChoose, onCancel }) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const prev = document.activeElement;
    const root = dialogRef.current;
    const initial = root?.querySelector('[data-autofocus="true"]') || root?.querySelector(".so-choice-opt");
    initial?.focus({ preventScroll: true });
    // Yakalama aşamasında: arkadaki çekmece / liste kısayolları (Esc, Tab) pencere açıkken çalışmaz
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...(dialogRef.current?.querySelectorAll("button:not(:disabled), a[href]") || [])];
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      const index = items.indexOf(document.activeElement);
      const next = e.shiftKey
        ? (index <= 0 ? items.length - 1 : index - 1)
        : (index < 0 || index === items.length - 1 ? 0 : index + 1);
      items[next].focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (prev && prev !== document.body && prev.isConnected && typeof prev.focus === "function") prev.focus({ preventScroll: true });
    };
  }, []);

  const tone = spec.tone || "info";
  const Icon = TONE_ICON[tone] || Info;
  const LinkIcon = spec.link?.icon || PhoneCall;
  const cancelLabel = spec.cancelLabel || "Vazgeç";
  return (
    <div className="ui-modal-backdrop so-choice-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={dialogRef} className="ui-modal so-choice" role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={spec.message ? messageId : undefined} data-tone={tone}>
        <div className="so-choice-head">
          <span className="so-choice-icon" aria-hidden="true"><Icon /></span>
          <div className="so-choice-text">
            <h2 id={titleId} className="so-choice-title">{spec.title}</h2>
            {spec.message && <p id={messageId} className="so-choice-message">{spec.message}</p>}
          </div>
          <button type="button" className="ui-icon-btn ui-icon-btn--sm so-choice-close" onClick={onCancel} aria-label={cancelLabel} title={`${cancelLabel} (Esc)`}>
            <X aria-hidden="true" />
          </button>
        </div>
        {spec.link?.href && (
          <a className="ui-btn so-choice-link" href={spec.link.href}>
            <LinkIcon aria-hidden="true" />{spec.link.label}
          </a>
        )}
        <div className="so-choice-options" role="group" aria-label="Seçenekler">
          {(spec.options || []).map((option) => {
            const OptionIcon = option.icon;
            return (
              <button key={option.id} type="button" className="ui-btn so-choice-opt" data-variant={option.variant || "default"}
                data-autofocus={option.autoFocus ? "true" : undefined} onClick={() => onChoose(option.id)}>
                {OptionIcon && <OptionIcon aria-hidden="true" />}
                <span className="so-choice-opt-text">
                  <span className="so-choice-opt-label">{option.label}</span>
                  {option.description && <small>{option.description}</small>}
                </span>
              </button>
            );
          })}
          <button type="button" className="ui-btn ui-btn--ghost so-choice-cancel" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Seçim penceresi kancası. element ekranın kökünde (.so içinde) çizilmelidir.
 * ask(spec) → Promise<string | null>; aynı anda tek soru: yeni soru öncekini "vazgeçildi" (null) sayar.
 */
export function useChoiceDialog() {
  const [state, setState] = useState(null); // { spec, seq } | { shield: true, seq }
  const pendingRef = useRef(null);
  const seqRef = useRef(0);
  const shieldTimer = useRef(null);

  const settle = useCallback((value) => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    clearTimeout(shieldTimer.current);
    seqRef.current += 1;
    const seq = seqRef.current;
    setState({ shield: true, seq });
    shieldTimer.current = setTimeout(() => setState((current) => (current?.shield && current.seq === seq ? null : current)), SHIELD_MS);
    resolve?.(value ?? null);
  }, []);

  const ask = useCallback((spec) => new Promise((resolve) => {
    pendingRef.current?.(null);
    pendingRef.current = resolve;
    clearTimeout(shieldTimer.current);
    seqRef.current += 1;
    setState({ spec, seq: seqRef.current });
  }), []);

  useEffect(() => () => {
    clearTimeout(shieldTimer.current);
    pendingRef.current?.(null);
    pendingRef.current = null;
  }, []);

  let element = null;
  if (state?.spec) {
    element = <ChoiceDialog key={state.seq} spec={state.spec} onChoose={(id) => settle(id)} onCancel={() => settle(null)} />;
  } else if (state?.shield) {
    element = <div className="so-click-shield" aria-hidden="true" />;
  }
  return { ask, element, open: Boolean(state?.spec) };
}

export default ChoiceDialog;
