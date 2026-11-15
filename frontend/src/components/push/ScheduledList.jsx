// "Planlı" listesi: ileri bir zamana planlanmış bildirimler. Her satırda düzenle (metin, kitle, bölge, ekran, zaman),
// iptal ve "Şimdi gönder". Sunucu yalnızca hâlâ planlı olan kaydı değiştirir; gönderimi başlamış bir kayıt için
// 409 döner ve liste yenilenir.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, Pencil, Send, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import { Drawer } from "../admin/ui";
import ScheduleField from "./ScheduleField";
import { BODY_LIMIT, TITLE_LIMIT, formatWhen, fromTrInput, scheduleProblem, sendTimeWarnings, toTrInput } from "./broadcastShared";

const EDIT_FORM = "push-scheduled-edit";

function EditDrawer({ item, audiences, zones, targets, hours, limits, now, onClose, onSaved }) {
  const { confirm } = useConfirm();
  const initial = { title: item.title, body: item.body, audience: item.audience, zone: item.zone || "", target: item.target || "home", custom: toTrInput(item.scheduledFor) };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setError(""); };
  const dirty = Object.keys(initial).some((key) => initial[key] !== form[key]);
  const at = fromTrInput(form.custom);
  // Saat değiştirilmediyse (yalnızca metin düzeltiliyorsa) kayıtlı an korunur ve "çok yakın" denetimi sunucuya bırakılır
  const timeChanged = form.custom !== initial.custom;
  const problem = timeChanged ? scheduleProblem(at, now, limits) : "";
  const title = form.title.trim();
  const body = form.body.trim();
  const canSave = dirty && !saving && title && body && !problem && Number.isFinite(at);

  const save = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    try {
      setSaving(true);
      setError("");
      const { data } = await axios.put(`/notifications/broadcasts/scheduled/${item._id}`, {
        title, body, audience: form.audience, zone: form.zone, target: form.target,
        scheduledFor: timeChanged ? new Date(at).toISOString() : new Date(item.scheduledFor).toISOString(),
      });
      toast.success(data.message || "Planlı bildirim güncellendi");
      onSaved();
    } catch (failure) {
      const message = failure.response?.data?.message || "Planlı bildirim güncellenemedi. Tekrar deneyin.";
      setError(message);
      // Kayıt artık planlı değilse (gönderildi / iptal edildi) liste eskimiştir: yenilenir, çekmece kapanır
      if (failure.response?.data?.reason === "not_scheduled") {
        toast.error(message);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title="Planlı bildirimi düzenle" subtitle={`Plan: ${formatWhen(item.scheduledFor, now)}`} icon={CalendarClock} width={480} onClose={onClose}
      dirty={dirty} onDirtyClose={() => confirm({ title: "Değişiklikler kaydedilmedi", message: "Yaptığınız değişiklikler kaybolacak. Kapatılsın mı?", confirmText: "Kapat", cancelText: "Düzenlemeye dön", type: "warning" })}
      footer={<>
        <button type="button" className="ui-btn" onClick={onClose} disabled={saving}>Vazgeç</button>
        <button type="submit" form={EDIT_FORM} className="ui-btn ui-btn--primary" disabled={!canSave}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
      </>}>
      <form id={EDIT_FORM} className="ui-stack" onSubmit={save}>
        {error && <div className="ui-banner ui-banner--danger" role="alert"><AlertTriangle /><span className="ui-grow">{error}</span></div>}
        <div>
          <div className="ui-between">
            <label className="ui-label" htmlFor="pbx-edit-title">Başlık</label>
            <span className="ui-num pbx-count">{form.title.length}/{TITLE_LIMIT}</span>
          </div>
          <input id="pbx-edit-title" className="ui-field" maxLength={TITLE_LIMIT} value={form.title} onChange={set("title")} required />
        </div>
        <div>
          <div className="ui-between">
            <label className="ui-label" htmlFor="pbx-edit-body">Mesaj</label>
            <span className="ui-num pbx-count">{form.body.length}/{BODY_LIMIT}</span>
          </div>
          <textarea id="pbx-edit-body" className="ui-field" rows={4} maxLength={BODY_LIMIT} value={form.body} onChange={set("body")} required />
        </div>
        <div className="pbx-edit-grid">
          <div>
            <label className="ui-label" htmlFor="pbx-edit-audience">Kime</label>
            <select id="pbx-edit-audience" className="ui-field" value={form.audience} onChange={set("audience")}>
              {audiences.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              {!audiences.some((entry) => entry.id === form.audience) && <option value={form.audience}>{form.audience}</option>}
            </select>
          </div>
          <div>
            <label className="ui-label" htmlFor="pbx-edit-zone">Bölge</label>
            <select id="pbx-edit-zone" className="ui-field" value={form.zone} onChange={set("zone")}>
              {zones.map((zone) => <option key={zone.id || "all"} value={zone.id}>{zone.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="ui-label" htmlFor="pbx-edit-target">Dokununca açılacak ekran</label>
          <select id="pbx-edit-target" className="ui-field" value={form.target} onChange={set("target")}>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
        </div>
        <div>
          <span className="ui-label">Ne zaman gönderilsin?</span>
          <ScheduleField when="custom" onWhen={() => {}} custom={form.custom} onCustom={(value) => { setForm((current) => ({ ...current, custom: value })); setError(""); }}
            now={now} limits={limits} problem={Number.isFinite(at) ? problem : "Tarih ve saat seçin."} warnings={sendTimeWarnings(at, hours, now)} inputId="pbx-edit-when" timeOnly />
        </div>
        <p className="ui-hint" style={{ marginTop: 0 }}>Kitle, gönderim anında yeniden hesaplanır; bugünkü kişi sayısı o güne kadar değişebilir.</p>
      </form>
    </Drawer>
  );
}

export default function ScheduledList({ items, audiences, zones, targets, hours, limits, now, configured, onChanged, onFailure }) {
  const { confirm } = useConfirm();
  const [editing, setEditing] = useState(null);
  // Aynı anda tek işlem: çift tıklama ikinci isteği göndermez
  const [busy, setBusy] = useState("");
  // Düzenlenen kayıt listeden düştüyse (gönderildi / iptal edildi) çekmece kapanır
  useEffect(() => {
    if (!editing || items.some((item) => item._id === editing)) return;
    setEditing(null);
    toast("Düzenlediğiniz bildirim artık planlı değil: gönderildi ya da iptal edildi.");
  }, [items, editing]);
  const editingItem = editing ? items.find((item) => item._id === editing) : null;
  const audienceLabel = (item) => audiences.find((entry) => entry.id === item.audience)?.label || item.audience;
  const zoneLabel = (item) => (item.zone ? zones.find((zone) => zone.id === item.zone)?.label || item.zone : "");

  const cancel = async (item) => {
    if (busy) return;
    const confirmed = await confirm({
      title: "Planlı bildirimi iptal et",
      message: `"${item.title}" bildirimi ${formatWhen(item.scheduledFor, Date.now())} için planlı. İptal edilirse gönderilmez.`,
      confirmText: "İptal et", cancelText: "Vazgeç", type: "danger",
    });
    if (!confirmed) return;
    try {
      setBusy(item._id);
      const { data } = await axios.delete(`/notifications/broadcasts/scheduled/${item._id}`);
      toast.success(data.message || "Planlı bildirim iptal edildi");
    } catch (error) {
      toast.error(error.response?.data?.message || "Planlı bildirim iptal edilemedi");
    } finally {
      setBusy("");
      onChanged();
    }
  };

  const sendNow = async (item) => {
    if (busy) return;
    const confirmed = await confirm({
      title: "Şimdi gönder",
      message: `"${item.title}" bildirimi planlanan saati (${formatWhen(item.scheduledFor, Date.now())}) beklemeden şimdi gönderilecek: ${audienceLabel(item)}${zoneLabel(item) ? ` · ${zoneLabel(item)}` : ""}. Gönderilen bildirim geri alınamaz.`,
      confirmText: "Şimdi gönder", cancelText: "Vazgeç", type: "warning",
    });
    if (!confirmed) return;
    try {
      setBusy(item._id);
      onFailure("");
      const { data } = await axios.post(`/notifications/broadcasts/scheduled/${item._id}/send`);
      toast.success(data.message || "Bildirim gönderildi");
    } catch (error) {
      onFailure(error.response?.data?.message || "Bildirim gönderilemedi");
      toast.error("Bildirim gönderilemedi");
    } finally {
      setBusy("");
      onChanged();
    }
  };

  // Çekmece yan sütunun (position: sticky → kendi katman bağlamı) dışına, panel köküne taşınır; yoksa üst çubuğun altında kalır
  const host = typeof document === "undefined" ? null : document.querySelector(".admin-layout");
  const drawer = editingItem ? (
    <EditDrawer key={editingItem._id} item={editingItem} audiences={audiences} zones={zones} targets={targets} hours={hours} limits={limits} now={now}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
  ) : null;

  return (
    <section className="ui-panel" aria-label="Planlı bildirimler">
      <div className="ui-panel-head">
        <h2>Planlı</h2>
        {items.length > 0 && <span className="ui-badge ui-badge--info ui-num">{items.length}/{limits.maxScheduled}</span>}
      </div>
      {items.length ? (
        <ol className="pbx-scheduled">
          {items.map((item) => {
            const warnings = sendTimeWarnings(new Date(item.scheduledFor).getTime(), hours, now);
            const late = new Date(item.scheduledFor).getTime() < now;
            return (
              <li key={item._id} className="pbx-scheduled-item">
                <div className="pbx-scheduled-when">
                  <CalendarClock aria-hidden="true" />
                  <strong>{formatWhen(item.scheduledFor, now)}</strong>
                  {late && <span className="ui-badge ui-badge--warn">Sırada</span>}
                  {warnings.length > 0 && <span className="pbx-warn-dot" title={warnings.join(" ")}><AlertTriangle aria-label={warnings.join(" ")} /></span>}
                </div>
                <h3 className="ui-wrap-anywhere">{item.title}</h3>
                <p className="ui-wrap-anywhere">{item.body}</p>
                <div className="push-history-meta">
                  <span>{audienceLabel(item)}</span>
                  {item.zone && <span className="ui-badge">{zoneLabel(item)}</span>}
                  {item.sentBy?.name && <span>{item.sentBy.name}</span>}
                </div>
                <div className="pbx-actions">
                  <button type="button" className="ui-btn ui-btn--sm" disabled={Boolean(busy)} onClick={() => setEditing(item._id)}><Pencil />Düzenle</button>
                  <button type="button" className="ui-btn ui-btn--sm" disabled={Boolean(busy) || !configured} onClick={() => sendNow(item)}>
                    <Send />{busy === item._id ? "İşleniyor…" : "Şimdi gönder"}
                  </button>
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" disabled={Boolean(busy)} onClick={() => cancel(item)}><Trash2 />İptal et</button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <div className="ui-empty pbx-empty">Planlı bildirim yok. “Ne zaman gönderilsin?” adımında ileri bir saat seçerek planlayabilirsiniz.</div>}
      {editingItem && (host ? createPortal(drawer, host) : drawer)}
    </section>
  );
}
