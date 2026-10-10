import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, FlaskConical, Gift, Home, Package, RefreshCw, Repeat, RotateCcw, Send, ShoppingCart, Smartphone, Sparkles, Star, Stethoscope, UserPlus, Users, } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";

const TITLE_LIMIT = 60;
const BODY_LIMIT = 180;
const TARGETS = [
  { id: "home", label: "Ana sayfa", icon: Home },
  { id: "cart", label: "Sepet", icon: ShoppingCart },
  { id: "orders", label: "Siparişlerim", icon: Package },
  { id: "referral", label: "Davet sayfası", icon: Gift },
  { id: "rate", label: "Mağazada puan ver", icon: Star },
];
const AUDIENCE_ICONS = { all: Users, cart: ShoppingCart, active30: Repeat, inactive30: Clock, noOrder: UserPlus };
// Yapay zekâ kutusuna tek dokunuşla yazılan fikir başlangıçları; yönetici düzenleyebilir.
const IDEAS = [
  { label: "☕ Sabah kahvaltısı", prompt: "Yurtta sabah kahvaltısı için güne güzel başlatan, günaydın temalı bir bildirim yaz." },
  { label: "🌙 Gece atıştırmalığı", prompt: "Gece ders çalışan öğrencilere atıştırmalık ve içecek hatırlatan sıcak bir bildirim yaz." },
  { label: "📚 Sınav haftası", prompt: "Sınav haftasında ders çalışanlara moral veren, kahve ve atıştırmalık hatırlatan bir bildirim yaz." },
  { label: "🎉 Hafta sonu", prompt: "Hafta sonu yurtta kalanlara arkadaşlarla paylaşılacak atıştırmalıkları hatırlatan eğlenceli bir bildirim yaz." },
  { label: "🌧️ Yağmurlu gün", prompt: "Yağmurlu havada dışarı çıkmadan siparişin kapıya geldiğini hatırlatan samimi bir bildirim yaz." },
  { label: "🛒 Sepet hatırlatma", prompt: "Sepetinde ürün bırakanlara siparişini tamamlamayı nazikçe hatırlatan bir bildirim yaz." },
];
// Başlık veya mesaja imlecin olduğu yere eklenen emojiler
const EMOJIS = ["🛒", "🔥", "🎁", "🎉", "⏰", "☕", "🥐", "🍕", "🍫", "🥤", "🌙", "📚", "⭐", "💚"];
// Tek dokunuşla forma dolan hazır metinler; gönderilmeden önce düzenlenebilir.
const TEMPLATES = [
  { id: "deals", label: "Haftanın fırsatları", title: "Haftanın fırsatları başladı 🛒", body: "Seçili ürünlerde bu haftaya özel fiyatlar seni bekliyor. Kaçırmadan göz at!", target: "home" },
  { id: "cart", label: "Sepet hatırlatma", title: "Sepetin seni bekliyor", body: "Seçtiğin ürünler hâlâ sepetinde. Siparişini birkaç dokunuşla tamamlayabilirsin.", target: "cart" },
  { id: "community", label: "Topluluk indirimi", title: "Topluluk indirimi açıldı 🎉", body: "Katıl, hedef dolunca indirim kuponun cüzdanına gelsin. Katılım sepet ekranında.", target: "cart" },
  { id: "mission", label: "Sipariş görevi", title: "Yeni görev: kupon kazan 🔥", body: "Görevi tamamla, indirim kuponunu kap. Ayrıntılar ana sayfada.", target: "home" },
  { id: "referral", label: "Arkadaşını davet et", title: "Arkadaşını davet et, kazan", body: "Davet kodunu paylaş; arkadaşın ilk siparişini verince ikiniz de kazanın.", target: "referral" },
  { id: "rate", label: "Puan iste", title: "Bizi değerlendirir misin? ⭐", body: "Uygulamamızı beğendiysen mağazada puan vermen bize çok yardımcı olur.", target: "rate" },
];
const TEST_AUDIENCE = "self";
const FAILURE_LABELS = {
  no_devices: "Kayıtlı cihaz yok",
  auth: "Anahtar reddedildi",
  rejected: "OneSignal reddetti",
  network: "Bağlantı hatası",
  not_configured: "Yapılandırılmamış",
};
const formatDate = (value) => new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const Counter = ({ value, limit }) => {
  const ratio = value / limit;
  return (
    <span className="push-counter" data-state={ratio >= 1 ? "full" : ratio >= 0.85 ? "near" : "ok"}>
      <span className="push-counter-bar"><span style={{ width: `${Math.min(100, ratio * 100)}%` }} /></span>
      <span className="ui-num">{value}/{limit}</span>
    </span>
  );
};

