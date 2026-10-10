import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, RefreshCw, RotateCcw, Send, Smartphone, Sparkles, Stethoscope, Users } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";

const TITLE_LIMIT = 60;
const BODY_LIMIT = 180;
const TARGETS = [
  { id: "home", label: "Ana sayfa" },
  { id: "cart", label: "Sepet" },
  { id: "orders", label: "Siparişlerim" },
  { id: "referral", label: "Davet sayfası" },
  { id: "rate", label: "Mağazada puan ver" },
];
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
      const options = Array.isArray(data.options) && data.options.length ? data.options : [{ title: data.title, body: data.body }];
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

  return (
    <div className="ui-page">
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
        <form className="ui-panel" onSubmit={send}>
          <div className="ui-panel-head">
            <h2>Yeni bildirim</h2>
          </div>
          <div className="ui-panel-body ui-stack">
            <div>
              <span className="ui-label">Hazır metinler</span>
              <div className="push-templates">
                {TEMPLATES.map((template) => (
                  <button type="button" key={template.id} className="push-template" onClick={() => applyTemplate(template)}>
                    {template.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="push-ai-draft">
              <label className="ui-label" htmlFor="push-ai-prompt">Yapay zekâya kampanyayı anlatın</label>
              <textarea id="push-ai-prompt" className="ui-field" rows={2} maxLength={600} value={aiPrompt}
                placeholder="Örn. Bugün makarna ve salçada indirim var; bunu yurtta kalanlara sıcak ve merak uyandıran bir dille duyur."
                onChange={(event) => { setAiPrompt(event.target.value); setAiError(""); }} />
              <div className="ui-between">
                <span className="ui-hint" style={{ marginTop: 0 }}>İndirim, tarih ve şart gibi bilgileri yazın; yapay zekâ bunları uydurmaz. Oluşan metni düzenleyebilirsiniz.</span>
                <button type="button" className="ui-btn ui-btn--primary" onClick={generateDraft} disabled={generating || aiPrompt.trim().length < 3}>
                  <Sparkles />{generating ? "Yazıyor…" : "Bildirim metni yaz"}
                </button>
              </div>
              {aiError && <p className="ui-hint" role="alert" style={{ color: "var(--ui-danger, #b42318)" }}>{aiError}</p>}
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
                  <span className="ui-hint" style={{ marginTop: 0 }}>Beğenmediyseniz &quot;Bildirim metni yaz&quot; ile yeniden üretebilir ya da aşağıda düzenleyebilirsiniz.</span>
                </div>
              )}
            </div>
            <div>
              <div className="ui-between">
                <label className="ui-label" htmlFor="push-title">Başlık</label>
                <span className="ui-text-xs ui-muted ui-num">{form.title.length}/{TITLE_LIMIT}</span>
              </div>
              <input id="push-title" className="ui-field" maxLength={TITLE_LIMIT} value={form.title} placeholder="Haftanın fırsatları başladı"
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
            </div>
            <div>
              <div className="ui-between">
                <label className="ui-label" htmlFor="push-body">Mesaj</label>
                <span className="ui-text-xs ui-muted ui-num">{form.body.length}/{BODY_LIMIT}</span>
              </div>
              <textarea id="push-body" className="ui-field" rows={3} maxLength={BODY_LIMIT} value={form.body} placeholder="Seçili ürünlerde bu haftaya özel fiyatlar sizi bekliyor."
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} required />
            </div>
            <div>
              <span className="ui-label">Kime gönderilsin?</span>
              <div className="push-options">
                {overview.audiences.map((item) => (
                  <button type="button" key={item.id} className="ui-option" aria-pressed={form.audience === item.id}
                    onClick={() => setForm((current) => ({ ...current, audience: item.id }))}>
                    <Users />
                    <span className="ui-grow">{item.label}</span>
                    <span className="ui-num ui-muted">{item.reachable}</span>
                  </button>
                ))}
                {!loading && !overview.audiences.length && <p className="ui-hint">Hedef kitle bilgisi alınamadı.</p>}
              </div>
              {audience && (
                <p className="ui-hint">
                  Bu gruptaki {audience.total} müşteriden {audience.reachable} tanesi kampanya bildirimlerine izin veriyor.
                  Uygulamayı yüklememiş veya bildirim izni vermemiş müşterilere ulaşmaz.
                </p>
              )}
            </div>
            <div>
              <span className="ui-label">Dokununca açılacak ekran</span>
              <div className="ui-segmented">
                {TARGETS.map((target) => (
                  <button type="button" key={target.id} aria-pressed={form.target === target.id}
                    onClick={() => setForm((current) => ({ ...current, target: target.id }))}>
                    {target.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ui-between push-actions">
              <span className="ui-hint" style={{ marginTop: 0 }}>Önce kendinize gönderip telefonunuzda nasıl göründüğüne bakabilirsiniz. Aynı bildirim 10 dakika içinde ikinci kez gönderilemez.</span>
              <div className="ui-cluster">
                <button type="button" className="ui-btn" disabled={!canTest} onClick={sendTest}>
                  <FlaskConical />
                  {testing ? "Gönderiliyor…" : "Önce kendime gönder"}
                </button>
                <button type="submit" className="ui-btn ui-btn--primary" disabled={!canSend}>
                  <Send />
                  {sending ? "Gönderiliyor…" : audience?.reachable ? `${audience.reachable} kişiye gönder` : "Gönder"}
                </button>
              </div>
            </div>
          </div>
        </form>

        <div className="ui-stack">
          <section className="ui-panel" aria-label="Önizleme">
            <div className="ui-panel-head">
              <h2>Önizleme</h2>
            </div>
            <div className="ui-panel-body">
              <div className="push-phone" aria-label="Telefonda görünüm">
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
                <span className="push-phone-target">Dokununca: {TARGETS.find((target) => target.id === form.target)?.label}</span>
              </div>
            </div>
          </section>

          <section className="ui-panel" aria-label="Kurulum denetimi">
            <div className="ui-panel-head">
              <h2>Kurulum denetimi</h2>
            </div>
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
          </section>

          <section className="ui-panel" aria-label="Gönderim geçmişi">
            <div className="ui-panel-head">
              <h2>Son gönderimler</h2>
            </div>
            {overview.history.length ? overview.history.map((item) => (
              <article key={item._id} className="ui-list-row">
                <div className="ui-grow">
                  <div className="ui-cluster">
                    <h3 className="ui-list-title ui-wrap-anywhere">{item.title}</h3>
                    <span className={`ui-badge ${item.sent ? "ui-badge--ok" : "ui-badge--danger"}`}>{item.sent ? "Gönderildi" : FAILURE_LABELS[item.failureReason] || "Başarısız"}</span>
                    {item.audience === TEST_AUDIENCE && <span className="ui-badge ui-badge--info">Deneme</span>}
                  </div>
                  <p className="ui-text-sm ui-wrap-anywhere">{item.body}</p>
                  <p className="ui-hint">{audienceLabel(item.audience)} · {item.targetedCount || 0} kişi{item.unreachableCount ? ` (${item.unreachableCount} kişinin kayıtlı cihazı yok)` : ""} · {formatDate(item.createdAt)}{item.sentBy?.name ? ` · ${item.sentBy.name}` : ""}</p>
                </div>
                <button type="button" className="ui-btn ui-btn--sm" title="Bu metni forma geri yükle"
                  onClick={() => { setForm((current) => ({ ...current, title: item.title, body: item.body })); setFailure(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <RotateCcw /> Tekrar kullan
                </button>
              </article>
            )) : <div className="ui-empty">{loading ? "Yükleniyor…" : "Henüz toplu bildirim gönderilmedi."}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
