/* global Intl */
// Seçili müşterilere (ya da süzgece uyan herkese, ya da tek müşteriye) bildirim veya kişiye özel kupon penceresi.
// Müşteriler ekranının toplu çubuğundan, "Süzgece uyan herkes" şeridinden ve müşteri çekmecesinden açılır.
// Akış: yaz → kontrol et → gönder. Uçlar: POST /customer-actions/preview, /customer-actions/push, /customer-actions/coupons.
// Müşteriye giden metinler (bildirim, kupon açıklaması) "sen" dilindedir; panel yazıları "siz" dilindedir.
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Bell, CheckCircle2, Clock, Moon, RefreshCw, RotateCcw, Send, Ticket, Users, X,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import { Segmented, Skeleton, money } from "../admin/ui";
import "../../styles/customer-actions.css";

const TZ = "Europe/Istanbul";
const DAY_MS = 86400000;
// Sunucu önizlemesi gelene kadar kullanılan sınırlar (sunucu kendi sınırını önizlemede bildirir)
const DEFAULT_LIMITS = { title: 60, body: 180, targets: 1000 };
const MAX_EXPIRY_DAYS = 90;
const MODES = [
  { value: "push", label: "Bildirim", icon: Bell },
  { value: "coupon", label: "Kupon", icon: Ticket },
];
// Bildirime dokununca açılacak ekran (sunucudaki PUSH_ROUTES anahtarları)
const ROUTES = [
  { value: "home", label: "Ana sayfa" },
  { value: "cart", label: "Sepet" },
  { value: "orders", label: "Siparişlerim" },
  { value: "referral", label: "Davet sayfası" },
  { value: "rate", label: "Mağazada puan ver" },
];
const ROUTE_LABELS = Object.fromEntries(ROUTES.map((route) => [route.value, route.label]));
const EXPIRY_PICKS = [
  { days: 0, label: "Bugün" },
  { days: 1, label: "Yarın" },
  { days: 3, label: "3 gün" },
  { days: 7, label: "7 gün" },
  { days: 14, label: "14 gün" },
  { days: 30, label: "30 gün" },
];
const VALUE_PICKS = { percentage: [10, 15, 20, 25], fixed: [25, 50, 75, 100] };
// Adım değişir değişmez gelen tıklama yeni adımın düğmesine işlemez: "Devam"a çift tıklamanın ikinci tıklaması aynı
// yerdeki "Gönder"e düşüp kontrol adımını atlatmasın
const STEP_GUARD_MS = 600;
// "Bugün" biten kuponda bundan az süre kaldıysa uyarılır (siparişler gece 01:00'e kadar sürer)
const SHORT_EXPIRY_MINUTES = 180;
const DAY_CHANGED = "Gece yarısı geçti; kupon bilgileri yeni güne göre güncellendi. Kontrol edip yeniden onaylayın.";
const INITIAL_COUPON = Object.freeze({
  discountType: "percentage",
  value: "10",
  maximumDiscount: "",
  minimumOrderAmount: "",
  expiry: { kind: "days", days: 7, date: "" },
  notify: true,
  title: "",
  body: "",
  edited: false,
  route: "cart",
});

// ── Biçimlendirme ───────────────────────────────────────────────────
const num = (value) => Number(value || 0).toLocaleString("tr-TR");
const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const dayKeyFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const clockFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const clockPartsFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const lockDateFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
/** İstanbul'da bugünün takvim günü: "2026-11-02" (yerel biçimden bağımsız: parçalardan kurulur) */
const istanbulToday = () => {
  const parts = Object.fromEntries(dayKeyFormat.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
/** İstanbul'da bugün 23:59'a kalan dakika */
const minutesLeftToday = () => {
  const parts = Object.fromEntries(clockPartsFormat.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return Math.max(0, 23 * 60 + 59 - ((Number(parts.hour) % 24) * 60 + Number(parts.minute)));
};
/** 135 → "2 saat 15 dakika", 40 → "40 dakika", 0 → "1 dakikadan az" */
const durationText = (minutes) => {
  if (minutes < 1) return "1 dakikadan az";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} dakika`;
  return rest ? `${hours} saat ${rest} dakika` : `${hours} saat`;
};
const keyToUtc = (key) => {
  const [year, month, day] = String(key).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const isDayKey = (key) => /^\d{4}-\d{2}-\d{2}$/.test(String(key || "")) && Number.isFinite(keyToUtc(key));
const addDays = (key, days) => new Date(keyToUtc(key) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS);
/** "2026-11-09" → "9 Kasım Pazartesi" */
const longDay = (key) => new Date(keyToUtc(key) + 12 * 3600000).toLocaleDateString("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", weekday: "long" });
/** Müşteriye giden tutar metni: 250 → "250 TL", 37.5 → "37,50 TL" (sunucudaki açıklamayla aynı) */
const tl = (value) => `${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2, maximumFractionDigits: 2 })} TL`;
/** "37,5" / "37.5" / "1.500" → sayı; boş ya da bozuksa NaN */
const parseAmount = (text) => {
  let value = String(text ?? "").trim().replace(/\s|₺|tl/gi, "");
  if (!value) return Number.NaN;
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
};
// Sunucudaki roundMoney (productPricing.toKurus) ile aynı yuvarlama: 1,005 → 1,01
const roundMoney = (value) => Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7) / 100;

// Türkçe iyelik + yönelme eki: 18 → "18'ine", 6 → "6'sına", 10 → "10'una", 3 → "3'üne"
const ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const lastWordOf = (n) => {
  if (n === 0) return "sıfır";
  if (n % 10) return ONES[n % 10];
  if (n % 100) return TENS[Math.floor(n / 10) % 10];
  if (n % 1000) return "yüz";
  if (n % 1000000) return "bin";
  return n % 1000000000 ? "milyon" : "milyar";
};
const withDative = (value) => {
  const n = Math.abs(Math.trunc(Number(value) || 0));
  const word = lastWordOf(n);
  const vowel = [...word].reverse().find((char) => "aeıioöuü".includes(char)) || "e";
  const narrow = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" }[vowel];
  const wide = "aıou".includes(vowel) ? "a" : "e";
  const endsWithVowel = "aeıioöuü".includes(word[word.length - 1]);
  return `${num(n)}'${endsWithVowel ? "s" : ""}${narrow}n${wide}`;
};

