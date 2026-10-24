// Yapay zekâ bölümü: asistan açık/kapalı, sağlayıcı, model ve sohbet geçmişi sınırı.
// API anahtarları sunucudaki ortam değişkenlerinden okunur; burada gösterilmez.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, BrainCircuit, Lock, RefreshCw } from "lucide-react";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import { Field, Input, Row, SectionHead, StatusPill, Switch, useSettingsForm } from "./fields";
import { AI_PROVIDERS } from "./settingsModel";

const formatContext = (tokens) => (tokens >= 1000 ? `${Math.round(tokens / 1000)}K bağlam` : tokens ? `${tokens} bağlam` : "");
const describeModel = (m) => [m.free ? "ücretsiz" : "ücretli", m.tools ? "araç desteği" : "", formatContext(m.context)].filter(Boolean).join(" · ");
const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "");

// OpenRouter'daki canlı model listesi (sunucu 6 saat önbelleğe alır). Liste alınamazsa boş döner.
const useLiveModels = (provider) => {
  const [state, setState] = useState({ status: "idle", models: [], fetchedAt: null });
  const load = useCallback(async (refresh = false) => {
    if (provider !== "openrouter") {
      setState({ status: "idle", models: [], fetchedAt: null });
      return;
    }
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const { data } = await axios.get("/settings/ai-models", { params: { provider, ...(refresh ? { refresh: 1 } : {}) } });
      const models = Array.isArray(data?.models) ? data.models : [];
      setState({ status: models.length ? "ready" : "empty", models, fetchedAt: data?.fetchedAt || null });
    } catch {
      setState({ status: "error", models: [], fetchedAt: null });
    }
  }, [provider]);
  useEffect(() => { load(); }, [load]);
  return [state, load];
};

