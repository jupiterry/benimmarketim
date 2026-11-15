import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Upload } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { useProductStore } from "../../stores/useProductStore";
import { CATEGORIES, IMPORT_HEADERS, IMPORT_MAX_MB, buildImportTemplate, downloadText, errorMessage } from "./productUtils";
import "../../styles/products.css";

const isCsvFile = (file) => /\.csv$/i.test(file?.name || "") || ["text/csv", "application/csv", "application/vnd.ms-excel"].includes(file?.type);

/**
 * CSV ile toplu ürün yükleme. Sunucu dosyayı satır satır doğrular: geçerli satırlar eklenir, atlanan
 * ve kopya satırlar satır numarası ve nedeniyle burada listelenir.
 */
const BulkUploadPanel = () => {
  const fetchAllProducts = useProductStore((s) => s.fetchAllProducts);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null); // { fileName, created, total, skipped, duplicates } | { fileName, error }
  const dragDepth = useRef(0);

  const upload = async (file) => {
    if (!file || busy) return;
    if (!isCsvFile(file)) {
      setResult({ fileName: file.name, error: "Yalnızca .csv dosyası yüklenebilir. Excel'de “Farklı kaydet → CSV” seçin." });
      return;
    }
    if (file.size > IMPORT_MAX_MB * 1024 * 1024) {
      setResult({ fileName: file.name, error: `Dosya ${IMPORT_MAX_MB} MB'tan büyük. Dosyayı bölüp tekrar deneyin.` });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    setResult(null);
    try {
      const { data } = await axios.post("/products/bulk-upload", formData);
      const created = Number(data?.created) || 0;
      const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
      const duplicates = Array.isArray(data?.duplicates) ? data.duplicates : [];
      setResult({ fileName: file.name, created, total: Number(data?.total) || created + skipped.length + duplicates.length, skipped, duplicates });
      if (created) {
        toast.success(`${created} ürün eklendi`);
        await fetchAllProducts();
      } else {
        toast.error("Hiç ürün eklenmedi; ayrıntılar aşağıda.");
      }
    } catch (error) {
      const message = errorMessage(error, "Yükleme sırasında hata oluştu. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setResult({ fileName: file.name, error: message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const onPick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // aynı dosya düzeltilip yeniden seçilebilsin
    upload(file);
  };
  const onDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length > 1) toast("Birden çok dosya bırakıldı; yalnızca ilki yüklenir.");
    upload(files[0]);
  };

  const missed = result && !result.error ? [
    ...result.skipped.map((item) => ({ ...item, kind: "skipped" })),
    ...result.duplicates.map((item) => ({
      ...item,
      kind: "duplicate",
      reason: item.of === "file" ? `Aynı ad dosyada ${item.firstRow}. satırda da var` : "Bu adla ürün katalogda zaten var",
    })),
  ].sort((a, b) => a.row - b.row) : [];
  const tone = !result ? undefined : result.error || !result.created ? "danger" : missed.length ? "warn" : "ok";

  return (
    <div className="ui-card prd-import">
      <div className="ui-card-header">
        <div>
          <h2 className="ui-title">Toplu ürün yükleme</h2>
          <p className="ui-subtitle">CSV dosyasıyla birçok ürünü tek seferde ekleyin.</p>
        </div>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => downloadText(buildImportTemplate(), "urun-yukleme-sablonu.csv")}>
          <Download />Şablonu indir
        </button>
      </div>
      <div className="ui-card-body ui-stack">
        <div>
          <p className="ui-label">Başlık satırı</p>
          <code className="ui-code prd-import-headers">{IMPORT_HEADERS.join(";")}</code>
        </div>
        <ul className="prd-import-rules">
          <li><strong>name</strong>, <strong>price</strong> ve <strong>category</strong> zorunludur. Fiyatı 12,50 ya da 12.50 yazabilirsiniz.</li>
          <li>Kategoriye kodu ya da adını yazın: {CATEGORIES.map((c) => c.slug).join(", ")}.</li>
          <li><strong>discountedPrice</strong> fiyattan düşükse ürün indirimli eklenir. <strong>isOutOfStock</strong> ve <strong>isHidden</strong> için evet ya da hayır yazın; boş bırakırsanız hayır sayılır.</li>
          <li>Katalogda ya da dosyada aynı adla ürün varsa o satır eklenmez. Hatalı satırlar atlanır, diğerleri eklenir.</li>
        </ul>

        <label className="ui-dropzone prd-import-drop" data-drag={dragging || undefined} aria-busy={busy}
          onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = busy ? "none" : "copy"; }}
          onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
          onDrop={onDrop}>
          {busy ? <RefreshCw className="ui-spin" /> : <Upload />}
          <span className="ui-strong">
            {busy ? "Dosya yükleniyor ve kontrol ediliyor…" : dragging ? "Dosyayı buraya bırakın" : "CSV dosyası seçin ya da buraya sürükleyin"}
          </span>
          <span className="ui-text-xs ui-muted">En fazla {IMPORT_MAX_MB} MB · .csv</span>
          <input type="file" accept=".csv,text/csv" onChange={onPick} disabled={busy} />
        </label>

        {result && (
          <div className="prd-import-result" data-tone={tone} role="status" aria-live="polite">
            {result.error ? (
              <>
                <p className="prd-import-summary"><AlertTriangle />Dosya yüklenemedi</p>
                <p className="ui-text-sm">{result.error}</p>
                <p className="ui-muted ui-text-xs">{result.fileName} · hiçbir ürün eklenmedi.</p>
              </>
            ) : (
              <>
                <p className="prd-import-summary">
                  {result.created ? <CheckCircle2 /> : <AlertTriangle />}
                  {result.created ? `${result.created} ürün eklendi` : "Hiç ürün eklenmedi"}
                  {missed.length > 0 && ` · ${missed.length} satır atlandı`}
                </p>
                <p className="ui-muted ui-text-xs">
                  {result.fileName} · {result.total} satır okundu
                  {result.created > 0 && " · ürünler Ürünler ekranında görünür"}
                </p>
                {missed.length > 0 && (
                  <>
                    <p className="ui-text-sm">Atlanan satırları düzeltip yalnızca onları yeniden yükleyebilirsiniz; eklenen ürünler tekrar eklenmez.</p>
                    <ul className="prd-import-list">
                      {missed.map((item) => (
                        <li key={`${item.kind}-${item.row}`}>
                          <span className="prd-import-rowno">Satır {item.row}</span>
                          <strong>{item.name || "(adsız)"}</strong>
                          <small data-kind={item.kind}>{item.reason}</small>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkUploadPanel;
