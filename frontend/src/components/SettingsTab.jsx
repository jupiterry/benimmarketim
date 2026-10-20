// Mağaza ayarları: bölümlü (Sipariş, Teslimat, Yapay zekâ, Uygulama, Entegrasyonlar) tek form.
// Taslak ile kayıtlı hal karşılaştırılır; değişen alanlar vurgulanır, altta yapışkan kaydet çubuğu
// çıkar, bölüm değişiminde ve sayfa kapanışında kaydedilmemiş değişiklik için uyarılır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, AlertCircle, MapPin, Plug, RefreshCw, RotateCcw, Save, ShoppingBag, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useConfirm } from "./ConfirmModal";
import { PageHeader, Skeleton, SkeletonBlock, timeAgo, useNow, usePref } from "./admin/ui";
import { SettingsContext } from "./settings/fields";
import {
  SECTIONS, changedPaths, countInSection, getPath, isSameSettings, normalizeSettings, readDraft, setPath, toPayload, validateSettings, writeDraft,
} from "./settings/settingsModel";
import OrderSection from "./settings/OrderSection";
import DeliverySection from "./settings/DeliverySection";
import AiSection from "./settings/AiSection";
import AppSection from "./settings/AppSection";
import IntegrationsSection from "./settings/IntegrationsSection";
import "../styles/settings.css";

const ICONS = { orders: ShoppingBag, delivery: MapPin, ai: Bot, app: Smartphone, integrations: Plug };
const VIEWS = { orders: OrderSection, delivery: DeliverySection, ai: AiSection, app: AppSection, integrations: IntegrationsSection };

