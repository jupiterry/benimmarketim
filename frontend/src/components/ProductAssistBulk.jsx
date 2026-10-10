import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, ExternalLink, EyeOff, Globe, ImageOff, ImagePlus, Layers, Link2,
  Loader, PackagePlus, RotateCcw, ScanSearch, Search, Sparkles, Tag, Trash2, Wand2, X,
} from "lucide-react";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import {
  CATEGORIES, errorMessage, formatPrice, normalizeName, parsePrice, runPool, shrinkPhoto,
} from "../lib/productAssist";
import { useProductStore } from "../stores/useProductStore";

// Toplu ekleme: fotoğraflar tek Gemini isteğiyle tanınır, her ürün için görsel otomatik
// aranıp arka planı temizlenir; yönetici adları kontrol edip fiyatları girer ve hepsini kaydeder.
// Hiçbir ürün yöneticinin "kaydet" demesi olmadan kataloğa eklenmez.

const MODES = {
  separate: {
    label: "Her fotoğrafta bir ürün",
    hint: "Her ürünün ön yüzünü ayrı çekin; yazılar okunur olsun.",
    max: 10,
    maxSide: 1280,
  },
  group: {
    label: "Bir fotoğrafta birden çok ürün",
    hint: "Ürünleri ön yüzleri görünecek şekilde yan yana dizin; fotoğraf başına 4–8 ürün idealdir. Raf etiketi görünüyorsa fiyat da okunur.",
    max: 4,
    maxSide: 1600,
  },
};

const PIPELINE_LANES = 3; // aynı anda hazırlanan ürün
const SAVE_LANES = 2; // aynı anda kaydedilen ürün (her biri Cloudinary'ye yüklenir)
const CANDIDATES_TO_TRY = 3; // zemini temizlenebilen görsel bulmak için denenecek aday

const STAGE_LABELS = {
  queued: "Sırada",
  searching: "Görsel aranıyor",
  preparing: "Görsel hazırlanıyor",
  ready: "Hazır",
  "no-image": "Görsel yok",
  unrecognized: "Tanınmadı",
};

let idSeed = 0;
const nextId = () => {
  idSeed += 1;
  return `pab-${Date.now().toString(36)}-${idSeed}`;
};

const isDuplicateOf = (name, similar) =>
  (similar || []).find((item) => normalizeName(item.name) === normalizeName(name)) || null;

const toItem = (product, photos, mode) => {
  const name = product.names?.[0] || "";
  const duplicate = isDuplicateOf(name, product.similar);
  return {
    id: nextId(),
    mode,
    run: 0,
    photo: photos[(product.photo || 1) - 1]?.dataUrl || "",
    photoIndex: product.photo || 1,
    recognized: Boolean(product.recognized),
    names: product.names || [],
    name,
    suggested: (product.categories || []).filter(Boolean),
    category: product.categories?.[0]?.slug || "",
    brand: product.brand || "",
    size: product.size || "",
    note: product.note || "",
    shelfPrice: product.shelfPrice || null,
    count: product.count || 1,
    query: product.searchQuery || name,
    similar: product.similar || [],
    duplicate,
    include: Boolean(product.recognized) && !duplicate,
    stage: product.recognized ? "queued" : "unrecognized",
    images: null,
    imageError: "",
    selectedUrl: "",
    prepared: null,
    price: "",
    prices: null, // internetteki fiyatlar: { offers, min, max, median }; null = aranmadı
    pricesLoading: false,
    description: "",
    save: "idle",
    saveError: "",
    open: false,
  };
};

const itemProblems = (item) => {
  const missing = [];
  if (item.name.trim().length < 2) missing.push("ad");
  if (!item.category) missing.push("kategori");
  if (!item.prepared?.image) missing.push("görsel");
  if (!(parsePrice(item.price) > 0)) missing.push("fiyat");
  return missing;
};