// ── Kupon ───────────────────────────────────────────────────────────
/** Formdaki kupon → { ok, values, errors } (sunucudaki parseCouponInput ile aynı kurallar) */
const readCoupon = (form, today) => {
  const errors = {};
  const percentage = form.discountType === "percentage";
  const value = parseAmount(form.value);
  if (percentage) {
    if (!Number.isInteger(value) || value < 1 || value > 90) errors.value = "1 ile 90 arasında tam sayı girin";
  } else if (!(value >= 1 && value <= 500)) {
    errors.value = "1–500 TL arasında bir tutar girin";
  }
  let maximumDiscount = null;
  if (percentage && String(form.maximumDiscount).trim()) {
    const amount = parseAmount(form.maximumDiscount);
    if (!(amount >= 1 && amount <= 10000)) errors.maximumDiscount = "1–10.000 TL arasında olmalı ya da boş bırakın";
    else maximumDiscount = roundMoney(amount);
  }
  let minimumOrderAmount = 0;
  if (String(form.minimumOrderAmount).trim()) {
    const amount = parseAmount(form.minimumOrderAmount);
    if (!(amount >= 0 && amount <= 10000)) errors.minimumOrderAmount = "0–10.000 TL arasında olmalı ya da boş bırakın";
    else minimumOrderAmount = roundMoney(amount);
  }
  const expiresOn = form.expiry.kind === "date" ? form.expiry.date : addDays(today, form.expiry.days);
  const daysLeft = isDayKey(expiresOn) ? daysBetween(today, expiresOn) : Number.NaN;
  if (!isDayKey(expiresOn)) errors.expiry = "Son kullanma günü seçin";
  else if (daysLeft < 0) errors.expiry = "Son kullanma günü geçmiş olamaz";
  else if (daysLeft > MAX_EXPIRY_DAYS) errors.expiry = `En fazla ${MAX_EXPIRY_DAYS} gün sonrası seçilebilir`;
  const values = {
    discountType: form.discountType,
    value: percentage ? value : roundMoney(value),
    maximumDiscount,
    minimumOrderAmount,
    expiresOn,
    daysLeft,
  };
  return { ok: Object.keys(errors).length === 0, values, errors };
};
const valueText = (coupon) => (coupon.discountType === "fixed" ? tl(coupon.value) : `%${coupon.value}`);
const capText = (coupon) => (coupon.discountType === "percentage" && coupon.maximumDiscount ? ` (en fazla ${tl(coupon.maximumDiscount)})` : "");
const untilText = (coupon) => {
  if (coupon.daysLeft === 0) return "Bugün 23:59'a kadar geçerli";
  if (coupon.daysLeft === 1) return "Yarın 23:59'a kadar geçerli";
  return `Son gün ${longDay(coupon.expiresOn)}`;
};
/** Uygulamadaki kupon kartında görünecek açıklama (sunucu aynı metni yazar) */
const couponDescription = (coupon) => {
  const minimum = coupon.minimumOrderAmount > 0 ? ` ${tl(coupon.minimumOrderAmount)} ve üzeri siparişinde geçerli.` : "";
  return `Sana özel ${valueText(coupon)} indirim${capText(coupon)}.${minimum} Tek kullanımlık.`;
};
const defaultCouponMessage = (coupon) => ({
  title: "Sana özel kupon 🎁",
  body: `${valueText(coupon)} indirim kuponun hazır${capText(coupon)}. ${untilText(coupon)}; sepette kullanabilirsin.`,
});
/** "En kötü durumda 23 × ₺50 = ₺1.150" — yüzde indirimde ancak üst sınır varsa hesaplanabilir */
const worstCase = (coupon, count) => {
  const each = coupon.discountType === "fixed" ? coupon.value : coupon.maximumDiscount;
  if (!(each > 0) || !count) return null;
  return { each, count, total: roundMoney(each * count) };
};

// ── Parçalar ────────────────────────────────────────────────────────
const Counter = ({ value, limit }) => {
  const ratio = limit ? value / limit : 0;
  return (
    <span className="push-counter" data-state={ratio > 1 ? "full" : ratio >= 0.85 ? "near" : "ok"} aria-label={`${value} / ${limit} karakter`}>
      <span className="push-counter-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, ratio * 100)}%` }} /></span>
      <span className="ui-num">{value}/{limit}</span>
    </span>
  );
};

const FieldError = ({ id, children }) => (children ? <p id={id} className="ca-error" role="alert">{children}</p> : null);

/** Telefon kilit ekranı görünümünde bildirim önizlemesi (Bildirimler ekranındaki görünümle aynı) */
const PhonePreview = ({ title, body, routeLabel }) => {
  const now = new Date();
  return (
    <div className="ca-phone" aria-label="Telefonda görünüm">
      <div className="push-phone">
        <div className="push-phone-clock" aria-hidden="true">
          <span>{lockDateFormat.format(now)}</span>
          <strong>{clockFormat.format(now)}</strong>
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
      {routeLabel && <p className="ca-phone-note">Dokununca <strong>{routeLabel}</strong> açılır</p>}
    </div>
  );
};

/** Uygulamadaki kupon kartının sade önizlemesi */
const CouponPreview = ({ coupon, valid }) => (
  <div className="ca-coupon" data-invalid={!valid || undefined} aria-label="Uygulamada kupon görünümü">
    <div className="ca-coupon-top">
      <span className="ca-coupon-value ui-num">{valid ? valueText(coupon) : "—"}</span>
      <span className="ca-coupon-tag">Sana özel</span>
    </div>
    <p className="ca-coupon-desc">{valid ? couponDescription(coupon) : "İndirimi ve son günü girin."}</p>
    <div className="ca-coupon-foot">
      <span className="ui-mono">OZEL•••••••</span>
      <span>{valid ? untilText(coupon) : ""}</span>
    </div>
  </div>
);

