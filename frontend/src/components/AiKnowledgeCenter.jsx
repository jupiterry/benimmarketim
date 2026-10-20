// Yapay zekâ bilgi merkezi: asistanın kullanacağı doğrulanmış, sabit mağaza bilgileri.
// Kart ızgarası + arama/kategori filtresi + ekleme/düzenleme çekmecesi + sağlayıcı ayarları çekmecesi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BookOpen, Bot, CheckCircle2, ChevronDown, Info, Pencil, Plus, Power, RefreshCw, Save, Search, Settings2, Tag, Trash2, X,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import {
  Drawer, EmptyState, KpiCard, KpiGrid, PageHeader, Segmented, ShortcutHelp, SkeletonCards,
  fold, timeAgo, undoable, useDebounced, useListShortcuts, useNow, usePref,
} from "./admin/ui";
import "../styles/ai-knowledge.css";

const CATEGORIES = ["Hizmetler", "Fotokopi", "Teslimat", "Kampanyalar", "Kuponlar", "Ödeme", "İade", "Çalışma Saatleri", "Sipariş", "Ürünler", "Genel"];
const PROVIDERS = [
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
];
const DEFAULT_CONFIG = { enabled: true, provider: "groq", model: "llama-3.1-8b-instant", maxHistoryMessages: 12 };
const SORTS = [
  { value: "priority", label: "Öncelik" },
  { value: "updated", label: "Son güncellenen" },
  { value: "title", label: "Başlık" },
];
const priorityTone = (p) => (p >= 60 ? "danger" : p >= 30 ? "warn" : "");
const toForm = (row) => ({
  title: row?.title || "", category: row?.category || "Genel", content: row?.content || "",
  keywords: Array.isArray(row?.keywords) ? row.keywords : [], isActive: row ? row.isActive !== false : true, priority: row ? Number(row.priority) || 0 : 10,
});

// ── Anahtar kelime girişi (virgül ya da Enter ile ekle) ────────────────
const KeywordInput = ({ value, onChange, id }) => {
  const [draft, setDraft] = useState("");
  const add = (raw) => {
    const items = String(raw).split(",").map((s) => s.trim().toLocaleLowerCase("tr-TR")).filter(Boolean);
    if (!items.length) return;
    onChange([...new Set([...value, ...items])].slice(0, 30));
    setDraft("");
  };
  return (
    <div className="aik-keywords">
      {value.map((k) => (
        <span key={k} className="aik-keyword">
          {k}
          <button type="button" aria-label={`${k} anahtar kelimesini kaldır`} onClick={() => onChange(value.filter((x) => x !== k))}><X /></button>
        </span>
      ))}
      <input id={id} className="aik-keyword-input" placeholder={value.length ? "Ekle…" : "ör. fotokopi, renkli baskı"} value={draft}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => draft.trim() && add(draft)} />
    </div>
  );
};

