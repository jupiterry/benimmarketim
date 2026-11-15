import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock, FlaskConical, Gift, Home, MapPin, Package, RefreshCw, Repeat, Send, ShoppingCart, Smartphone, Sparkles, Star, Stethoscope, UserPlus, Users, Zap, } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import PushLibrary from "./push/PushLibrary";
import AutomationPanel from "./push/AutomationPanel";
import TestRecipientPicker, { RecipientTag } from "./push/TestRecipientPicker";
import useTestRecipient, { testRecipientName } from "./push/useTestRecipient";
import ScheduleField from "./push/ScheduleField";
import ScheduledList from "./push/ScheduledList";
import BroadcastHistory from "./push/BroadcastHistory";
import {
  BODY_LIMIT, DEFAULT_LIMITS, DEFAULT_ZONES, TEST_AUDIENCE, TITLE_LIMIT, formatWhen, historyState, lastSendHint, resolveWhen, scheduleProblem, sendTimeWarnings, toTrInput,
} from "./push/broadcastShared";
import { Tabs, useDebounced, useNow, usePref } from "./admin/ui";
import "../styles/push-broadcast.css";

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
// Mesajın altındaki "yapay zekâ ile geliştir" düğmeleri (sunucudaki REWRITE_INSTRUCTIONS ile aynı anahtarlar)
const REWRITES = [
  { id: "shorter", label: "✂️ Kısalt" },
  { id: "funnier", label: "😄 Daha esprili" },
  { id: "warmer", label: "💚 Daha samimi" },
  { id: "curious", label: "❓ Merak uyandır" },
  { id: "emoji", label: "✨ Emoji düzenle" },
  { id: "calmer", label: "🧘 Sadeleştir" },
];
// Ekranın iki bölümü: elle gönderilen toplu bildirim ve kurallara göre kendiliğinden giden bildirimler
const SCREEN_TABS = [
  { value: "broadcast", label: "Tek seferlik bildirim", icon: Send },
  { value: "auto", label: "Otomatik bildirimler", icon: Zap },
];
const formatDate = (value) => new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const EMPTY_OVERVIEW = { configured: true, audiences: [], history: [], scheduled: [], zones: DEFAULT_ZONES, limits: DEFAULT_LIMITS, hours: {} };

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
  const [screenTab, setScreenTab] = usePref("admin-push-tab", "broadcast");
  const tab = screenTab === "auto" ? "auto" : "broadcast";
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  // Son gönderim denemesinin hatası; bildirim balonu kaybolsa da ekranda kalır
  const [failure, setFailure] = useState("");
  const [failureTitle, setFailureTitle] = useState("Bildirim gönderilemedi");
  const reportFailure = useCallback((message, heading = "Bildirim gönderilemedi") => {
    setFailureTitle(heading);
    setFailure(message);
  }, []);
  // Kurulum denetimi: bir hesabın bildirim alıp alamadığı ve alamıyorsa nedeni
  const [checking, setChecking] = useState(false);
  const [checkEmail, setCheckEmail] = useState("");
  const [diagnosis, setDiagnosis] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", zone: "", target: "home" });
  // Ne zaman: "now" hemen gönderir; diğerleri bildirimi planlar (saatler Türkiye saati)
  const [when, setWhen] = useState("now");
  const [customWhen, setCustomWhen] = useState("");
  const now = useNow(30000);
  // Seçili bölgedeki kitle büyüklükleri (bölge "Tümü" iken genel sayılar kullanılır)
  const [zoneCounts, setZoneCounts] = useState({ zone: "", audiences: null, error: false });
  const [countsVersion, setCountsVersion] = useState(0);
  const submitting = useRef(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  // Yapay zekânın farklı tonlardaki önerileri; birine dokununca forma dolar
  const [aiOptions, setAiOptions] = useState([]);
  // Yapay zekânın kullandığı gerçek mağaza bilgileri (haftalık fırsatlar, flash sale, çok satanlar)
  const [aiFacts, setAiFacts] = useState([]);
  const [useStoreData, setUseStoreData] = useState(true);
  const [rewriting, setRewriting] = useState("");
  const aiSectionRef = useRef(null);
  // Emoji eklemek için son odaklanan alan ve imleç konumu
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef("title");
  // Test alıcısı iki sekmede ortak: burada bir kez kurulur, Otomatik bildirimler sekmesine de verilir
  const testRecipient = useTestRecipient();
  const ensureTestRecipient = testRecipient.ensure;
  useEffect(() => {
    // Otomatik bildirimler sekmesi alıcıyı kendi ayar yüklemesinden alır; burada yalnızca bu sekmede yüklenir
    if (tab === "broadcast") ensureTestRecipient();
  }, [tab, ensureTestRecipient]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/notifications/broadcasts");
      setOverview({
        configured: data.configured !== false,
        audiences: data.audiences || [],
        history: data.history || [],
        scheduled: data.scheduled || [],
        zones: Array.isArray(data.zones) && data.zones.length ? data.zones : DEFAULT_ZONES,
        limits: { ...DEFAULT_LIMITS, ...(data.limits || {}) },
        hours: { orderHours: data.orderHours || null, sendWindow: data.sendWindow || null },
      });
      // Gönderimden sonra seçili bölgenin sayıları da yenilensin
      setCountsVersion((version) => version + 1);
    } catch {
      toast.error("Bildirim bilgileri alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Saati gelen plan sunucuda gönderilir; liste eskimesin diye zamanı bir dakikadan fazla geçmiş plan varken
  // (en sık dakikada bir) sessizce yenilenir.
  const lastAutoRefresh = useRef(0);
  useEffect(() => {
    if (tab !== "broadcast" || !overview.scheduled.some((item) => new Date(item.scheduledFor).getTime() < now - 60000)) return;
    if (now - lastAutoRefresh.current < 60000) return;
    lastAutoRefresh.current = now;
    load();
  }, [now, tab, overview.scheduled, load]);

  // Bölge seçilince sayılar sunucudan alınır (kısa gecikmeyle: art arda tıklamada tek istek)
  const debouncedZone = useDebounced(form.zone, 250);
  useEffect(() => {
    if (!debouncedZone) return undefined;
    let cancelled = false;
    axios.get("/notifications/broadcasts/audience-count", { params: { zone: debouncedZone } })
      .then(({ data }) => { if (!cancelled) setZoneCounts({ zone: debouncedZone, audiences: data.audiences || [], error: false }); })
      .catch(() => { if (!cancelled) setZoneCounts((current) => ({ zone: debouncedZone, audiences: current.zone === debouncedZone ? current.audiences : null, error: true })); });
    return () => { cancelled = true; };
  }, [debouncedZone, countsVersion]);
  const zoneMatches = Boolean(form.zone) && zoneCounts.zone === form.zone;
  // Gösterilen sayılar: bölge yoksa genel; bölge varsa o bölgenin sayıları (gelene kadar null)
  const counts = form.zone ? (zoneMatches ? zoneCounts.audiences : null) : overview.audiences;
  const countError = zoneMatches && zoneCounts.error;
  const counting = Boolean(form.zone) && !counts && !countError;
  const audienceInfo = useMemo(() => overview.audiences.find((item) => item.id === form.audience), [overview.audiences, form.audience]);
  const audience = useMemo(() => (counts || []).find((item) => item.id === form.audience), [counts, form.audience]);
  const zoneLabel = form.zone ? overview.zones.find((zone) => zone.id === form.zone)?.label || form.zone : "";
  const everyone = overview.audiences.find((item) => item.id === "all");
  const lastSend = overview.history.find((item) => item.audience !== TEST_AUDIENCE);
  const lastSendState = lastSend ? historyState(lastSend) : null;
  // Kütüphanede "gönderildi" sayılanlar: yalnızca müşterilere başarıyla giden gerçek gönderimler (denemeler ve başarısızlar değil)
  const sentTitles = useMemo(
    () => overview.history.filter((item) => item.audience !== TEST_AUDIENCE && item.sent).map((item) => item.title).filter(Boolean),
    [overview.history],
  );
  const title = form.title.trim();
  const body = form.body.trim();
  const busy = sending || testing;
  const reachable = audience?.reachable || 0;
  // Planlama: seçilen an (ms), geçerli mi ve saat uyarıları. "Şimdi"de whenMs null'dır.
  const scheduling = when !== "now";
  const whenMs = resolveWhen(when, customWhen, now);
  const whenProblem = scheduling ? scheduleProblem(whenMs, now, overview.limits) : "";
  const timeWarnings = scheduling && whenProblem ? [] : sendTimeWarnings(whenMs, overview.hours, now);
  const scheduleFull = overview.scheduled.length >= overview.limits.maxScheduled;
  const canSend = overview.configured && !busy && title && body && Boolean(audience)
    && (scheduling ? !whenProblem && !scheduleFull : reachable > 0);
  const recentSend = audience ? lastSendHint(audience.lastSentAt, now) : null;
  const canTest = overview.configured && !busy && !testRecipient.saving && title && body;
  const testTo = testRecipient.loaded ? testRecipientName(testRecipient) : "";

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

  // Kütüphaneden seçilen bildirim: metin, açılacak ekran ve önerilen kitle forma dolar
  const pickFromLibrary = (pair) => {
    const suggested = overview.audiences.find((item) => item.id === pair.theme.audience && item.reachable > 0);
    setForm((current) => ({ ...current, title: pair.title, body: pair.body, target: pair.theme.target || current.target, audience: suggested ? suggested.id : current.audience }));
    setFailure("");
    toast.success(suggested && suggested.id !== form.audience ? `Forma dolduruldu · kitle: ${suggested.label}` : "Forma dolduruldu; göndermeden önce düzenleyebilirsin");
    requestAnimationFrame(() => titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const applyDraftResponse = (data) => {
    const options = (Array.isArray(data.options) && data.options.length ? data.options : [{ title: data.title, body: data.body }])
      .filter((option) => typeof option?.title === "string" && typeof option?.body === "string");
    if (!options.length) throw new Error("empty-draft");
    setAiOptions(options);
    setAiFacts(Array.isArray(data.facts) ? data.facts : []);
    setForm((current) => ({ ...current, title: options[0].title, body: options[0].body }));
    setFailure("");
    return options;
  };

  // Formdaki metni seçilen yönde yeniden yazdırır (kısalt, esprili yap…)
  const rewriteDraft = async (instruction) => {
    if (rewriting || generating || !title || !body) return;
    try {
      setRewriting(instruction);
      setAiError("");
      const { data } = await axios.post("/notifications/broadcasts/draft", {
        mode: "rewrite", instruction, current: { title, body }, target: form.target, audience: form.audience, useStoreData,
      });
      const options = applyDraftResponse(data);
      toast.success(`${options.length} yeni sürüm hazır; beğendiğini seç.`);
      requestAnimationFrame(() => aiSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setAiError(error.response?.data?.message || "Metin geliştirilemedi. Tekrar deneyin.");
      toast.error("Metin geliştirilemedi");
    } finally {
      setRewriting("");
    }
  };

  const generateDraft = async (event) => {
    event.preventDefault();
    if (generating || aiPrompt.trim().length < 3) return;
    try {
      setGenerating(true);
      setAiError("");
      const { data } = await axios.post("/notifications/broadcasts/draft", {
        prompt: aiPrompt.trim(), target: form.target, audience: form.audience, useStoreData,
      });
      const options = applyDraftResponse(data);
      toast.success(options.length > 1 ? `${options.length} öneri hazır; birini seçip gözden geçirin.` : "Bildirim taslağı hazır; göndermeden önce gözden geçirin.");
    } catch (error) {
      setAiError(error.response?.data?.message || "Yapay zekâ metin oluşturamadı. Tekrar deneyin.");
    } finally {
      setGenerating(false);
    }
  };

  // Bildirimi herkese göndermeden önce yalnızca test alıcısının telefonunda dene (sunucu kayıtlı alıcıyı kullanır)
  const sendTest = async () => {
    if (!canTest) return;
    try {
      setTesting(true);
      setFailure("");
      const { data } = await axios.post("/notifications/broadcasts", { ...form, title, body, audience: TEST_AUDIENCE });
      toast.success(data.message || "Test bildirimi gönderildi");
      await load();
    } catch (error) {
      reportFailure(error.response?.data?.message || "Test bildirimi gönderilemedi", "Test bildirimi gönderilemedi");
      toast.error("Test bildirimi gönderilemedi");
      await load();
    } finally {
      setTesting(false);
    }
  };

  // "Tarih ve saat seç" ilk açıldığında alan boş kalmasın: bir sonraki tam saatin bir saat sonrası önerilir
  const pickWhen = (next) => {
    if (next === "custom" && !customWhen) setCustomWhen(toTrInput((Math.floor(Date.now() / 3600000) + 2) * 3600000));
    setWhen(next);
  };

  const audienceText = `${audienceInfo?.label || ""}${zoneLabel ? ` · ${zoneLabel}` : ""}`;

  // İleri bir zamana planlar; bildirim o an gelince sunucudaki dakikalık iş gönderir
  const schedule = async () => {
    const at = resolveWhen(when, customWhen, Date.now());
    const problem = scheduleProblem(at, Date.now(), overview.limits);
    if (problem) {
      toast.error(problem);
      return;
    }
    const warnings = sendTimeWarnings(at, overview.hours);
    const confirmed = await confirm({
      title: "Bildirimi planla",
      message: [
        `"${title}" bildirimi ${formatWhen(at)} (Türkiye saati) gönderilmek üzere planlanacak: ${audienceText}.`,
        reachable > 0 ? `Kitle gönderim anında yeniden hesaplanır (şu an ${reachable} kişi).` : "Şu an bu kitlede bildirim alabilecek müşteri yok; gönderim anında da yoksa bildirim gönderilmez.",
        ...warnings.map((warning) => `Dikkat: ${warning}`),
      ].join(" "),
      confirmText: `${formatWhen(at)} için planla`,
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!confirmed || submitting.current) return;
    try {
      submitting.current = true;
      setSending(true);
      setFailure("");
      const { data } = await axios.post("/notifications/broadcasts/scheduled", { ...form, title, body, scheduledFor: new Date(at).toISOString() });
      toast.success(data.message || "Bildirim planlandı");
      setForm((current) => ({ ...current, title: "", body: "" }));
      setWhen("now");
      await load();
    } catch (error) {
      reportFailure(error.response?.data?.message || "Bildirim planlanamadı. Tekrar deneyin.", "Bildirim planlanamadı");
      toast.error("Bildirim planlanamadı");
      await load();
    } finally {
      submitting.current = false;
      setSending(false);
    }
  };

  const send = async (event) => {
    event.preventDefault();
    if (!canSend || submitting.current) return;
    if (scheduling) {
      await schedule();
      return;
    }
    const confirmed = await confirm({
      title: "Bildirimi gönder",
      message: [
        `"${title}" bildirimi ${reachable} müşterinin telefonuna gönderilecek (${audienceText}). Gönderilen bildirim geri alınamaz.`,
        ...(recentSend?.recent ? [recentSend.text] : []),
        ...timeWarnings.map((warning) => `Dikkat: ${warning}`),
      ].join(" "),
      confirmText: `${reachable} kişiye gönder`,
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!confirmed || submitting.current) return;
    try {
      submitting.current = true;
      setSending(true);
      setFailure("");
      const { data } = await axios.post("/notifications/broadcasts", { ...form, title, body });
      toast.success(data.message || "Bildirim gönderildi");
      setForm((current) => ({ ...current, title: "", body: "" }));
      await load();
    } catch (error) {
      reportFailure(error.response?.data?.message || "Bildirim gönderilemedi");
      toast.error("Bildirim gönderilemedi");
      await load();
    } finally {
      submitting.current = false;
      setSending(false);
    }
  };

  // Geçmişteki bir bildirimin metnini forma geri yükler (kitle ve zaman değişmez)
  const reuse = (item) => {
    setForm((current) => ({ ...current, title: item.title, body: item.body }));
    setFailure("");
    toast.success("Metin forma dolduruldu; göndermeden önce düzenleyebilirsiniz");
    requestAnimationFrame(() => titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const targetLabel = TARGETS.find((target) => target.id === form.target)?.label;

  return (
    <div className="ui-page push-page">
      <header className="app-pagehead">
        <div>
          <h1>Bildirim gönder</h1>
          <p>{tab === "auto" ? "Kurallara uyan müşterilere kendiliğinden giden bildirimleri yönetin." : "Müşterilerinizin telefonuna kampanya ve duyuru bildirimi gönderin."}</p>
        </div>
        {tab === "broadcast" && (
          <button onClick={load} className="ui-btn" aria-label="Yenile">
            <RefreshCw className={loading ? "ui-spin" : ""} />
            Yenile
          </button>
        )}
      </header>

      <Tabs ariaLabel="Bildirim türü" tabs={SCREEN_TABS} value={tab} onChange={setScreenTab} />

      {tab === "auto" ? <AutomationPanel testRecipient={testRecipient} /> : (<>

      {!overview.configured && (
        <div className="ui-banner ui-banner--warn" role="status">
          Bildirim servisi yapılandırılmamış. Sunucu ayarlarına OneSignal anahtarları eklenene kadar gönderim yapılamaz.
        </div>
      )}

      {failure && (
        <div className="ui-banner ui-banner--danger push-failure" role="alert">
          <AlertTriangle />
          <div className="ui-grow">
            <strong>{failureTitle}</strong>
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
          <span className="ui-stat-value push-stat-text">{lastSend ? formatDate(lastSend.at || lastSend.createdAt) : "Henüz yok"}</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Son gönderimin durumu</span>
          <span className="ui-stat-value push-stat-text">{lastSend ? (lastSendState.tone === "ok" ? `${lastSend.targetedCount || 0} kişiye gitti` : lastSendState.label) : "–"}</span>
        </div>
      </div>

      <div className="push-layout">
        <form id="push-form" className="push-compose" onSubmit={send}>
          {/* 1. Yapay zekâ ile yaz */}
          <section className="push-ai" aria-labelledby="push-ai-title" ref={aiSectionRef}>
            <div className="push-ai-head">
              <span className="push-ai-badge"><Sparkles /></span>
              <div>
                <h2 id="push-ai-title">Yapay zekâ ile yaz</h2>
                <p>Ne duyurmak istediğinizi anlatın; seçili kitleye ve ekrana göre 4 farklı tonda öneri hazırlasın.</p>
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
            <div className="ui-between">
              <span className="push-ai-note">Yapay zekâ indirim, fiyat ya da tarih uydurmaz; yalnızca sizin yazdıklarınızı ve mağazanın gerçek bilgilerini kullanır.</span>
              <label className="push-ai-store">
                <input type="checkbox" checked={useStoreData} onChange={(e) => setUseStoreData(e.target.checked)} />
                Mağaza verilerini kullan
              </label>
            </div>
            {aiFacts.length > 0 && (
              <div className="push-ai-facts" aria-label="Kullanılan mağaza bilgileri">
                <span className="ui-muted">Kullanabildiği bilgiler:</span>
                {aiFacts.map((fact) => <span key={fact}>{fact}</span>)}
              </div>
            )}
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

          {/* Hazır bildirim kütüphanesi */}
          <PushLibrary onPick={pickFromLibrary} sentTitles={sentTitles} />

          {/* 2. Metin */}
          <section className="ui-panel" aria-labelledby="push-text-title">
            <div className="ui-panel-head push-step-head">
              <span className="push-step">1</span>
              <h2 id="push-text-title">Bildirim metni</h2>
            </div>
            <div className="ui-panel-body ui-stack">
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
              <div className="push-rewrite" aria-label="Yapay zekâ ile geliştir">
                <span className="push-rewrite-label"><Sparkles />Yapay zekâ ile geliştir:</span>
                {REWRITES.map((item) => (
                  <button type="button" key={item.id} onClick={() => rewriteDraft(item.id)}
                    disabled={!title || !body || Boolean(rewriting) || generating}
                    title={!title || !body ? "Önce başlık ve mesaj yazın" : undefined}>
                    {rewriting === item.id ? "Yazıyor…" : item.label}
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
              <div>
                <span className="ui-label" id="push-zone-label">Bölge</span>
                <div className="push-targets" role="group" aria-labelledby="push-zone-label">
                  {overview.zones.map((zone) => (
                    <button type="button" key={zone.id || "all"} className="push-target" aria-pressed={form.zone === zone.id}
                      onClick={() => setForm((current) => ({ ...current, zone: zone.id }))}>
                      <MapPin />{zone.label}
                    </button>
                  ))}
                </div>
                <p className="ui-hint">
                  Bölge, müşterinin iptal edilmemiş son siparişine göre belirlenir (adrese teslim siparişler Devrek sayılır). Hiç sipariş vermemiş müşteriler hiçbir bölgede sayılmaz; bölge seçiliyken onlara gönderilmez.
                </p>
              </div>
              {countError && (
                <div className="ui-banner ui-banner--warn" role="alert">
                  <span className="ui-grow">{zoneLabel} için kişi sayıları alınamadı.</span>
                  <button type="button" className="ui-btn ui-btn--sm" onClick={() => setCountsVersion((version) => version + 1)}>Tekrar dene</button>
                </div>
              )}
              <div className="push-audiences" aria-busy={counting}>
                {overview.audiences.map((item) => {
                  const Icon = AUDIENCE_ICONS[item.id] || Users;
                  const count = (counts || []).find((entry) => entry.id === item.id);
                  const share = count?.total ? Math.round((count.reachable / count.total) * 100) : 0;
                  return (
                    <button type="button" key={item.id} className="push-audience" aria-pressed={form.audience === item.id}
                      onClick={() => setForm((current) => ({ ...current, audience: item.id }))}>
                      <span className="push-audience-icon"><Icon /></span>
                      <span className="push-audience-text">
                        <span className="push-audience-label">{item.label}</span>
                        {count
                          ? <span className="push-audience-meta"><strong className="ui-num">{count.reachable}</strong> kişiye ulaşır · {count.total} müşteri</span>
                          : <span className="push-audience-meta">{countError ? "Sayı alınamadı" : "Hesaplanıyor…"}</span>}
                        <span className="push-audience-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                      </span>
                    </button>
                  );
                })}
                {!loading && !overview.audiences.length && <p className="ui-hint">Hedef kitle bilgisi alınamadı.</p>}
              </div>
              {audience && (
                <p className="ui-hint" style={{ marginTop: 0 }}>
                  {zoneLabel ? `${zoneLabel} bölgesinde bu gruptaki` : "Bu gruptaki"} {audience.total} müşteriden {audience.reachable} tanesi kampanya bildirimlerine izin veriyor.
                  Uygulamayı yüklememiş veya bildirim izni vermemiş müşterilere ulaşmaz.
                </p>
              )}
              {recentSend && (
                <p className="pbx-lastsend" data-recent={recentSend.recent ? "true" : undefined} role="status">
                  <Clock aria-hidden="true" /><span>{recentSend.text}</span>
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
            <div className="ui-panel-head push-step-head push-step-head--inner">
              <span className="push-step">4</span>
              <h2>Ne zaman gönderilsin?</h2>
            </div>
            <div className="ui-panel-body">
              <ScheduleField when={when} onWhen={pickWhen} custom={customWhen} onCustom={setCustomWhen} now={now} limits={overview.limits}
                problem={whenProblem} warnings={timeWarnings} />
              {scheduling && scheduleFull && (
                <p className="pbx-problem" role="alert">En fazla {overview.limits.maxScheduled} planlı bildirim bekleyebilir. Yenisini planlamak için Planlı listesinden birini iptal edin ya da gönderilmesini bekleyin.</p>
              )}
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
                    <span className="push-preview-time">{scheduling && !whenProblem ? formatWhen(whenMs, now) : "şimdi"}</span>
                  </div>
                  <strong className="ui-wrap-anywhere">{title || "Bildirim başlığı"}</strong>
                  <p className="ui-wrap-anywhere">{body || "Mesajınız burada görünecek."}</p>
                </div>
              </div>
            </div>
            <dl className="push-summary">
              <div><dt>Kime</dt><dd>{audienceInfo ? audienceInfo.label : "–"}</dd></div>
              <div><dt>Bölge</dt><dd>{zoneLabel || "Tümü"}</dd></div>
              <div><dt>{scheduling ? "Ulaşacak (şu an)" : "Ulaşacak"}</dt><dd className="ui-num">{audience ? `${reachable} kişi` : counting ? "Hesaplanıyor…" : "–"}</dd></div>
              <div><dt>Açılacak ekran</dt><dd>{targetLabel}</dd></div>
              <div><dt>Ne zaman</dt><dd>{scheduling ? (whenProblem ? "Saat seçin" : formatWhen(whenMs, now)) : "Şimdi"}</dd></div>
            </dl>
            <div className="push-send-actions">
              <button type="submit" form="push-form" className="ui-btn ui-btn--primary push-send" disabled={!canSend}>
                {scheduling ? <CalendarClock /> : <Send />}
                {scheduling
                  ? (sending ? "Planlanıyor…" : whenProblem ? "Planla" : `${formatWhen(whenMs, now)} için planla`)
                  : (sending ? "Gönderiliyor…" : reachable ? `${reachable} kişiye gönder` : "Gönder")}
              </button>
              <TestRecipientPicker state={testRecipient} compact />
              <button type="button" className="ui-btn push-test" disabled={!canTest} onClick={sendTest}
                title={testTo ? `Yalnızca test alıcısının telefonuna gider (${testTo})` : "Yalnızca test alıcısının telefonuna gider"}>
                <FlaskConical />
                {testing ? "Gönderiliyor…" : <>Önce test gönder<RecipientTag name={testTo} /></>}
              </button>
              <p className="push-send-note">
                {scheduling ? "Planlanan bildirim, saati gelince kendiliğinden gönderilir; o ana kadar Planlı listesinden düzenlenebilir ya da iptal edilebilir." : "Aynı bildirim 10 dakika içinde ikinci kez gönderilemez."}
              </p>
            </div>
          </section>

          <ScheduledList items={overview.scheduled} audiences={overview.audiences} zones={overview.zones} targets={TARGETS} hours={overview.hours}
            limits={overview.limits} now={now} configured={overview.configured} onChanged={load} onFailure={reportFailure} />

          <BroadcastHistory items={overview.history} loading={loading} audiences={overview.audiences} zones={overview.zones} onReuse={reuse} />

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
      </>)}
    </div>
  );
}
