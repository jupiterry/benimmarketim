// Seçili bölgeler için yapışkan toplu işlem çubuğu. Değer isteyen işlemler (ücret, eşik, minimum) çubuğun içinde
// küçük bir giriş satırı açar; Enter uygular, Esc vazgeçer.
import { useEffect, useRef, useState } from "react";
import { BadgePercent, Check, CheckSquare, Gift, Loader2, Lock, PhoneCall, PhoneOff, ShoppingBasket, Tag, Unlock, X } from "lucide-react";
import { num, parseMoney } from "./shared";

const PROMPTS = {
  fee: { label: "Teslimat ücreti", placeholder: "40", hint: "0 yazarsanız ücretsiz olur.", allowEmpty: false },
  threshold: { label: "Şu tutarın üstü ücretsiz", placeholder: "Boş: eşiği kaldır", hint: "Boş bırakırsanız eşik kaldırılır.", allowEmpty: true },
  minimum: { label: "Minimum sepet", placeholder: "Boş: genel minimum", hint: "Boş bırakırsanız genel minimum geçerli olur; 0 = minimum yok.", allowEmpty: true },
};

const BulkBar = ({ count, busy, onAction, onClear, generalMinimum }) => {
  const [prompt, setPrompt] = useState(null); // "fee" | "threshold" | "minimum"
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (prompt) inputRef.current?.focus(); }, [prompt]);

  const openPrompt = (kind) => { setPrompt(kind); setValue(""); setError(""); };
  const closePrompt = () => { setPrompt(null); setError(""); };

  const apply = async (e) => {
    e?.preventDefault();
    const p = PROMPTS[prompt];
    const parsed = parseMoney(value);
    if (parsed === null && !p.allowEmpty) { setError("Bir tutar yazın."); return; }
    if (Number.isNaN(parsed)) { setError("Geçerli bir tutar yazın (ör. 40 ya da 12,5)."); return; }
    if (prompt === "fee" && parsed > 1000) { setError("En fazla 1.000 TL."); return; }
    if (prompt === "threshold" && parsed !== null && parsed <= 0) { setError("Eşik 0'dan büyük olmalı."); return; }
    const ok = await onAction(prompt, parsed);
    if (ok) closePrompt();
  };

  const p = prompt ? PROMPTS[prompt] : null;
  const placeholder = prompt === "minimum" && generalMinimum != null ? `Boş: genel (${num(generalMinimum)} TL)` : p?.placeholder;

  return (
    <div className="ui-bulkbar dz-bulk" role="region" aria-label="Seçili bölgeler için toplu işlemler">
      <span className="ui-bulkbar-count"><CheckSquare aria-hidden="true" /><span><span className="ui-num">{num(count)}</span> bölge seçili</span></span>
      {prompt ? (
        <form className="dz-bulk-form" onSubmit={apply} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closePrompt(); } }}>
          <label className="dz-bulk-label" htmlFor="dz-bulk-input">{p.label}</label>
          <span className="dz-money dz-bulk-money">
            <input ref={inputRef} id="dz-bulk-input" className="ui-field ui-field--sm ui-num" inputMode="decimal" value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }} placeholder={placeholder}
              aria-invalid={Boolean(error)} aria-describedby="dz-bulk-hint" autoComplete="off" data-esc-clear="1" />
            <span aria-hidden="true">TL</span>
          </span>
          <button type="submit" className="ui-btn ui-btn--sm ui-btn--primary" disabled={busy}>{busy ? <Loader2 className="ui-spin" /> : <Check />}Uygula</button>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={closePrompt} disabled={busy}>Vazgeç</button>
          <span className={`dz-bulk-hint${error ? " is-error" : ""}`} id="dz-bulk-hint" role={error ? "alert" : undefined}>{error || p.hint}</span>
        </form>
      ) : (
        <div className="dz-bulk-actions">
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onAction("free")} disabled={busy}><Gift />Ücretsiz yap</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => openPrompt("fee")} disabled={busy}><Tag />Ücret belirle…</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => openPrompt("threshold")} disabled={busy}><BadgePercent />Eşik belirle…</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => openPrompt("minimum")} disabled={busy}><ShoppingBasket />Minimum belirle…</button>
          <span className="dz-bulk-sep" aria-hidden="true" />
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onAction("open")} disabled={busy}><Unlock />Aç</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onAction("close")} disabled={busy}><Lock />Kapat</button>
          <span className="dz-bulk-sep" aria-hidden="true" />
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onAction("callbackOn")} disabled={busy}
            title="Seçili bölgelerde ilk siparişi telefonla teyit et"><PhoneCall />Teyit iste</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onAction("callbackOff")} disabled={busy}
            title="Seçili bölgelerde ilk sipariş teyidini kapat"><PhoneOff />Teyidi kaldır</button>
          {busy && <Loader2 className="ui-spin dz-busy" aria-label="Uygulanıyor" />}
        </div>
      )}
      <button type="button" className="ui-icon-btn ui-icon-btn--sm dz-bulk-clear" onClick={onClear} aria-label="Seçimi temizle" title="Seçimi temizle (Esc)"><X /></button>
    </div>
  );
};

export default BulkBar;
