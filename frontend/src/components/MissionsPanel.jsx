import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Pencil, Power, Save, Target, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";

// datetime-local alanı için yerel saat biçimi
const toLocalInput = (value) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const freshForm = () => ({
  id: null,
  title: "",
  description: "",
  targetOrders: 3,
  minOrderAmount: 300,
  rewardAmount: 50,
  rewardMinimumOrderAmount: 0,
  rewardValidityDays: 14,
  startsAt: toLocalInput(new Date()),
  endsAt: toLocalInput(new Date(Date.now() + 30 * 86400000)),
  isActive: true,
});
const formatDate = (value) => new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
const formatMoney = (value) => `₺${Number(value || 0).toLocaleString("tr-TR")}`;

// Sipariş görevleri: "X TL üzeri N sipariş ver, Y TL kupon kazan". Oluşturma, düzenleme, yayına alma ve silme.
export default function MissionsPanel() {
  const { confirm } = useConfirm();
  const [missions, setMissions] = useState([]);
  const [form, setForm] = useState(freshForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get("/missions/admin");
      setMissions(data.missions || []);
    } catch {
      toast.error("Görevler alınamadı");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const edit = (mission) => {
    setForm({
      id: mission._id,
      title: mission.title,
      description: mission.description || "",
      targetOrders: mission.targetOrders,
      minOrderAmount: mission.minOrderAmount || 0,
      rewardAmount: mission.rewardAmount,
      rewardMinimumOrderAmount: mission.rewardMinimumOrderAmount || 0,
      rewardValidityDays: mission.rewardValidityDays || 14,
      startsAt: toLocalInput(mission.startsAt),
      endsAt: toLocalInput(mission.endsAt),
      isActive: mission.isActive,
    });
    window.setTimeout(() => document.getElementById("mission-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await axios.post("/missions/admin", {
        ...form,
        targetOrders: Number(form.targetOrders),
        minOrderAmount: Number(form.minOrderAmount || 0),
        rewardAmount: Number(form.rewardAmount),
        rewardMinimumOrderAmount: Number(form.rewardMinimumOrderAmount || 0),
        rewardValidityDays: Number(form.rewardValidityDays),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      });
      toast.success(data.mission?.isActive ? "Görev yayında" : "Görev kaydedildi");
      setForm(freshForm());
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Görev kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (mission) => {
    try {
      await axios.patch(`/missions/admin/${mission._id}`, { isActive: !mission.isActive });
      toast.success(mission.isActive ? "Görev pasife alındı" : "Görev yayına alındı");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Görev güncellenemedi");
    }
  };

  const remove = async (mission) => {
    const confirmed = await confirm({
      title: "Görevi Sil",
      message: `"${mission.title}" görevini silmek istediğinize emin misiniz? Verilmiş kuponlar geçerli kalır.`,
      confirmText: "Evet, Sil",
      cancelText: "İptal",
      type: "danger",
    });
    if (!confirmed) return;
    try {
      await axios.delete(`/missions/admin/${mission._id}`);
      toast.success("Görev silindi");
      if (form.id === mission._id) setForm(freshForm());
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Görev silinemedi");
    }
  };

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const running = missions.filter((mission) => mission.running).length;

  return (
    <section className="ui-card" style={{ overflow: "hidden" }}>
      <div className="ui-card-header">
        <div>
          <h3 className="ui-title">Sipariş Görevleri</h3>
          <p className="ui-subtitle">Belirlediğin tutarın üzerinde belirlediğin sayıda sipariş veren müşteriye otomatik kupon tanımlansın.</p>
        </div>
        {running > 0 && <span className="ui-badge ui-badge--ok">{running} görev yayında</span>}
      </div>

      <form id="mission-form" onSubmit={save} className="ui-card-body ui-grid-4">
        <label className="ui-label" style={{ gridColumn: "span 2", marginBottom: 0 }}>Görev adı
          <input required minLength={3} maxLength={60} value={form.title} onChange={set("title")} placeholder="Ekim görevi" className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ gridColumn: "span 2", marginBottom: 0 }}>Müşteriye gösterilecek açıklama
          <input maxLength={160} value={form.description} onChange={set("description")} placeholder="Bu ay 3 sipariş ver, kuponu kap" className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Sipariş sayısı
          <input required min="1" max="50" step="1" type="number" value={form.targetOrders} onChange={set("targetOrders")} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Sipariş başına en az (₺)
          <input min="0" type="number" value={form.minOrderAmount} onChange={set("minOrderAmount")} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Ödül kuponu (₺)
          <input required min="1" type="number" value={form.rewardAmount} onChange={set("rewardAmount")} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Kupon için min. sepet (₺)
          <input min="0" type="number" value={form.rewardMinimumOrderAmount} onChange={set("rewardMinimumOrderAmount")} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Kupon geçerliliği (gün)
          <input required min="1" max="365" step="1" type="number" value={form.rewardValidityDays} onChange={set("rewardValidityDays")} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Başlangıç
          <input required type="datetime-local" value={form.startsAt} onChange={set("startsAt")} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Bitiş
          <input required type="datetime-local" value={form.endsAt} onChange={set("endsAt")} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-check" style={{ alignSelf: "end", minHeight: 38 }}>
          <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
          Kaydedince yayına al
        </label>
        <div className="ui-cluster ui-span-all">
          <button type="submit" disabled={saving} className="ui-btn ui-btn--primary">
            <Save />
            {form.id ? "Görevi güncelle" : "Görevi oluştur"}
          </button>
          {form.id && <button type="button" onClick={() => setForm(freshForm())} className="ui-btn">Vazgeç</button>}
          <span className="ui-hint" style={{ marginTop: 0 }}>
            Özet: {Number(form.minOrderAmount) > 0 ? `${formatMoney(form.minOrderAmount)} ve üzeri ` : ""}{form.targetOrders || "?"} teslim edilmiş sipariş → {formatMoney(form.rewardAmount)} kupon
          </span>
        </div>
      </form>

      {missions.map((mission) => {
        const open = expandedId === mission._id;
        return (
          <article key={mission._id} className="ui-list-row" style={{ flexWrap: "wrap" }}>
            <div className="ui-grow">
              <div className="ui-cluster">
                <h4 className="ui-list-title">{mission.title}</h4>
                <span className={`ui-badge ${mission.running ? "ui-badge--ok" : mission.isActive ? "ui-badge--warn" : ""}`}>
                  {mission.running ? "Yayında" : mission.isActive ? "Tarih dışında" : "Pasif"}
                </span>
              </div>
              <p className="ui-text-sm" style={{ marginTop: 4 }}><Target size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />{mission.rule}</p>
              <p className="ui-hint">
                {formatDate(mission.startsAt)} – {formatDate(mission.endsAt)} · {mission.completionCount} kişi tamamladı · {formatMoney(mission.totalReward)} kupon verildi
              </p>
            </div>
            <div className="ui-cluster">
              <button onClick={() => edit(mission)} className="ui-btn ui-btn--sm"><Pencil />Düzenle</button>
              <button onClick={() => toggle(mission)} className={`ui-btn ui-btn--sm ${mission.isActive ? "ui-btn--warn" : ""}`}><Power />{mission.isActive ? "Pasife al" : "Yayına al"}</button>
              <button onClick={() => setExpandedId(open ? null : mission._id)} className="ui-btn ui-btn--sm" aria-expanded={open}><Users />Tamamlayanlar<ChevronDown style={{ transform: open ? "rotate(180deg)" : undefined }} /></button>
              <button onClick={() => remove(mission)} className="ui-btn ui-btn--sm ui-btn--danger"><Trash2 />Sil</button>
            </div>
            {open && (
              <div style={{ flexBasis: "100%" }}>
                {mission.completions.length ? (
                  <table className="ui-table">
                    <thead><tr><th>Müşteri</th><th>Kupon</th><th>Tarih</th></tr></thead>
                    <tbody>
                      {mission.completions.map((entry) => (
                        <tr key={entry.couponCode}>
                          <td>{entry.name}</td>
                          <td className="ui-mono">{entry.couponCode}</td>
                          <td>{new Date(entry.completedAt).toLocaleString("tr-TR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="ui-hint">Henüz tamamlayan yok.</p>}
              </div>
            )}
          </article>
        );
      })}
      {!missions.length && <div className="ui-empty">Henüz görev oluşturulmadı.</div>}
    </section>
  );
}