export default function AiSection() {
  const form = useSettingsForm();
  const { confirm } = useConfirm();
  const { ai } = form.draft;
  const provider = AI_PROVIDERS.find((p) => p.value === ai.provider) || AI_PROVIDERS[0];
  const [live, reloadLive] = useLiveModels(provider.value);
  const hasLive = live.models.length > 0;
  const modelId = String(ai.model || "").trim();
  const current = hasLive ? live.models.find((m) => m.id === modelId) : null;
  const suggestions = live.models.filter((m) => m.free && m.tools && m.id !== modelId).slice(0, 4);
  const freeCount = live.models.filter((m) => m.free).length;

  const toggleAi = async (next) => {
    if (!next) {
      const ok = await confirm({
        title: "Asistanı kapat",
        message: "Müşteri sohbetinde yapay zekâ yanıt vermez; mesajlar yalnızca size düşer. Kaydet'e basınca geçerli olur.",
        confirmText: "Asistanı kapat",
        cancelText: "Vazgeç",
        type: "warning",
      });
      if (!ok) return;
    }
    form.update("ai.enabled", next);
  };

  return (
    <div className="stg-section">
      <section className="ui-panel">
        <SectionHead
          icon={Bot}
          title="Yapay zekâ asistanı"
          description="Müşteri sohbetinde ürün, sipariş ve mağaza sorularını yanıtlayan asistan."
          aside={<StatusPill tone={ai.enabled ? "ok" : "muted"}>{ai.enabled ? "Açık" : "Kapalı"}</StatusPill>}
        />
        <div className="ui-panel-body stg-stack">
          <div className="stg-hero stg-hero--soft" data-on={ai.enabled} data-changed={form.changed.has("ai.enabled")}>
            <span className="stg-hero-icon"><Bot /></span>
            <div className="stg-hero-text">
              <strong>{ai.enabled ? "Asistan yanıt veriyor" : "Asistan kapalı"}</strong>
              <span>{ai.enabled ? `${provider.label} üzerinden ${ai.model || "—"} modeli kullanılıyor.` : "Sohbetler doğrudan yönetici paneline düşer."}</span>
            </div>
            <Switch size="lg" tone={ai.enabled ? "ok" : undefined} checked={ai.enabled} onChange={toggleAi} label="Yapay zekâ asistanını aç/kapat" />
          </div>
        </div>
      </section>

      <section className="ui-panel" data-disabled={!ai.enabled}>
        <SectionHead icon={BrainCircuit} title="Sağlayıcı ve model" description="Model adı, seçilen sağlayıcıda birebir geçerli olmalı; yanlış ad sohbette hata verir." />
        <div className="ui-panel-body stg-stack">
          <Field path="ai.provider" label="Sağlayıcı">
            <div className="stg-providers" role="radiogroup" aria-label="Sağlayıcı">
              {AI_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={ai.provider === p.value}
                  className="stg-provider"
                  onClick={() => form.update("ai.provider", p.value)}
                >
                  <strong>{p.label}</strong>
                  <span>{p.note}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="stg-grid-2">
            <Field
              path="ai.model"
              label="Model"
              wide={hasLive}
              hint={hasLive
                ? `OpenRouter'daki güncel liste: ${live.models.length} model, ${freeCount} ücretsiz${live.fetchedAt ? ` (${formatTime(live.fetchedAt)} itibarıyla)` : ""}. Yazarak arayın; listede olmayan bir kimliği de elle girebilirsiniz.`
                : `${provider.label} için örnekler: ${provider.models.join(", ")}`}
            >
              <div className="stg-model-input">
                <Input path="ai.model" className="ui-mono" list="stg-ai-models" placeholder={hasLive ? "Model ara: gemma, llama, qwen…" : provider.models[0]} spellCheck={false} autoComplete="off" aria-label="Model adı" />
                {provider.value === "openrouter" && (
                  <button
                    type="button"
                    className="ui-icon-btn"
                    onClick={() => reloadLive(true)}
                    disabled={live.status === "loading"}
                    aria-label="OpenRouter model listesini yenile"
                    title="Model listesini yenile"
                  >
                    <RefreshCw className={live.status === "loading" ? "ui-spin" : ""} />
                  </button>
                )}
              </div>
              <datalist id="stg-ai-models">
                {hasLive
                  ? live.models.map((m) => <option key={m.id} value={m.id} label={`${m.name} · ${describeModel(m)}`} />)
                  : provider.models.map((m) => <option key={m} value={m} />)}
              </datalist>
              {current && (
                <div className="stg-model-meta" aria-label="Seçili modelin özellikleri">
                  <span className={`ui-badge ${current.free ? "ui-badge--ok" : ""}`}>{current.free ? "ücretsiz" : "ücretli"}</span>
                  {current.tools
                    ? <span className="ui-badge ui-badge--info">araç desteği</span>
                    : <span className="ui-badge ui-badge--warn">araç desteği yok</span>}
                  {current.context > 0 && <span className="ui-badge">{formatContext(current.context)}</span>}
                </div>
              )}
              {hasLive && modelId && !current && (
                <div className="ui-banner ui-banner--warn stg-banner" role="status">
                  <AlertTriangle />
                  Bu model OpenRouter&apos;ın güncel listesinde yok; istekler &quot;model bulunamadı&quot; (HTTP 404) hatası verebilir. Sunucu bu durumda ücretsiz bir yedek modele geçmeyi dener, ama listeden geçerli bir model seçmeniz önerilir.
                </div>
              )}
              {current && !current.tools && (
                <p className="ui-hint stg-field-hint">Bu model araç çağrısını desteklemiyor; müşteri asistanı canlı ürün ve sipariş bilgisi gerektiren sorularda araç destekli ücretsiz bir modele geçer.</p>
              )}
              {live.status === "error" && (
                <p className="ui-hint stg-field-hint">OpenRouter model listesi alınamadı; model adını elle girebilirsiniz.</p>
              )}
              {suggestions.length > 0 && (
                <div className="stg-model-picks">
                  <span className="ui-hint">Önerilen ücretsiz ve araç destekli modeller:</span>
                  {suggestions.map((m) => (
                    <button key={m.id} type="button" className="ui-btn ui-btn--sm ui-btn--ghost ui-mono" onClick={() => form.update("ai.model", m.id)} title={`${m.name} · ${describeModel(m)}`}>
                      {m.id}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field path="ai.maxHistoryMessages" label="Sohbet geçmişi sınırı" hint="Asistanın her yanıtta hatırladığı önceki mesaj sayısı (2–30). Yüksek değer daha tutarlı ama daha pahalı.">
              <div className="stg-range">
                <input
                  type="range"
                  min="2"
                  max="30"
                  value={ai.maxHistoryMessages}
                  aria-label="Sohbet geçmişi sınırı"
                  onChange={(e) => form.update("ai.maxHistoryMessages", Number(e.target.value))}
                />
                <Input path="ai.maxHistoryMessages" type="number" min="2" max="30" className="stg-range-num" aria-label="Sohbet geçmişi sınırı (sayı)" parse={(v) => (v === "" ? "" : Number(v))} />
              </div>
            </Field>
          </div>
          <Row title="API anahtarları" description="Groq, OpenRouter ve Gemini anahtarları yalnızca sunucudaki .env dosyasından okunur; panelden görüntülenmez ve değiştirilemez.">
            <span className="ui-badge"><Lock />Sunucuda</span>
          </Row>
          <Row title="Bilgi merkezi" description="Asistanın kullandığı sabit bilgiler (iade, teslimat, fotokopi vb.) ayrı bir bölümde yönetilir.">
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "ai-knowledge" }))}>
              Bilgi merkezine git
            </button>
          </Row>
        </div>
      </section>
    </div>
  );
}
