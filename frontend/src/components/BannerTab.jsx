// Vitrin görselleri: müşteri uygulamasının ana sayfasındaki kaydırıcıyı (banner) yönetir.
// Uç noktalar: GET /banners/admin · POST /banners · PUT /banners/:id · DELETE /banners/:id
// · POST /banners/upload (dosya → Cloudinary adresi). Sıra, PUT ile `order` alanına yazılır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Battery,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  ImageOff,
  ImagePlus,
  Link as LinkIcon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Signal,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Wifi,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { cloudinaryImage } from "../lib/image";
import { useConfirm } from "./ConfirmModal";
import {
  Drawer,
  EmptyState,
  KpiCard,
  KpiGrid,
  PageHeader,
  Segmented,
  ShortcutHelp,
  Skeleton,
  SkeletonCards,
  fold,
  timeAgo,
  undoable,
  useListShortcuts,
  useNow,
  usePref,
} from "./admin/ui";
import "../styles/banners.css";

// ── Görsel kuralları ───────────────────────────────────────────────────────
// Kart ve kaydırıcı 16:7 oranında kırpılır (önceki tasarımdaki .banner-image ile aynı oran).
const RATIO = 16 / 7;
const RATIO_LABEL = "16:7";
const MIN_WIDTH = 1200;
const SOFT_MAX_BYTES = 2 * 1024 * 1024;
const HARD_MAX_BYTES = 4.5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