// ── Bilgi ekleme / düzenleme çekmecesi ─────────────────────────────────
const KnowledgeDrawer = ({ row, categories, saving, onClose, onSave, onDelete }) => {
  const { confirm } = useConfirm();
  const [form, setForm] = useState(() => toForm(row));
  const [customMode, setCustomMode] = useState(() => Boolean(row?.category && !categories.includes(row.category)));
  const [customCategory, setCustomCategory] = useState(() => (row?.category && !categories.includes(row.category) ? row.category : ""));
  const initial = useMemo(() => JSON.stringify(toForm(row)), [row]);
  const category = customMode ? customCategory.trim() : form.category;
  const dirty = JSON.stringify({ ...form, category }) !== initial;
  const valid = form.title.trim().length >= 3 && form.content.trim().length >= 10 && category.length >= 2;

  useEffect(() => { setForm(toForm(row)); }, [row]);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ ...form, category, title: form.title.trim(), content: form.content.trim() });
  };
  const onDirtyClose = () => confirm({ title: "Kaydedilmemiş değişiklik", message: "Değişiklikler kaydedilmedi. Yine de kapatılsın mı?", confirmText: "Kapat", cancelText: "Geri dön", type: "warning" });

  return (
    <Drawer title={row ? "Bilgiyi düzenle" : "Yeni bilgi"} subtitle={row ? `Son güncelleme ${timeAgo(row.updatedAt)}` : "Asistanın kullanacağı doğrulanmış bilgi"} icon={BookOpen} width={560}
      onClose={onClose} dirty={dirty} onDirtyClose={onDirtyClose}
      footer={(
        <>
          {row && <button type="button" className="ui-btn ui-btn--ghost aik-delete" onClick={() => onDelete(row)}><Trash2 aria-hidden="true" />Sil</button>}
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="aik-form" className="ui-btn ui-btn--primary" disabled={!valid || !dirty || saving}>
            {saving ? <RefreshCw className="ui-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{row ? "Kaydet" : "Bilgi ekle"}
          </button>
        </>
      )}>
      <form id="aik-form" className="aik-form" onSubmit={submit}>
        <div>
          <label className="ui-label" htmlFor="aik-title">Başlık <span className="ui-muted">(müşterinin sorusu gibi yazın)</span></label>
          <input id="aik-title" className="ui-field" required maxLength={160} placeholder="ör. Fotokopi için hangi dosyaları yükleyebilirim?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="aik-form-row">
          <div className="ui-grow">
            <label className="ui-label" htmlFor="aik-category">Kategori</label>
            <select id="aik-category" className="ui-field" value={customMode ? "__custom" : form.category}
              onChange={(e) => { if (e.target.value === "__custom") setCustomMode(true); else { setCustomMode(false); setForm({ ...form, category: e.target.value }); } }}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__custom">Yeni kategori…</option>
            </select>
            {customMode && <input className="ui-field aik-custom-cat" placeholder="Kategori adı" maxLength={80} autoFocus value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} />}
          </div>
          <div className="aik-priority">
            <label className="ui-label" htmlFor="aik-priority">Öncelik <span className="ui-num">{form.priority}</span></label>
            <input id="aik-priority" type="range" min="0" max="100" step="5" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            <span className="ui-hint">Yüksek öncelik, aynı konuda önce kullanılır.</span>
          </div>
        </div>
        <div>
          <label className="ui-label" htmlFor="aik-content">Doğrulanmış bilgi <span className="ui-muted">{form.content.length}/10000</span></label>
          <textarea id="aik-content" className="ui-field aik-textarea" required rows={7} maxLength={10000} placeholder="Asistanın müşteriye söyleyeceği cevap. Fiyat, stok, kampanya gibi canlı değişen bilgileri buraya yazmayın."
            value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div>
          <label className="ui-label" htmlFor="aik-keywords">Anahtar kelimeler <span className="ui-muted">(virgül ya da Enter ile ayırın)</span></label>
          <KeywordInput id="aik-keywords" value={form.keywords} onChange={(keywords) => setForm({ ...form, keywords })} />
        </div>
        <button type="button" className="ui-toggle" aria-pressed={form.isActive} onClick={() => setForm({ ...form, isActive: !form.isActive })}>
          <i /><span>{form.isActive ? "Aktif · asistan bu bilgiyi kullanır" : "Pasif · asistan bu bilgiyi kullanmaz"}</span>
        </button>
      </form>
    </Drawer>
  );
};