export default function PushBroadcastTab() {
  const { confirm } = useConfirm();
  const [overview, setOverview] = useState({ configured: true, audiences: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  // Son gönderim denemesinin hatası; bildirim balonu kaybolsa da ekranda kalır
  const [failure, setFailure] = useState("");
  // Kurulum denetimi: bir hesabın bildirim alıp alamadığı ve alamıyorsa nedeni
  const [checking, setChecking] = useState(false);
  const [checkEmail, setCheckEmail] = useState("");
  const [diagnosis, setDiagnosis] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", target: "home" });
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  // Yapay zekânın farklı tonlardaki önerileri; birine dokununca forma dolar
  const [aiOptions, setAiOptions] = useState([]);
  // Emoji eklemek için son odaklanan alan ve imleç konumu
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef("title");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/notifications/broadcasts");
      setOverview({ configured: data.configured !== false, audiences: data.audiences || [], history: data.history || [] });
    } catch {
      toast.error("Bildirim bilgileri alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const audience = useMemo(() => overview.audiences.find((item) => item.id === form.audience), [overview.audiences, form.audience]);
  const audienceLabel = (id) => (id === TEST_AUDIENCE ? "Deneme (yalnızca ben)" : overview.audiences.find((item) => item.id === id)?.label || id);
  const everyone = overview.audiences.find((item) => item.id === "all");
  const lastSend = overview.history.find((item) => item.audience !== TEST_AUDIENCE);
  const title = form.title.trim();
  const body = form.body.trim();
  const busy = sending || testing;
  const canSend = overview.configured && !busy && title && body && (audience?.reachable || 0) > 0;
  const canTest = overview.configured && !busy && title && body;

  const runDiagnosis = async (event) => {
    event?.preventDefault();
    if (checking) return;
    try {
      setChecking(true);
      const email = checkEmail.trim();
      const { data } = await axios.get("/notifications/broadcasts/diagnose", { params: email ? { email } : {} });
      setDiagnosis(data);
    } catch (error) {
      setDiagnosis({ ready: false, title: "Denetim yapılamadı", steps: [error.response?.data?.message || "Sunucuya ulaşılamadı. Lütfen tekrar deneyin."], devices: [], account: null });
    } finally {
      setChecking(false);
    }
  };

  const insertEmoji = (emoji) => {
    const field = lastField.current;
    const element = field === "body" ? bodyRef.current : titleRef.current;
    const limit = field === "body" ? BODY_LIMIT : TITLE_LIMIT;
    const value = form[field];
    if (value.length + emoji.length > limit) {
      toast.error(`${field === "body" ? "Mesaj" : "Başlık"} karakter sınırına ulaştı`);
      return;
    }
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setForm((current) => ({ ...current, [field]: next }));
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const applyTemplate = (template) => {
    setForm((current) => ({ ...current, title: template.title, body: template.body, target: template.target }));
    setFailure("");
  };

  const generateDraft = async (event) => {
    event.preventDefault();
    if (generating || aiPrompt.trim().length < 3) return;
    try {
      setGenerating(true);
      setAiError("");
      const { data } = await axios.post("/notifications/broadcasts/draft", { prompt: aiPrompt.trim(), target: form.target });
      const options = (Array.isArray(data.options) && data.options.length ? data.options : [{ title: data.title, body: data.body }])
        .filter((option) => typeof option?.title === "string" && typeof option?.body === "string");
      if (!options.length) throw new Error("empty-draft");
      setAiOptions(options);
      setForm((current) => ({ ...current, title: options[0].title, body: options[0].body }));
      setFailure("");
      toast.success(options.length > 1 ? `${options.length} öneri hazır; birini seçip gözden geçirin.` : "Bildirim taslağı hazır; göndermeden önce gözden geçirin.");
    } catch (error) {
      setAiError(error.response?.data?.message || "Yapay zekâ metin oluşturamadı. Tekrar deneyin.");
    } finally {
      setGenerating(false);
    }
  };

  // Bildirimi herkese göndermeden önce yalnızca kendi telefonunda dene
  const sendTest = async () => {
    if (!canTest) return;
    try {
      setTesting(true);
      setFailure("");
      const { data } = await axios.post("/notifications/broadcasts", { ...form, title, body, audience: TEST_AUDIENCE });
      toast.success(data.message || "Deneme bildirimi gönderildi");
      await load();
    } catch (error) {
      const message = error.response?.data?.message || "Deneme bildirimi gönderilemedi";
      setFailure(message);
      toast.error("Deneme bildirimi gönderilemedi");
      await load();
    } finally {
      setTesting(false);
    }
  };

  const send = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    const confirmed = await confirm({
      title: "Bildirimi gönder",
      message: `"${title}" bildirimi ${audience.reachable} müşterinin telefonuna gönderilecek. Gönderilen bildirim geri alınamaz.`,
      confirmText: `${audience.reachable} kişiye gönder`,
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!confirmed) return;
    try {
      setSending(true);
      setFailure("");
      const { data } = await axios.post("/notifications/broadcasts", { ...form, title, body });
      toast.success(data.message || "Bildirim gönderildi");
      setForm((current) => ({ ...current, title: "", body: "" }));
      await load();
    } catch (error) {
      const message = error.response?.data?.message || "Bildirim gönderilemedi";
      setFailure(message);
      toast.error("Bildirim gönderilemedi");
      await load();
    } finally {
      setSending(false);
    }
  };

  const targetLabel = TARGETS.find((target) => target.id === form.target)?.label;

  return (
    <div className="ui-page push-page">
      <header className="app-pagehead">
        <div>
          <h1>Bildirim gönder</h1>
          <p>Müşterilerinizin telefonuna kampanya ve duyuru bildirimi gönderin.</p>
        </div>
        <button onClick={load} className="ui-btn" aria-label="Yenile">
          <RefreshCw className={loading ? "ui-spin" : ""} />
          Yenile
        </button>
      </header>

      {!overview.configured && (
        <div className="ui-banner ui-banner--warn" role="status">
          Bildirim servisi yapılandırılmamış. Sunucu ayarlarına OneSignal anahtarları eklenene kadar gönderim yapılamaz.
        </div>
      )}

      {failure && (
        <div className="ui-banner ui-banner--danger push-failure" role="alert">
          <AlertTriangle />
          <div className="ui-grow">
            <strong>Bildirim gönderilemedi</strong>
            <p>{failure}</p>
          </div>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setFailure("")}>Kapat</button>
        </div>
      )}

      <div className="ui-stats">
        <div className="ui-stat">
          <span className="ui-stat-label">Müşteri</span>
          <span className="ui-stat-value ui-num">{everyone ? everyone.total : "–"}</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Kampanya bildirimine izinli</span>
          <span className="ui-stat-value ui-num">{everyone ? everyone.reachable : "–"}</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Son gönderim</span>
          <span className="ui-stat-value push-stat-text">{lastSend ? formatDate(lastSend.createdAt) : "Henüz yok"}</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Son gönderimin durumu</span>
          <span className="ui-stat-value push-stat-text">{lastSend ? (lastSend.sent ? `${lastSend.targetedCount || 0} kişiye gitti` : FAILURE_LABELS[lastSend.failureReason] || "Başarısız") : "–"}</span>
        </div>
      </div>

      <div className="push-layout">
        <form id="push-form" className="push-compose" onSubmit={send}>
          {/* 1. Yapay zekâ ile yaz */}
          <section className="push-ai" aria-labelledby="push-ai-title">
            <div className="push-ai-head">
              <span className="push-ai-badge"><Sparkles /></span>
              <div>
                <h2 id="push-ai-title">Yapay zekâ ile yaz</h2>
                <p>Ne duyurmak istediğinizi anlatın; emojili, farklı tonlarda 3 öneri hazırlasın.</p>
              </div>
            </div>
            <div className="push-ideas" aria-label="Fikir başlangıçları">
              {IDEAS.map((idea) => (
                <button type="button" key={idea.label} className="push-idea" onClick={() => { setAiPrompt(idea.prompt); setAiError(""); }}>
                  {idea.label}
                </button>
              ))}
            </div>
            <div className="push-ai-input">
              <textarea id="push-ai-prompt" className="ui-field" rows={2} maxLength={600} value={aiPrompt} aria-label="Yapay zekâya kampanyayı anlatın"
                placeholder="Örn. Bugün makarna ve salçada indirim var; yurtta kalanlara sıcak ve merak uyandıran bir dille duyur."
                onChange={(event) => { setAiPrompt(event.target.value); setAiError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) generateDraft(event); }} />
              <button type="button" className="ui-btn ui-btn--primary push-ai-go" onClick={generateDraft} disabled={generating || aiPrompt.trim().length < 3}>
                <Sparkles className={generating ? "ui-spin" : ""} />{generating ? "Yazıyor…" : aiOptions.length ? "Yeniden yaz" : "Öneri al"}
              </button>
            </div>
            <span className="push-ai-note">İndirim, tarih, saat gibi bilgileri siz yazın; yapay zekâ bunları uydurmaz.</span>
            {aiError && <p className="push-ai-error" role="alert">{aiError}</p>}
            {aiOptions.length > 0 && (
              <div className="push-ai-options" role="radiogroup" aria-label="Yapay zekâ önerileri">
                {aiOptions.map((option, index) => {
                  const selected = form.title === option.title && form.body === option.body;
                  return (
                    <button type="button" key={`${index}-${option.title}`} role="radio" aria-checked={selected}
                      className="push-ai-option" data-selected={selected}
                      onClick={() => { setForm((current) => ({ ...current, title: option.title, body: option.body })); setFailure(""); }}>
                      <span className="push-ai-option-tone">{option.tone || `Öneri ${index + 1}`}{selected && <CheckCircle2 aria-hidden="true" />}</span>
                      <strong>{option.title}</strong>
                      <span>{option.body}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 2. Metin */}
          <section className="ui-panel" aria-labelledby="push-text-title">
            <div className="ui-panel-head push-step-head">
              <span className="push-step">1</span>
              <h2 id="push-text-title">Bildirim metni</h2>
            </div>
            <div className="ui-panel-body ui-stack">
              <div className="push-templates" aria-label="Hazır metinler">
                <span className="push-templates-label">Hazır:</span>
                {TEMPLATES.map((template) => (
                  <button type="button" key={template.id} className="push-template" onClick={() => applyTemplate(template)}>
                    {template.label}
                  </button>
                ))}
              </div>
              <div>
                <div className="ui-between">
                  <label className="ui-label" htmlFor="push-title">Başlık</label>
                  <Counter value={form.title.length} limit={TITLE_LIMIT} />
                </div>
                <input id="push-title" ref={titleRef} className="ui-field push-title-field" maxLength={TITLE_LIMIT} value={form.title} placeholder="Haftanın fırsatları başladı 🛒"
                  onFocus={() => { lastField.current = "title"; }}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
              </div>
              <div>
                <div className="ui-between">
                  <label className="ui-label" htmlFor="push-body">Mesaj</label>
                  <Counter value={form.body.length} limit={BODY_LIMIT} />
                </div>
                <textarea id="push-body" ref={bodyRef} className="ui-field" rows={3} maxLength={BODY_LIMIT} value={form.body} placeholder="Seçili ürünlerde bu haftaya özel fiyatlar seni bekliyor."
                  onFocus={() => { lastField.current = "body"; }}
                  onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} required />
              </div>
              <div className="push-emojis" aria-label="Emoji ekle">
                {EMOJIS.map((emoji) => (
                  <button type="button" key={emoji} className="push-emoji" title="İmlecin olduğu yere ekle"
                    onMouseDown={(event) => event.preventDefault()} onClick={() => insertEmoji(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 3. Kitle ve ekran */}
          <section className="ui-panel" aria-labelledby="push-audience-title">
            <div className="ui-panel-head push-step-head">
              <span className="push-step">2</span>
              <h2 id="push-audience-title">Kime gönderilsin?</h2>
            </div>
            <div className="ui-panel-body ui-stack">
              <div className="push-audiences">
                {overview.audiences.map((item) => {
                  const Icon = AUDIENCE_ICONS[item.id] || Users;
                  const share = item.total ? Math.round((item.reachable / item.total) * 100) : 0;
                  return (
                    <button type="button" key={item.id} className="push-audience" aria-pressed={form.audience === item.id}
                      onClick={() => setForm((current) => ({ ...current, audience: item.id }))}>
                      <span className="push-audience-icon"><Icon /></span>
                      <span className="push-audience-text">
                        <span className="push-audience-label">{item.label}</span>
                        <span className="push-audience-meta"><strong className="ui-num">{item.reachable}</strong> kişiye ulaşır · {item.total} müşteri</span>
                        <span className="push-audience-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                      </span>
                    </button>
                  );
                })}
                {!loading && !overview.audiences.length && <p className="ui-hint">Hedef kitle bilgisi alınamadı.</p>}
              </div>
              {audience && (
                <p className="ui-hint" style={{ marginTop: 0 }}>
                  Bu gruptaki {audience.total} müşteriden {audience.reachable} tanesi kampanya bildirimlerine izin veriyor.
                  Uygulamayı yüklememiş veya bildirim izni vermemiş müşterilere ulaşmaz.
                </p>
              )}
            </div>
            <div className="ui-panel-head push-step-head push-step-head--inner">
              <span className="push-step">3</span>
              <h2>Dokununca açılacak ekran</h2>
            </div>
            <div className="ui-panel-body">
              <div className="push-targets">
                {TARGETS.map((target) => {
                  const Icon = target.icon;
                  return (
                    <button type="button" key={target.id} className="push-target" aria-pressed={form.target === target.id}
                      onClick={() => setForm((current) => ({ ...current, target: target.id }))}>
                      <Icon />{target.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </form>

        <aside className="push-side">
          <section className="ui-panel push-sendcard" aria-label="Önizleme ve gönderim">
            <div className="push-phone" aria-label="Telefonda görünüm">
              <div className="push-phone-notch" aria-hidden="true" />
              <div className="push-phone-clock">
                <span>{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</span>
                <strong>{new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</strong>
              </div>
              <div className="push-preview">
                <img className="push-preview-icon" src="/favicon.png" alt="" width="36" height="36" />
                <div className="ui-grow">
                  <div className="ui-between">
                    <span className="push-preview-app">Benim Marketim</span>
                    <span className="push-preview-time">şimdi</span>
                  </div>
                  <strong className="ui-wrap-anywhere">{title || "Bildirim başlığı"}</strong>
                  <p className="ui-wrap-anywhere">{body || "Mesajınız burada görünecek."}</p>
                </div>
              </div>
            </div>
            <dl className="push-summary">
              <div><dt>Kime</dt><dd>{audience ? audience.label : "–"}</dd></div>
              <div><dt>Ulaşacak</dt><dd className="ui-num">{audience ? `${audience.reachable} kişi` : "–"}</dd></div>
              <div><dt>Açılacak ekran</dt><dd>{targetLabel}</dd></div>
            </dl>
            <div className="push-send-actions">
              <button type="submit" form="push-form" className="ui-btn ui-btn--primary push-send" disabled={!canSend}>
                <Send />
                {sending ? "Gönderiliyor…" : audience?.reachable ? `${audience.reachable} kişiye gönder` : "Gönder"}
              </button>
              <button type="button" className="ui-btn push-test" disabled={!canTest} onClick={sendTest}>
                <FlaskConical />
                {testing ? "Gönderiliyor…" : "Önce kendime gönder"}
              </button>
              <p className="push-send-note">Aynı bildirim 10 dakika içinde ikinci kez gönderilemez.</p>
            </div>
          </section>

          <section className="ui-panel" aria-label="Gönderim geçmişi">
            <div className="ui-panel-head">
              <h2>Son gönderimler</h2>
            </div>
            {overview.history.length ? (
              <ol className="push-history">
                {overview.history.map((item) => (
                  <li key={item._id} className="push-history-item" data-state={item.sent ? "ok" : "bad"}>
                    <div className="ui-grow">
                      <div className="push-history-top">
                        <h3 className="ui-wrap-anywhere">{item.title}</h3>
                        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost push-reuse" title="Bu metni forma geri yükle" aria-label={`“${item.title}” metnini tekrar kullan`}
                          onClick={() => { setForm((current) => ({ ...current, title: item.title, body: item.body })); setFailure(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                          <RotateCcw />
                        </button>
                      </div>
                      <p className="ui-wrap-anywhere">{item.body}</p>
                      <div className="push-history-meta">
                        <span className={`ui-badge ${item.sent ? "ui-badge--ok" : "ui-badge--danger"}`}>{item.sent ? "Gönderildi" : FAILURE_LABELS[item.failureReason] || "Başarısız"}</span>
                        {item.audience === TEST_AUDIENCE && <span className="ui-badge ui-badge--info">Deneme</span>}
                        <span>{audienceLabel(item.audience)} · {item.targetedCount || 0} kişi{item.unreachableCount ? ` (${item.unreachableCount} kişinin kayıtlı cihazı yok)` : ""}</span>
                        <span>{formatDate(item.createdAt)}{item.sentBy?.name ? ` · ${item.sentBy.name}` : ""}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <div className="ui-empty">{loading ? "Yükleniyor…" : "Henüz toplu bildirim gönderilmedi."}</div>}
          </section>

          <details className="ui-panel push-check-panel">
            <summary className="ui-panel-head">
              <Stethoscope />
              <h2>Kurulum denetimi</h2>
              <ChevronDown className="push-check-chevron" aria-hidden="true" />
            </summary>
            <div className="ui-panel-body ui-stack">
              <p className="ui-hint" style={{ marginTop: 0 }}>
                Bir hesabın telefonuna bildirim gidip gitmeyeceğini, gitmiyorsa nedenini gösterir. Boş bırakırsanız kendi hesabınız denetlenir. Bildirim gönderilmez.
              </p>
              <form className="push-check-form" onSubmit={runDiagnosis}>
                <input className="ui-field" type="email" value={checkEmail} placeholder="Müşteri e-postası (isteğe bağlı)" aria-label="Denetlenecek hesabın e-postası"
                  onChange={(event) => setCheckEmail(event.target.value)} />
                <button type="submit" className="ui-btn" disabled={checking}>
                  <Stethoscope />
                  {checking ? "Denetleniyor…" : "Denetle"}
                </button>
              </form>
              {diagnosis && (
                <div className={`push-check ${diagnosis.ready ? "push-check--ok" : "push-check--bad"}`} role="status">
                  <div className="push-check-head">
                    {diagnosis.ready ? <CheckCircle2 /> : <AlertTriangle />}
                    <div>
                      <strong>{diagnosis.title}</strong>
                      {diagnosis.account?.email && <span>{diagnosis.account.name ? `${diagnosis.account.name} · ` : ""}{diagnosis.account.email}</span>}
                    </div>
                  </div>
                  {diagnosis.steps?.length > 0 && (
                    <ul>
                      {diagnosis.steps.map((step) => <li key={step}>{step}</li>)}
                    </ul>
                  )}
                  {diagnosis.devices?.map((device, index) => (
                    <div className="push-check-device" key={`${device.platform}-${index}`}>
                      <Smartphone />
                      <span className="ui-grow">{device.platform}{device.model ? ` · ${device.model}` : ""}{device.appVersion ? ` · sürüm ${device.appVersion}` : ""}</span>
                      <span className={`ui-badge ${device.enabled ? "ui-badge--ok" : "ui-badge--danger"}`}>{device.enabled ? "Bildirim açık" : device.hasToken ? "İzin kapalı" : "Adres alınamamış"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
