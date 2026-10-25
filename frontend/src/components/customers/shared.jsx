/* eslint-disable react-refresh/only-export-components */
// Müşteriler ekranının ortak yardımcıları ve küçük parçaları (segment adları, etiketler, avatar, gün anahtarları).
import { useState } from "react";
import { Crown, Monitor, Smartphone, Tablet } from "lucide-react";
import { avatarTone, initials, lastSeenAt, registeredAt } from "../../lib/customers";

export const DAY = 86400000;
export const ACTIVE_DAYS = 30; // bu kadar gün içinde görüldüyse "aktif"
export const NEW_DAYS = 7; // bu kadar gün içinde kayıt olduysa "yeni"
export const LOYAL_ORDERS = 5; // bu kadar ve üstü sipariş "sadık"
export const PAGE_SIZES = [25, 50, 100]; // sunucu sayfası (GET /users?limit=, en fazla 100)

export { avatarTone, initials, lastSeenAt, registeredAt };

const ms = (date) => (date ? new Date(date).getTime() : 0);

export const isAdmin = (user) => user?.role === "admin";
export const isNew = (user, now) => now - ms(registeredAt(user)) < NEW_DAYS * DAY;
export const isActive = (user, now) => now - ms(lastSeenAt(user)) < ACTIVE_DAYS * DAY;
/** 30+ gündür hiç görülmedi (yeni kayıtlar risk sayılmaz) */
export const isAtRisk = (user, now) => !isActive(user, now) && !isNew(user, now);
/** Yerel gün başı (sunucuya "bugün kayıt olan" ve grafik için gönderilir) */
export const startOfLocalDay = (now) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
};
const pad2 = (n) => String(n).padStart(2, "0");
/** Yerel tarih anahtarı "2026-10-25" (sunucudaki $dateToString biçimiyle aynı) */
export const localDayKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
/** Son `days` günün kayıt sayıları (en eski → en yeni); `rows` GET /users/stats → registrations.days */
export const registrationSeriesFrom = (rows, days, now) => {
  const counts = new Map((rows || []).map((row) => [row.day, Number(row.count) || 0]));
  const today = startOfLocalDay(now);
  return Array.from({ length: days }, (_, index) => {
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1 - index));
    return { start: start.getTime(), count: counts.get(localDayKey(start)) || 0 };
  });
};
/** Tarayıcının saat dilimi (grafik günleri sunucuda bu dilime göre gruplanır) */
export const browserTimeZone = () => {
  try {
    return window.Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul";
  } catch {
    return "Europe/Istanbul";
  }
};

/** Sipariş özeti: liste satırında sunucudan gelir (GET /users → orderCount, totalSpent, avgOrderValue); iptaller hariç */
export const orderInfoOf = (user) => {
  const orderCount = Number(user?.orderCount) || 0;
  if (!orderCount) return null;
  return { orderCount, totalSpent: Number(user.totalSpent) || 0, avgOrderValue: Number(user.avgOrderValue) || 0 };
};
export const hasOrders = (user) => (Number(user?.orderCount) || 0) > 0;
export const isLoyal = (user) => (Number(user?.orderCount) || 0) >= LOYAL_ORDERS;

/** Liste süzgeçleri; kurallar sunucuda (GET /users?segment=…), sayılar GET /users/stats'tan gelir */
export const SEGMENTS = [
  { id: "all", label: "Tümü" },
  { id: "active", label: "Aktif", hint: `Son ${ACTIVE_DAYS} günde görüldü` },
  { id: "risk", label: "Risk altında", hint: `${ACTIVE_DAYS}+ gündür sessiz` },
  { id: "new", label: "Yeni", hint: `Son ${NEW_DAYS} günde kayıt oldu` },
  { id: "admin", label: "Yönetici" },
  { id: "noOrders", label: "Sipariş yok", hint: "Hiç sipariş vermedi" },
];

