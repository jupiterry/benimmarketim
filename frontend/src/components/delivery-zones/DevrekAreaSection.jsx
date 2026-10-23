// Genel Devrek kartının "Teslimat alanı" bölümü: Devrek merkezinin OpenStreetMap sınırı.
// - Durum: Yüklü (ad, ~km², tarih) / Yüklenmedi (siparişler alınır ama "alan doğrulanmadı" işaretlenir).
// - "Sınırı OpenStreetMap'ten yükle/güncelle": POST /delivery/admin/zones/devrek/area/fetch (en küçük aday = merkez seçilir).
// - Aday listesi (radyo): PUT /delivery/admin/zones/devrek/area { osmType, osmId }.
// - "Sınırı kaldır": DELETE /delivery/admin/zones/devrek/area.
// Her işlem sunucuda işlem kaydına yazılır.
import { useId, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, DownloadCloud, ExternalLink, Loader2, MapPinned, Trash2 } from "lucide-react";
import axios from "../../lib/axios";
import { formatDateTime } from "../admin/ui";
import { useConfirm } from "../ConfirmModal";
import { errorMessage, km2, osmLink } from "./shared";

const API = "/delivery/admin/zones/devrek/area";
const sameCandidate = (a, b) => Boolean(a && b) && a.osmType === b.osmType && Number(a.osmId) === Number(b.osmId);
const levelText = (level) => (Number.isFinite(Number(level)) && level !== null ? `Yönetim seviyesi ${level}` : "");

