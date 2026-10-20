// Yapay zekâ bölümü: asistan açık/kapalı, sağlayıcı, model ve sohbet geçmişi sınırı.
// API anahtarları sunucudaki ortam değişkenlerinden okunur; burada gösterilmez.
import { Bot, BrainCircuit, Lock } from "lucide-react";
import { useConfirm } from "../ConfirmModal";
import { Field, Input, Row, SectionHead, StatusPill, Switch, useSettingsForm } from "./fields";
import { AI_PROVIDERS } from "./settingsModel";

export default function AiSection() {
  const form = useSettingsForm();
  const { confirm } = useConfirm();
  const { ai } = form.draft;
  const provider = AI_PROVIDERS.find((p) => p.value === ai.provider) || AI_PROVIDERS[0];

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
            <Field path="ai.model" label="Model" hint={`${provider.label} için örnekler: ${provider.models.join(", ")}`}>
              <Input path="ai.model" className="ui-mono" list="stg-ai-models" placeholder={provider.models[0]} spellCheck={false} autoComplete="off" aria-label="Model adı" />
              <datalist id="stg-ai-models">{provider.models.map((m) => <option key={m} value={m} />)}</datalist>
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
