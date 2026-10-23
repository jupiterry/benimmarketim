// "Kuryeler" kartı: sipariş ataması ve kurye bazında gün sonu için kurye listesi (ekle / düzenle / pasif yap).
// Uç noktalar: GET/PUT /delivery/admin/couriers (PUT listenin tamamını gönderir; kimlikler korunur, eski siparişlerdeki
// kurye adı değişmez). Kurye silinmez, pasif yapılır: pasif kurye yeni siparişe atanamaz ama geçmişte görünür.
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Bike, Check, Loader2, Pencil, Phone, Plus, RefreshCw, ToggleLeft, ToggleRight, X } from "lucide-react";
import axios from "../../lib/axios";
import { Skeleton } from "../admin/ui";
import { errorMessage, num } from "./shared";

const API = "/delivery/admin/couriers";
const LIMITS = { name: 40, phone: 20, max: 30 };
const PHONE_RE = /^[0-9+()\s-]{7,20}$/;

const normalize = (list) => (Array.isArray(list) ? list : []).map((c) => ({
  _id: String(c._id || ""), name: String(c.name || ""), phone: String(c.phone || ""), active: c.active !== false,
}));
const tel = (phone) => {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
};
const validate = ({ name, phone }, couriers, editingId) => {
  const errors = {};
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName) errors.name = "Kurye adını yazın.";
  else if (cleanName.length > LIMITS.name) errors.name = `En fazla ${LIMITS.name} karakter.`;
  else if (couriers.some((c) => c._id !== editingId && c.name.toLocaleLowerCase("tr") === cleanName.toLocaleLowerCase("tr"))) errors.name = "Bu adda bir kurye zaten var.";
  const cleanPhone = phone.trim().replace(/\s+/g, " ");
  if (cleanPhone && !PHONE_RE.test(cleanPhone)) errors.phone = "Geçerli bir telefon yazın ya da boş bırakın.";
  return { errors, value: { name: cleanName, phone: cleanPhone } };
};

/** Ekleme / düzenleme satırı (Enter kaydeder, Esc vazgeçer) */
function CourierForm({ initial, couriers, editingId, busy, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const nameRef = useRef(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const { errors, value } = validate(form, couriers, editingId);
  const shown = touched ? errors : {};
  const idBase = `dz-c-${editingId || "new"}`;
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    await onSubmit(value);
  };
  return (
    <form className="dz-courier-form" onSubmit={submit} noValidate
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <div className="dz-courier-inputs">
        <div className="dz-courier-input">
          <label className="ui-label dz-label-sm" htmlFor={`${idBase}-name`}>Ad</label>
          <input ref={nameRef} id={`${idBase}-name`} className="ui-field" value={form.name} maxLength={LIMITS.name + 5} autoComplete="off"
            placeholder="ör. Mehmet" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-esc-clear="1"
            aria-invalid={Boolean(shown.name)} aria-describedby={shown.name ? `${idBase}-ename` : undefined} />
          {shown.name && <p className="dz-error" id={`${idBase}-ename`} role="alert">{shown.name}</p>}
        </div>
        <div className="dz-courier-input">
          <label className="ui-label dz-label-sm" htmlFor={`${idBase}-phone`}>Telefon <span className="ui-muted">(isteğe bağlı)</span></label>
          <input id={`${idBase}-phone`} className="ui-field ui-num" value={form.phone} maxLength={LIMITS.phone + 5} autoComplete="off"
            inputMode="tel" placeholder="05xx xxx xx xx" onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} data-esc-clear="1"
            aria-invalid={Boolean(shown.phone)} aria-describedby={shown.phone ? `${idBase}-ephone` : undefined} />
          {shown.phone && <p className="dz-error" id={`${idBase}-ephone`} role="alert">{shown.phone}</p>}
        </div>
      </div>
      <div className="dz-courier-form-actions">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onCancel} disabled={busy}>Vazgeç</button>
        <button type="submit" className="ui-btn ui-btn--sm ui-btn--primary" disabled={busy}>
          {busy ? <Loader2 className="ui-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{editingId ? "Kaydet" : "Kuryeyi ekle"}
        </button>
      </div>
    </form>
  );
}

