// Uygulama bölümü: mobil sürüm numaraları, zorunlu güncelleme ve mağaza bağlantıları.
// Canlı durum, mobil uygulamanın okuduğu /version-check ucundan gelir.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, Smartphone } from "lucide-react";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import { Skeleton } from "../admin/ui";
import { Field, Input, Row, SectionHead, StatusPill, Switch, useSettingsForm } from "./fields";

export default function AppSection() {
  const form = useSettingsForm();
  const { confirm } = useConfirm();
  const { appVersion } = form.draft;
  const [live, setLive] = useState({ status: "loading", data: null });

  const fetchLive = useCallback(async () => {
    setLive((s) => ({ ...s, status: "loading" }));
    try {
      const { data } = await axios.get("/version-check?platform=android");
      setLive({ status: "ready", data });
    } catch {
      setLive({ status: "error", data: null });
    }
  }, []);
  useEffect(() => { fetchLive(); }, [fetchLive, form.savedAt]);

  const toggleForce = async (next) => {
    if (next) {
      const ok = await confirm({
        title: "Zorunlu güncellemeyi aç",
        message: `Minimum sürümün (${appVersion.minimumVersion}) altındaki uygulamalar güncellenene kadar kullanılamaz. Mağazada yeni sürümün yayında olduğundan emin olun.`,
        confirmText: "Aç",
        cancelText: "Vazgeç",
        type: "warning",
      });
      if (!ok) return;
    }
    form.update("appVersion.forceUpdate", next);
  };

  const liveMismatch = live.status === "ready" && live.data && (
    live.data.latest_version !== form.saved.appVersion.latestVersion || live.data.minimum_version !== form.saved.appVersion.minimumVersion
  );

  return (
    <div className="stg-section">
      <section className="ui-panel">
        <SectionHead
          icon={Smartphone}
          title="Uygulama sürümü"
          description="Android ve iOS için tek sürüm bilgisi. Uygulama açılışta bu değerleri okur."
          aside={
            <button type="button" className="ui-btn ui-btn--sm" onClick={fetchLive} disabled={live.status === "loading"}>
              <RefreshCw className={live.status === "loading" ? "ui-spin" : ""} />Canlı durumu yenile
            </button>
          }
        />
        <div className="ui-panel-body stg-stack">
          <div className="stg-live" aria-live="polite">
            <div className="stg-live-head">
              <StatusPill tone={live.status === "error" ? "danger" : live.status === "ready" ? "ok" : "muted"}>
                {live.status === "error" ? "Canlı API yanıt vermedi" : live.status === "ready" ? "Canlı API" : "Canlı API sorgulanıyor"}
              </StatusPill>
              {liveMismatch && <span className="ui-muted ui-text-xs">Canlı yanıt kayıtlı değerlerden farklı; sayfayı yenileyin.</span>}
            </div>
            {live.status === "loading" && <div className="stg-live-grid"><Skeleton height={34} /><Skeleton height={34} /><Skeleton height={34} /></div>}
            {live.status === "error" && (
              <button type="button" className="ui-btn ui-btn--sm" onClick={fetchLive}>Tekrar dene</button>
            )}
            {live.status === "ready" && live.data && (
              <dl className="stg-live-grid">
                <div><dt>Son sürüm</dt><dd className="ui-mono">{live.data.latest_version}</dd></div>
                <div><dt>Minimum sürüm</dt><dd className="ui-mono">{live.data.minimum_version}</dd></div>
                <div><dt>Zorunlu güncelleme</dt><dd>{live.data.force_update ? "Açık" : "Kapalı"}</dd></div>
              </dl>
            )}
          </div>

          <div className="stg-grid-2">
            <Field path="appVersion.latestVersion" label="Son sürüm" hint="Mağazada yayında olan en yeni sürüm.">
              <Input path="appVersion.latestVersion" className="ui-mono" placeholder="4.1.0" inputMode="decimal" autoComplete="off" aria-label="Son sürüm" />
            </Field>
            <Field path="appVersion.minimumVersion" label="Minimum sürüm" hint="Bu sürümün altı, zorunlu güncelleme açıksa engellenir.">
              <Input path="appVersion.minimumVersion" className="ui-mono" placeholder="4.0.0" inputMode="decimal" autoComplete="off" aria-label="Minimum sürüm" />
            </Field>
          </div>

          <div className="stg-field" data-changed={form.changed.has("appVersion.forceUpdate")}>
            <Row
              danger={appVersion.forceUpdate}
              title={<><AlertTriangle className="stg-row-icon" />Zorunlu güncelleme</>}
              description="Açıkken minimum sürümün altındaki uygulamalar güncelleme ekranında kalır ve kullanılamaz."
            >
              <Switch checked={appVersion.forceUpdate} onChange={toggleForce} tone={appVersion.forceUpdate ? "warn" : undefined} label="Zorunlu güncellemeyi aç/kapat" />
            </Row>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <SectionHead icon={ExternalLink} title="Mağaza bağlantıları" description="Güncelleme ekranındaki düğmeler müşteriyi bu adreslere götürür." />
        <div className="ui-panel-body stg-grid-2">
          {[
            ["androidStoreUrl", "Google Play"],
            ["iosStoreUrl", "App Store"],
          ].map(([key, label]) => (
            <Field key={key} path={`appVersion.${key}`} label={label}>
              <div className="stg-url">
                <Input path={`appVersion.${key}`} type="url" className="ui-field--sm" placeholder="https://" spellCheck={false} aria-label={`${label} bağlantısı`} />
                <a className="ui-btn ui-btn--sm" href={appVersion[key] || "#"} target="_blank" rel="noopener noreferrer" aria-label={`${label} sayfasını aç`} aria-disabled={!appVersion[key]}>
                  <ExternalLink />Aç
                </a>
              </div>
            </Field>
          ))}
        </div>
      </section>
    </div>
  );
}