const DevrekAreaSection = ({ zone, onAreaChange }) => {
  const { confirm } = useConfirm();
  const headId = useId();
  const [busy, setBusy] = useState(""); // "fetch" | "select:<key>" | "clear"
  const [error, setError] = useState("");
  const area = zone.area;
  const candidates = zone.areaCandidates || [];
  const mapLink = area ? osmLink(area.osmType, area.osmId) : null;

  const apply = (data) => onAreaChange({
    area: data?.area && data.area.osmType ? data.area : null,
    ...(Array.isArray(data?.candidates) ? { areaCandidates: data.candidates } : {}),
  });

  const fetchArea = async () => {
    setBusy("fetch");
    setError("");
    try {
      const { data } = await axios.post(`${API}/fetch`);
      apply(data);
      const count = data?.candidates?.length || 0;
      toast.success(count > 1 ? `Sınır yüklendi: ${data.area?.displayName || "Devrek"} (${count} aday)` : `Sınır yüklendi: ${data?.area?.displayName || "Devrek"}`);
    } catch (err) {
      setError(errorMessage(err, "Sınır yüklenemedi. Biraz sonra tekrar deneyin."));
    } finally {
      setBusy("");
    }
  };

  const select = async (candidate) => {
    if (sameCandidate(area, candidate) || busy) return;
    setBusy(`select:${candidate.osmType}/${candidate.osmId}`);
    setError("");
    try {
      const { data } = await axios.put(API, { osmType: candidate.osmType, osmId: candidate.osmId });
      apply(data);
      toast.success(`Teslimat alanı: ${candidate.displayName || "seçilen sınır"}`);
    } catch (err) {
      setError(errorMessage(err, "Sınır seçilemedi"));
    } finally {
      setBusy("");
    }
  };

  const clear = async () => {
    const ok = await confirm({
      title: "Teslimat alanı kaldırılsın mı?",
      message: "Sınır kaldırılınca Devrek siparişleri konum denetimi yapılmadan alınır ve “alan doğrulanmadı” olarak işaretlenir. Sınırı istediğiniz zaman yeniden yükleyebilirsiniz.",
      confirmText: "Sınırı kaldır",
      type: "danger",
    });
    if (!ok) return;
    setBusy("clear");
    setError("");
    try {
      await axios.delete(API);
      onAreaChange({ area: null });
      toast.success("Teslimat alanı kaldırıldı");
    } catch (err) {
      setError(errorMessage(err, "Sınır kaldırılamadı"));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="dz-area" aria-labelledby={headId}>
      <div className="dz-area-head">
        <span className="dz-area-icon"><MapPinned aria-hidden="true" /></span>
        <div className="dz-area-titles">
          <h3 className="dz-area-h" id={headId}>Teslimat alanı</h3>
          <p className="ui-hint">Google Haritalar’da “Devrek, Zonguldak” için görünen merkez (belediye) sınırı. Müşteri adres eklerken konumunu haritada işaretler; sınır dışındaki adres ve sipariş reddedilir.</p>
        </div>
      </div>

      {area ? (
        <div className="dz-area-status" data-state="ok" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div className="dz-area-status-text">
            <strong>Yüklü: {area.displayName || `${area.osmType}/${area.osmId}`}</strong>
            <span className="ui-num">{[km2(area.areaKm2), levelText(area.adminLevel), area.fetchedAt ? formatDateTime(area.fetchedAt) : ""].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
      ) : (
        <div className="dz-area-status" data-state="missing" role="status">
          <AlertTriangle aria-hidden="true" />
          <div className="dz-area-status-text">
            <strong>Yüklenmedi</strong>
            <span>Sınır yüklenene kadar Devrek siparişleri alınır ama siparişlerde “alan doğrulanmadı” olarak işaretlenir.</span>
          </div>
        </div>
      )}

      {error && (
        <div className="ui-banner ui-banner--danger dz-area-error" role="alert">
          <AlertTriangle /><span className="ui-grow">{error}</span>
        </div>
      )}

      <div className="dz-area-actions">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={fetchArea} disabled={Boolean(busy)}>
          {busy === "fetch" ? <Loader2 className="ui-spin" /> : <DownloadCloud />}
          {area ? "Sınırı OpenStreetMap'ten güncelle" : "Sınırı OpenStreetMap'ten yükle"}
        </button>
        {mapLink && (
          <a className="ui-btn ui-btn--sm" href={mapLink} target="_blank" rel="noopener noreferrer" title="Seçili sınırı OpenStreetMap'te aç">
            <ExternalLink />Haritada kontrol et
          </a>
        )}
        {area && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost dz-area-clear" onClick={clear} disabled={Boolean(busy)}>
            {busy === "clear" ? <Loader2 className="ui-spin" /> : <Trash2 />}Sınırı kaldır
          </button>
        )}
      </div>

      {candidates.length > 0 && (
        <fieldset className="dz-area-cands" disabled={Boolean(busy)}>
          <legend className="ui-label">Bulunan sınırlar <span className="ui-muted">({candidates.length})</span></legend>
          <p className="ui-hint dz-area-cands-hint">
            En küçük alan Devrek merkezinin (belediye) sınırıdır ve önerilir. Daha büyük olan ilçe sınırı köyleri de kapsar.
          </p>
          <div className="dz-area-list" role="radiogroup" aria-label="Teslimat alanı sınırı">
            {candidates.map((candidate, index) => {
              const key = `${candidate.osmType}/${candidate.osmId}`;
              const checked = sameCandidate(area, candidate);
              const link = osmLink(candidate.osmType, candidate.osmId);
              return (
                <label key={key} className="dz-area-cand" data-checked={checked || undefined}>
                  <input type="radio" name={`${headId}-cand`} className="dz-area-radio" checked={checked} onChange={() => select(candidate)} />
                  <span className="dz-area-cand-main">
                    <span className="dz-area-cand-name">
                      {candidate.displayName || key}
                      {index === 0 && <span className="ui-badge ui-badge--brand dz-area-tag">Merkez sınırı · önerilen</span>}
                    </span>
                    <span className="dz-area-cand-meta ui-num">{[km2(candidate.areaKm2), levelText(candidate.adminLevel)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {busy === `select:${key}` ? (
                    <Loader2 className="ui-spin dz-area-cand-busy" aria-label="Seçiliyor" />
                  ) : link && (
                    <a className="ui-icon-btn ui-icon-btn--sm dz-area-cand-link" href={link} target="_blank" rel="noopener noreferrer"
                      aria-label={`${candidate.displayName || key} sınırını OpenStreetMap'te aç`} onClick={(e) => e.stopPropagation()}>
                      <ExternalLink />
                    </a>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </section>
  );
};

export default DevrekAreaSection;