/** "23 kişi seçili · 18'ine bildirim ulaşabilir" satırı */
const AudienceSummary = ({ state, mode, notify, onRetry, isFilter }) => {
  if (state.status === "loading") {
    return (
      <div className="ca-audience" aria-busy="true">
        <Users aria-hidden="true" />
        <div className="ca-audience-text">
          <span className="ui-muted">Alıcılar hesaplanıyor…</span>
          <Skeleton width="60%" height={10} />
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="ui-banner ui-banner--danger ca-banner" role="alert">
        <AlertTriangle />
        <span className="ui-grow">{state.error}</span>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry}><RefreshCw />Tekrar dene</button>
      </div>
    );
  }
  const data = state.data;
  const { total, reachable } = data;
  const single = total === 1 && data.sample?.[0];
  const pushLine = mode === "push" || notify;
  const reach = !total ? "" : single
    ? (reachable ? "bildirim ulaşabilir" : "bildirim ulaşmaz (bildirimi kapalı ya da uygulaması yok)")
    : reachable === total ? "hepsine bildirim ulaşabilir"
      : reachable ? `${withDative(reachable)} bildirim ulaşabilir`
        : "hiçbirine bildirim ulaşmaz";
  const head = single
    ? <strong>{data.sample[0].name || "İsimsiz müşteri"}</strong>
    : mode === "coupon"
      ? <><strong className="ui-num">{num(total)}</strong> kişiye birer kupon</>
      : isFilter
        ? <>Süzgece uyan <strong className="ui-num">{num(total)}</strong> kişi</>
        : <><strong className="ui-num">{num(total)}</strong> kişi seçili</>;
  const others = total - (data.sample?.length || 0);
  return (
    <div className="ca-audience" data-empty={!total || undefined}>
      <Users aria-hidden="true" />
      <div className="ca-audience-text">
        {total ? (
          <span className="ca-audience-line">{head}{pushLine && <> · <span data-tone={reachable ? undefined : "warn"}>{reach}</span></>}</span>
        ) : (
          <span className="ca-audience-line"><strong>Bu hedefte müşteri yok</strong></span>
        )}
        {total > 1 && (
          <span className="ca-audience-sub ui-truncate" title={data.sample.map((user) => user.name).join(", ")}>
            {data.sample.map((user) => user.name || "İsimsiz").join(", ")}{others > 0 ? ` ve ${num(others)} kişi daha` : ""}
          </span>
        )}
        {pushLine && total > 0 && reachable < total && !single && (
          <span className="ca-audience-sub">{num(total - reachable)} kişinin bildirimi kapalı ya da uygulaması yok{mode === "coupon" ? "; kuponu yine de alır" : ""}.</span>
        )}
        {data.capped && (
          <span className="ca-audience-sub" data-tone="warn">Süzgece {num(data.matched)} kişi uyuyor; en son görülen {num(total)} kişi seçildi.</span>
        )}
        {data.missing > 0 && (
          <span className="ca-audience-sub">{num(data.missing)} seçili hesap atlanır (yönetici ya da silinmiş hesap).</span>
        )}
        {data.admins > 0 && (
          <span className="ca-audience-sub">Süzgece uyan {num(data.admins)} yönetici hesabı hariç tutuldu.</span>
        )}
      </div>
    </div>
  );
};

// ── Pencere ─────────────────────────────────────────────────────────
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {"push"|"coupon"} props.mode  açılıştaki sekme
 * @param {{userIds: string[]}|{filter: object}} props.target  sunucuya gidecek hedef (açılıştaki anlık görüntü)
 * @param {string} props.audienceLabel  başlık altında görünen kısa açıklama
 * @param {{title?: string, body?: string, route?: string}} [props.preset]  hazır bildirim metni
 * @param {() => void} props.onClose
 */