export default function CouriersCard() {
  const [couriers, setCouriers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // "new" | courier _id
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(API);
      setCouriers(normalize(data?.couriers));
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Kuryeler yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  /** Listenin tamamını kaydeder; sunucu yanıtı listeyi yeniler */
  const save = async (next, busyKey, success) => {
    setBusyId(busyKey);
    try {
      const { data } = await axios.put(API, { couriers: next.map(({ _id, name, phone, active }) => (_id ? { _id, name, phone, active } : { name, phone, active })) });
      setCouriers(normalize(data?.couriers));
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Kuryeler kaydedilemedi"));
      return false;
    } finally {
      setBusyId("");
    }
  };

  const list = couriers || [];
  const activeCount = list.filter((c) => c.active).length;
  const full = list.length >= LIMITS.max;

  const add = async (value) => {
    const ok = await save([...list, { ...value, active: true }], "new", `${value.name} kurye olarak eklendi`);
    if (ok) setEditing(null);
  };
  const update = async (courier, value) => {
    const ok = await save(list.map((c) => (c._id === courier._id ? { ...c, ...value } : c)), courier._id, `${value.name} kaydedildi`);
    if (ok) setEditing(null);
  };
  const toggle = (courier) => save(
    list.map((c) => (c._id === courier._id ? { ...c, active: !c.active } : c)),
    courier._id,
    courier.active ? `${courier.name} pasif yapıldı; yeni siparişe atanamaz` : `${courier.name} yeniden aktif`,
  );

  return (
    <section className="ui-panel dz-couriers" aria-labelledby="dz-couriers-title">
      <div className="dz-couriers-head">
        <div className="dz-couriers-title">
          <span className="dz-couriers-icon" aria-hidden="true"><Bike /></span>
          <div>
            <h2 className="dz-h2" id="dz-couriers-title">Kuryeler</h2>
            <p className="ui-hint">Siparişler ekranında kurye atanır; gün sonunda kurye bazında nakit ve kart tahsilatı görünür.</p>
          </div>
        </div>
        {couriers && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setEditing("new")} disabled={editing === "new" || full || Boolean(busyId)}
            title={full ? `En fazla ${LIMITS.max} kurye` : "Kurye ekle"}>
            <Plus aria-hidden="true" />Kurye ekle
          </button>
        )}
      </div>

      {loading && !couriers ? (
        <div className="dz-couriers-skel" aria-busy="true"><Skeleton height={40} radius={10} /><Skeleton height={40} radius={10} /></div>
      ) : !couriers ? (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle aria-hidden="true" /><span className="ui-grow">{error || "Kuryeler yüklenemedi"}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}><RefreshCw aria-hidden="true" />Tekrar dene</button>
        </div>
      ) : (
        <>
          {editing === "new" && (
            <CourierForm initial={{ name: "", phone: "" }} couriers={list} editingId={null} busy={busyId === "new"}
              onSubmit={add} onCancel={() => setEditing(null)} />
          )}
          {list.length === 0 && editing !== "new" ? (
            <p className="dz-couriers-empty">Henüz kurye yok. İlk kuryeyi ekleyin; siparişleri kuryelere atayıp kurye fişi yazdırabilirsiniz.</p>
          ) : (
            <ul className="dz-courier-list" aria-label="Kurye listesi">
              {list.map((c) => (
                <li key={c._id} className="dz-courier" data-inactive={c.active ? undefined : "true"}>
                  {editing === c._id ? (
                    <CourierForm initial={{ name: c.name, phone: c.phone }} couriers={list} editingId={c._id} busy={busyId === c._id}
                      onSubmit={(value) => update(c, value)} onCancel={() => setEditing(null)} />
                  ) : (
                    <>
                      <span className="dz-courier-main">
                        <strong className="ui-truncate">{c.name}</strong>
                        {c.phone ? (
                          tel(c.phone)
                            ? <a className="dz-courier-phone ui-num" href={tel(c.phone)}><Phone aria-hidden="true" />{c.phone}</a>
                            : <span className="dz-courier-phone ui-num">{c.phone}</span>
                        ) : <span className="dz-courier-phone ui-muted">Telefon yok</span>}
                      </span>
                      <span className={`ui-badge${c.active ? " ui-badge--ok" : ""}`}>{c.active ? "Aktif" : "Pasif"}</span>
                      <span className="dz-courier-actions">
                        {busyId === c._id && <Loader2 className="ui-spin dz-busy" aria-label="Kaydediliyor" />}
                        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => setEditing(c._id)} disabled={Boolean(busyId)}
                          aria-label={`${c.name} düzenle`} title="Düzenle"><Pencil /></button>
                        <button type="button" className="ui-icon-btn ui-switch dz-switch" role="switch" aria-checked={c.active} data-on={c.active}
                          onClick={() => toggle(c)} disabled={Boolean(busyId)}
                          aria-label={`${c.name} ${c.active ? "aktif; pasif yap" : "pasif; aktif yap"}`} title={c.active ? "Pasif yap" : "Aktif yap"}>
                          {c.active ? <ToggleRight /> : <ToggleLeft />}
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {list.length > 0 && (
            <p className="ui-hint dz-couriers-foot">
              <span className="ui-num">{num(activeCount)}</span> aktif · <span className="ui-num">{num(list.length - activeCount)}</span> pasif
              {" · "}Pasif kurye yeni siparişe atanamaz; eski siparişlerde adı görünmeye devam eder.
              {error && couriers && <span className="dz-couriers-err"> <X aria-hidden="true" />Son yenileme başarısız.</span>}
            </p>
          )}
        </>
      )}
    </section>
  );
}
