// Bölge ekleme / düzenleme çekmecesi. Yurtların türü sabittir ve silinemez; siparişi olan bölge silinemez.
import { useMemo, useRef, useState } from "react";
import { Info, Loader2, Lock, MapPin, PhoneCall, Save, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Drawer, Segmented } from "../admin/ui";
import { useConfirm } from "../ConfirmModal";
import {
  CLOSE_REASONS, ETA_PRESETS, LIMITS, TYPES, deleteBlock, emptyForm, feeSummary, formFromZone, num, parseMoney, sameForm, tl, validateForm,
} from "./shared";

const FieldError = ({ id, children }) => (children ? <p className="dz-error" id={id} role="alert">{children}</p> : null);

const ZoneDrawer = ({ zone, zones, nextSort, generalMinimum, campaign, onClose, onSave, onDelete }) => {
  const { confirm } = useConfirm();
  const isNew = !zone;
  const isYurt = zone?.type === "yurt";
  const initial = useMemo(() => (zone ? formFromZone(zone) : emptyForm(nextSort)), [zone, nextSort]);
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false); // ilk "Kaydet"ten sonra tüm hatalar görünür
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const nameRef = useRef(null);
  const feeRef = useRef(null);

  const dirty = !sameForm(form, initial);
  const { errors, payload } = validateForm(form, { zones, editingId: zone?._id ?? null, isYurt });
  const shown = touched ? errors : {};
  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setServerError(""); };
  const onInput = (key) => (e) => set(key)(e.target.value);

  const confirmDiscard = () => confirm({
    title: "Değişiklikler kaydedilmedi",
    message: "Çekmeceyi kapatırsanız yaptığınız değişiklikler kaybolur.",
    confirmText: "Kapat, kaydetme",
    cancelText: "Düzenlemeye dön",
    type: "warning",
  });

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    const first = Object.keys(errors)[0];
    if (first) {
      const el = document.getElementById(`dz-f-${first}`);
      el?.focus();
      return;
    }
    if (!isNew && !dirty) { onClose(); return; }
    // Yurdu kapatmak mevcut uygulamada da o yurdu kapatır
    if (isYurt && zone.enabled && !payload.enabled) {
      const ok = await confirm({
        title: `${zone.name} kapatılsın mı?`,
        message: "Bu yurt mevcut mobil uygulamada da siparişe kapanır (Mağaza ayarlarındaki yurt anahtarıyla aynıdır).",
        confirmText: "Kapat",
        type: "warning",
      });
      if (!ok) return;
    }
    setSaving(true);
    setServerError("");
    const result = await onSave(payload, zone);
    setSaving(false);
    if (result?.error) setServerError(result.error);
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
  const block = zone ? deleteBlock(zone) : null;
  const typeOptions = isYurt
    ? [{ value: "yurt", label: "Yurt", icon: Lock }]
    : [{ value: "mahalle", label: "Mahalle", icon: TYPES.mahalle.icon }, { value: "koy", label: "Köy", icon: TYPES.koy.icon }];

  return (
    <Drawer
      title={isNew ? "Yeni bölge" : zone.name}
      subtitle={isNew ? "Mahalle ya da köy ekleyin" : `${TYPES[zone.type].label} · bu ay ${num(zone.ordersThisMonth)}, toplam ${num(zone.ordersTotal)} sipariş`}
      icon={MapPin}
      width={480}
      dirty={dirty && !saving}
      onDirtyClose={confirmDiscard}
      onClose={onClose}
      className="dz-drawer"
      footer={(
        <>
          <button type="button" className="ui-btn" onClick={async () => { if (!dirty || await confirmDiscard()) onClose(); }} disabled={saving}>Vazgeç</button>
          <button type="submit" form="dz-zone-form" className="ui-btn ui-btn--primary" disabled={saving}>
            {saving ? <Loader2 className="ui-spin" /> : <Save />}{isNew ? "Bölgeyi ekle" : "Kaydet"}
          </button>
        </>
      )}
    >
      <form id="dz-zone-form" className="dz-form" onSubmit={submit} noValidate
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}>
        {serverError && <div className="ui-banner ui-banner--danger" role="alert"><Info /><span className="ui-grow">{serverError}</span></div>}

        <div className="dz-fieldset">
          <label className="ui-label" htmlFor="dz-f-name">Bölge adı</label>
          <input ref={nameRef} id="dz-f-name" className="ui-field" value={form.name} onChange={onInput("name")} maxLength={LIMITS.name + 10}
            placeholder={form.type === "koy" ? "ör. Yazıcık Köyü" : "ör. Cumhuriyet Mahallesi"} autoFocus={isNew}
            aria-invalid={Boolean(shown.name)} aria-describedby={shown.name ? "dz-e-name" : undefined} autoComplete="off" />
          <FieldError id="dz-e-name">{shown.name}</FieldError>
        </div>

        <div className="dz-fieldset">
          <span className="ui-label" id="dz-l-type">Tür</span>
          <Segmented ariaLabel="Bölge türü" value={form.type} onChange={isYurt ? () => {} : set("type")} options={typeOptions} />
          {isYurt && <p className="ui-hint dz-hint">Yurt bölgelerinin türü değiştirilemez ve silinemez.</p>}
        </div>

        <div className="dz-fieldset dz-box">
          <div className="dz-toggle-row">
            <div>
              <span className="dz-toggle-title" id="dz-l-enabled">Siparişe açık</span>
              <p className="ui-hint">{form.enabled ? "Müşteriler bu bölgeye sipariş verebilir." : "Bölge listede görünmez, sipariş alınmaz."}</p>
            </div>
            <button type="button" id="dz-f-enabled" className="ui-icon-btn ui-switch" role="switch" aria-checked={form.enabled} data-on={form.enabled}
              aria-labelledby="dz-l-enabled" onClick={() => set("enabled")(!form.enabled)}>
              {form.enabled ? <ToggleRight /> : <ToggleLeft />}
            </button>
          </div>
          {!form.enabled && (
            <div className="dz-subfield">
              <label className="ui-label" htmlFor="dz-f-closedReason">Kapanma nedeni <span className="ui-muted">(isteğe bağlı)</span></label>
              <input id="dz-f-closedReason" className="ui-field" value={form.closedReason} onChange={onInput("closedReason")}
                maxLength={LIMITS.closedReason + 10} placeholder="ör. Yoğunluk nedeniyle geçici olarak kapalı"
                aria-invalid={Boolean(shown.closedReason)} aria-describedby={shown.closedReason ? "dz-e-closedReason" : undefined} />
              <div className="ui-chips dz-presets" role="group" aria-label="Hazır nedenler">
                {CLOSE_REASONS.map((r) => (
                  <button key={r} type="button" aria-pressed={form.closedReason === r} onClick={() => set("closedReason")(form.closedReason === r ? "" : r)}>
                    {r.replace(/ nedeniyle.*$/, "").replace(" yetersizliği", " yok")}
                  </button>
                ))}
              </div>
              <FieldError id="dz-e-closedReason">{shown.closedReason}</FieldError>
            </div>
          )}
        </div>

        <div className="dz-fieldset">
          <span className="ui-label">Teslimat ücreti</span>
          <Segmented ariaLabel="Teslimat ücreti" value={form.feeMode}
            onChange={(v) => { set("feeMode")(v); if (v === "paid") setTimeout(() => feeRef.current?.focus(), 0); }}
            options={[{ value: "free", label: "Ücretsiz" }, { value: "paid", label: "Ücretli" }]} />
          {form.feeMode === "paid" && (
            <div className="dz-money-grid">
              <div>
                <label className="ui-label dz-label-sm" htmlFor="dz-f-fee">Ücret</label>
                <span className="dz-money">
                  <input ref={feeRef} id="dz-f-fee" className="ui-field ui-num" inputMode="decimal" value={form.fee} onChange={onInput("fee")}
                    placeholder="40" aria-invalid={Boolean(shown.fee)} aria-describedby={shown.fee ? "dz-e-fee" : undefined} autoComplete="off" />
                  <span aria-hidden="true">TL</span>
                </span>
                <FieldError id="dz-e-fee">{shown.fee}</FieldError>
              </div>
              <div>
                <label className="ui-label dz-label-sm" htmlFor="dz-f-threshold">Şu tutarın üstü ücretsiz <span className="ui-muted">(isteğe bağlı)</span></label>
                <span className="dz-money">
                  <input id="dz-f-threshold" className="ui-field ui-num" inputMode="decimal" value={form.threshold} onChange={onInput("threshold")}
                    placeholder="Eşik yok" aria-invalid={Boolean(shown.threshold)} aria-describedby={shown.threshold ? "dz-e-threshold" : "dz-h-threshold"} autoComplete="off" />
                  <span aria-hidden="true">TL</span>
                </span>
                <FieldError id="dz-e-threshold">{shown.threshold}</FieldError>
                {!shown.threshold && <p className="ui-hint dz-hint" id="dz-h-threshold">Sepetteki ürün tutarı bu değere ulaşınca teslimat ücretsiz olur.</p>}
              </div>
            </div>
          )}
          {isYurt && (
            <p className="ui-hint dz-hint dz-hint--info"><Info aria-hidden="true" />Mevcut uygulamadan verilen yurt siparişlerinde ücret alınmaz ve genel minimum sepet geçerlidir. Buradaki ücret ve minimum yalnızca yeni (adresli) sipariş akışında uygulanır.</p>
          )}
        </div>

        <div className="dz-fieldset">
          <label className="ui-label" htmlFor="dz-f-minimum">Minimum sepet <span className="ui-muted">(isteğe bağlı)</span></label>
          <span className="dz-money">
            <input id="dz-f-minimum" className="ui-field ui-num" inputMode="decimal" value={form.minimum} onChange={onInput("minimum")}
              placeholder={generalMinimum != null ? `Genel (${tl(generalMinimum)})` : "Genel minimum"}
              aria-invalid={Boolean(shown.minimum)} aria-describedby={shown.minimum ? "dz-e-minimum" : "dz-h-minimum"} autoComplete="off" />
            <span aria-hidden="true">TL</span>
          </span>
          <FieldError id="dz-e-minimum">{shown.minimum}</FieldError>
          {!shown.minimum && <p className="ui-hint dz-hint" id="dz-h-minimum">Boş bırakırsanız Mağaza ayarlarındaki genel minimum geçerli olur. 0 yazarsanız minimum aranmaz.</p>}
        </div>

        <div className="dz-fieldset dz-box">
          <div className="dz-toggle-row">
            <div>
              <span className="dz-toggle-title" id="dz-l-callback"><PhoneCall aria-hidden="true" className="dz-toggle-icon" />İlk siparişte telefonla teyit</span>
              <p className="ui-hint" id="dz-h-callback">
                {form.callback
                  ? "Bu bölgede daha önce teslim edilmiş siparişi olmayan müşterinin siparişi “Teyit için ara” olarak işaretlenir."
                  : "Uzak köyler için önerilir: ilk siparişte müşteriyi arayıp adresi teyit edersiniz."}
              </p>
            </div>
            <button type="button" id="dz-f-callback" className="ui-icon-btn ui-switch" role="switch" aria-checked={form.callback} data-on={form.callback}
              aria-labelledby="dz-l-callback" aria-describedby="dz-h-callback" onClick={() => set("callback")(!form.callback)}>
              {form.callback ? <ToggleRight /> : <ToggleLeft />}
            </button>
          </div>
        </div>

        <div className="dz-grid-2">
          <div className="dz-fieldset">
            <label className="ui-label" htmlFor="dz-f-etaText">Tahmini süre</label>
            <input id="dz-f-etaText" className="ui-field" value={form.etaText} onChange={onInput("etaText")} maxLength={LIMITS.etaText + 10}
              placeholder="ör. 30-60 dk" list="dz-eta-presets" aria-invalid={Boolean(shown.etaText)} aria-describedby={shown.etaText ? "dz-e-etaText" : undefined} autoComplete="off" />
            <datalist id="dz-eta-presets">{ETA_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
            <FieldError id="dz-e-etaText">{shown.etaText}</FieldError>
          </div>
          <div className="dz-fieldset">
            <label className="ui-label" htmlFor="dz-f-sortOrder">Liste sırası</label>
            <input id="dz-f-sortOrder" className="ui-field ui-num" inputMode="numeric" value={form.sortOrder} onChange={onInput("sortOrder")}
              aria-invalid={Boolean(shown.sortOrder)} aria-describedby={shown.sortOrder ? "dz-e-sortOrder" : "dz-h-sortOrder"} autoComplete="off" />
            <FieldError id="dz-e-sortOrder">{shown.sortOrder}</FieldError>
            {!shown.sortOrder && <p className="ui-hint dz-hint" id="dz-h-sortOrder">Küçük sayı önce görünür.</p>}
          </div>
        </div>

        <div className="dz-preview" aria-live="polite">
          <span className="dz-preview-label">Müşteri böyle görür</span>
          <strong className="dz-preview-name">{form.name.trim() || "Bölge adı"}</strong>
          <span className="dz-preview-line ui-num">
            {feeSummary(preview, campaign)} · {minimumText}{form.etaText.trim() ? ` · ${form.etaText.trim()}` : ""}
          </span>
          {campaign && preview.deliveryFee > 0 && <span className="dz-preview-note">“Her yerde ücretsiz teslimat” açık olduğu için şu an ücret alınmaz.</span>}
          {!form.enabled && <span className="dz-preview-note">Kapalı bölgeler müşteriye gösterilmez.</span>}
          {form.callback && <span className="dz-preview-note">İlk siparişte: “İlk siparişin için seni arayıp teyit edeceğiz.”</span>}
        </div>

        {!isNew && (
          <div className="dz-danger">
            <div>
              <strong>Bölgeyi sil</strong>
              <p className="ui-hint">{block || "Bu bölgenin hiç siparişi yok; silebilirsiniz."}</p>
            </div>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" disabled={Boolean(block) || saving} onClick={() => onDelete(zone)}>
              <Trash2 />Sil
            </button>
          </div>
        )}
        <p className="ui-hint dz-kbd-hint"><kbd className="ui-kbd">Ctrl</kbd><kbd className="ui-kbd">Enter</kbd> kaydet · <kbd className="ui-kbd">Esc</kbd> kapat</p>
      </form>
    </Drawer>
  );
};

export default ZoneDrawer;
