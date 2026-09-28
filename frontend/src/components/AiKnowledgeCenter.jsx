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

  return <div className="space-y-6">
    <section className="admin-card"><div className="admin-card-body"><h2 className="text-lg font-bold text-white">Bilgi merkezinin rolü</h2><p className="mt-2 text-sm leading-6 text-gray-300">Buraya fotokopi, iade ve teslimat politikaları, hizmet alanı ve sık sorulan sorular gibi sabit bilgileri ekleyin. Ürün, fiyat, stok, sipariş, kampanya, kupon, çalışma saati ve sepet sorularında asistan önce güncel backend verilerini güvenli araçlarla sorgular; bu kayıtlar canlı verinin yerine kullanılmaz.</p></div></section>
    {seedStatus !== null && <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200">Bilgi merkezi otomatik olarak kontrol edildi{seedStatus ? `; ${seedStatus} doğrulanmış sık sorulan bilgi eklendi.` : "; başlangıç bilgileri zaten mevcut."} Canlı değişen bilgiler buraya eklenmez.</div>}
    <section className="admin-card"><div className="admin-card-body">
      <div className="mb-5 flex items-center gap-3"><Bot className="text-emerald-400"/><div><h2 className="text-xl font-bold text-white">AI sağlayıcısı</h2><p className="text-sm text-gray-400">Anahtarlar yalnızca sunucudaki environment değişkenlerinden okunur.</p></div></div>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-sm text-gray-300">Durum<select value={config.enabled ? "on" : "off"} onChange={(e) => setConfig({ ...config, enabled: e.target.value === "on" })} className="mt-2 w-full rounded-xl border border-white/10 bg-gray-900 p-3 text-white"><option value="on">Aktif</option><option value="off">Pasif</option></select></label>
        <label className="text-sm text-gray-300">Provider<select value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-gray-900 p-3 text-white"><option value="groq">Groq</option><option value="openrouter">OpenRouter</option><option value="gemini">Gemini</option></select></label>
        <label className="text-sm text-gray-300">Model<input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-gray-900 p-3 text-white" /></label>
        <label className="text-sm text-gray-300">Geçmiş sınırı<input type="number" min="2" max="30" value={config.maxHistoryMessages} onChange={(e) => setConfig({ ...config, maxHistoryMessages: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-white/10 bg-gray-900 p-3 text-white" /></label>
      </div><button onClick={saveConfig} className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-white"><Save size={16}/>Ayarları kaydet</button>
    </div></section>

    <section className="admin-card"><div className="admin-card-body">
      <div className="mb-5 flex items-center gap-3"><BookOpen className="text-cyan-400"/><h2 className="text-xl font-bold text-white">{editingId ? "Bilgiyi düzenle" : "Yeni bilgi ekle"}</h2></div>
      <form onSubmit={saveKnowledge} className="grid gap-4 md:grid-cols-2">
        <input required placeholder="Başlık" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-xl border border-white/10 bg-gray-900 p-3 text-white" />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-xl border border-white/10 bg-gray-900 p-3 text-white">{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <textarea required rows="5" placeholder="Doğrulanmış bilgi" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="rounded-xl border border-white/10 bg-gray-900 p-3 text-white md:col-span-2" />
        <input placeholder="Anahtar kelimeler (virgülle ayırın)" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} className="rounded-xl border border-white/10 bg-gray-900 p-3 text-white" />
        <input type="number" min="0" max="100" placeholder="Öncelik" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="rounded-xl border border-white/10 bg-gray-900 p-3 text-white" />
        <div className="flex gap-3 md:col-span-2"><button className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-white">{editingId ? <Save size={16}/> : <Plus size={16}/>} {editingId ? "Güncelle" : "Bilgi ekle"}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-white"><X size={16}/>Vazgeç</button>}</div>
      </form>
    </div></section>

    <section className="admin-card"><div className="admin-card-body">
      <input placeholder="Bilgi merkezinde ara..." value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-gray-900 p-3 text-white" />
      <div className="space-y-3">{filtered.map((row) => <article key={row._id} className={`rounded-2xl border p-4 ${row.isActive ? "border-emerald-400/20 bg-emerald-400/5" : "border-white/10 bg-white/[.03] opacity-65"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-bold text-white">{row.title}</h3><span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-300">{row.category}</span><span className="text-xs text-gray-500">Öncelik {row.priority}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{row.content}</p><p className="mt-2 text-xs text-gray-500">{(row.keywords || []).join(" · ") || "Anahtar kelime yok"}</p></div>
        <div className="flex gap-2"><button onClick={() => toggle(row)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${row.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-gray-300"}`}>{row.isActive ? "Aktif" : "Pasif"}</button><button onClick={() => edit(row)} className="rounded-lg bg-white/10 p-2 text-gray-200"><Pencil size={15}/></button><button onClick={() => remove(row._id)} className="rounded-lg bg-red-500/10 p-2 text-red-300"><Trash2 size={15}/></button></div></div>
      </article>)}{!filtered.length && <p className="py-8 text-center text-gray-500">Henüz bilgi kaydı yok.</p>}</div>
    </div></section>
  </div>;
}
