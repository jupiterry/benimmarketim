import { useEffect, useMemo, useState } from "react";
import { BookOpen, Bot, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";

const categories = ["Hizmetler", "Fotokopi", "Teslimat", "Kampanyalar", "Kuponlar", "Ödeme", "İade", "Çalışma Saatleri", "Sipariş", "Ürünler", "Genel"];
const emptyForm = { title: "", category: "Genel", content: "", keywords: "", isActive: true, priority: 0 };

export default function AiKnowledgeCenter() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [config, setConfig] = useState({ enabled: true, provider: "groq", model: "llama-3.1-8b-instant", maxHistoryMessages: 12 });
  const [seedStatus, setSeedStatus] = useState(null);

  const load = async () => {
    try {
      const [knowledge, aiConfig] = await Promise.all([axios.get("/ai/knowledge"), axios.get("/ai/config")]);
      setRows(knowledge.data.knowledge || []);
      setConfig(aiConfig.data.config || config);
      if (!sessionStorage.getItem("aiKnowledgeSeeded")) {
        const { data } = await axios.post("/ai/knowledge/seed");
        sessionStorage.setItem("aiKnowledgeSeeded", "true");
        setSeedStatus(data.added);
        if (data.added) {
          const refreshed = await axios.get("/ai/knowledge");
          setRows(refreshed.data.knowledge || []);
        }
      }
    } catch { toast.error("Yapay zekâ ayarları yüklenemedi"); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((row) => `${row.title} ${row.category} ${row.content} ${(row.keywords || []).join(" ")}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [rows, query]);
  const saveKnowledge = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, keywords: form.keywords.split(",").map((item) => item.trim()).filter(Boolean) };
      if (editingId) await axios.put(`/ai/knowledge/${editingId}`, payload); else await axios.post("/ai/knowledge", payload);
      toast.success(editingId ? "Bilgi güncellendi" : "Bilgi eklendi");
      setForm(emptyForm); setEditingId(null); await load();
    } catch (error) { toast.error(error.response?.data?.message || "Bilgi kaydedilemedi"); }
  };
  const edit = (row) => { setEditingId(row._id); setForm({ ...row, keywords: (row.keywords || []).join(", ") }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const remove = async (id) => { if (!confirm("Bu bilgi kaydı silinsin mi?")) return; await axios.delete(`/ai/knowledge/${id}`); setRows((current) => current.filter((row) => row._id !== id)); toast.success("Bilgi silindi"); };
  const toggle = async (row) => { const { data } = await axios.patch(`/ai/knowledge/${row._id}/status`, { isActive: !row.isActive }); setRows((current) => current.map((item) => item._id === row._id ? data.knowledge : item)); };
  const saveConfig = async () => { try { const { data } = await axios.put("/ai/config", config); setConfig(data.config); toast.success("AI sağlayıcı ayarları kaydedildi"); } catch (error) { toast.error(error.response?.data?.message || "Ayarlar kaydedilemedi"); } };

  return <div className="ui-page">
    <section className="ui-card"><div className="ui-card-body"><h2 className="ui-title">Bilgi merkezinin rolü</h2><p className="ui-subtitle" style={{ marginTop: 6, lineHeight: 1.6 }}>Buraya fotokopi, iade ve teslimat politikaları, hizmet alanı ve sık sorulan sorular gibi sabit bilgileri ekleyin. Ürün, fiyat, stok, sipariş, kampanya, kupon, çalışma saati ve sepet sorularında asistan önce güncel backend verilerini güvenli araçlarla sorgular; bu kayıtlar canlı verinin yerine kullanılmaz.</p></div></section>
    {seedStatus !== null && <div role="status" className="ui-banner ui-banner--info">Bilgi merkezi otomatik olarak kontrol edildi{seedStatus ? `; ${seedStatus} doğrulanmış sık sorulan bilgi eklendi.` : "; başlangıç bilgileri zaten mevcut."} Canlı değişen bilgiler buraya eklenmez.</div>}
    <section className="ui-card">
      <div className="ui-card-header"><div><h2 className="ui-title"><Bot/>AI sağlayıcısı</h2><p className="ui-subtitle">Anahtarlar yalnızca sunucudaki environment değişkenlerinden okunur.</p></div></div>
      <div className="ui-card-body ui-stack">
      <div className="ui-grid-4">
        <label className="ui-label">Durum<select value={config.enabled ? "on" : "off"} onChange={(e) => setConfig({ ...config, enabled: e.target.value === "on" })} className="ui-field"><option value="on">Aktif</option><option value="off">Pasif</option></select></label>
        <label className="ui-label">Provider<select value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} className="ui-field"><option value="groq">Groq</option><option value="openrouter">OpenRouter</option><option value="gemini">Gemini</option></select></label>
        <label className="ui-label">Model<input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} className="ui-field" /></label>
        <label className="ui-label">Geçmiş sınırı<input type="number" min="2" max="30" value={config.maxHistoryMessages} onChange={(e) => setConfig({ ...config, maxHistoryMessages: Number(e.target.value) })} className="ui-field" /></label>
      </div><div><button onClick={saveConfig} className="ui-btn ui-btn--primary"><Save/>Ayarları kaydet</button></div>
    </div></section>

    <section className="ui-card">
      <div className="ui-card-header"><h2 className="ui-title"><BookOpen/>{editingId ? "Bilgiyi düzenle" : "Yeni bilgi ekle"}</h2></div>
      <div className="ui-card-body">
      <form onSubmit={saveKnowledge} className="ui-grid-2">
        <input required placeholder="Başlık" aria-label="Başlık" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="ui-field" />
        <select aria-label="Kategori" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="ui-field">{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <textarea required rows="5" placeholder="Doğrulanmış bilgi" aria-label="Doğrulanmış bilgi" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="ui-field ui-span-all" />
        <input placeholder="Anahtar kelimeler (virgülle ayırın)" aria-label="Anahtar kelimeler" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} className="ui-field" />
        <input type="number" min="0" max="100" placeholder="Öncelik" aria-label="Öncelik" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="ui-field" />
        <div className="ui-cluster ui-span-all"><button className="ui-btn ui-btn--primary">{editingId ? <Save/> : <Plus/>} {editingId ? "Güncelle" : "Bilgi ekle"}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="ui-btn"><X/>Vazgeç</button>}</div>
      </form>
    </div></section>

    <section className="ui-card">
      <div className="ui-card-header"><input placeholder="Bilgi merkezinde ara..." aria-label="Bilgi merkezinde ara" value={query} onChange={(e) => setQuery(e.target.value)} className="ui-field" /></div>
      <div>{filtered.map((row) => <article key={row._id} className="ui-list-row knowledge-row" data-muted={!row.isActive}>
        <div className="ui-grow"><div className="ui-cluster"><h3 className="ui-list-title">{row.title}</h3><span className="ui-badge">{row.category}</span><span className="ui-text-xs ui-muted">Öncelik {row.priority}</span></div><p className="ui-text-sm ui-wrap-anywhere" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{row.content}</p><p className="ui-hint" style={{ marginTop: 6 }}>{(row.keywords || []).join(" · ") || "Anahtar kelime yok"}</p></div>
        <div className="ui-cluster"><button onClick={() => toggle(row)} className={`ui-badge ${row.isActive ? "ui-badge--ok" : ""}`}>{row.isActive ? "Aktif" : "Pasif"}</button><button onClick={() => edit(row)} className="ui-icon-btn ui-icon-btn--sm" aria-label="Düzenle" title="Düzenle"><Pencil/></button><button onClick={() => remove(row._id)} className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" aria-label="Sil" title="Sil"><Trash2/></button></div>
      </article>)}{!filtered.length && <p className="ui-empty">Henüz bilgi kaydı yok.</p>}</div>
    </section>
  </div>;
}