// ── Sağlayıcı ayarları çekmecesi ───────────────────────────────────────
const ConfigDrawer = ({ config, saving, onClose, onSave }) => {
  const [form, setForm] = useState({ ...DEFAULT_CONFIG, ...config });
  const dirty = JSON.stringify(form) !== JSON.stringify({ ...DEFAULT_CONFIG, ...config });
  return (
    <Drawer title="Yapay zekâ sağlayıcısı" subtitle="Anahtarlar yalnızca sunucudaki ortam değişkenlerinden okunur" icon={Bot} width={460} onClose={onClose}
      footer={(
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" className="ui-btn ui-btn--primary" disabled={!dirty || saving || !form.model.trim()} onClick={() => onSave(form)}>
            {saving ? <RefreshCw className="ui-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Ayarları kaydet
          </button>
        </>
      )}>
      <div className="aik-form">
        <button type="button" className="ui-option" aria-pressed={form.enabled} onClick={() => setForm({ ...form, enabled: !form.enabled })}>
          <Power aria-hidden="true" />
          <span className="ui-grow">{form.enabled ? "Asistan açık" : "Asistan kapalı"}<small>{form.enabled ? "Müşteri sohbetlerini yapay zekâ yanıtlar." : "Sohbetler doğrudan ekibe düşer."}</small></span>
        </button>
        <div>
          <label className="ui-label" htmlFor="aik-provider">Sağlayıcı</label>
          <select id="aik-provider" className="ui-field" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="ui-label" htmlFor="aik-model">Model</label>
          <input id="aik-model" className="ui-field ui-mono" value={form.model} placeholder="ör. llama-3.1-8b-instant" onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </div>
        <div>
          <label className="ui-label" htmlFor="aik-history">Sohbet geçmişi sınırı <span className="ui-muted">(2–30 mesaj)</span></label>
          <input id="aik-history" type="number" min="2" max="30" className="ui-field" value={form.maxHistoryMessages} onChange={(e) => setForm({ ...form, maxHistoryMessages: Math.max(2, Math.min(30, Number(e.target.value) || 2)) })} />
          <span className="ui-hint">Asistanın her yanıtta hatırlayacağı önceki mesaj sayısı.</span>
        </div>
      </div>
    </Drawer>
  );
};

// ── Ana ekran ─────────────────────────────────────────────────────────
export default function AiKnowledgeCenter() {
  const [rows, setRows] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [active, setActive] = useState("all");
  const [sort, setSort] = usePref("admin-ai-knowledge-sort", "priority");
  const [roleOpen, setRoleOpen] = usePref("admin-ai-knowledge-role", true);
  const [seedStatus, setSeedStatus] = useState(null);
  const [drawer, setDrawer] = useState(null); // { row } | null
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef(null);
  const search = useDebounced(query, 200);
  const now = useNow();

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [knowledge, aiConfig] = await Promise.all([axios.get("/ai/knowledge"), axios.get("/ai/config").catch(() => null)]);
      let list = knowledge.data.knowledge || [];
      if (aiConfig?.data?.config) setConfig({ ...DEFAULT_CONFIG, ...aiConfig.data.config });
      // Başlangıç bilgileri oturumda bir kez kontrol edilir (zaten varsa eklenmez)
      if (!sessionStorage.getItem("aiKnowledgeSeeded")) {
        try {
          const { data } = await axios.post("/ai/knowledge/seed");
          sessionStorage.setItem("aiKnowledgeSeeded", "true");
          setSeedStatus(data.added || 0);
          if (data.added) list = (await axios.get("/ai/knowledge")).data.knowledge || list;
        } catch { /* tohumlama isteğe bağlı */ }
      }
      setRows(list);
    } catch (err) {
      setError(err?.response?.data?.message || "Bilgi merkezi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => [...new Set([...CATEGORIES, ...rows.map((r) => r.category).filter(Boolean)])], [rows]);
  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, passive: 0, byCategory: {} };
    for (const r of rows) {
      if (r.isActive !== false) c.active += 1; else c.passive += 1;
      c.byCategory[r.category] = (c.byCategory[r.category] || 0) + 1;
    }
    return c;
  }, [rows]);
  const usedCategories = categories.filter((c) => counts.byCategory[c]);

  const visible = useMemo(() => {
    const q = fold(search);
    const list = rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (active === "active" && r.isActive === false) return false;
      if (active === "passive" && r.isActive !== false) return false;
      if (!q) return true;
      return fold(`${r.title} ${r.category} ${r.content} ${(r.keywords || []).join(" ")}`).includes(q);
    });
    return [...list].sort((a, b) => {
      if (sort === "title") return String(a.title).localeCompare(String(b.title), "tr");
      if (sort === "updated") return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      return (b.priority || 0) - (a.priority || 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }, [rows, category, active, search, sort]);
  const hasFilters = category !== "all" || active !== "all" || Boolean(search);
  useEffect(() => { setCursor(-1); }, [category, active, search, sort]);

  // ── İşlemler ──
  const save = async (payload) => {
    setSaving(true);
    try {
      const row = drawer?.row;
      const { data } = row ? await axios.put(`/ai/knowledge/${row._id}`, payload) : await axios.post("/ai/knowledge", payload);
      const saved = data.knowledge;
      setRows((list) => (row ? list.map((r) => (r._id === row._id ? saved : r)) : [saved, ...list]));
      toast.success(row ? "Bilgi güncellendi" : "Bilgi eklendi");
      setDrawer(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Bilgi kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (row) => {
    const next = !(row.isActive !== false);
    setRows((list) => list.map((r) => (r._id === row._id ? { ...r, isActive: next } : r)));
    try {
      const { data } = await axios.patch(`/ai/knowledge/${row._id}/status`, { isActive: next });
      setRows((list) => list.map((r) => (r._id === row._id ? data.knowledge : r)));
    } catch (err) {
      setRows((list) => list.map((r) => (r._id === row._id ? { ...r, isActive: !next } : r)));
      toast.error(err?.response?.data?.message || "Durum değiştirilemedi");
    }
  };
  const remove = (row) => {
    const snapshot = rows;
    setRows((list) => list.filter((r) => r._id !== row._id));
    if (drawer?.row?._id === row._id) setDrawer(null);
    undoable({
      message: `“${row.title}” silindi`,
      icon: <Trash2 />,
      commit: async () => {
        try {
          await axios.delete(`/ai/knowledge/${row._id}`);
        } catch (err) {
          toast.error(err?.response?.data?.message || "Bilgi silinemedi");
          setRows(snapshot);
        }
      },
      undo: () => setRows(snapshot),
    });
  };
  const saveConfig = async (form) => {
    setSaving(true);
    try {
      const { data } = await axios.put("/ai/config", form);
      setConfig({ ...DEFAULT_CONFIG, ...data.config });
      toast.success("Sağlayıcı ayarları kaydedildi");
      setConfigOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: (dir) => setCursor((c) => Math.max(0, Math.min(visible.length - 1, c + dir))),
    open: () => { if (cursor >= 0 && visible[cursor]) setDrawer({ row: visible[cursor] }); },
    escape: () => setCursor(-1),
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
    extra: { n: () => setDrawer({ row: null }) },
  });
  useEffect(() => {
    if (cursor < 0) return;
    document.querySelector(`.aik-card[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="ui-page aik">
      <PageHeader
        title="Yapay Zekâ Bilgi Merkezi"
        description="Asistanın kullanacağı doğrulanmış mağaza bilgilerini yönetin."
        meta={rows.length ? `${counts.active} aktif bilgi` : undefined}
        actions={(
          <>
            <button type="button" className="ui-btn" onClick={() => setConfigOpen(true)}><Settings2 aria-hidden="true" />Sağlayıcı ayarları</button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => setDrawer({ row: null })}><Plus aria-hidden="true" />Yeni bilgi</button>
          </>
        )}
      />

      {loading && !rows.length ? <SkeletonCards count={4} /> : (
        <KpiGrid>
          <KpiCard icon={BookOpen} label="Bilgi kaydı" value={rows.length} note={`${usedCategories.length} kategori`} tone="brand" onClick={() => { setActive("all"); setCategory("all"); setQuery(""); }} />
          <KpiCard icon={CheckCircle2} label="Aktif" value={counts.active} note="asistan kullanıyor" tone="ok" active={active === "active"} onClick={() => setActive(active === "active" ? "all" : "active")} />
          <KpiCard icon={Power} label="Pasif" value={counts.passive} note="kullanılmıyor" tone={counts.passive ? "warn" : ""} active={active === "passive"} onClick={() => setActive(active === "passive" ? "all" : "passive")} />
          <KpiCard icon={Bot} label="Asistan" value={config.enabled ? "Açık" : "Kapalı"} note={`${PROVIDERS.find((p) => p.value === config.provider)?.label || config.provider} · ${config.model}`} tone={config.enabled ? "info" : "danger"} onClick={() => setConfigOpen(true)} />
        </KpiGrid>
      )}

      {seedStatus !== null && (
        <div role="status" className="ui-banner ui-banner--info">
          <Info aria-hidden="true" />
          <span className="ui-grow">Başlangıç bilgileri kontrol edildi{seedStatus ? `; ${seedStatus} doğrulanmış sık sorulan bilgi eklendi.` : "; hepsi zaten mevcut."}</span>
          <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label="Kapat" onClick={() => setSeedStatus(null)}><X /></button>
        </div>
      )}

      <section className="ui-panel aik-role" data-open={roleOpen}>
        <button type="button" className="aik-role-toggle" aria-expanded={roleOpen} onClick={() => setRoleOpen(!roleOpen)}>
          <Info aria-hidden="true" /><span className="ui-grow">Bilgi merkezi neye yarar, neye yaramaz?</span><ChevronDown aria-hidden="true" />
        </button>
        {roleOpen && (
          <div className="aik-role-body">
            <div className="aik-role-col" data-tone="ok">
              <strong><CheckCircle2 aria-hidden="true" />Buraya yazın</strong>
              <p>Fotokopi, iade ve teslimat politikaları, hizmet alanı, sık sorulan sorular gibi <b>sabit</b> bilgiler.</p>
            </div>
            <div className="aik-role-col" data-tone="warn">
              <strong><AlertTriangle aria-hidden="true" />Buraya yazmayın</strong>
              <p>Ürün, fiyat, stok, sipariş, kampanya, kupon, çalışma saati ve sepet bilgileri. Asistan bunları canlı verilerden okur; buradaki kayıt canlı verinin yerine geçmez.</p>
            </div>
          </div>
        )}
      </section>

      <div className="aik-toolbar">
        <label className="ui-search aik-search">
          <Search aria-hidden="true" />
          <input ref={searchRef} className="ui-field" type="search" placeholder="Başlık, içerik ya da anahtar kelime…" aria-label="Bilgi merkezinde ara"
            value={query} data-esc-clear="true" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Segmented ariaLabel="Durum" value={active} onChange={setActive} options={[
          { value: "all", label: "Tümü", count: counts.all },
          { value: "active", label: "Aktif", count: counts.active, tone: "ok" },
          { value: "passive", label: "Pasif", count: counts.passive, tone: "warn" },
        ]} />
        <select className="ui-field ui-field--sm ui-field--auto aik-sort" aria-label="Sıralama" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {usedCategories.length > 0 && (
        <div className="ui-chips aik-chips" role="group" aria-label="Kategori">
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>Tüm kategoriler<span className="aik-chip-count">{rows.length}</span></button>
          {usedCategories.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? "all" : c)}>{c}<span className="aik-chip-count">{counts.byCategory[c]}</span></button>
          ))}
        </div>
      )}

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle aria-hidden="true" /><span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}

      {loading && !rows.length ? (
        <div className="aik-grid" aria-busy="true" aria-label="Yükleniyor">
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="ui-skeleton aik-card-skeleton" />)}
        </div>
      ) : !visible.length ? (
        <section className="ui-panel">
          {hasFilters ? (
            <EmptyState icon={Search} title="Bu filtrelere uyan bilgi yok" description="Aramayı ya da kategoriyi değiştirin."
              action={<button type="button" className="ui-btn" onClick={() => { setQuery(""); setCategory("all"); setActive("all"); }}>Filtreleri temizle</button>} />
          ) : (
            <EmptyState icon={BookOpen} title="Henüz bilgi kaydı yok" description="Asistanın müşterilere doğru yanıt vermesi için ilk doğrulanmış bilgiyi ekleyin."
              action={<button type="button" className="ui-btn ui-btn--primary" onClick={() => setDrawer({ row: null })}><Plus aria-hidden="true" />İlk bilgiyi ekle</button>} />
          )}
        </section>
      ) : (
        <div className="aik-grid">
          {visible.map((row, index) => {
            const isActive = row.isActive !== false;
            return (
              <article key={row._id} className="aik-card" data-index={index} data-active={cursor === index} data-muted={!isActive}>
                <button type="button" className="aik-card-main" onClick={() => setDrawer({ row })} aria-label={`${row.title} bilgisini düzenle`}>
                  <div className="aik-card-top">
                    <span className="ui-badge"><Tag aria-hidden="true" />{row.category}</span>
                    <span className={`ui-badge ${priorityTone(row.priority) ? `ui-badge--${priorityTone(row.priority)}` : ""}`} title="Öncelik">Öncelik {row.priority ?? 0}</span>
                  </div>
                  <h3 className="aik-card-title">{row.title}</h3>
                  <p className="aik-card-content">{row.content}</p>
                  {row.keywords?.length > 0 && (
                    <p className="aik-card-keywords">{row.keywords.slice(0, 6).map((k) => <span key={k}>{k}</span>)}{row.keywords.length > 6 && <span className="ui-muted">+{row.keywords.length - 6}</span>}</p>
                  )}
                </button>
                <footer className="aik-card-foot">
                  <button type="button" className="ui-toggle" aria-pressed={isActive} onClick={() => toggle(row)} title={isActive ? "Pasife al" : "Aktif et"}>
                    <i /><span>{isActive ? "Aktif" : "Pasif"}</span>
                  </button>
                  <span className="ui-muted aik-card-time">{timeAgo(row.updatedAt, now)}</span>
                  <span className="aik-card-actions">
                    <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label="Düzenle" title="Düzenle" onClick={() => setDrawer({ row })}><Pencil /></button>
                    <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" aria-label="Sil" title="Sil" onClick={() => remove(row)}><Trash2 /></button>
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <footer className="aik-foot">
        <span className="ui-muted">{visible.length} bilgi{hasFilters ? " (filtreli)" : ""}</span>
        <span className="ui-muted aik-kbd"><kbd>/</kbd> ara · <kbd>j</kbd><kbd>k</kbd> gezin · <kbd>↵</kbd> düzenle · <kbd>n</kbd> yeni · <kbd>?</kbd> yardım</span>
      </footer>

      {drawer && <KnowledgeDrawer row={drawer.row} categories={categories} saving={saving} onClose={() => setDrawer(null)} onSave={save} onDelete={remove} />}
      {configOpen && <ConfigDrawer config={config} saving={saving} onClose={() => setConfigOpen(false)} onSave={saveConfig} />}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={[[["n"], "Yeni bilgi ekle"]]} />
    </div>
  );
}
