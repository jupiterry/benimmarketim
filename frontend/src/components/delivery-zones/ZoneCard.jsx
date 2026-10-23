// Sabit teslimat bölgesi kartı (Kız KYK Yurdu, Erkek KYK Yurdu, Genel Devrek). Bölge eklenemez/silinemez; yönetici
// siparişe açar/kapatır (kapanma nedeniyle), ücreti (Ücretsiz / Ücretli + "X TL üstü ücretsiz"), minimum sepeti
// (boş = genel), tahmini süreyi ve ilk sipariş telefon teyidini ayarlar. Her kart kendi "Kaydet" düğmesiyle
// PUT /delivery/admin/zones/:id gönderir. Devrek kartı ek olarak "Teslimat alanı" bölümünü (children) taşır.
import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2, PhoneCall, RotateCcw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { Segmented } from "../admin/ui";
import { useConfirm } from "../ConfirmModal";
import { CLOSE_REASONS, ETA_PRESETS, LIMITS, cardFormFromZone, feeSummary, num, parseMoney, sameForm, tl, validateCardForm } from "./shared";

const FieldError = ({ id, children }) => (children ? <p className="dz-error" id={id} role="alert">{children}</p> : null);

const ZoneCard = ({ zone, title, note, icon: Icon, generalMinimum, campaign, onSave, children, wide = false }) => {
  const { confirm } = useConfirm();
  const initial = useMemo(() => cardFormFromZone(zone), [zone]);
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const feeRef = useRef(null);
  const isYurt = zone.type === "yurt";
  const uid = `dz-${zone._id}`;

  // Sunucudan yeni değer gelince (kaydetme ya da yenileme) kaydedilmemiş değişiklik yoksa form güncellenir
  const dirty = !sameForm(form, initial);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setForm(initial);
  }, [initial]);

  const { errors, payload } = validateCardForm(form);
  const shown = touched ? errors : {};
  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setServerError(""); };
  const onInput = (key) => (e) => set(key)(e.target.value);

  const reset = () => { setForm(initial); setTouched(false); setServerError(""); };

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    if (!dirty) return;
    // Yurdu kapatmak mevcut uygulamada da o yurdu kapatır
    if (isYurt && zone.enabled && !payload.enabled) {
      const ok = await confirm({
        title: `${title} kapatılsın mı?`,
        message: "Bu yurt mevcut mobil uygulamada da hemen siparişe kapanır (Mağaza ayarlarındaki yurt anahtarıyla aynıdır).",
        confirmText: "Yurdu kapat",
        type: "warning",
      });
      if (!ok) return;
    }
    setSaving(true);
    setServerError("");
    const result = await onSave(zone, payload, title);
    setSaving(false);
    if (result?.error) setServerError(result.error);
    else {
      // Kaydedilen değerler formun yeni hali olur ("12,50" → "12,5" gibi biçim farkları kirli sayılmasın)
      setForm(cardFormFromZone({ ...zone, ...payload }));
      setTouched(false);
    }
  };

  const fee = parseMoney(form.fee);
  const threshold = parseMoney(form.threshold);
  const minimum = parseMoney(form.minimum);
  const preview = {
    deliveryFee: form.feeMode === "paid" && fee > 0 ? fee : 0,
    freeDeliveryThreshold: form.feeMode === "paid" && threshold > 0 ? threshold : null,
  };
  const minimumText = minimum === null || Number.isNaN(minimum)
    ? (generalMinimum != null ? (Number(generalMinimum) > 0 ? `Min. sepet ${tl(generalMinimum)}` : "Minimum yok") : "Genel minimum sepet")
    : minimum === 0 ? "Minimum yok" : `Min. sepet ${tl(minimum)}`;

  return (
    <section className="ui-panel dz-card" data-open={form.enabled || undefined} data-wide={wide || undefined} aria-labelledby={`${uid}-title`}>
      <form className="dz-card-form" onSubmit={submit} noValidate
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}>
        <header className="dz-card-head">
          <span className="dz-card-icon" data-type={zone.type}>{Icon && <Icon aria-hidden="true" />}</span>
          <div className="dz-card-titles">
            <h2 className="dz-h2" id={`${uid}-title`}>{title}</h2>
            <p className="ui-hint dz-card-note">{note}</p>
          </div>
          <span className={`ui-badge ${zone.enabled ? "ui-badge--ok" : ""} dz-card-state`}>{zone.enabled ? "Açık" : "Kapalı"}</span>
        </header>

        <div className="dz-card-stats ui-num" aria-label="Sipariş sayıları">
          <span><strong>{num(zone.ordersThisMonth)}</strong> sipariş bu ay</span>
          <span className="dz-card-dot" aria-hidden="true">·</span>
          <span><strong>{num(zone.ordersTotal)}</strong> toplam</span>
        </div>

        <div className={wide ? "dz-card-body dz-card-body--wide" : "dz-card-body"}>
          <div className="dz-card-fields">
            {serverError && <div className="ui-banner ui-banner--danger" role="alert"><Info /><span className="ui-grow">{serverError}</span></div>}

            <div className="dz-fieldset dz-box">
              <div className="dz-toggle-row">
                <div>
                  <span className="dz-toggle-title" id={`${uid}-l-enabled`}>Siparişe açık</span>
                  <p className="ui-hint">{form.enabled ? "Müşteriler bu bölgeye sipariş verebilir." : "Bölge müşteriye gösterilmez, sipariş alınmaz."}</p>
                </div>
                <button type="button" id={`${uid}-enabled`} className="ui-icon-btn ui-switch" role="switch" aria-checked={form.enabled} data-on={form.enabled}
                  aria-labelledby={`${uid}-l-enabled`} onClick={() => set("enabled")(!form.enabled)} disabled={saving}>
                  {form.enabled ? <ToggleRight /> : <ToggleLeft />}
                </button>
              </div>
              {!form.enabled && (
                <div className="dz-subfield">
                  <label className="ui-label" htmlFor={`${uid}-closedReason`}>Kapanma nedeni <span className="ui-muted">(isteğe bağlı, müşteriye gösterilir)</span></label>
                  <input id={`${uid}-closedReason`} className="ui-field" value={form.closedReason} onChange={onInput("closedReason")}
                    maxLength={LIMITS.closedReason + 10} placeholder="ör. Yoğunluk nedeniyle geçici olarak kapalı"
                    aria-invalid={Boolean(shown.closedReason)} aria-describedby={shown.closedReason ? `${uid}-e-closedReason` : undefined} />
                  <div className="ui-chips dz-presets" role="group" aria-label="Hazır nedenler">
                    {CLOSE_REASONS.map((r) => (
                      <button key={r} type="button" aria-pressed={form.closedReason === r} onClick={() => set("closedReason")(form.closedReason === r ? "" : r)}>
                        {r.replace(/ nedeniyle.*$/, "").replace(" yetersizliği", " yok")}
                      </button>
                    ))}
                  </div>
                  <FieldError id={`${uid}-e-closedReason`}>{shown.closedReason}</FieldError>
                </div>
              )}
            </div>

            <div className="dz-fieldset">
              <span className="ui-label">Teslimat ücreti</span>
              <Segmented ariaLabel={`${title} teslimat ücreti`} value={form.feeMode}
                onChange={(v) => { set("feeMode")(v); if (v === "paid") setTimeout(() => feeRef.current?.focus(), 0); }}
                options={[{ value: "free", label: "Ücretsiz" }, { value: "paid", label: "Ücretli" }]} />
              {form.feeMode === "paid" && (
                <div className="dz-money-grid">
                  <div>
                    <label className="ui-label dz-label-sm" htmlFor={`${uid}-fee`}>Ücret</label>
                    <span className="dz-money">
                      <input ref={feeRef} id={`${uid}-fee`} className="ui-field ui-num" inputMode="decimal" value={form.fee} onChange={onInput("fee")}
                        placeholder="40" aria-invalid={Boolean(shown.fee)} aria-describedby={shown.fee ? `${uid}-e-fee` : undefined} autoComplete="off" />
                      <span aria-hidden="true">TL</span>
                    </span>
                    <FieldError id={`${uid}-e-fee`}>{shown.fee}</FieldError>
                  </div>
                  <div>
                    <label className="ui-label dz-label-sm" htmlFor={`${uid}-threshold`}>Şu tutarın üstü ücretsiz <span className="ui-muted">(isteğe bağlı)</span></label>
                    <span className="dz-money">
                      <input id={`${uid}-threshold`} className="ui-field ui-num" inputMode="decimal" value={form.threshold} onChange={onInput("threshold")}
                        placeholder="Eşik yok" aria-invalid={Boolean(shown.threshold)} aria-describedby={shown.threshold ? `${uid}-e-threshold` : `${uid}-h-threshold`} autoComplete="off" />
                      <span aria-hidden="true">TL</span>
                    </span>
                    <FieldError id={`${uid}-e-threshold`}>{shown.threshold}</FieldError>
                    {!shown.threshold && (
                      <p className="ui-hint dz-hint" id={`${uid}-h-threshold`}>
                        {threshold > 0 ? `${tl(threshold)} üstü siparişlerde teslimat ücretsiz.` : "Sepetteki ürün tutarı bu değere ulaşınca teslimat ücretsiz olur."}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {isYurt && (
                <p className="ui-hint dz-hint dz-hint--info"><Info aria-hidden="true" />Mevcut uygulamadan verilen yurt siparişlerinde ücret alınmaz ve genel minimum sepet geçerlidir. Buradaki ücret ve minimum yalnızca yeni (adresli) sipariş akışında uygulanır.</p>
              )}
            </div>

            <div className="dz-grid-2">
              <div className="dz-fieldset">
                <label className="ui-label" htmlFor={`${uid}-minimum`}>Minimum sepet</label>
                <span className="dz-money">
                  <input id={`${uid}-minimum`} className="ui-field ui-num" inputMode="decimal" value={form.minimum} onChange={onInput("minimum")}
                    placeholder={generalMinimum != null ? `Genel (${tl(generalMinimum)})` : "Genel minimum"}
                    aria-invalid={Boolean(shown.minimum)} aria-describedby={shown.minimum ? `${uid}-e-minimum` : `${uid}-h-minimum`} autoComplete="off" />
                  <span aria-hidden="true">TL</span>
                </span>
                <FieldError id={`${uid}-e-minimum`}>{shown.minimum}</FieldError>
                {!shown.minimum && <p className="ui-hint dz-hint" id={`${uid}-h-minimum`}>Boş = genel minimum. 0 = minimum yok.</p>}
              </div>
              <div className="dz-fieldset">
                <label className="ui-label" htmlFor={`${uid}-etaText`}>Tahmini süre</label>
                <input id={`${uid}-etaText`} className="ui-field" value={form.etaText} onChange={onInput("etaText")} maxLength={LIMITS.etaText + 10}
                  placeholder="ör. 30-60 dk" list={`${uid}-eta-presets`} aria-invalid={Boolean(shown.etaText)}
                  aria-describedby={shown.etaText ? `${uid}-e-etaText` : undefined} autoComplete="off" />
                <datalist id={`${uid}-eta-presets`}>{ETA_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
                <FieldError id={`${uid}-e-etaText`}>{shown.etaText}</FieldError>
              </div>
            </div>

            <div className="dz-fieldset dz-box">
              <div className="dz-toggle-row">
                <div>
                  <span className="dz-toggle-title" id={`${uid}-l-callback`}><PhoneCall aria-hidden="true" className="dz-toggle-icon" />İlk sipariş teyidi</span>
                  <p className="ui-hint" id={`${uid}-h-callback`}>
                    {form.callback
                      ? "Daha önce teslim edilmiş siparişi olmayan müşterinin siparişi “Teyit için ara” olarak işaretlenir."
                      : "Açarsanız müşterinin ilk siparişinde onu arayıp adresi teyit edersiniz."}
                  </p>
                </div>
                <button type="button" id={`${uid}-callback`} className="ui-icon-btn ui-switch" role="switch" aria-checked={form.callback} data-on={form.callback}
                  aria-labelledby={`${uid}-l-callback`} aria-describedby={`${uid}-h-callback`} onClick={() => set("callback")(!form.callback)} disabled={saving}>
                  {form.callback ? <ToggleRight /> : <ToggleLeft />}
                </button>
              </div>
            </div>

            <div className="dz-preview" aria-live="polite">
              <span className="dz-preview-label">Müşteri böyle görür</span>
              <span className="dz-preview-line ui-num">
                {feeSummary(preview, campaign)} · {minimumText}{form.etaText.trim() ? ` · ${form.etaText.trim()}` : ""}
              </span>
              {campaign && preview.deliveryFee > 0 && <span className="dz-preview-note">“Her yerde ücretsiz teslimat” açık olduğu için şu an ücret alınmaz.</span>}
              {!form.enabled && <span className="dz-preview-note">Kapalı bölge müşteriye gösterilmez.</span>}
            </div>
          </div>

          {children && <div className="dz-card-extra">{children}</div>}
        </div>

        <footer className="dz-card-foot" data-dirty={dirty || undefined}>
          <span className="ui-hint dz-card-dirty" aria-live="polite">{dirty ? "Kaydedilmemiş değişiklik var" : "Değişiklikler işlem kayıtlarına yazılır"}</span>
          {dirty && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={reset} disabled={saving}><RotateCcw />Vazgeç</button>
          )}
          <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm" disabled={saving || !dirty}>
            {saving ? <Loader2 className="ui-spin" /> : <Save />}Kaydet
          </button>
        </footer>
      </form>
    </section>
  );
};

export default ZoneCard;