const SettingsTab = () => {
  const { confirm } = useConfirm();
  const now = useNow(30000);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [savedAt, setSavedAt] = useState(0); // son başarılı kayıt (alt bölümler canlı veriyi tazeler)
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false); // "Kaydedildi" durumu
  const [restored, setRestored] = useState(false); // oturumdan geri yüklenen taslak
  const [section, setSection] = usePref("stg-section", "orders");
  const flashTimer = useRef(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { data } = await axios.get("/settings");
      const next = normalizeSettings(data);
      useSettingsStore.setState({ settings: next });
      setSaved(next);
      // Başka bir ekrana geçip dönüldüyse oturumdaki taslak (sunucu değişmediyse) geri gelir
      const stored = readDraft();
      const storedDraft = stored?.draft ? normalizeSettings(stored.draft) : null;
      if (stored?.base && storedDraft && isSameSettings(normalizeSettings(stored.base), next) && !isSameSettings(storedDraft, next)) {
        setDraft({ ...storedDraft, updatedAt: next.updatedAt });
        setRestored(true);
      } else {
        writeDraft(null);
        setDraft(next);
        setRestored(false);
      }
      setStatus("ready");
    } catch (error) {
      console.error("Ayarlar getirilirken hata oluştu:", error);
      setStatus("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = useMemo(() => (saved && draft ? changedPaths(saved, draft) : new Set()), [saved, draft]);
  const errors = useMemo(() => (draft ? validateSettings(draft) : {}), [draft]);
  const dirty = changed.size > 0;
  const errorCount = Object.keys(errors).length;

  // Taslağı oturumda sakla (sekme değişince kaybolmasın); temizken sil
  useEffect(() => {
    if (!saved || !draft) return;
    writeDraft(dirty ? { base: saved, draft } : null);
  }, [saved, draft, dirty]);

  // Sayfa kapanırken tarayıcı uyarısı
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const update = useCallback((path, value) => setDraft((d) => setPath(d, path, value)), []);
  const updateMany = useCallback((map) => setDraft((d) => Object.entries(map).reduce((acc, [path, value]) => setPath(acc, path, value), d)), []);
  const reset = useCallback((paths) => setDraft((d) => paths.reduce((acc, path) => setPath(acc, path, getPath(saved, path)), d)), [saved]);
  const revertAll = useCallback(() => { setDraft(saved); setRestored(false); }, [saved]);

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    if (errorCount) {
      toast.error(errorCount === 1 ? "1 alanda hata var, düzeltip tekrar deneyin" : `${errorCount} alanda hata var, düzeltip tekrar deneyin`);
      return;
    }
    try {
      setSaving(true);
      const { data } = await axios.put("/settings", toPayload(draft));
      const next = normalizeSettings(data?.settings || draft);
      useSettingsStore.setState({ settings: next });
      setSaved(next);
      setDraft(next);
      setRestored(false);
      setSavedAt(Date.now());
      writeDraft(null);
      const count = Array.isArray(data?.changes) ? data.changes.length : changed.size;
      toast.success(count ? `${count} ayar kaydedildi` : "Ayarlar kaydedildi");
      setFlash(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 3200);
    } catch (error) {
      console.error("Ayarlar güncellenirken hata oluştu:", error);
      toast.error(error.response?.data?.message || "Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, errorCount, draft, changed]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Ctrl/⌘+S kaydeder
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const currentSection = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  const changeSection = async (id) => {
    if (id === currentSection.id) return;
    const pending = countInSection(changed, currentSection);
    if (pending) {
      const ok = await confirm({
        title: "Kaydedilmemiş değişiklikler var",
        message: `${currentSection.label} bölümünde ${pending} kaydedilmemiş değişiklik var. Başka bölüme geçince değişiklikler kaybolmaz; alttaki çubuktan kaydedebilirsiniz. Kaydetmeden geçilsin mi?`,
        confirmText: "Kaydetmeden geç",
        cancelText: "Bu bölümde kal",
        type: "warning",
      });
      if (!ok) return;
    }
    setSection(id);
  };

  const reload = async () => {
    if (dirty) {
      const ok = await confirm({
        title: "Değişiklikler silinsin mi?",
        message: `Kaydedilmemiş ${changed.size} değişiklik var. Yenilemek bunları siler ve sunucudaki değerleri getirir.`,
        confirmText: "Yenile ve sil",
        cancelText: "Vazgeç",
        type: "danger",
      });
      if (!ok) return;
    }
    writeDraft(null);
    await load();
  };

  const View = VIEWS[currentSection.id];
  const headerActions = (
    <button type="button" className="ui-btn" onClick={reload} disabled={status === "loading"}>
      <RefreshCw className={status === "loading" ? "ui-spin" : ""} />Yenile
    </button>
  );

  if (status === "error") {
    return (
      <div className="ui-page stg">
        <PageHeader title="Mağaza ayarları" description="Çalışma saatleri, teslimat noktaları, asistan ve uygulama sürümü." actions={headerActions} />
        <div className="ui-banner ui-banner--danger stg-banner" role="alert">
          <AlertTriangle />Ayarlar yüklenemedi. Sunucuya ulaşılamıyor olabilir.
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}>Tekrar dene</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ui-page stg ${(dirty || flash) && status === "ready" ? "stg--bar" : ""}`}>
      <PageHeader
        title="Mağaza ayarları"
        description="Çalışma saatleri, teslimat noktaları, asistan ve uygulama sürümü. Değişiklikler Kaydet'e basınca geçerli olur."
        meta={saved?.updatedAt ? `Son kayıt ${timeAgo(saved.updatedAt, now)}` : undefined}
        actions={headerActions}
      />

      {restored && status === "ready" && (
        <div className="ui-banner ui-banner--info stg-banner" role="status">
          <AlertCircle />Önceki oturumdan kaydedilmemiş taslak geri yüklendi ({changed.size} değişiklik).
          <button type="button" className="ui-btn ui-btn--sm" onClick={revertAll}>Taslağı at</button>
        </div>
      )}

      <div className="stg-layout">
        <nav className="stg-nav" aria-label="Ayar bölümleri">
          <div className="stg-nav-list" role="tablist" aria-orientation="vertical">
            {SECTIONS.map((s) => {
              const Icon = ICONS[s.id];
              const pending = countInSection(changed, s);
              const invalid = Object.keys(errors).some((path) => s.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)));
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={currentSection.id === s.id}
                  aria-controls={`stg-panel-${s.id}`}
                  className="stg-nav-item"
                  data-invalid={invalid}
                  onClick={() => changeSection(s.id)}
                  disabled={status !== "ready"}
                >
                  <span className="stg-nav-icon"><Icon /></span>
                  <span className="stg-nav-text">
                    <span className="stg-nav-label">{s.label}</span>
                    <span className="stg-nav-short">{s.short}</span>
                  </span>
                  {pending > 0 && <span className="stg-nav-count" aria-label={`${pending} kaydedilmemiş değişiklik`}>{pending}</span>}
                  {invalid && <span className="stg-nav-alert" aria-label="Hatalı alan var"><AlertCircle /></span>}
                </button>
              );
            })}
          </div>
          <p className="stg-nav-foot ui-hint"><kbd>Ctrl</kbd> + <kbd>S</kbd> kaydeder</p>
        </nav>

        <div className="stg-content" id={`stg-panel-${currentSection.id}`} role="tabpanel" aria-label={currentSection.label}>
          {status === "loading" || !draft ? (
            <div className="stg-section" aria-busy="true" aria-label="Yükleniyor">
              <div className="ui-panel"><div className="ui-panel-body stg-stack"><Skeleton width="40%" height={18} /><Skeleton width="70%" height={12} /><SkeletonBlock height={84} /></div></div>
              <div className="ui-panel"><div className="ui-panel-body stg-stack"><Skeleton width="30%" height={18} /><div className="stg-grid-2"><SkeletonBlock height={56} /><SkeletonBlock height={56} /></div><SkeletonBlock height={40} /></div></div>
              <div className="ui-panel"><div className="ui-panel-body stg-stack"><Skeleton width="35%" height={18} /><SkeletonBlock height={64} /></div></div>
            </div>
          ) : (
            <SettingsContext.Provider value={{ draft, saved, changed, errors, update, updateMany, reset, savedAt }}>
              <View />
            </SettingsContext.Provider>
          )}
        </div>
      </div>

      {(dirty || flash) && status === "ready" && (
        <div className={`stg-savebar ${flash && !dirty ? "stg-savebar--saved" : ""} ${errorCount ? "stg-savebar--invalid" : ""}`} role="status" aria-live="polite">
          {flash && !dirty ? (
            <span className="stg-savebar-text"><Check />Kaydedildi</span>
          ) : (
            <>
              <span className="stg-savebar-text">
                {errorCount ? <AlertCircle /> : <span className="ui-dot ui-dot--warn" />}
                {errorCount
                  ? `${changed.size} değişiklik · ${errorCount} alanda hata var`
                  : changed.size === 1 ? "Kaydedilmemiş 1 değişiklik var" : `Kaydedilmemiş ${changed.size} değişiklik var`}
              </span>
              <span className="stg-savebar-actions">
                <button type="button" className="ui-btn ui-btn--ghost" onClick={revertAll} disabled={saving}><RotateCcw />Geri al</button>
                <button type="button" className="ui-btn ui-btn--primary" onClick={save} disabled={saving || errorCount > 0}>
                  {saving ? <><span className="ui-loader stg-savebar-loader" />Kaydediliyor…</> : <><Save />Kaydet</>}
                </button>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsTab;
