import { useEffect, useId, useRef, useState } from "react";
import { Eye, FlaskConical, RotateCcw, Save, ToggleLeft, ToggleRight, Users } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { InlineLoading, Segmented, formatDateTime } from "../admin/ui";
import {
  BODY_LIMIT, COUPON_ONLY, COUPON_SUFFIX, INFO, PLACEHOLDER_HINTS, TIMING, TITLE_LIMIT,
  placeholdersIn, renderTemplate, sameDraft, sampleVars, toPayload, validateDraft,
} from "./automationShared";

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

const Counter = ({ value, limit }) => (
  <span className="au-counter ui-num" data-state={value > limit ? "over" : value >= limit * 0.85 ? "near" : "ok"}>{value}/{limit}</span>
);

/**
 * Tek otomasyon kartı: aç/kapat, zamanlama, metin (canlı önizleme), kupon, "Kaç kişiye gider?", test, istatistik.
 * Kaydetme ve aç/kapat üst bileşende (onSave / onToggle) yapılır.
 */
export default function AutomationCard({ type, saved, stats, defaults, configured, saving, onSave, onToggle }) {
  const info = INFO[type];
  const Icon = info.icon;
  const uid = useId();
  const [draft, setDraft] = useState(() => clone(saved));
  const [preview, setPreview] = useState(null);
  const [testing, setTesting] = useState(false);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef("body");
  const savedRef = useRef(saved);

  // Sunucudaki ayar değişince (kaydetme, yenileme) kaydedilmemiş değişiklik yoksa taslak güncellenir
  useEffect(() => {
    setDraft((current) => (sameDraft(type, current, savedRef.current) ? clone(saved) : current));
    savedRef.current = saved;
  }, [saved, type]);

  const enabled = Boolean(saved?.enabled);
  const dirty = !sameDraft(type, draft, saved);
  const errors = validateDraft(type, draft);
  const hasErrors = Object.keys(errors).length > 0;
  const hasCoupon = Boolean(draft.coupon);
  const couponOn = Boolean(draft.coupon?.enabled);
  const vars = sampleVars(type, draft);
  const previewTitle = renderTemplate(draft.title, vars);
  const previewBody = renderTemplate(draft.body, vars);
  const usesCoupon = [...placeholdersIn(draft.title), ...placeholdersIn(draft.body)].includes("kupon");
  const sent30 = stats?.sent30 || 0;

  const set = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setPreview(null);
  };
  const setCoupon = (key, value) => {
    setDraft((current) => ({ ...current, coupon: { ...current.coupon, [key]: value } }));
    setPreview(null);
  };

  // {alan} etiketini imlecin olduğu yere ekler
  const insert = (key) => {
    const field = lastField.current;
    const element = field === "title" ? titleRef.current : bodyRef.current;
    const token = `{${key}}`;
    const value = String(draft[field] || "");
    const limit = field === "title" ? TITLE_LIMIT : BODY_LIMIT;
    if (value.length + token.length > limit) {
      toast.error(`${field === "title" ? "Başlık" : "Mesaj"} karakter sınırına ulaştı`);
      return;
    }
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    set(field, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const appendCouponText = () => {
    const next = `${String(draft.body || "").trim()}${COUPON_SUFFIX}`;
    if (next.length > BODY_LIMIT) {
      toast.error(`Mesaj ${BODY_LIMIT} karakteri geçer; önce mesajı kısaltın`);
      return;
    }
    set("body", next);
  };

  const runPreview = async () => {
    setPreview({ loading: true });
    try {
      const { data } = await axios.post(`/notification-automations/${type}/preview`, { config: toPayload(type, draft) });
      setPreview({ ...data, at: Date.now() });
    } catch (error) {
      setPreview({ error: error.response?.data?.message || "Hesaplanamadı. Tekrar deneyin." });
    }
  };

  const sendTest = async () => {
    if (testing) return;
    try {
      setTesting(true);
      const { data } = await axios.post(`/notification-automations/${type}/test`, { config: toPayload(type, draft) });
      toast.success(data.message || "Test bildirimi gönderildi");
    } catch (error) {
      toast.error(error.response?.data?.message || "Test bildirimi gönderilemedi");
    } finally {
      setTesting(false);
    }
  };

  const resetDefaults = () => {
    setDraft({ ...clone(defaults), enabled });
    setPreview(null);
    toast("Varsayılan metin ve ayarlar forma geldi; kaydetmeyi unutmayın.");
  };

  return (
    <article className="ui-panel au-card" data-on={enabled} aria-labelledby={`${uid}-title`}>
      <header className="au-card-head">
        <span className="au-card-icon"><Icon aria-hidden="true" /></span>
        <div className="au-card-heading">
          <div className="au-card-titleline">
            <h3 id={`${uid}-title`}>{info.label}</h3>
            <span className={`ui-badge ${enabled ? "ui-badge--ok" : ""}`}>{enabled ? "Açık" : "Kapalı"}</span>
            {dirty && <span className="ui-badge ui-badge--warn">Kaydedilmedi</span>}
          </div>
          <p>{info.who}</p>
        </div>
        <button type="button" className="ui-icon-btn ui-switch au-card-switch" role="switch" aria-checked={enabled} data-on={enabled}
          aria-label={`${info.label} ${enabled ? "kapat" : "aç"}`} disabled={saving || (!enabled && hasErrors)}
          title={!enabled && hasErrors ? "Önce formdaki hataları düzeltin" : undefined}
          onClick={() => onToggle(type, !enabled, toPayload(type, draft))}>
          {enabled ? <ToggleRight /> : <ToggleLeft />}
        </button>
      </header>

      <dl className="au-stats" aria-label="Son gönderimler">
        <div><dt>Son 7 gün</dt><dd><strong className="ui-num">{stats?.sent7 || 0}</strong> gönderildi · <strong className="ui-num">{stats?.conversions7 || 0}</strong> sipariş</dd></div>
        <div><dt>Son 30 gün</dt><dd><strong className="ui-num">{sent30}</strong> gönderildi · <strong className="ui-num">{stats?.conversions30 || 0}</strong> sipariş</dd></div>
        <div><dt>Dönüşüm</dt><dd><strong className="ui-num">%{percent(stats?.conversions30 || 0, sent30)}</strong>{stats?.failed30 ? <span className="ui-muted"> · {stats.failed30} ulaşmadı</span> : null}</dd></div>
      </dl>

      <div className="au-card-body">
        <section className="au-section" aria-labelledby={`${uid}-timing`}>
          <h4 id={`${uid}-timing`} className="au-section-title">Ne zaman gider?</h4>
          <div className="au-timing">
            {TIMING[type].map((field) => (
              <div className="au-field" key={field.key}>
                <label className="ui-label" htmlFor={`${uid}-${field.key}`}>{field.label}</label>
                <div className="au-input-unit">
                  <input id={`${uid}-${field.key}`} className="ui-field" type="number" inputMode="numeric" min={field.min} max={field.max} step={1}
                    value={draft[field.key] ?? ""} aria-invalid={Boolean(errors[field.key])}
                    onChange={(event) => set(field.key, event.target.value)} />
                  <span aria-hidden="true">{field.unit}</span>
                </div>
                {errors[field.key] ? <span className="au-error">{errors[field.key]}</span> : field.hint ? <span className="ui-hint">{field.hint}</span> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="au-section" aria-labelledby={`${uid}-text`}>
          <h4 id={`${uid}-text`} className="au-section-title">Bildirim metni</h4>
          <div className="au-text-grid">
            <div className="au-text-fields">
              <div className="au-field">
                <div className="ui-between">
                  <label className="ui-label" htmlFor={`${uid}-ttl`}>Başlık</label>
                  <Counter value={String(draft.title || "").length} limit={TITLE_LIMIT} />
                </div>
                <input id={`${uid}-ttl`} ref={titleRef} className="ui-field" maxLength={TITLE_LIMIT + 20} value={draft.title || ""}
                  aria-invalid={Boolean(errors.title)} onFocus={() => { lastField.current = "title"; }}
                  onChange={(event) => set("title", event.target.value)} />
                {errors.title && <span className="au-error">{errors.title}</span>}
              </div>
              <div className="au-field">
                <div className="ui-between">
                  <label className="ui-label" htmlFor={`${uid}-body`}>Mesaj</label>
                  <Counter value={String(draft.body || "").length} limit={BODY_LIMIT} />
                </div>
                <textarea id={`${uid}-body`} ref={bodyRef} className="ui-field au-textarea" rows={3} maxLength={BODY_LIMIT + 40} value={draft.body || ""}
                  aria-invalid={Boolean(errors.body)} onFocus={() => { lastField.current = "body"; }}
                  onChange={(event) => set("body", event.target.value)} />
                {errors.body && <span className="au-error">{errors.body}</span>}
              </div>
              <div className="au-placeholders" role="group" aria-label="Metne alan ekle">
                <span className="ui-hint">Ekle:</span>
                {Object.entries(PLACEHOLDER_HINTS[type]).map(([key, hint]) => {
                  const locked = hasCoupon && COUPON_ONLY.has(key) && !couponOn;
                  return (
                    <button type="button" key={key} className="au-chip" disabled={locked} title={locked ? "Önce kuponu açın" : `${hint} — imlecin olduğu yere ekler`}
                      onMouseDown={(event) => event.preventDefault()} onClick={() => insert(key)}>
                      {`{${key}}`}<span className="au-chip-hint">{hint}</span>
                    </button>
                  );
                })}
              </div>
              {errors.text && <span className="au-error" role="alert">{errors.text}</span>}
            </div>

            <div className="au-preview" aria-label="Telefonda görünüm (örnek değerlerle)">
              <span className="au-preview-label">Önizleme</span>
              <div className="au-notification">
                <img className="au-notification-icon" src="/favicon.png" alt="" width="32" height="32" />
                <div className="au-notification-text">
                  <div className="ui-between">
                    <span className="au-notification-app">Benim Marketim</span>
                    <span className="au-notification-time">şimdi</span>
                  </div>
                  <strong>{previewTitle || "Bildirim başlığı"}</strong>
                  <p>{previewBody || "Mesaj burada görünecek."}</p>
                </div>
              </div>
              <span className="ui-hint">Dokununca açılır: {info.target}. Örnek değerler: {vars.ad}{vars.kupon ? `, ${vars.kupon}` : ""}.</span>
            </div>
          </div>
        </section>

        {hasCoupon && (
          <section className="au-section" aria-labelledby={`${uid}-coupon`}>
            <div className="au-toggle-row">
              <div>
                <h4 id={`${uid}-coupon`} className="au-section-title">Kişiye özel kupon</h4>
                <p className="ui-hint">{couponOn ? "Bildirimle birlikte müşteriye tek kullanımlık bir kupon tanımlanır; ulaşmayan bildirimin kuponu kapatılır." : "Kapalı: bildirim kuponsuz gider."}</p>
              </div>
              <button type="button" className="ui-icon-btn ui-switch" role="switch" aria-checked={couponOn} data-on={couponOn}
                aria-labelledby={`${uid}-coupon`} onClick={() => setCoupon("enabled", !couponOn)}>
                {couponOn ? <ToggleRight /> : <ToggleLeft />}
              </button>
            </div>
            {couponOn && (
              <div className="au-coupon">
                <Segmented ariaLabel="Kupon türü" size="sm" value={draft.coupon.type}
                  onChange={(value) => setCoupon("type", value)}
                  options={[{ value: "percentage", label: "Yüzde (%)" }, { value: "fixed", label: "Tutar (TL)" }]} />
                <div className="au-timing">
                  <div className="au-field">
                    <label className="ui-label" htmlFor={`${uid}-cval`}>İndirim</label>
                    <div className="au-input-unit">
                      <input id={`${uid}-cval`} className="ui-field" type="number" inputMode="decimal" min={1} max={draft.coupon.type === "fixed" ? 1000 : 50}
                        value={draft.coupon.value ?? ""} aria-invalid={Boolean(errors.couponValue)} onChange={(event) => setCoupon("value", event.target.value)} />
                      <span aria-hidden="true">{draft.coupon.type === "fixed" ? "TL" : "%"}</span>
                    </div>
                    {errors.couponValue && <span className="au-error">{errors.couponValue}</span>}
                  </div>
                  <div className="au-field">
                    <label className="ui-label" htmlFor={`${uid}-cdays`}>Geçerlilik</label>
                    <div className="au-input-unit">
                      <input id={`${uid}-cdays`} className="ui-field" type="number" inputMode="numeric" min={1} max={60}
                        value={draft.coupon.validDays ?? ""} aria-invalid={Boolean(errors.couponDays)} onChange={(event) => setCoupon("validDays", event.target.value)} />
                      <span aria-hidden="true">gün</span>
                    </div>
                    {errors.couponDays && <span className="au-error">{errors.couponDays}</span>}
                  </div>
                  <div className="au-field">
                    <label className="ui-label" htmlFor={`${uid}-cmin`}>Alt sipariş tutarı</label>
                    <div className="au-input-unit">
                      <input id={`${uid}-cmin`} className="ui-field" type="number" inputMode="decimal" min={0} max={10000}
                        value={draft.coupon.minOrderAmount ?? ""} aria-invalid={Boolean(errors.couponMin)} onChange={(event) => setCoupon("minOrderAmount", event.target.value)} />
                      <span aria-hidden="true">TL</span>
                    </div>
                    {errors.couponMin ? <span className="au-error">{errors.couponMin}</span> : <span className="ui-hint">0 = alt tutar yok</span>}
                  </div>
                </div>
                {!usesCoupon && (
                  <div className="au-coupon-tip">
                    <span className="ui-hint">Müşteri kodu görsün diye metne {"{kupon}"} ekleyin.</span>
                    <button type="button" className="ui-btn ui-btn--sm" onClick={appendCouponText}>Metne kupon kodunu ekle</button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {preview && (
        <div className="au-reach" role="status" aria-live="polite">
          {preview.loading ? <InlineLoading label="Hesaplanıyor…" /> : preview.error ? (
            <span className="au-error">{preview.error}</span>
          ) : (
            <>
              <div className="au-reach-main">
                <Users aria-hidden="true" />
                <span><strong className="ui-num">{preview.count}</strong> kişiye gider{!preview.enabled && " (açılırsa)"}</span>
                {preview.candidates > preview.count && (
                  <span className="ui-muted">· {preview.candidates - preview.count} kişi izin, cihaz ya da sıklık sınırı nedeniyle atlanır</span>
                )}
              </div>
              {preview.samples?.length > 0 && <span className="au-reach-samples">Örnek: {preview.samples.join(", ")}</span>}
              {preview.notes?.map((note) => <p key={note} className="ui-hint">{note}</p>)}
            </>
          )}
        </div>
      )}

      <footer className="au-card-foot">
        <div className="au-card-foot-meta">
          {stats?.lastSentAt ? <span className="ui-hint">Son gönderim: {formatDateTime(stats.lastSentAt)}</span> : <span className="ui-hint">Henüz gönderim yok</span>}
        </div>
        <div className="au-card-actions">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={resetDefaults} title="Varsayılan metin ve ayarları forma getirir">
            <RotateCcw />Varsayılan
          </button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={runPreview} disabled={preview?.loading || hasErrors}
            title={hasErrors ? "Önce formdaki hataları düzeltin" : "Gönderim yapmaz"}>
            <Eye />Kaç kişiye gider?
          </button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={sendTest} disabled={testing || !configured || hasErrors}
            title={!configured ? "Bildirim servisi yapılandırılmamış" : "Yalnızca sizin telefonunuza, örnek değerlerle gider"}>
            <FlaskConical className={testing ? "ui-spin" : ""} />{testing ? "Gönderiliyor…" : "Bana test gönder"}
          </button>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => onSave(type, toPayload(type, draft))} disabled={!dirty || hasErrors || saving}>
            <Save />{saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </footer>
    </article>
  );
}