const mb = (bytes) => (bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`);
const host = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Dosya okunamadı"));
  reader.readAsDataURL(file);
});
const measure = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => resolve(null);
  img.src = src;
});

/** Boyut/oran kontrolü → [{ tone, text }] */
const checks = ({ width, height, bytes, failed }) => {
  const rows = [];
  if (failed) return [{ tone: "danger", text: "Görsel açılamadı. Adresi ya da dosyayı kontrol edin." }];
  if (!width || !height) return rows;
  const ratio = width / height;
  const deviation = Math.abs(ratio - RATIO) / RATIO;
  const ratioText = `${width}×${height} px (oran ${ratio.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}:1)`;
  if (deviation > 0.1) {
    rows.push({ tone: "warn", text: `${ratioText}. Önerilen oran ${RATIO_LABEL} (örn. 1600×700); kenarlar kırpılacak.` });
  } else {
    rows.push({ tone: "ok", text: `${ratioText} · ${RATIO_LABEL} oranına uygun.` });
  }
  if (width < MIN_WIDTH) rows.push({ tone: "warn", text: `Düşük çözünürlük: ${width} px genişlik. Telefonda bulanık görünebilir; en az ${MIN_WIDTH} px önerilir.` });
  if (bytes > HARD_MAX_BYTES) rows.push({ tone: "danger", text: `Dosya çok büyük (${mb(bytes)}). En fazla 4,5 MB yüklenebilir.` });
  else if (bytes > SOFT_MAX_BYTES) rows.push({ tone: "warn", text: `Dosya büyük (${mb(bytes)}). Yükleme uzun sürebilir; 2 MB altı önerilir.` });
  return rows;
};

const FILTERS = [
  { id: "all", label: "Tümü" },
  { id: "live", label: "Yayında", dot: "ok" },
  { id: "paused", label: "Pasif" },
];
const EMPTY_TEXT = { live: "Yayında görsel yok. Pasif bir görseli açın ya da yeni yükleyin.", paused: "Pasif görsel yok." };

// ── Telefon çerçevesi: vitrin kaydırıcısı ─────────────────────────────────
const PhonePreview = ({ slides, now }) => {
  const sliderRef = useRef(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const time = new Date(now).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  const goTo = useCallback((index) => {
    const el = sliderRef.current;
    if (!el || !count) return;
    const next = ((index % count) + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }, [count]);

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const id = setInterval(() => goTo(active + 1), 3500);
    return () => clearInterval(id);
  }, [count, paused, active, goTo]);
  useEffect(() => { setActive(0); }, [count]);

  const onScroll = () => {
    const el = sliderRef.current;
    if (!el || !el.clientWidth) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="bnr-phone" aria-label="Müşteri uygulaması önizlemesi" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="bnr-phone-screen">
        <span className="bnr-phone-notch" aria-hidden="true" />
        <div className="bnr-phone-status" aria-hidden="true">
          <span>{time}</span>
          <span><Signal /><Wifi /><Battery /></span>
        </div>
        <div className="bnr-phone-app">
          <div className="bnr-phone-search" aria-hidden="true"><Search />Ürün ara…</div>
          <div className="bnr-slider-wrap">
            {count === 0 ? (
              <div className="bnr-slider-empty">
                <ImageIcon aria-hidden="true" />
                Yayında görsel yok. Müşteri bu alanı görmez.
              </div>
            ) : (
              <>
                <div ref={sliderRef} className="bnr-slider" onScroll={onScroll} aria-live="off">
                  {slides.map((b, i) => (
                    <div key={b._id || `ghost-${i}`} className="bnr-slide" data-ghost={b.ghost || undefined} aria-hidden={i !== active}>
                      {b.image ? <img src={cloudinaryImage(b.image, 600)} alt="" draggable={false} /> : null}
                      {(b.title || b.subtitle) && (
                        <div className="bnr-slide-text">
                          {b.title && <strong>{b.title}</strong>}
                          {b.subtitle && <span>{b.subtitle}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {count > 1 && (
                  <>
                    <button type="button" className="bnr-slider-nav" data-dir="prev" onClick={() => goTo(active - 1)} aria-label="Önceki görsel"><ChevronLeft /></button>
                    <button type="button" className="bnr-slider-nav" data-dir="next" onClick={() => goTo(active + 1)} aria-label="Sonraki görsel"><ChevronRight /></button>
                    <div className="bnr-dots" role="tablist" aria-label="Görseller">
                      {slides.map((b, i) => (
                        <button key={b._id || `dot-${i}`} type="button" role="tab" aria-current={i === active} aria-label={`${i + 1}. görsel`} onClick={() => goTo(i)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="bnr-phone-rest" aria-hidden="true"><span /><span /><span /><span /></div>
          <div className="bnr-phone-rest" aria-hidden="true"><span /><span /><span /><span /></div>
        </div>
      </div>
    </div>
  );
};

// ── Yükleme / düzenleme çekmecesi ──────────────────────────────────────────
const BannerForm = ({ mode, item, items, onClose, onSaved, onGhost }) => {
  const { confirm } = useConfirm();
  const editing = mode === "edit";
  const [source, setSource] = useState("file");
  const [image, setImage] = useState(editing ? item.image || "" : "");
  const [urlDraft, setUrlDraft] = useState(editing ? item.image || "" : "");
  const [fileData, setFileData] = useState(null); // { dataUrl, bytes, name }
  const [info, setInfo] = useState(null); // { width, height, bytes, failed }
  const [measuring, setMeasuring] = useState(false);
  const [title, setTitle] = useState(editing ? item.title || "" : "");
  const [subtitle, setSubtitle] = useState(editing ? item.subtitle || "" : "");
  const [linkUrl, setLinkUrl] = useState(editing ? item.linkUrl || "" : "");
  const [isActive, setIsActive] = useState(editing ? item.isActive !== false : true);
  const [order, setOrder] = useState(editing ? String(item.order ?? 0) : "");
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState(null); // "upload" | "save"
  const [touched, setTouched] = useState(false);
  const fileRef = useRef(null);
  const titleRef = useRef(null);

  const preview = fileData?.dataUrl || image;
  const rows = useMemo(() => (info ? checks(info) : []), [info]);
  const blocking = rows.some((r) => r.tone === "danger");
  const canSave = Boolean(preview) && Boolean(title.trim()) && !blocking && !phase && !measuring;

  // Görsel değişince ölç
  useEffect(() => {
    if (!preview) { setInfo(null); return undefined; }
    let cancelled = false;
    setMeasuring(true);
    measure(preview).then((dims) => {
      if (cancelled) return;
      setInfo(dims ? { ...dims, bytes: fileData?.bytes || 0 } : { failed: true });
      setMeasuring(false);
    });
    return () => { cancelled = true; };
  }, [preview, fileData]);

  // Kaydırıcıda hayalet slayt
  useEffect(() => {
    if (!onGhost) return undefined;
    onGhost(preview ? { _id: editing ? item._id : null, image: preview, title, subtitle, isActive, order: editing ? item.order : Number.MAX_SAFE_INTEGER } : null);
    return () => onGhost(null);
  }, [onGhost, preview, title, subtitle, isActive, editing, item]);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  const takeFile = async (file) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) { toast.error("Yalnızca JPG, PNG, WebP, GIF ya da AVIF yükleyin"); return; }
    try {
      const dataUrl = await readAsDataUrl(file);
      setFileData({ dataUrl, bytes: file.size, name: file.name });
      setSource("file");
      setTouched(true);
      if (!title.trim()) titleRef.current?.focus();
    } catch (error) {
      toast.error(error.message);
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    takeFile(e.dataTransfer.files?.[0]);
  };
  const applyUrl = () => {
    const next = urlDraft.trim();
    setFileData(null);
    setImage(next);
    setTouched(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    try {
      let finalImage = image;
      if (fileData) {
        setPhase("upload");
        const uploaded = await axios.post("/banners/upload", { image: fileData.dataUrl });
        finalImage = uploaded.data?.url;
        if (!finalImage) throw new Error("Görsel adresi alınamadı");
      }
      setPhase("save");
      const payload = {
        image: finalImage,
        title: title.trim(),
        subtitle: subtitle.trim(),
        linkUrl: linkUrl.trim() || null,
        isActive,
      };
      if (editing) {
        const n = Number(order);
        payload.order = Number.isFinite(n) ? n : item.order;
        const response = await axios.put(`/banners/${item._id}`, payload);
        onSaved("edit", response.data?.banner || { ...item, ...payload });
      } else {
        payload.order = items.reduce((max, b) => Math.max(max, Number(b.order) || 0), -1) + 1;
        const response = await axios.post("/banners", payload);
        onSaved("add", response.data?.banner);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Kaydedilemedi");
    } finally {
      setPhase(null);
    }
  };

  const onDirtyClose = () => confirm({
    title: "Kaydedilmemiş değişiklik var",
    message: "Çekmeceyi kapatırsanız girdikleriniz kaybolur.",
    confirmText: "Kapat",
    cancelText: "Düzenlemeye dön",
    type: "warning",
  });

  return (
    <Drawer
      title={editing ? "Görseli düzenle" : "Görsel yükle"}
      subtitle={editing ? item.title : `Önerilen ${RATIO_LABEL} oran, 1600×700 px, 2 MB altı`}
      icon={editing ? Pencil : ImagePlus}
      width={460}
      onClose={onClose}
      dirty={touched && !phase}
      onDirtyClose={onDirtyClose}
      footer={(
        <>
          <button type="button" className="ui-btn" onClick={onClose} disabled={Boolean(phase)}>İptal</button>
          <button type="submit" form="bnr-form" className="ui-btn ui-btn--primary" disabled={!canSave}>
            {phase === "upload" ? <><span className="ui-loader" />Görsel yükleniyor…</> : phase === "save" ? <><span className="ui-loader" />Kaydediliyor…</> : editing ? "Kaydet" : "Vitrine ekle"}
          </button>
        </>
      )}
    >
      <form id="bnr-form" className="bnr-form" onSubmit={submit} noValidate>
        <div>
          <span className="ui-label">Görsel</span>
          <div
            className="ui-dropzone bnr-drop"
            data-over={over}
            data-has={Boolean(preview)}
            role="button"
            tabIndex={0}
            aria-label={preview ? "Görseli değiştir" : "Görsel seç ya da sürükleyip bırak"}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            {preview ? (
              <>
                <img src={preview} alt="" draggable={false} />
                {(title || subtitle) && (
                  <div className="bnr-drop-overlay-text" aria-hidden="true">
                    {title && <strong>{title}</strong>}
                    {subtitle && <span>{subtitle}</span>}
                  </div>
                )}
              </>
            ) : (
              <div className="bnr-drop-text">
                <Upload aria-hidden="true" />
                <strong>{over ? "Bırakın" : "Dosyayı buraya sürükleyin"}</strong>
                <span>ya da tıklayıp seçin · JPG, PNG, WebP · {RATIO_LABEL}</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept={ACCEPTED.join(",")} hidden onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />

          <div className="bnr-image-tools">
            <Segmented
              size="sm"
              ariaLabel="Görsel kaynağı"
              value={source}
              onChange={setSource}
              options={[{ value: "file", label: "Dosya", icon: Upload }, { value: "url", label: "Adres", icon: LinkIcon }]}
            />
            {source === "file" ? (
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus />{preview ? "Başka dosya seç" : "Dosya seç"}
              </button>
            ) : (
              <div className="ui-cluster ui-grow" style={{ flexWrap: "nowrap", gap: 6 }}>
                <input
                  type="url"
                  className="ui-field ui-field--sm"
                  placeholder="https://…/gorsel.jpg"
                  aria-label="Görsel adresi"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } }}
                />
                <button type="button" className="ui-btn ui-btn--sm" onClick={applyUrl} disabled={!urlDraft.trim() || urlDraft.trim() === image}>Kullan</button>
              </div>
            )}
          </div>

          {(rows.length > 0 || measuring || fileData) && (
            <div className="bnr-check" aria-live="polite">
              {fileData && <div className="bnr-check-row"><ImageIcon />{fileData.name} · {mb(fileData.bytes)} · kaydedince sunucuya yüklenir</div>}
              {measuring && <div className="bnr-check-row"><span className="ui-loader" />Görsel ölçülüyor…</div>}
              {rows.map((r) => {
                const Icon = r.tone === "ok" ? CheckCircle2 : AlertTriangle;
                return <div key={r.text} className="bnr-check-row" data-tone={r.tone}><Icon />{r.text}</div>;
              })}
            </div>
          )}
        </div>

        <div>
          <label className="ui-label" htmlFor="bnr-title">Başlık</label>
          <input
            ref={titleRef}
            id="bnr-title"
            type="text"
            className="ui-field"
            placeholder="Örn. Hafta sonu %20 indirim"
            maxLength={80}
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTouched(true); }}
            required
          />
          <p className="ui-hint">Uygulamada görselin üstünde yazar; kısa tutun.</p>
        </div>
        <div>
          <label className="ui-label" htmlFor="bnr-subtitle">Alt başlık <span className="ui-muted">(isteğe bağlı)</span></label>
          <input
            id="bnr-subtitle"
            type="text"
            className="ui-field"
            placeholder="Örn. Tüm atıştırmalıklarda, pazar gecesine kadar"
            maxLength={120}
            value={subtitle}
            onChange={(e) => { setSubtitle(e.target.value); setTouched(true); }}
          />
        </div>
        <div>
          <label className="ui-label" htmlFor="bnr-link">Bağlantı <span className="ui-muted">(isteğe bağlı)</span></label>
          <input
            id="bnr-link"
            type="url"
            className="ui-field"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => { setLinkUrl(e.target.value); setTouched(true); }}
          />
          <p className="ui-hint">Görsele dokunulunca açılır. Boş bırakılırsa yalnızca gösterilir.</p>
        </div>

        <div className="bnr-form-row">
          <div>
            <strong>Yayında</strong>
            <small>Kapalıyken vitrinde görünmez; kayıt durur.</small>
          </div>
          <button
            type="button"
            className="ui-icon-btn ui-switch"
            data-on={isActive}
            role="switch"
            aria-checked={isActive}
            aria-label="Yayında"
            onClick={() => { setIsActive((v) => !v); setTouched(true); }}
          >
            {isActive ? <ToggleRight /> : <ToggleLeft />}
          </button>
        </div>
        {editing && (
          <div className="bnr-form-row">
            <div>
              <strong>Sıra</strong>
              <small>Küçük sayı önce gösterilir. Kartları sürükleyerek de değiştirebilirsiniz.</small>
            </div>
            <input
              type="number"
              className="ui-field ui-field--auto"
              style={{ width: 84 }}
              aria-label="Sıra"
              min="0"
              value={order}
              onChange={(e) => { setOrder(e.target.value); setTouched(true); }}
            />
          </div>
        )}
      </form>
    </Drawer>
  );
};

// ── Kart ──────────────────────────────────────────────────────────────────
const BannerCard = ({ banner, index, total, cursor, canReorder, dragging, over, now, onEdit, onToggle, onRemove, onMove, onHover, dragHandlers }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [banner.image]);
  const state = banner.isActive ? "live" : "paused";
  return (
    <article
      className="bnr-card"
      data-state={state}
      data-cursor={cursor}
      data-dragging={dragging}
      data-over={over}
      data-draggable={canReorder}
      data-bnr-card={banner._id}
      draggable={canReorder}
      onMouseEnter={onHover}
      {...dragHandlers}
    >
      <div className="bnr-media">
        {banner.image && !broken ? (
          <img src={cloudinaryImage(banner.image, 800)} alt={banner.title || ""} loading="lazy" draggable={false} onError={() => setBroken(true)} />
        ) : (
          <div className="bnr-media-broken"><ImageOff aria-hidden="true" />Görsel açılamadı</div>
        )}
        <span className="bnr-pos" aria-label={`Sıra ${index + 1}`}>{index + 1}</span>
        {!banner.isActive && <span className="ui-badge bnr-flag">Pasif</span>}
        {canReorder && <span className="bnr-handle" aria-hidden="true" title="Sürükleyerek sırala"><GripVertical /></span>}
      </div>
      <div className="bnr-body">
        <h3 className="bnr-title"><button type="button" onClick={onEdit} title="Düzenle">{banner.title || "Başlıksız"}</button></h3>
        {banner.subtitle && <p className="bnr-sub">{banner.subtitle}</p>}
        <p className="bnr-meta">
          {banner.linkUrl ? (
            <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" title={banner.linkUrl}><ExternalLink />{host(banner.linkUrl)}</a>
          ) : (
            <span><LinkIcon />Bağlantı yok</span>
          )}
          {banner.updatedAt && <span>{timeAgo(banner.updatedAt, now)}</span>}
        </p>
      </div>
      <div className="bnr-foot">
        <button
          type="button"
          className="ui-icon-btn ui-switch"
          data-on={banner.isActive}
          role="switch"
          aria-checked={banner.isActive}
          aria-label={banner.isActive ? "Yayından kaldır" : "Yayına al"}
          title={banner.isActive ? "Yayından kaldır" : "Yayına al"}
          onClick={onToggle}
        >
          {banner.isActive ? <ToggleRight /> : <ToggleLeft />}
        </button>
        <button type="button" className="ui-icon-btn" onClick={() => onMove(-1)} disabled={!canReorder || index === 0} aria-label="Öne al" title="Öne al"><ArrowLeft /></button>
        <button type="button" className="ui-icon-btn" onClick={() => onMove(1)} disabled={!canReorder || index === total - 1} aria-label="Geriye al" title="Geriye al"><ArrowRight /></button>
        <span className="bnr-spacer" />
        <button type="button" className="ui-icon-btn" onClick={onEdit} aria-label="Düzenle" title="Düzenle (↵)"><Pencil /></button>
        <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={onRemove} aria-label="Sil" title="Sil"><Trash2 /></button>
      </div>
    </article>
  );
};

// ── Ekran ────────────────────────────────────────────────────────────────
const BannerTab = () => {
  const now = useNow(60000);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [drawer, setDrawer] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [previewOpen, setPreviewOpen] = usePref("bnr-preview-open", true);
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const searchRef = useRef(null);
  const pendingRemoval = useRef(new Set());

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const response = await axios.get("/banners/admin");
      setBanners((response.data?.banners || []).filter((b) => !pendingRemoval.current.has(b._id)));
      setError(null);
    } catch (e) {
      if (!quiet) setError(e.response?.data?.message || "Vitrin görselleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Türetilen veriler ──
  const stats = useMemo(() => ({
    live: banners.filter((b) => b.isActive).length,
    paused: banners.filter((b) => !b.isActive).length,
    linked: banners.filter((b) => b.linkUrl).length,
    lastChange: banners.reduce((max, b) => Math.max(max, new Date(b.updatedAt || b.createdAt || 0).getTime()), 0),
  }), [banners]);
  const counts = { all: banners.length, live: stats.live, paused: stats.paused };
  const rows = useMemo(() => {
    const q = fold(query.trim());
    return banners.filter((b) => {
      if (filter === "live" && !b.isActive) return false;
      if (filter === "paused" && b.isActive) return false;
      if (q && !fold(`${b.title} ${b.subtitle || ""}`).includes(q)) return false;
      return true;
    });
  }, [banners, filter, query]);
  const filtered = filter !== "all" || Boolean(query.trim());
  const canReorder = !filtered && rows.length > 1 && !reordering;
  const slides = useMemo(() => {
    const live = banners.filter((b) => b.isActive && !(ghost && ghost._id === b._id));
    const list = ghost && ghost.isActive ? [...live, { ...ghost, ghost: true }] : live;
    return list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }, [banners, ghost]);

  useEffect(() => { setCursor(-1); }, [filter, query]);
  useEffect(() => {
    if (cursor < 0) return;
    const id = rows[cursor]?._id;
    if (id) document.querySelector(`[data-bnr-card="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, rows]);

  // ── İşlemler ──
  const openAdd = () => setDrawer({ mode: "add" });
  const openEdit = (b) => setDrawer({ mode: "edit", item: b });

  const toggle = async (b) => {
    const nextActive = !b.isActive;
    setBanners((cur) => cur.map((x) => (x._id === b._id ? { ...x, isActive: nextActive } : x)));
    try {
      const response = await axios.put(`/banners/${b._id}`, { isActive: nextActive });
      const updated = response.data?.banner;
      if (updated) setBanners((cur) => cur.map((x) => (x._id === b._id ? { ...x, ...updated } : x)));
      toast.success(nextActive ? "Yayına alındı" : "Yayından kaldırıldı");
    } catch (e) {
      setBanners((cur) => cur.map((x) => (x._id === b._id ? { ...x, isActive: b.isActive } : x)));
      toast.error(e.response?.data?.message || "Durum değiştirilemedi");
    }
  };

  const remove = (b) => {
    const index = banners.findIndex((x) => x._id === b._id);
    pendingRemoval.current.add(b._id);
    setBanners((cur) => cur.filter((x) => x._id !== b._id));
    if (drawer?.item?._id === b._id) setDrawer(null);
    undoable({
      message: `"${b.title || "Görsel"}" silindi`,
      icon: <Trash2 />,
      commit: async () => {
        try {
          await axios.delete(`/banners/${b._id}`);
        } catch (e) {
          toast.error(e.response?.data?.message || "Silinemedi, liste yenilendi");
          pendingRemoval.current.delete(b._id);
          load({ quiet: true });
        } finally {
          pendingRemoval.current.delete(b._id);
        }
      },
      undo: () => {
        pendingRemoval.current.delete(b._id);
        setBanners((cur) => {
          if (cur.some((x) => x._id === b._id)) return cur;
          const next = [...cur];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, b);
          return next;
        });
      },
    });
  };

  const persistOrder = async (next) => {
    const before = new Map(banners.map((b) => [b._id, Number(b.order) || 0]));
    const renumbered = next.map((b, i) => ({ ...b, order: i }));
    setBanners(renumbered);
    const changed = renumbered.filter((b) => before.get(b._id) !== b.order);
    if (!changed.length) return;
    setReordering(true);
    try {
      await Promise.all(changed.map((b) => axios.put(`/banners/${b._id}`, { order: b.order })));
      toast.success("Sıra kaydedildi");
    } catch (e) {
      toast.error(e.response?.data?.message || "Sıra kaydedilemedi");
      load({ quiet: true });
    } finally {
      setReordering(false);
    }
  };
  const moveTo = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const from = banners.findIndex((b) => b._id === fromId);
    const to = banners.findIndex((b) => b._id === toId);
    if (from < 0 || to < 0) return;
    const next = [...banners];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  };
  const moveBy = (b, delta) => {
    const from = banners.findIndex((x) => x._id === b._id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= banners.length) return;
    moveTo(b._id, banners[to]._id);
  };
  const dragHandlersFor = (b) => (canReorder ? {
    onDragStart: (e) => {
      setDragId(b._id);
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", b._id); } catch { /* bazı tarayıcılar */ }
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overId !== b._id) setOverId(b._id);
    },
    onDrop: (e) => {
      e.preventDefault();
      moveTo(dragId, b._id);
      setDragId(null);
      setOverId(null);
    },
    onDragEnd: () => { setDragId(null); setOverId(null); },
  } : {});

  const onSaved = (mode, saved) => {
    setDrawer(null);
    if (mode === "add") {
      if (saved) setBanners((cur) => [...cur.filter((x) => x._id !== saved._id), saved]);
      toast.success("Görsel vitrine eklendi");
    } else if (saved) {
      setBanners((cur) => cur.map((x) => (x._id === saved._id ? { ...x, ...saved } : x)));
      toast.success("Görsel güncellendi");
    }
    load({ quiet: true });
  };

  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: (d) => setCursor((c) => (rows.length ? Math.min(rows.length - 1, Math.max(0, c + d)) : -1)),
    open: () => { if (rows[cursor]) openEdit(rows[cursor]); },
    escape: () => { if (cursor >= 0) setCursor(-1); else if (filtered) { setFilter("all"); setQuery(""); } },
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
    extra: { n: openAdd },
  });

  const previewHead = (
    <div className="bnr-preview-head">
      <div>
        <h2><Smartphone />Müşteri görünümü</h2>
        <p>{slides.length ? `${slides.length} görsel kaydırıcıda` : "Kaydırıcı boş"} · canlı</p>
      </div>
      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setPreviewOpen((v) => !v)} aria-expanded={previewOpen}>
        {previewOpen ? "Gizle" : "Göster"}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="ui-page">
        <PageHeader title="Vitrin görselleri" description="Ana sayfadaki kaydırıcıyı yönetin." />
        <SkeletonCards count={4} />
        <div className="bnr-layout">
          <div className="bnr-main">
            <Skeleton height={54} radius={10} />
            <div className="bnr-grid" aria-busy="true" aria-label="Yükleniyor">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={236} radius={10} />)}
            </div>
          </div>
          <aside className="bnr-side"><div className="ui-panel ui-panel-body"><Skeleton height={420} radius={26} /></div></aside>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Vitrin görselleri"
        meta={stats.live ? `${stats.live} yayında` : undefined}
        description="Ana sayfadaki kaydırıcıyı yönetin: görsel yükleyin, başlık ve bağlantı verin, kartları sürükleyerek sıralayın."
        actions={(
          <>
            <button type="button" className="ui-icon-btn" onClick={() => load({ quiet: true })} aria-label="Yenile" title="Yenile"><RefreshCw /></button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={openAdd}><Plus />Görsel yükle</button>
          </>
        )}
      />

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle />
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard icon={ImageIcon} label="Yayında" value={stats.live} tone="ok" note="kaydırıcıda dönüyor" active={filter === "live"} onClick={() => setFilter(filter === "live" ? "all" : "live")} />
        <KpiCard icon={ToggleLeft} label="Pasif" value={stats.paused} note="gizli, kayıt duruyor" active={filter === "paused"} onClick={() => setFilter(filter === "paused" ? "all" : "paused")} />
        <KpiCard icon={LinkIcon} label="Bağlantılı" value={stats.linked} tone="info" note="dokununca sayfa açar" />
        <KpiCard icon={RefreshCw} label="Son değişiklik" value={stats.lastChange ? timeAgo(stats.lastChange, now) : "—"} note={banners.length ? `${banners.length} görsel` : "görsel yok"} />
      </KpiGrid>

      <div className="bnr-layout">
        <div className="bnr-main">
          {banners.length === 0 && error ? null : banners.length === 0 ? (
            <section className="ui-panel">
              <EmptyState
                icon={ImagePlus}
                title="Vitrin boş"
                description={`İlk görseli yükleyin; ${RATIO_LABEL} oranında (örn. 1600×700 px) bir görsel ana sayfada hemen dönmeye başlar.`}
                action={<button type="button" className="ui-btn ui-btn--primary" onClick={openAdd}><Upload />İlk görseli yükle</button>}
              />
            </section>
          ) : (
            <>
              <div className="bnr-toolbar">
                <div className="ui-search">
                  <Search aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    className="ui-field"
                    placeholder="Başlıkta ara…"
                    aria-label="Başlıkta ara"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-esc-clear="1"
                  />
                </div>
                <div className="ui-chips" role="group" aria-label="Durum filtresi">
                  {FILTERS.map((f) => (
                    <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                      {f.dot && <span className={`ui-dot ui-dot--${f.dot}`} />}
                      {f.label}
                      <span className="ui-count">{counts[f.id]}</span>
                    </button>
                  ))}
                </div>
                <div className="bnr-toolbar-right">
                  {filtered ? (
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => { setFilter("all"); setQuery(""); }}>Filtreleri temizle</button>
                  ) : (
                    <><GripVertical />{reordering ? "Sıra kaydediliyor…" : "Kartları sürükleyerek sıralayın"}</>
                  )}
                </div>
              </div>

              {rows.length === 0 ? (
                <section className="ui-panel">
                  <EmptyState
                    compact
                    icon={Search}
                    title="Sonuç yok"
                    description={query ? `"${query}" ile eşleşen görsel yok.` : EMPTY_TEXT[filter]}
                    action={<button type="button" className="ui-btn ui-btn--sm" onClick={() => { setFilter("all"); setQuery(""); }}>Filtreleri temizle</button>}
                  />
                </section>
              ) : (
                <div className="bnr-grid" role="list" aria-label="Vitrin görselleri">
                  {rows.map((b, i) => (
                    <BannerCard
                      key={b._id}
                      banner={b}
                      index={banners.indexOf(b)}
                      total={banners.length}
                      cursor={cursor === i}
                      canReorder={canReorder}
                      dragging={dragId === b._id}
                      over={overId === b._id && dragId !== b._id}
                      now={now}
                      onEdit={() => openEdit(b)}
                      onToggle={() => toggle(b)}
                      onRemove={() => remove(b)}
                      onMove={(delta) => moveBy(b, delta)}
                      onHover={() => setCursor(i)}
                      dragHandlers={dragHandlersFor(b)}
                    />
                  ))}
                </div>
              )}
              <div className="bnr-listfoot">
                <p>{rows.length === banners.length ? `${banners.length} görsel` : `${rows.length} / ${banners.length} görsel`} · yayındakiler sırayla kaydırıcıda döner</p>
                <p className="bnr-foot-hint">İpucu: <kbd>/</kbd> ara · <kbd>j</kbd> <kbd>k</kbd> gez · <kbd>↵</kbd> düzenle · <kbd>n</kbd> yeni · <kbd>?</kbd> yardım</p>
              </div>
            </>
          )}
        </div>

        <aside className="bnr-side" data-collapsed={!previewOpen}>
          <div className="ui-panel ui-panel-body">
            {previewHead}
            {previewOpen && (
              <>
                <PhonePreview slides={slides} now={now} />
                <p className="bnr-preview-note"><span className="ui-dot ui-dot--ok" />Yayındaki görseller sırayla, temsili görünüm</p>
              </>
            )}
          </div>
        </aside>
      </div>

      {drawer && (
        <BannerForm
          key={drawer.item?._id || "new"}
          mode={drawer.mode}
          item={drawer.item}
          items={banners}
          onClose={() => setDrawer(null)}
          onSaved={onSaved}
          onGhost={setGhost}
        />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={[[["n"], "Yeni görsel yükle"]]} />
    </div>
  );
};

export default BannerTab;
