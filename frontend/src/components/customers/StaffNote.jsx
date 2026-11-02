// Personelin iç notu ve işaretleri (yalnızca panel; müşteri hiçbir yerde görmez).
// PATCH /users/:id/staff-note { text?, flags?, baseUpdatedAt? } → { success, staffNote, staffFlags }
// baseUpdatedAt: düzenlemeye başlanan notun sürümü; bu arada başka yönetici kaydettiyse sunucu 409 döner, not ezilmez.
import { useEffect, useId, useRef, useState } from "react";
import { Check, Lock, Pencil, PhoneCall, Plus, Save, StickyNote, X } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import { formatDateTime } from "../admin/ui";
import { STAFF_FLAGS, STAFF_FLAG_BY_KEY, STAFF_NOTE_MAX } from "../../lib/staffFlags";
import { STAFF_FLAG_ICONS } from "./shared";

const CALL_BEFORE = "call_before";
const errorText = (error, fallback) => error?.response?.data?.message || fallback;

const StaffNotePanel = ({ userId, note, flags, deliveryFailures, onChange, onDirtyChange }) => {
  const { confirm } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [flagBusy, setFlagBusy] = useState(null); // kaydedilen işaret anahtarı
  const [conflict, setConflict] = useState(null); // { text } — 409 sonrası güncel not (silindiyse "")
  const [suggestHidden, setSuggestHidden] = useState(false);
  const baseRef = useRef(null); // düzenlemeye başlanan notun sürümü (updatedAt | null)
  const textareaRef = useRef(null);
  const viewButtonRef = useRef(null); // "Düzenle" / "İç not ekle": düzenleme bitince odak buraya döner
  const busyRef = useRef(false); // işaret kaydı sürüyor (çift tıklama iki istek göndermesin)
  const savingRef = useRef(false); // not kaydı sürüyor (hızlı iki Ctrl+Enter iki istek göndermesin)
  const fieldId = useId();
  const hintId = useId();
  const headingId = useId();

  const activeFlags = Array.isArray(flags) ? flags.filter((key) => STAFF_FLAG_BY_KEY[key]) : [];
  const savedText = note?.text || "";
  const dirty = editing && draft.trim() !== savedText;
  const length = draft.trim().length;
  const failures = Number(deliveryFailures?.total) || 0;
  const suggest = failures >= 2 && !activeFlags.includes(CALL_BEFORE) && !suggestHidden;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const apply = (data, fallback = {}) => onChange?.({
    staffNote: data?.staffNote === undefined ? (fallback.staffNote ?? note ?? null) : data.staffNote,
    staffFlags: Array.isArray(data?.staffFlags) ? data.staffFlags : (fallback.staffFlags ?? activeFlags),
  });

  const startEdit = () => {
    baseRef.current = note?.updatedAt ?? null;
    setDraft(savedText);
    setConflict(null);
    setEditing(true);
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    });
  };
  const closeEditor = () => {
    setEditing(false);
    setDraft("");
    setConflict(null);
    requestAnimationFrame(() => viewButtonRef.current?.focus());
  };
  const cancelEdit = closeEditor;

  const saveNote = async () => {
    if (savingRef.current) return;
    const text = draft.trim();
    if (text.length > STAFF_NOTE_MAX) { toast.error(`İç not en fazla ${STAFF_NOTE_MAX} karakter olabilir`); return; }
    if (text === savedText && !conflict) { cancelEdit(); return; }
    if (!text && savedText) {
      const ok = await confirm({
        title: "İç notu sil",
        message: "Bu müşterinin iç notu silinecek. Devam edilsin mi?",
        confirmText: "Notu sil",
        cancelText: "Vazgeç",
        type: "danger",
      });
      if (!ok) return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingNote(true);
    try {
      const { data } = await axios.patch(`/users/${userId}/staff-note`, { text, baseUpdatedAt: baseRef.current });
      apply(data);
      closeEditor();
      toast.success(text ? "İç not kaydedildi" : "İç not silindi");
    } catch (error) {
      const data = error.response?.data;
      if (error.response?.status === 409 && data?.conflict) {
        // Başka bir yönetici bu arada kaydetti: güncel not gösterilir, taslak korunur; yeni kayıt güncel sürüme göre yapılır
        apply(data);
        baseRef.current = data.staffNote?.updatedAt ?? null;
        setConflict({ text: data.staffNote?.text || "" });
        toast.error(errorText(error, "İç not bu arada değişti"));
      } else {
        toast.error(errorText(error, "İç not kaydedilemedi"));
      }
    } finally {
      savingRef.current = false;
      setSavingNote(false);
    }
  };

  const toggleFlag = async (key) => {
    if (busyRef.current || !STAFF_FLAG_BY_KEY[key]) return;
    const on = activeFlags.includes(key);
    const next = on ? activeFlags.filter((item) => item !== key) : [...activeFlags, key];
    busyRef.current = true;
    setFlagBusy(key);
    try {
      const { data } = await axios.patch(`/users/${userId}/staff-note`, { flags: next });
      apply(data, { staffFlags: next });
      toast.success(on ? `“${STAFF_FLAG_BY_KEY[key].label}” kaldırıldı` : `“${STAFF_FLAG_BY_KEY[key].label}” eklendi`);
    } catch (error) {
      toast.error(errorText(error, "İşaret kaydedilemedi"));
    } finally {
      busyRef.current = false;
      setFlagBusy(null);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveNote();
    } else if (event.key === "Escape" && !savingNote) {
      // Alan içindeyken çekmece kapanmaz (data-esc-clear). Değişiklik yoksa düzenleme kapanır; varsa odak alandan
      // çıkar, ikinci Esc çekmecenin "kaydedilmemiş değişiklik" sorusunu açar.
      event.preventDefault();
      if (dirty) event.currentTarget.blur();
      else cancelEdit();
    }
  };

  return (
    <section className="cus-staff" aria-labelledby={headingId}>
      <div className="cus-staff-head">
        <Lock aria-hidden="true" />
        <h3 id={headingId}>İç not ve işaretler</h3>
        <span className="cus-staff-private">Yalnızca ekip görür · müşteriye gösterilmez</span>
      </div>

      <div className="cus-staff-flags" role="group" aria-label="İşaretler">
        {STAFF_FLAGS.map((flag) => {
          const on = activeFlags.includes(flag.key);
          const busy = flagBusy === flag.key;
          const Icon = STAFF_FLAG_ICONS[flag.key] || Check;
          return (
            <button
              key={flag.key}
              type="button"
              className="cus-flag"
              data-tone={flag.tone}
              aria-pressed={on}
              aria-busy={busy || undefined}
              aria-disabled={Boolean(flagBusy) || undefined}
              onClick={() => toggleFlag(flag.key)}
              title={on ? `“${flag.label}” işaretini kaldır` : `“${flag.label}” olarak işaretle`}
            >
              {busy ? <span className="cus-mini-spin" aria-hidden="true" /> : on ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}
              {flag.label}
            </button>
          );
        })}
      </div>

      {suggest && (
        <div className="cus-staff-suggest" role="status">
          <PhoneCall aria-hidden="true" />
          <span className="ui-grow">Bu müşteriye {failures} kez teslim edilemedi. “Siparişten önce ara” işareti eklensin mi?</span>
          <span className="cus-staff-suggest-actions">
            <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => toggleFlag(CALL_BEFORE)} aria-disabled={Boolean(flagBusy) || undefined}>
              <Plus />Ekle
            </button>
            <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => setSuggestHidden(true)} aria-label="Öneriyi gizle" title="Şimdilik gizle"><X /></button>
          </span>
        </div>
      )}

      {editing ? (
        <form className="cus-staff-form" onSubmit={(event) => { event.preventDefault(); saveNote(); }}>
          {conflict && (
            <div className="cus-staff-conflict" role="alert">
              <strong>Başka bir yönetici notu değiştirdi.</strong>
              {conflict.text ? <p>{conflict.text}</p> : <p>Not silinmiş.</p>}
              {conflict.text && (
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setDraft(conflict.text); setConflict(null); }}>Güncel notu kullan</button>
              )}
            </div>
          )}
          <label className="ui-label" htmlFor={fieldId}>İç not</label>
          <textarea
            id={fieldId}
            ref={textareaRef}
            className="ui-field cus-staff-text"
            value={draft}
            maxLength={STAFF_NOTE_MAX}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Örn. Zil çalışmıyor, gelince arayın. Bina arka girişten."
            aria-describedby={hintId}
            data-esc-clear="1"
            readOnly={savingNote}
          />
          <div className="cus-staff-actions">
            <span id={hintId} className="ui-hint cus-staff-count ui-num">
              {length}/{STAFF_NOTE_MAX} karakter<span className="cus-staff-kbd"> · Ctrl+Enter ile kaydedin</span>
            </span>
            <span className="ui-grow" />
            <button type="button" className="ui-btn ui-btn--sm" onClick={cancelEdit} disabled={savingNote}>Vazgeç</button>
            <button type="submit" className={`ui-btn ui-btn--sm ${!length && savedText ? "ui-btn--danger" : "ui-btn--primary"}`} disabled={savingNote || (!dirty && !conflict)}>
              <Save />{savingNote ? "Kaydediliyor…" : !length && savedText ? "Notu sil" : "Kaydet"}
            </button>
          </div>
        </form>
      ) : savedText ? (
        <div className="cus-staff-note">
          <StickyNote aria-hidden="true" />
          <div className="cus-staff-note-body">
            <p>{savedText}</p>
            <span className="cus-when-sub">
              {[note?.updatedBy?.name || "Bir yönetici", note?.updatedAt ? formatDateTime(note.updatedAt) : ""].filter(Boolean).join(" · ")}
            </span>
          </div>
          <button ref={viewButtonRef} type="button" className="ui-btn ui-btn--sm" onClick={startEdit}><Pencil />Düzenle</button>
        </div>
      ) : (
        <button ref={viewButtonRef} type="button" className="cus-staff-add" onClick={startEdit}>
          <Plus aria-hidden="true" />
          <span>İç not ekle</span>
          <span className="cus-when-sub">Kapı, adres tarifi, ödeme alışkanlığı gibi ekibin bilmesi gerekenler</span>
        </button>
      )}
    </section>
  );
};

export default StaffNotePanel;