const ProductAssistBulk = () => {
  const [mode, setMode] = useState("separate");
  const [photos, setPhotos] = useState([]); // { id, dataUrl }
  const [items, setItems] = useState([]);
  const [phase, setPhase] = useState("select"); // select | identifying | review
  const [identifyError, setIdentifyError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pastedUrls, setPastedUrls] = useState({});
  const galleryInput = useRef(null);
  const cameraInput = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const runsRef = useRef({});
  const startedRef = useRef(new Set());
  const lanesRef = useRef({ active: 0, waiting: [] });
  const { fetchAllProducts } = useProductStore();
  const { confirm } = useConfirm();

  const config = MODES[mode];
  const unsaved = items.some((item) => item.include && item.save !== "saved");

  // Kaydedilmemiş ürün varken sayfa kapatılırsa tarayıcı uyarır
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // run: ürünün güncel işlem sayacı. Eski bir arama/hazırlama sonucu yeni seçimin üzerine yazılmaz.
  const update = (id, changes, run) =>
    setItems((list) => list.map((item) => (item.id === id && (run === undefined || item.run === run) ? { ...item, ...changes } : item)));
  const startRun = (id) => {
    const run = (runsRef.current[id] || 0) + 1;
    runsRef.current[id] = run;
    update(id, { run });
    return run;
  };

  // Otomatik hazırlık aynı anda en fazla PIPELINE_LANES ürün için çalışır
  const withLane = async (task) => {
    const lanes = lanesRef.current;
    if (lanes.active >= PIPELINE_LANES) await new Promise((resolve) => lanes.waiting.push(resolve));
    lanes.active += 1;
    try {
      return await task();
    } finally {
      lanes.active -= 1;
      lanes.waiting.shift()?.();
    }
  };

  // ── Fotoğraflar ────────────────────────────────────────────────────
  const addPhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = config.max - photos.length;
    if (room <= 0) {
      toast.error(`Bu modda en fazla ${config.max} fotoğraf seçebilirsiniz.`);
      return;
    }
    if (files.length > room) toast(`İlk ${room} fotoğraf alındı (en fazla ${config.max}).`);
    const added = [];
    for (const file of files.slice(0, room)) {
      try {
        added.push({ id: nextId(), dataUrl: await shrinkPhoto(file, config.maxSide, 0.82) });
      } catch {
        toast.error(`${file.name || "Bir fotoğraf"} açılamadı.`);
      }
    }
    setPhotos((current) => [...current, ...added].slice(0, config.max));
  };

  const changeMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setPhotos((current) => current.slice(0, MODES[next].max));
    setIdentifyError("");
  };

  // ── Görsel: ara → ilk adaylardan zemini temizlenebileni seç ────────
  const prepareImage = async (imageUrl) => {
    const { data } = await axios.post("/product-assist/prepare-image", { imageUrl });
    return data;
  };

  // İnternetteki fiyatlar yalnızca referanstır; fiyat kutusu kendiliğinden doldurulmaz
  const fetchPrices = async (id, run, query) => {
    update(id, { pricesLoading: true }, run);
    try {
      const { data } = await axios.post("/product-assist/prices", { query });
      update(id, { prices: { offers: data.offers || [], min: data.min, max: data.max, median: data.median }, pricesLoading: false }, run);
    } catch {
      update(id, { prices: { offers: [], min: null, max: null, median: null }, pricesLoading: false }, run);
    }
  };

  const processItem = async (id, queryOverride) => {
    const item = itemsRef.current.find((entry) => entry.id === id);
    const query = (queryOverride ?? item?.query ?? "").trim();
    if (!item || query.length < 3) return;
    const run = startRun(id);
    fetchPrices(id, run, item.name.trim().length >= 3 ? item.name.trim() : query);
    update(id, { stage: "searching", images: null, imageError: "", selectedUrl: "", prepared: null, query }, run);
    let images;
    try {
      const { data } = await axios.post("/product-assist/images", { query });
      images = data.images || [];
    } catch (error) {
      update(id, { stage: "no-image", images: [], imageError: errorMessage(error, "Görsel araması yapılamadı.") }, run);
      return;
    }
    if (!images.length) {
      update(id, { stage: "no-image", images: [], imageError: "Görsel bulunamadı. Aramayı değiştirin ya da bağlantı yapıştırın." }, run);
      return;
    }
    update(id, { stage: "preparing", images }, run);
    let fallback = null;
    for (const image of images.slice(0, CANDIDATES_TO_TRY)) {
      try {
        const prepared = await prepareImage(image.imageUrl);
        if (prepared.backgroundRemoved) {
          update(id, { stage: "ready", selectedUrl: image.imageUrl, prepared }, run);
          return;
        }
        fallback = fallback || { url: image.imageUrl, prepared };
      } catch {
        // indirilemeyen görsel: sıradaki aday denenir
      }
    }
    if (fallback) update(id, { stage: "ready", selectedUrl: fallback.url, prepared: fallback.prepared }, run);
    else update(id, { stage: "no-image", imageError: "Görseller hazırlanamadı. Listeden başka bir görsel seçin." }, run);
  };

  const chooseImage = async (id, imageUrl) => {
    if (!/^https?:\/\//i.test(imageUrl || "")) return;
    const run = startRun(id);
    update(id, { stage: "preparing", selectedUrl: imageUrl, prepared: null, imageError: "" }, run);
    try {
      const prepared = await prepareImage(imageUrl);
      update(id, { stage: "ready", prepared }, run);
    } catch (error) {
      update(id, { stage: "no-image", imageError: errorMessage(error, "Görsel hazırlanamadı. Başka bir görsel seçin.") }, run);
    }
  };

  // Yeni tanınan ürünler sıraya girer; görsel araması ve hazırlık kendiliğinden başlar
  useEffect(() => {
    for (const item of items) {
      if (item.stage !== "queued" || startedRef.current.has(item.id)) continue;
      startedRef.current.add(item.id);
      withLane(() => processItem(item.id));
    }
  });

  // ── Tanıma ─────────────────────────────────────────────────────────
  const identify = async (batch) => {
    if (!batch.length) return;
    setIdentifyError("");
    setPhase("identifying");
    try {
      const { data } = await axios.post("/product-assist/identify-batch", { mode, photos: batch.map((photo) => photo.dataUrl) }, { timeout: 180000 });
      const created = (data.products || []).map((product) => toItem(product, batch, mode));
      setItems((current) => [...current, ...created]);
      setPhotos([]);
      setPhase("review");
      const found = created.filter((item) => item.recognized).length;
      if (!found) toast.error("Fotoğraflarda ürün tanınamadı. Ön yüzleri daha net çekip tekrar deneyin.");
      else toast.success(`${found} ürün bulundu; görseller hazırlanıyor.`);
    } catch (error) {
      // Fotoğraflar seçili kalır; hata seçim ekranında gösterilir, varsa "Listeye dön" ile önceki ürünlere dönülür
      setPhase("select");
      setIdentifyError(errorMessage(error, "Fotoğraflar yorumlanamadı. Tekrar deneyin."));
    }
  };

  // Tanınmayan tek bir fotoğrafı (her fotoğrafta bir ürün modunda) yeniden tanır
  const reidentify = async (id) => {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item?.photo) return;
    const run = startRun(id);
    update(id, { stage: "searching", imageError: "" }, run);
    try {
      const { data } = await axios.post("/product-assist/identify", { photo: item.photo });
      if (!data.recognized) {
        update(id, { stage: "unrecognized", imageError: "Yine tanınamadı. Adı kendiniz yazıp görsel arayın." }, run);
        return;
      }
      const fresh = toItem({ ...data, photo: 1 }, [{ dataUrl: item.photo }], item.mode);
      update(id, {
        recognized: true, names: fresh.names, name: fresh.name, suggested: fresh.suggested, category: fresh.category,
        brand: fresh.brand, size: fresh.size, note: fresh.note, query: fresh.query, similar: fresh.similar,
        duplicate: fresh.duplicate, include: !fresh.duplicate,
      }, run);
      await processItem(id, fresh.query);
    } catch (error) {
      update(id, { stage: "unrecognized", imageError: errorMessage(error, "Fotoğraf yorumlanamadı.") }, run);
    }
  };

  // ── Kayıt ──────────────────────────────────────────────────────────
  const readyItems = items.filter((item) => item.include && item.save !== "saved" && !itemProblems(item).length);
  const missingItems = items.filter((item) => item.include && item.save !== "saved" && itemProblems(item).length);
  const savedCount = items.filter((item) => item.save === "saved").length;
  const working = items.some((item) => ["queued", "searching", "preparing"].includes(item.stage));
  const allDone = savedCount > 0 && items.every((item) => item.save === "saved" || !item.include);

  const saveAll = async () => {
    if (!readyItems.length || saving) return;
    setSaving(true);
    let ok = 0;
    await runPool(readyItems, SAVE_LANES, async (item) => {
      update(item.id, { save: "saving", saveError: "" });
      try {
        await axios.post("/products", {
          name: item.name.trim(),
          description: item.description.trim(),
          price: parsePrice(item.price),
          category: item.category,
          image: item.prepared.image,
          isHidden: hidden,
        });
        ok += 1;
        update(item.id, { save: "saved", open: false });
      } catch (error) {
        update(item.id, { save: "error", saveError: errorMessage(error, "Kaydedilemedi.") });
      }
    });
    setSaving(false);
    const failed = readyItems.length - ok;
    if (ok) toast.success(`${ok} ürün kataloğa eklendi${hidden ? " (mağazada gizli)" : ""}`);
    if (failed) toast.error(`${failed} ürün kaydedilemedi; satırdaki hatayı kontrol edin.`);
    if (ok) fetchAllProducts?.();
  };

  const reset = () => {
    startedRef.current = new Set();
    setItems([]);
    setPhotos([]);
    setPastedUrls({});
    setIdentifyError("");
    setPhase("select");
  };

  const startOver = async () => {
    if (unsaved) {
      const ok = await confirm({
        title: "Baştan başla",
        message: "Listedeki kaydedilmemiş ürünler silinecek. Emin misiniz?",
        confirmText: "Evet, temizle",
        cancelText: "Vazgeç",
        type: "warning",
      });
      if (!ok) return;
    }
    reset();
  };

  // Fiyat kutusunda Enter → sonraki ürünün fiyatı (hızlı giriş)
  const focusNextPrice = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputs = Array.from(document.querySelectorAll(".pab-price input:not([disabled])"));
    const index = inputs.indexOf(event.currentTarget);
    inputs[index + 1]?.focus();
    if (index === inputs.length - 1) event.currentTarget.blur();
  };

  // ── Görünüm ────────────────────────────────────────────────────────
  const photoPicker = (
    <section className="ui-panel pab-select" aria-labelledby="pab-photos">
      <header className="ui-panel-head">
        <div>
          <h2 id="pab-photos"><Layers />Toplu ekleme fotoğrafları</h2>
          <p>Tüm fotoğraflar tek seferde tanınır; ücretsiz yapay zekâ kotasından tek istek harcanır.</p>
        </div>
      </header>
      <div className="ui-panel-body ui-stack">
        <div className="pab-modes" role="radiogroup" aria-label="Fotoğraf türü">
          {Object.entries(MODES).map(([key, value]) => (
            <button key={key} type="button" className="ui-option" role="radio" aria-checked={mode === key} aria-pressed={mode === key}
              onClick={() => changeMode(key)} disabled={phase === "identifying"}>
              {mode === key ? <Check /> : <span className="pa-dot" />}
              <span>{value.label}<small>{value.hint}</small></span>
              <span className="ui-badge">en fazla {value.max}</span>
            </button>
          ))}
        </div>

        <div className="pab-photos">
          {photos.map((photo, index) => (
            <figure key={photo.id} className="pab-photo">
              <img src={photo.dataUrl} alt={`Fotoğraf ${index + 1}`} />
              <figcaption>{index + 1}</figcaption>
              <button type="button" className="pab-photo-remove" aria-label={`${index + 1}. fotoğrafı çıkar`} disabled={phase === "identifying"}
                onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}>
                <X />
              </button>
            </figure>
          ))}
          {photos.length < config.max && (
            <button type="button" className="ui-dropzone pab-add" onClick={() => galleryInput.current?.click()} disabled={phase === "identifying"}>
              <ImagePlus aria-hidden="true" />
              <span>{photos.length ? "Fotoğraf ekle" : "Fotoğrafları seç"}</span>
              <small>{photos.length}/{config.max}</small>
            </button>
          )}
        </div>
        <input ref={galleryInput} type="file" accept="image/*" multiple hidden
          onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
          onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} />

        {identifyError && <p className="pa-error" role="alert">{identifyError}</p>}

        <div className="ui-cluster pab-select-actions">
          <button type="button" className="ui-btn ui-btn--primary ui-btn--lg" onClick={() => identify(photos)} disabled={!photos.length || phase === "identifying"}>
            {phase === "identifying" ? <Loader className="ui-spin" /> : <ScanSearch />}
            {phase === "identifying" ? "Ürünler tanınıyor…" : `Ürünleri tanı${photos.length ? ` (${photos.length} fotoğraf)` : ""}`}
          </button>
          <button type="button" className="ui-btn" onClick={() => cameraInput.current?.click()} disabled={photos.length >= config.max || phase === "identifying"}>
            <Camera />Kamerayla çek
          </button>
          {items.length > 0 && phase !== "identifying" && (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setPhase("review")}>Listeye dön</button>
          )}
        </div>
        {phase === "identifying" && (
          <p className="pa-working" aria-live="polite"><Sparkles />Yapay zekâ {photos.length} fotoğrafı inceliyor; bu genelde 10–40 saniye sürer.</p>
        )}
      </div>
    </section>
  );

  if (phase !== "review") return <div className="pab">{photoPicker}</div>;

  return (
    <div className="pab">
      {/* Özet ve kayıt çubuğu */}
      <section className="ui-panel pab-bar" aria-label="Toplu ekleme özeti">
        <div className="pab-bar-stats">
          <strong className="ui-num">{items.length} ürün</strong>
          <span className="pab-stat" data-tone="ok"><CheckCircle2 />{readyItems.length} hazır</span>
          {missingItems.length > 0 && <span className="pab-stat" data-tone="warn"><AlertTriangle />{missingItems.length} eksik</span>}
          {savedCount > 0 && <span className="pab-stat" data-tone="brand"><Check />{savedCount} eklendi</span>}
          {working && <span className="pab-stat"><Loader className="ui-spin" />görseller hazırlanıyor</span>}
        </div>
        <div className="pab-bar-actions">
          <button type="button" className="ui-toggle" aria-pressed={hidden} onClick={() => setHidden(!hidden)} title="Ürünler mağazada görünmez; Ürünler sekmesinden kontrol edip açarsınız">
            <i /><span><EyeOff />Mağazada gizli ekle</span>
          </button>
          <button type="button" className="ui-btn" onClick={() => setPhase("select")} disabled={saving}>
            <ImagePlus />Fotoğraf ekle
          </button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={saveAll} disabled={!readyItems.length || saving}>
            {saving ? <Loader className="ui-spin" /> : <PackagePlus />}
            {saving ? "Kaydediliyor…" : `Hazır olanları kaydet (${readyItems.length})`}
          </button>
        </div>
      </section>

      {missingItems.length > 0 && !saving && (
        <p className="ui-hint pab-hint">Eksik bilgisi olan ürünler kaydedilmez. Fiyat kutusunda <kbd>Enter</kbd> ile sonraki ürünün fiyatına geçebilirsiniz.</p>
      )}

      <ol className="pab-list">
        {items.map((item, index) => {
          const problems = itemProblems(item);
          const saved = item.save === "saved";
          const busy = ["queued", "searching", "preparing"].includes(item.stage);
          const otherCategories = CATEGORIES.filter((category) => !item.suggested.some((entry) => entry.slug === category.slug));
          return (
            <li key={item.id} className="pab-item" data-included={item.include} data-saved={saved || undefined} data-open={item.open || undefined}>
              <div className="pab-row">
                <label className="pab-include" title={item.include ? "Kaydedilecek" : "Kaydedilmeyecek"}>
                  <input type="checkbox" checked={item.include} disabled={saved || saving}
                    onChange={(event) => update(item.id, { include: event.target.checked })} aria-label={`${index + 1}. ürünü kaydet`} />
                </label>

                <button type="button" className="pab-thumb" onClick={() => update(item.id, { open: !item.open })} aria-label="Görseli değiştir" disabled={saved}>
                  {item.prepared?.image ? <img src={item.prepared.image} alt="" />
                    : busy ? <Wand2 className="ui-spin" />
                      : item.photo ? <img src={item.photo} alt="" className="pab-thumb-photo" /> : <ImageOff />}
                  {item.prepared && !item.prepared.backgroundRemoved && <span className="pab-thumb-flag" title="Zemini temizlenemedi"><AlertTriangle /></span>}
                </button>

                <div className="pab-main">
                  <input className="ui-field pab-name" value={item.name} maxLength={90} disabled={saved}
                    placeholder={item.recognized ? "Ürün adı" : "Tanınmadı — adı yazın"} aria-label={`${index + 1}. ürünün adı`}
                    onChange={(event) => {
                      const name = event.target.value;
                      update(item.id, { name, duplicate: isDuplicateOf(name, item.similar) });
                    }} />
                  <div className="pab-meta">
                    <span className="pab-no">#{index + 1}</span>
                    {item.brand && <span>{item.brand}</span>}
                    {item.size && <span>{item.size}</span>}
                    {item.count > 1 && <span>{item.count} adet görüldü</span>}
                    <span>Fotoğraf {item.photoIndex}</span>
                    {item.duplicate && <span className="pab-flag" data-tone="danger"><AlertTriangle />Katalogda var: {formatPrice(item.duplicate.price)}</span>}
                    {!item.duplicate && item.similar.length > 0 && <span className="pab-flag" data-tone="warn"><AlertTriangle />Benzer ürün var</span>}
                    {!item.recognized && <span className="pab-flag" data-tone="warn">Tanınmadı</span>}
                  </div>
                </div>

                <select className="ui-field pab-category" value={item.category} disabled={saved} aria-label={`${index + 1}. ürünün kategorisi`}
                  onChange={(event) => update(item.id, { category: event.target.value })}>
                  <option value="">Kategori seç…</option>
                  {item.suggested.length > 0 && (
                    <optgroup label="Önerilen">
                      {item.suggested.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label={item.suggested.length ? "Diğer" : "Kategoriler"}>
                    {otherCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                  </optgroup>
                </select>

                <div className="pab-price">
                  <span aria-hidden="true">₺</span>
                  <input className="ui-field" inputMode="decimal" placeholder="Fiyat" value={item.price} disabled={saved}
                    aria-label={`${index + 1}. ürünün fiyatı`}
                    onKeyDown={focusNextPrice}
                    onChange={(event) => update(item.id, { price: event.target.value.replace(/[^\d.,]/g, "") })} />
                  {!item.price && !saved && item.prices?.median && (
                    <button type="button" className="pab-shelf pab-web" onClick={() => update(item.id, { price: String(item.prices.median).replace(".", ",") })}
                      title={`İnternette ${item.prices.offers.length} sonuç: ${formatPrice(item.prices.min)} – ${formatPrice(item.prices.max)}. Kullanmak için tıklayın.`}>
                      <Globe />İnternet {formatPrice(item.prices.median)}
                    </button>
                  )}
                  {item.shelfPrice && !item.price && !saved && (
                    <button type="button" className="pab-shelf" onClick={() => update(item.id, { price: String(item.shelfPrice).replace(".", ",") })}
                      title="Fotoğraftaki raf etiketinden okundu">
                      <Tag />Etiket {formatPrice(item.shelfPrice)}
                    </button>
                  )}
                </div>

                <span className="pab-state" data-stage={saved ? "saved" : item.save === "saving" ? "saving" : item.save === "error" ? "error" : busy ? "busy" : !item.include ? "skip" : problems.length ? "missing" : "ready"}>
                  {saved ? <><Check />Eklendi</>
                    : item.save === "saving" ? <><Loader className="ui-spin" />Kaydediliyor</>
                      : item.save === "error" ? <><AlertTriangle />Hata</>
                        : busy ? <><Loader className="ui-spin" />{STAGE_LABELS[item.stage]}</>
                          : !item.include ? <>Eklenmeyecek</>
                            : problems.length ? <>Eksik: {problems.join(", ")}</>
                            : <><CheckCircle2 />Hazır</>}
                </span>

                <button type="button" className="ui-icon-btn pab-toggle" aria-expanded={item.open} aria-label="Ayrıntılar" disabled={saved}
                  onClick={() => update(item.id, { open: !item.open })}>
                  <ChevronDown />
                </button>
              </div>

              {item.save === "error" && <p className="pa-error pab-row-error" role="alert">{item.saveError}</p>}

              {item.open && !saved && (
                <div className="pab-detail">
                  <div className="pab-detail-side">
                    {item.photo && <img className="pab-source" src={item.photo} alt={`Kaynak fotoğraf ${item.photoIndex}`} />}
                    {item.note && <p className="ui-hint">{item.note}</p>}
                    {!item.recognized && item.mode === "separate" && (
                      <button type="button" className="ui-btn ui-btn--sm" onClick={() => reidentify(item.id)} disabled={busy}>
                        <RotateCcw />Tekrar tanı
                      </button>
                    )}
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost pab-remove" disabled={saving}
                      onClick={() => setItems((list) => list.filter((entry) => entry.id !== item.id))}>
                      <Trash2 />Listeden çıkar
                    </button>
                  </div>

                  <div className="ui-stack pab-detail-main">
                    {item.names.length > 1 && (
                      <div className="pab-names" role="radiogroup" aria-label="Ad önerileri">
                        {item.names.map((name) => (
                          <button type="button" key={name} className="ui-option" role="radio" aria-checked={item.name === name} aria-pressed={item.name === name}
                            onClick={() => update(item.id, { name, duplicate: isDuplicateOf(name, item.similar) })}>
                            {item.name === name ? <Check /> : <span className="pa-dot" />}{name}
                          </button>
                        ))}
                      </div>
                    )}

                    {item.similar.length > 0 && (
                      <div className="ui-banner ui-banner--warn" role="status">
                        <AlertTriangle />
                        <div>
                          <strong>Katalogdaki benzer ürünler:</strong>
                          <ul className="pab-similar">{item.similar.map((entry) => <li key={entry._id}>{entry.name} — {formatPrice(entry.price)}</li>)}</ul>
                        </div>
                      </div>
                    )}

                    <div className="pab-prices" aria-live="polite">
                      <span className="ui-label"><Globe />İnternetteki fiyatlar</span>
                      {item.pricesLoading && <span className="ui-hint"><Loader className="ui-spin" />Aranıyor…</span>}
                      {!item.pricesLoading && item.prices && !item.prices.offers.length && <span className="ui-hint">Fiyat bulunamadı.</span>}
                      {!item.pricesLoading && item.prices?.offers.length > 0 && (
                        <ul>
                          {item.prices.offers.map((offer) => (
                            <li key={`${offer.pageUrl}-${offer.price}`}>
                              <button type="button" className="pab-offer-use" onClick={() => update(item.id, { price: String(offer.price).replace(".", ",") })} title="Bu fiyatı kullan">
                                <strong className="ui-num">{formatPrice(offer.price)}</strong>
                                <span>{offer.source}</span>
                              </button>
                              {offer.pageUrl && (
                                <a href={offer.pageUrl} target="_blank" rel="noopener noreferrer" className="ui-icon-btn ui-icon-btn--sm" aria-label={`${offer.source} sayfasını aç`} title={offer.title}>
                                  <ExternalLink />
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="pa-search">
                      <input className="ui-field" value={item.query} aria-label="Görsel arama sorgusu" placeholder="Aranacak ürün adı"
                        onChange={(event) => update(item.id, { query: event.target.value })}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); processItem(item.id, item.query); } }} />
                      <button type="button" className="ui-btn" onClick={() => processItem(item.id, item.query || item.name)} disabled={busy || (item.query || item.name).trim().length < 3}>
                        <Search />Görsel ara
                      </button>
                    </div>

                    {item.imageError && <p className="pa-error" role="alert">{item.imageError}</p>}
                    {item.stage === "searching" && <div className="pa-grid pab-grid" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i} className="ui-skeleton pa-tile" />)}</div>}
                    {item.images?.length > 0 && item.stage !== "searching" && (
                      <div className="pa-grid pab-grid" role="radiogroup" aria-label="Görsel seçenekleri">
                        {item.images.map((image) => (
                          <button type="button" key={image.imageUrl} className="pa-tile" role="radio" aria-checked={item.selectedUrl === image.imageUrl}
                            data-selected={item.selectedUrl === image.imageUrl} onClick={() => chooseImage(item.id, image.imageUrl)} disabled={item.stage === "preparing"} title={image.title}>
                            <img src={image.imageUrl} alt={image.title || "Ürün görseli"} loading="lazy" referrerPolicy="no-referrer"
                              onError={(event) => { event.currentTarget.closest("button").hidden = true; }} />
                            <span className="pa-tile-source">{image.source}</span>
                            {item.selectedUrl === image.imageUrl && <span className="pa-tile-check">{item.stage === "preparing" ? <Loader className="ui-spin" /> : <Check />}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {item.prepared && !item.prepared.backgroundRemoved && (
                      <div className="ui-banner ui-banner--warn" role="status">
                        <AlertTriangle />
                        <span>Seçilen görselin zemini düz değil, arka planı kaldırılamadı. Beyaz zeminli başka bir görsel seçmeniz önerilir.</span>
                      </div>
                    )}
                    <div className="pa-search">
                      <input className="ui-field" value={pastedUrls[item.id] || ""} aria-label="Görsel bağlantısı" placeholder="ya da bir görsel bağlantısı yapıştırın (https://…)"
                        onChange={(event) => setPastedUrls((current) => ({ ...current, [item.id]: event.target.value }))} />
                      <button type="button" className="ui-btn" onClick={() => chooseImage(item.id, (pastedUrls[item.id] || "").trim())}
                        disabled={item.stage === "preparing" || !/^https?:\/\//i.test((pastedUrls[item.id] || "").trim())}>
                        <Link2 />Kullan
                      </button>
                    </div>

                    <div>
                      <label htmlFor={`${item.id}-desc`} className="ui-label">Açıklama <span className="ui-muted">(isteğe bağlı)</span></label>
                      <textarea id={`${item.id}-desc`} className="ui-field" rows={2} maxLength={500} value={item.description}
                        onChange={(event) => update(item.id, { description: event.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {allDone && (
        <div className="ui-banner ui-banner--info pab-done" role="status">
          <CheckCircle2 />
          <span>{savedCount} ürün kataloğa eklendi{hidden ? "; Ürünler sekmesinden kontrol edip mağazada görünür yapabilirsiniz" : ""}.</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={reset}><Layers />Yeni toplu ekleme</button>
        </div>
      )}
      {!allDone && (
        <div className="pab-foot">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={startOver} disabled={saving}>
            <RotateCcw />Baştan başla
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductAssistBulk;