export default function CustomerActionDialog({ mode: initialMode = "push", target, audienceLabel = "", preset = null, onClose }) {
  const { confirm } = useConfirm();
  const titleId = useId();
  const fieldId = useId();
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const confirmTitleRef = useRef(null);
  const doneTitleRef = useRef(null);
  const openedAtRef = useRef(0); // pencerenin açıldığı an (arka plan tıklaması için)
  const stepAtRef = useRef(0); // son adım değişikliğinin anı (çift tıklama koruması)
  const [mode, setMode] = useState(initialMode === "coupon" ? "coupon" : "push");
  const [step, setStep] = useState("compose"); // compose → confirm → done
  const [preview, setPreview] = useState({ status: "loading", data: null, error: "" });
  const initialPush = useMemo(() => ({
    title: preset?.title || "",
    body: preset?.body || "",
    route: ROUTE_LABELS[preset?.route] ? preset.route : "home",
  }), [preset]);
  const [pushForm, setPushForm] = useState(initialPush);
  const [couponForm, setCouponForm] = useState(INITIAL_COUPON);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [issue, setIssue] = useState(null); // sunucunun reddi: { code, message, ... }
  const [quietOk, setQuietOk] = useState(false);
  // Sunucu "sessiz saat" dediyse (önizlemeden sonra saat dönmüş olabilir) pencere kapanana kadar hatırlanır
  const [serverQuiet, setServerQuiet] = useState(null);
  const [result, setResult] = useState(null);
  const [today, setToday] = useState(istanbulToday);
  const isFilter = Boolean(target?.filter);

  // ── Önizleme (kaç kişi, kaçına ulaşır) ──
  const previewRequest = useRef(0);
  const loadPreview = useCallback(async () => {
    const id = ++previewRequest.current;
    setPreview((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const { data } = await axios.post("/customer-actions/preview", { target, channel: initialMode === "coupon" ? "coupon" : "push" });
      if (id === previewRequest.current) setPreview({ status: "ready", data, error: "" });
    } catch (error) {
      if (id === previewRequest.current) setPreview({ status: "error", data: null, error: errorText(error, "Alıcılar hesaplanamadı. Bağlantıyı kontrol edip tekrar deneyin.") });
    }
  }, [target, initialMode]);
  useEffect(() => {
    loadPreview();
    return () => { previewRequest.current += 1; }; // kapanınca geç gelen yanıt yazılmasın
  }, [loadPreview]);

  const data = preview.status === "ready" ? preview.data : null;
  const limits = { ...DEFAULT_LIMITS, ...(data?.limits || {}) };
  const total = data?.total || 0;
  const reachable = data?.reachable || 0;
  const pushConfigured = data ? data.pushConfigured !== false : true;
  const quietActive = Boolean(data?.quietHours?.active) || Boolean(serverQuiet);
  const quietWindow = serverQuiet || data?.quietHours || null;

  // ── Form değerleri ──
  const pushTitle = pushForm.title.trim();
  const pushBody = pushForm.body.trim();
  const couponRead = useMemo(() => readCoupon(couponForm, today), [couponForm, today]);
  const coupon = couponRead.values;
  const defaults = useMemo(() => (couponRead.ok ? defaultCouponMessage(coupon) : { title: "Sana özel kupon 🎁", body: "" }), [couponRead.ok, coupon]);
  // Yönetici bildirim metnine dokunmadıysa metin kupondan kendiliğinden üretilir
  const couponTitle = (couponForm.edited ? couponForm.title : defaults.title).trim();
  const couponBody = (couponForm.edited ? couponForm.body : defaults.body).trim();
  const notify = couponForm.notify && pushConfigured;
  const message = mode === "push" ? { title: pushTitle, body: pushBody } : { title: couponTitle, body: couponBody };
  const willPush = mode === "push" || notify;
  // Sessiz saat onayı yalnızca bildirim gerçekten birine gidecekse istenir (sunucu da aynı kuralı uygular). Sunucu
  // "sessiz saat" dediyse önizlemedeki sayı ne olursa olsun sorulur: önizlemede kimseye ulaşmayan kupon bildirimi
  // gönderim anında birine ulaşabilir; onay kutusu çıkmazsa gönder düğmesi her seferinde aynı redde takılırdı.
  const needsQuietOk = willPush && quietActive && (reachable > 0 || Boolean(serverQuiet));

  const errors = useMemo(() => {
    const out = {};
    const check = (key, value, limit, label) => {
      if (!value) out[key] = `${label} yazın`;
      else if (value.length > limit) out[key] = `${label} en fazla ${limit} karakter olabilir`;
    };
    if (mode === "push") {
      check("title", pushTitle, limits.title, "Başlık");
      check("body", pushBody, limits.body, "Mesaj");
    } else {
      Object.assign(out, couponRead.errors);
      if (notify) {
        check("title", couponTitle, limits.title, "Bildirim başlığı");
        check("body", couponBody, limits.body, "Bildirim mesajı");
      }
    }
    return out;
  }, [mode, pushTitle, pushBody, couponRead.errors, notify, couponTitle, couponBody, limits.title, limits.body]);
  const valid = Object.keys(errors).length === 0;
  const showError = (key) => (attempted ? errors[key] : null);

  const blocked = !data || !total
    || (mode === "push" && (!pushConfigured || !reachable));
  const dirty = useMemo(() => (
    JSON.stringify(pushForm) !== JSON.stringify(initialPush) || JSON.stringify(couponForm) !== JSON.stringify(INITIAL_COUPON)
  ), [pushForm, couponForm, initialPush]);

  // ── Kapatma ──
  const requestClose = useCallback(async () => {
    if (busyRef.current) return; // gönderim sürerken kapanmaz (sonuç kaybolmasın)
    if (step !== "done" && dirty) {
      const ok = await confirm({
        title: "Gönderilmedi",
        message: "Yazdıklarınız gönderilmedi ve kaybolacak. Pencere kapatılsın mı?",
        confirmText: "Kapat",
        cancelText: "Geri dön",
        type: "warning",
      });
      if (!ok) return;
    }
    onClose?.();
  }, [step, dirty, confirm, onClose]);
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  // Odak: açılınca ilk alana (dokunmatik ekranda klavye açılmasın diye pencereye), kapanınca açan öğeye döner
  useEffect(() => {
    const previous = document.activeElement;
    openedAtRef.current = Date.now();
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    requestAnimationFrame(() => (fine && firstFieldRef.current ? firstFieldRef.current : dialogRef.current)?.focus({ preventScroll: true }));
    // Odak pencerenin dışındayken (ör. arka plana tıklandıysa) Esc yine kapatır
    const onKey = (event) => {
      if (event.key !== "Escape" || document.querySelector(".confirm-root")) return;
      if (dialogRef.current?.contains(event.target)) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous && previous !== document.body && previous.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, []);

  const onDialogKeyDown = (event) => {
    if (event.key === "Escape") {
      // Arkadaki liste ve çekmece kısayolları bu tuşu görmesin (ör. aramayı temizleme)
      event.stopPropagation();
      if (!document.querySelector(".confirm-root")) closeRef.current();
      return;
    }
    if (event.key !== "Tab" || document.querySelector(".confirm-root")) return;
    const items = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])].filter((el) => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Adım değişince odak yeni adıma taşınır: kontrol ve sonuç adımında başlığa (ekran okuyucu okur; basılı tutulan
  // Enter gönder düğmesine düşmez), yazma adımında ilk alana (dokunmatikte pencereye). Kaldırılan düğmede kalan odak
  // sayfaya düşüp Tab'ı pencereden kaçırırdı.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    stepAtRef.current = Date.now();
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    const target = step === "confirm" ? confirmTitleRef.current
      : step === "done" ? doneTitleRef.current
        : (fine ? firstFieldRef.current : null);
    (target || dialogRef.current)?.focus();
  }, [step]);
  /** Çift tıklamanın ikincisi ya da adım değişir değişmez gelen tıklama değil mi? */
  const deliberate = (event) => !(event?.detail > 1) && Date.now() - stepAtRef.current > STEP_GUARD_MS;

  /** Pencere açıkken gece yarısı geçtiyse "bugün" tazelenir; true: gün değişti */
  const refreshToday = () => {
    const fresh = istanbulToday();
    if (fresh === today) return false;
    setToday(fresh);
    return true;
  };

  // ── Adımlar ──
  const switchMode = (next) => {
    if (busyRef.current || next === mode) return;
    setMode(next);
    setStep("compose");
    setAttempted(false);
    setIssue(null);
  };
  const goConfirm = (event) => {
    event?.preventDefault();
    if (step !== "compose" || busyRef.current) return;
    setAttempted(true);
    // Gün değiştiyse kupon (son gün, "bugün/yarın" metni) yeni güne göre yeniden hesaplanır; yönetici görüp yeniden onaylar
    if (refreshToday() && mode === "coupon") {
      toast(DAY_CHANGED);
      return;
    }
    if (blocked || !valid) {
      requestAnimationFrame(() => dialogRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setIssue(null);
    setQuietOk(false);
    setStep("confirm");
  };

  const submit = async ({ confirmDuplicate = false } = {}) => {
    if (busyRef.current || blocked || !valid) return;
    if (needsQuietOk && !quietOk) return;
    // Kontrol adımı gece yarısından önce açıldıysa gösterilen son gün ve bildirimdeki "yarın" artık yanlıştır
    // (ör. "Yarın 23:59'a kadar" yazıp bugün biten kupon): yeni güne göre yeniden kontrol ettirilir
    if (mode === "coupon" && refreshToday()) {
      setStep("compose");
      setIssue(null);
      toast(DAY_CHANGED);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const confirmQuietHours = needsQuietOk && quietOk;
      const request = mode === "push"
        ? axios.post("/customer-actions/push", {
          target, title: pushTitle, body: pushBody, route: pushForm.route, confirmDuplicate, confirmQuietHours,
        })
        : axios.post("/customer-actions/coupons", {
          target,
          coupon: {
            discountType: coupon.discountType,
            value: coupon.value,
            ...(coupon.maximumDiscount ? { maximumDiscount: coupon.maximumDiscount } : {}),
            minimumOrderAmount: coupon.minimumOrderAmount,
            expiresOn: coupon.expiresOn,
          },
          notify,
          ...(notify ? { message: { title: couponTitle, body: couponBody }, route: couponForm.route } : {}),
          confirmQuietHours,
        });
      const { data: response } = await request;
      setResult(response);
      setStep("done");
      if (mode === "coupon" && !response.created) toast(response.message || "Yeni kupon oluşturulmadı");
      else toast.success(response.message || (mode === "push" ? "Bildirim gönderildi" : "Kuponlar oluşturuldu"));
    } catch (error) {
      const body = error?.response?.data || {};
      setIssue({
        ...body,
        code: body.code || "error",
        message: body.message || "İşlem tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.",
      });
      if (body.code === "quiet_hours") {
        setServerQuiet(body.quietHours || { active: true });
        setQuietOk(false);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // ── Görünüm ──
  const isPush = mode === "push";
  const routeKey = isPush ? pushForm.route : couponForm.route;
  const cost = !isPush && couponRead.ok ? worstCase(coupon, total) : null;
  // "Bugün" biten kuponun kullanılabileceği süre (gece geç saatte verilen kupon birkaç dakikada bitmesin diye uyarılır)
  const minutesLeft = !isPush && coupon.daysLeft === 0 ? minutesLeftToday() : Number.POSITIVE_INFINITY;
  const shortExpiry = minutesLeft < SHORT_EXPIRY_MINUTES;
  const sendLabel = isPush
    ? (reachable ? `${num(reachable)} kişiye gönder` : "Gönder")
    : `${num(total)} kupon oluştur`;
  const HeadIcon = isPush ? Bell : Ticket;
  const setPush = (patch) => setPushForm((current) => ({ ...current, ...patch }));
  const setCoupon = (patch) => setCouponForm((current) => ({ ...current, ...patch }));
  const editMessage = (patch) => setCouponForm((current) => ({
    ...current,
    // İlk dokunuşta o anki varsayılan metin düzenlenecek metne kopyalanır
    ...(current.edited ? {} : { title: defaults.title, body: defaults.body }),
    edited: true,
    ...patch,
  }));
  const fieldProps = (key, describedBy) => ({
    "aria-invalid": showError(key) ? "true" : undefined,
    "aria-describedby": showError(key) ? `${fieldId}-${key}-error` : describedBy,
  });

  const quietBox = needsQuietOk && step === "confirm" && (
    <div className="ui-banner ui-banner--warn ca-banner" role="status">
      <Moon />
      <div className="ui-grow ca-banner-text">
        <strong>Şu an sessiz saatler</strong>
        <span>Otomatik bildirimler yalnızca {quietWindow?.start || "10:00"}–{quietWindow?.end || "21:30"} arasında gider. Müşteriler bu saatte bildirimden rahatsız olabilir.</span>
        <label className="ui-check ca-check">
          <input type="checkbox" checked={quietOk} onChange={(event) => setQuietOk(event.target.checked)} />
          Yine de şimdi göndermek istiyorum
        </label>
      </div>
    </div>
  );

  const issueBox = issue && issue.code !== "quiet_hours" && (
    issue.code === "duplicate" ? (
      <div className="ui-banner ui-banner--warn ca-banner" role="alert">
        <AlertTriangle />
        <div className="ui-grow ca-banner-text">
          <strong>Bu bildirim az önce gönderildi</strong>
          <span>{issue.message}</span>
        </div>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => submit({ confirmDuplicate: true })} disabled={busy}><Send />Yine de gönder</button>
      </div>
    ) : (
      <div className={`ui-banner ${issue.code === "in_progress" ? "ui-banner--info" : "ui-banner--danger"} ca-banner`} role="alert">
        {issue.code === "in_progress" ? <Clock /> : <AlertTriangle />}
        <div className="ui-grow ca-banner-text">
          <strong>{issue.code === "in_progress" ? "İşlem sürüyor" : isPush ? "Bildirim gönderilemedi" : "Kupon verilemedi"}</strong>
          <span>{issue.message}</span>
        </div>
      </div>
    )
  );

  return (
    <div
      className="ui-modal-backdrop ca-backdrop"
      onMouseDown={(event) => {
        // Pencereyi açan düğmeye çift tıklamanın ikincisi arka plana düşüp pencereyi hemen kapatmasın
        if (event.target !== event.currentTarget || event.detail > 1 || Date.now() - openedAtRef.current < STEP_GUARD_MS) return;
        requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ui-modal ui-modal--wide ca-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <div className="ui-modal-header ca-head">
          <span className="ca-head-icon" aria-hidden="true"><HeadIcon /></span>
          <div className="ca-head-text">
            <h2 id={titleId}>{isPush ? "Bildirim gönder" : "Kupon ver"}</h2>
            {audienceLabel && <p className="ui-truncate" title={audienceLabel}>{audienceLabel}</p>}
          </div>
          <button type="button" className="ui-icon-btn ca-close" onClick={requestClose} disabled={busy} aria-label="Kapat"><X /></button>
        </div>

        {step === "done" && result ? (
          <div className="ui-modal-body ca-done">
            {isPush || result.created ? <CheckCircle2 className="ca-done-icon" aria-hidden="true" /> : <Ticket className="ca-done-icon" data-tone="muted" aria-hidden="true" />}
            <h3 ref={doneTitleRef} tabIndex={-1}>{isPush ? "Bildirim gönderildi" : result.created ? "Kuponlar oluşturuldu" : "Yeni kupon oluşturulmadı"}</h3>
            <p className="ui-muted">{result.message}</p>
            <dl className="ca-stats">
              {isPush ? (
                <>
                  <div><dt>Gönderildi</dt><dd className="ui-num">{num(result.sent)}</dd></div>
                  <div><dt>Cihaza ulaşmadı</dt><dd className="ui-num">{num(result.failed)}</dd></div>
                  <div><dt>Atlandı</dt><dd className="ui-num">{num(result.skipped)}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Kupon</dt><dd className="ui-num">{num(result.created)}</dd></div>
                  <div><dt>Bildirim giden</dt><dd className="ui-num">{result.notify ? num(result.pushed) : "—"}</dd></div>
                  <div><dt>Atlandı</dt><dd className="ui-num">{num(result.skipped)}</dd></div>
                </>
              )}
            </dl>
            {!isPush && result.pushProblem && (
              <div className="ui-banner ui-banner--warn ca-banner" role="status">
                <AlertTriangle />
                <span className="ui-grow">Kuponlar müşterilerin cüzdanında; bildirim gitmedi. {result.pushProblem}</span>
              </div>
            )}
            {!isPush && result.code && (
              <p className="ca-code">Kupon kodu: <strong className="ui-mono">{result.code}</strong></p>
            )}
            {!isPush && result.created > 0 && (
              <p className="ui-hint">Kuponlar müşterinin uygulamadaki kuponlarında görünür; yalnızca sahibi, bir kez kullanabilir. Kuponlar ekranında “Kişiye özel” olarak listelenir.</p>
            )}
          </div>
        ) : (
          <form id={`${fieldId}-form`} className="ui-modal-body ca-body" onSubmit={goConfirm} noValidate>
            <div className="ca-main">
              <div className="ca-modes">
                <Segmented ariaLabel="Eylem türü" value={mode} onChange={switchMode} options={MODES} />
              </div>
              <AudienceSummary state={preview} mode={mode} notify={notify} onRetry={loadPreview} isFilter={isFilter} />
              {data && !pushConfigured && (
                <div className="ui-banner ui-banner--warn ca-banner" role="status">
                  <AlertTriangle />
                  <span className="ui-grow">{isPush ? "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik); bildirim gönderilemez." : "Bildirim servisi yapılandırılmamış; kupon bildirimsiz verilir."}</span>
                </div>
              )}
              {data && pushConfigured && needsQuietOk && step === "compose" && (
                <p className="ca-quiet-note"><Moon aria-hidden="true" />Şu an sessiz saatler (otomatik bildirimler {quietWindow?.start || "10:00"}–{quietWindow?.end || "21:30"} arasında gider). Göndermeden önce onayınız istenecek.</p>
              )}
              {data && pushConfigured && isPush && total > 0 && !reachable && (
                <div className="ui-banner ui-banner--warn ca-banner" role="status">
                  <AlertTriangle />
                  <span className="ui-grow">Bu kişilerin hiçbirine bildirim ulaşmıyor (bildirimleri kapalı ya da uygulamayı bildirim destekli sürümde açmamışlar). Kupon verebilirsiniz; kupon uygulamadaki kuponlarında görünür.</span>
                  <button type="button" className="ui-btn ui-btn--sm" onClick={() => switchMode("coupon")}><Ticket />Kupon ver</button>
                </div>
              )}

              {step === "compose" ? (
                isPush ? (
                  <div className="ca-fields">
                    <div className="ca-field">
                      <div className="ca-field-head">
                        <label className="ui-label" htmlFor={`${fieldId}-title`}>Başlık</label>
                        <Counter value={pushForm.title.trim().length} limit={limits.title} />
                      </div>
                      <input id={`${fieldId}-title`} ref={firstFieldRef} className="ui-field ca-title-field" value={pushForm.title} maxLength={limits.title}
                        placeholder="Bir şey mi unuttun? 🛒" autoComplete="off" onChange={(event) => setPush({ title: event.target.value })} {...fieldProps("title")} />
                      <FieldError id={`${fieldId}-title-error`}>{showError("title")}</FieldError>
                    </div>
                    <div className="ca-field">
                      <div className="ca-field-head">
                        <label className="ui-label" htmlFor={`${fieldId}-body`}>Mesaj</label>
                        <Counter value={pushForm.body.trim().length} limit={limits.body} />
                      </div>
                      <textarea id={`${fieldId}-body`} className="ui-field" rows={3} value={pushForm.body} maxLength={limits.body}
                        placeholder="Eksiklerini şimdi sepete ekle, kapına getirelim." onChange={(event) => setPush({ body: event.target.value })} {...fieldProps("body", `${fieldId}-tone`)} />
                      <FieldError id={`${fieldId}-body-error`}>{showError("body")}</FieldError>
                      <p id={`${fieldId}-tone`} className="ui-hint">Müşteriye “sen” diye hitap edin; kısa ve net yazın.</p>
                    </div>
                    <div className="ca-field">
                      <label className="ui-label" htmlFor={`${fieldId}-route`}>Dokununca açılacak ekran</label>
                      <select id={`${fieldId}-route`} className="ui-field" value={pushForm.route} onChange={(event) => setPush({ route: event.target.value })}>
                        {ROUTES.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="ca-fields">
                    <div className="ca-field">
                      <span className="ui-label" id={`${fieldId}-type`}>İndirim</span>
                      <div className="ca-type-row">
                        <Segmented ariaLabel="İndirim türü" value={couponForm.discountType}
                          onChange={(discountType) => {
                            if (discountType === couponForm.discountType) return;
                            // Yüzde ve tutar değerleri birbirine çevrilemez: türe uygun bir başlangıç değeri yazılır
                            setCoupon({ discountType, value: String(VALUE_PICKS[discountType][discountType === "fixed" ? 1 : 0]) });
                          }}
                          options={[{ value: "percentage", label: "Yüzde (%)" }, { value: "fixed", label: "Tutar (₺)" }]} />
                        <div className="ca-amount">
                          <span aria-hidden="true">{couponForm.discountType === "fixed" ? "₺" : "%"}</span>
                          <input ref={firstFieldRef} className="ui-field" inputMode={couponForm.discountType === "fixed" ? "decimal" : "numeric"} value={couponForm.value}
                            aria-label={couponForm.discountType === "fixed" ? "İndirim tutarı (TL)" : "İndirim yüzdesi"} autoComplete="off"
                            onChange={(event) => setCoupon({ value: event.target.value })} {...fieldProps("value")} />
                        </div>
                      </div>
                      <div className="ca-chips" role="group" aria-label="Hızlı seçim">
                        {VALUE_PICKS[couponForm.discountType].map((value) => (
                          <button key={value} type="button" className="ca-chip" aria-pressed={parseAmount(couponForm.value) === value} onClick={() => setCoupon({ value: String(value) })}>
                            {couponForm.discountType === "fixed" ? `₺${value}` : `%${value}`}
                          </button>
                        ))}
                      </div>
                      <FieldError id={`${fieldId}-value-error`}>{showError("value")}</FieldError>
                    </div>
                    <div className="ca-row2">
                      {couponForm.discountType === "percentage" && (
                        <div className="ca-field">
                          <label className="ui-label" htmlFor={`${fieldId}-max`}>En fazla indirim (₺)</label>
                          <input id={`${fieldId}-max`} className="ui-field" inputMode="decimal" value={couponForm.maximumDiscount} placeholder="Sınırsız" autoComplete="off"
                            onChange={(event) => setCoupon({ maximumDiscount: event.target.value })} {...fieldProps("maximumDiscount")} />
                          <FieldError id={`${fieldId}-maximumDiscount-error`}>{showError("maximumDiscount")}</FieldError>
                        </div>
                      )}
                      <div className="ca-field">
                        <label className="ui-label" htmlFor={`${fieldId}-min`}>Alt sepet tutarı (₺)</label>
                        <input id={`${fieldId}-min`} className="ui-field" inputMode="decimal" value={couponForm.minimumOrderAmount} placeholder="Yok" autoComplete="off"
                          onChange={(event) => setCoupon({ minimumOrderAmount: event.target.value })} {...fieldProps("minimumOrderAmount")} />
                        <FieldError id={`${fieldId}-minimumOrderAmount-error`}>{showError("minimumOrderAmount")}</FieldError>
                      </div>
                    </div>
                    <div className="ca-field">
                      <span className="ui-label">Son kullanma</span>
                      <div className="ca-chips" role="group" aria-label="Son kullanma günü">
                        {EXPIRY_PICKS.map((pick) => (
                          <button key={pick.days} type="button" className="ca-chip"
                            aria-pressed={couponForm.expiry.kind === "days" && couponForm.expiry.days === pick.days}
                            onClick={() => setCoupon({ expiry: { kind: "days", days: pick.days, date: "" } })}>
                            {pick.label}
                          </button>
                        ))}
                        <label className="ca-date" data-active={couponForm.expiry.kind === "date" || undefined}>
                          <input type="date" className="ui-field" min={today} max={addDays(today, MAX_EXPIRY_DAYS)}
                            value={couponForm.expiry.kind === "date" ? couponForm.expiry.date : ""}
                            onChange={(event) => setCoupon({ expiry: event.target.value ? { kind: "date", days: 0, date: event.target.value } : { ...INITIAL_COUPON.expiry } })}
                            aria-label="Son kullanma tarihi seç" {...fieldProps("expiry")} />
                        </label>
                      </div>
                      {isDayKey(coupon.expiresOn) && !errors.expiry && (
                        <p className="ui-hint">Son gün: <strong>{longDay(coupon.expiresOn)} 23:59</strong> (İstanbul saati)</p>
                      )}
                      {shortExpiry && !errors.expiry && (
                        <p className="ca-expiry-note" role="status">
                          <Clock aria-hidden="true" />
                          Kupon bu gece 23:59&apos;da biter ({durationText(minutesLeft)} kaldı). Daha uzun süre için “Yarın”ı seçin.
                        </p>
                      )}
                      <FieldError id={`${fieldId}-expiry-error`}>{showError("expiry")}</FieldError>
                    </div>
                    {couponRead.ok && (
                      cost ? (
                        <p className="ca-cost"><Ticket aria-hidden="true" />En kötü durumda {num(cost.count)} × {money(cost.each)} = <strong>{money(cost.total)}</strong>{coupon.discountType === "percentage" ? " (kupon başına en fazla indirimle)" : ""}</p>
                      ) : coupon.discountType === "percentage" && (
                        <p className="ca-cost" data-tone="warn"><AlertTriangle aria-hidden="true" />Üst sınır yok: indirim sepet büyüdükçe artar. Maliyeti sınırlamak için “En fazla indirim” girin.</p>
                      )
                    )}
                    <div className="ca-notify">
                      <label className="ui-check ca-notify-toggle">
                        <input type="checkbox" checked={notify} disabled={!pushConfigured} onChange={(event) => setCoupon({ notify: event.target.checked })} />
                        <span>Müşteriye bildirim gönder{data ? <span className="ui-muted"> · {reachable ? `${num(reachable)} kişiye ulaşabilir` : "kimseye ulaşmaz"}</span> : null}</span>
                      </label>
                      {notify && (
                        <div className="ca-fields ca-fields--inner">
                          <div className="ca-field">
                            <div className="ca-field-head">
                              <label className="ui-label" htmlFor={`${fieldId}-ctitle`}>Bildirim başlığı</label>
                              <Counter value={couponTitle.length} limit={limits.title} />
                            </div>
                            <input id={`${fieldId}-ctitle`} className="ui-field" value={couponForm.edited ? couponForm.title : defaults.title} maxLength={limits.title} autoComplete="off"
                              onChange={(event) => editMessage({ title: event.target.value })} {...fieldProps("title")} />
                            <FieldError id={`${fieldId}-title-error`}>{showError("title")}</FieldError>
                          </div>
                          <div className="ca-field">
                            <div className="ca-field-head">
                              <label className="ui-label" htmlFor={`${fieldId}-cbody`}>Bildirim mesajı</label>
                              <Counter value={couponBody.length} limit={limits.body} />
                            </div>
                            <textarea id={`${fieldId}-cbody`} className="ui-field" rows={3} value={couponForm.edited ? couponForm.body : defaults.body} maxLength={limits.body}
                              onChange={(event) => editMessage({ body: event.target.value })} {...fieldProps("body")} />
                            <FieldError id={`${fieldId}-body-error`}>{showError("body")}</FieldError>
                            {couponForm.edited && (
                              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ca-reset" onClick={() => setCoupon({ edited: false, title: "", body: "" })}>
                                <RotateCcw />Kupona göre yeniden yaz
                              </button>
                            )}
                          </div>
                          <div className="ca-field">
                            <label className="ui-label" htmlFor={`${fieldId}-croute`}>Dokununca açılacak ekran</label>
                            <select id={`${fieldId}-croute`} className="ui-field" value={couponForm.route} onChange={(event) => setCoupon({ route: event.target.value })}>
                              {ROUTES.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="ca-confirm">
                  <h3 ref={confirmTitleRef} tabIndex={-1} className="ca-confirm-title">Göndermeden önce kontrol edin</h3>
                  <dl className="ca-kv">
                    <div><dt>Kime</dt><dd>{total === 1 && data?.sample?.[0] ? (data.sample[0].name || "İsimsiz müşteri") : `${isFilter ? "Süzgece uyan" : "Seçili"} ${num(total)} kişi`}{data?.capped ? ` (süzgece ${num(data.matched)} kişi uyuyor)` : ""}</dd></div>
                    {isPush ? (
                      <>
                        <div><dt>Bildirim gidecek</dt><dd><strong className="ui-num">{num(reachable)}</strong> kişi</dd></div>
                        {total > reachable && <div><dt>Ulaşmayacak</dt><dd>{num(total - reachable)} kişi (bildirimi kapalı ya da uygulaması yok)</dd></div>}
                        <div><dt>Açılacak ekran</dt><dd>{ROUTE_LABELS[routeKey]}</dd></div>
                      </>
                    ) : (
                      <>
                        <div><dt>Kupon</dt><dd>{valueText(coupon)} indirim{capText(coupon)} · kişi başına 1 adet, tek kullanımlık</dd></div>
                        <div><dt>Alt sepet</dt><dd>{coupon.minimumOrderAmount > 0 ? money(coupon.minimumOrderAmount) : "Yok"}</dd></div>
                        <div><dt>Son gün</dt><dd>{longDay(coupon.expiresOn)} 23:59{shortExpiry ? ` · ${durationText(minutesLeft)} kaldı` : ""}</dd></div>
                        <div><dt>En kötü durumda</dt><dd>{cost ? <strong>{money(cost.total)}</strong> : "Üst sınır yok"}</dd></div>
                        <div><dt>Bildirim</dt><dd>{notify ? (reachable ? `${num(reachable)} kişiye “${couponTitle}”` : "Kimseye ulaşmaz") : "Gönderilmeyecek"}</dd></div>
                      </>
                    )}
                  </dl>
                  <p className="ui-hint">{isPush ? "Gönderilen bildirim geri alınamaz. Aynı bildirim 10 dakika içinde aynı kişilere ikinci kez gidecekse önce onayınız istenir." : "Kuponlar hemen müşterilerin uygulamadaki kuponlarına düşer. Aynı kupon 10 dakika içinde aynı kişiye ikinci kez verilmez."}</p>
                  {quietBox}
                  {issueBox}
                </div>
              )}
            </div>

            <aside className="ca-side" aria-label="Önizleme">
              {willPush ? (
                <PhonePreview title={message.title} body={message.body} routeLabel={ROUTE_LABELS[routeKey]} />
              ) : (
                <p className="ca-side-note"><Bell aria-hidden="true" />Bildirim gönderilmeyecek; kupon müşterinin uygulamadaki kuponlarında görünür.</p>
              )}
              {!isPush && <CouponPreview coupon={coupon} valid={couponRead.ok} />}
            </aside>
          </form>
        )}

        {/* Her adımın düğmeleri ayrı anahtarla yeniden kurulur: "Devam" düğmesi yerinde "Gönder"e dönüşüp odağı ve
            tıklamayı taşımasın. Yeni adımdaki düğmeler adım değişir değişmez gelen tıklamayı (çift tıklama) yok sayar. */}
        <div className="ui-modal-footer ca-foot">
          {step === "done" ? (
            <button key="done" type="button" className="ui-btn ui-btn--primary" onClick={() => onClose?.()}>Kapat</button>
          ) : step === "confirm" ? (
            <Fragment key="confirm">
              <button type="button" className="ui-btn" onClick={() => { setStep("compose"); setIssue(null); }} disabled={busy}><ArrowLeft />Düzenle</button>
              <span className="ui-grow" />
              <button type="button" className="ui-btn ui-btn--primary" onClick={(event) => { if (deliberate(event)) submit(); }}
                disabled={busy || blocked || !valid || (needsQuietOk && !quietOk)}>
                {isPush ? <Send /> : <Ticket />}{busy ? (isPush ? "Gönderiliyor…" : "Oluşturuluyor…") : sendLabel}
              </button>
            </Fragment>
          ) : (
            <Fragment key="compose">
              <button type="button" className="ui-btn" onClick={(event) => { if (deliberate(event)) requestClose(); }}>Vazgeç</button>
              <span className="ui-grow" />
              <button type="submit" form={`${fieldId}-form`} className="ui-btn ui-btn--primary" disabled={preview.status !== "ready" || blocked}>
                Devam
              </button>
            </Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