/** Satır ve çekmecedeki etiketler */
export const customerTags = (user, now) => {
  const tags = [];
  if (isAdmin(user)) {
    tags.push({ id: "admin", label: "Admin", tone: "brand", icon: Crown });
    return tags;
  }
  if (isNew(user, now)) tags.push({ id: "new", label: "Yeni", tone: "info" });
  if (isLoyal(user)) tags.push({ id: "loyal", label: "Sadık", tone: "ok" });
  if (isAtRisk(user, now)) tags.push({ id: "risk", label: "Risk altında", tone: "warn" });
  return tags;
};

export const TagBadges = ({ tags, max = 2 }) => (
  <>
    {tags.slice(0, max).map((tag) => (
      <span key={tag.id} className={`ui-badge ui-badge--${tag.tone}`} title={tag.hint}>
        {tag.icon && <tag.icon aria-hidden="true" />}
        {tag.label}
      </span>
    ))}
  </>
);

/** Müşteri avatarı: profil fotoğrafı varsa o, yoksa (ya da yüklenemezse) baş harfler. */
export const Avatar = ({ name, src, size }) => {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <span className={`ui-avatar cus-avatar${size === "lg" ? " cus-avatar--lg" : ""}`} data-tone={showImage ? undefined : avatarTone(name)} aria-hidden="true">
      {showImage ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
};

// ── Cihaz ────────────────────────────────────────────────────────────
const DEVICE = { desktop: ["Bilgisayar", Monitor], mobile: ["Telefon", Smartphone], tablet: ["Tablet", Tablet] };
export const deviceLabel = (type) => DEVICE[type]?.[0] || "Bilinmiyor";
export const DeviceIcon = ({ type, ...rest }) => {
  const Icon = DEVICE[type]?.[1] || Monitor;
  return <Icon aria-hidden="true" {...rest} />;
};
export const platformLabel = (platform) => ({ android: "Android", ios: "iOS", web: "Web" }[platform] || null);

// ── Sipariş durumu ───────────────────────────────────────────────────
export const orderStatusTone = (status) =>
  status === "Teslim Edildi" ? "ok" : status === "İptal Edildi" ? "danger" : status === "Yolda" ? "info" : "warn";

// ── Mobil uygulama takibi ────────────────────────────────────────────
// Veriler backend/services/appActivity.service.js tarafından doldurulur.
export const APP_PERIODS = [
  { value: "today", label: "Bugün" },
  { value: "week", label: "7 gün" },
  { value: "month", label: "30 gün" },
];
// Sunucu uygulamanın kapandığını göremez; son istekten bu kadar sonra "uygulamada" sayılmaz.
export const APP_ONLINE_MS = 2 * 60 * 1000;
export const appPeriodStart = (period, now) => {
  if (period === "today") return new Date(now).setHours(0, 0, 0, 0);
  return now - (period === "week" ? 7 : 30) * DAY;
};
// 0: dönemde açmadı · 1: açtı · 2: sepet / sipariş ekranına girdi · 3: sipariş verdi
export const appStage = (user, since) => {
  const activity = user.appActivity;
  if (!activity || ms(activity.lastSeenAt) < since) return 0;
  if (ms(activity.orderAt) >= since) return 3;
  if (ms(activity.checkoutAt) >= since) return 2;
  return 1;
};
export const isInAppNow = (user, now) => now - ms(user.appActivity?.lastSeenAt) < APP_ONLINE_MS;
export const APP_STAGE_BADGES = {
  1: { label: "Açtı, baktı", tone: "info" },
  2: { label: "Siparişe geldi, vermedi", tone: "warn" },
  3: { label: "Sipariş verdi", tone: "ok" },
};
export const APP_FILTERS = [
  { id: "now", label: "Şu an uygulamada", tone: "ok" },
  { id: "opened", label: "Uygulamayı açtı" },
  { id: "checkout", label: "Sepet / sipariş ekranı" },
  { id: "ordered", label: "Sipariş verdi" },
  { id: "noOrder", label: "Açtı, sipariş vermedi", tone: "warn" },
  { id: "notOpened", label: "Hiç açmadı" },
];

/** WhatsApp bağlantısı (0'la başlayan numaralara ülke kodu eklenir) */
export const whatsappLink = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("0") ? `9${digits}` : digits}`;
};
export const phoneDigits = (phone) => String(phone || "").replace(/\D/g, "");
