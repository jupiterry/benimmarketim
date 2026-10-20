/* eslint-disable react-refresh/only-export-components */
// Müşteriler ekranının ortak yardımcıları ve küçük parçaları (segment kuralları, etiketler, avatar).
import { Crown, Monitor, Smartphone, Tablet } from "lucide-react";
import { avatarTone, initials, lastSeenAt, registeredAt } from "../../lib/customers";

export const DAY = 86400000;
export const ACTIVE_DAYS = 30; // bu kadar gün içinde görüldüyse "aktif"
export const NEW_DAYS = 7; // bu kadar gün içinde kayıt olduysa "yeni"
export const LOYAL_ORDERS = 5; // bu kadar ve üstü sipariş "sadık"
export const PAGE_SIZE = 50;

export { avatarTone, initials, lastSeenAt, registeredAt };

const ms = (date) => (date ? new Date(date).getTime() : 0);

export const isAdmin = (user) => user?.role === "admin";
export const isNew = (user, now) => now - ms(registeredAt(user)) < NEW_DAYS * DAY;
export const isActive = (user, now) => now - ms(lastSeenAt(user)) < ACTIVE_DAYS * DAY;
/** 30+ gündür hiç görülmedi (yeni kayıtlar risk sayılmaz) */
export const isAtRisk = (user, now) => !isActive(user, now) && !isNew(user, now);
export const registeredToday = (user, now) => {
  const at = registeredAt(user);
  if (!at) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return at.getTime() >= start.getTime();
};

/** Sipariş özeti (best-customers uç noktasından): { orderCount, totalSpent, avgOrderValue } */
export const orderInfoOf = (orderMap, user) => orderMap?.get?.(String(user?._id)) || null;
export const hasOrders = (orderMap, user) => (orderInfoOf(orderMap, user)?.orderCount || 0) > 0;
export const isLoyal = (orderMap, user) => (orderInfoOf(orderMap, user)?.orderCount || 0) >= LOYAL_ORDERS;

/** Liste süzgeçleri; `orderMap` yüklenmeden "Sipariş yok" süzgeci boş döner */
export const SEGMENTS = [
  { id: "all", label: "Tümü", test: () => true },
  { id: "active", label: "Aktif", hint: `Son ${ACTIVE_DAYS} günde görüldü`, test: (u, now) => !isAdmin(u) && isActive(u, now) },
  { id: "risk", label: "Risk altında", hint: `${ACTIVE_DAYS}+ gündür sessiz`, test: (u, now) => !isAdmin(u) && isAtRisk(u, now) },
  { id: "new", label: "Yeni", hint: `Son ${NEW_DAYS} günde kayıt oldu`, test: (u, now) => !isAdmin(u) && isNew(u, now) },
  { id: "admin", label: "Yönetici", test: (u) => isAdmin(u) },
  { id: "noOrders", label: "Sipariş yok", hint: "Hiç sipariş vermedi", test: (u, now, orderMap) => !isAdmin(u) && Boolean(orderMap) && !hasOrders(orderMap, u) },
];

/** Satır ve çekmecedeki etiketler */
export const customerTags = (user, orderMap, now) => {
  const tags = [];
  if (isAdmin(user)) {
    tags.push({ id: "admin", label: "Admin", tone: "brand", icon: Crown });
    return tags;
  }
  if (isNew(user, now)) tags.push({ id: "new", label: "Yeni", tone: "info" });
  if (isLoyal(orderMap, user)) tags.push({ id: "loyal", label: "Sadık", tone: "ok" });
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

export const Avatar = ({ name, size }) => (
  <span className={`ui-avatar cus-avatar${size === "lg" ? " cus-avatar--lg" : ""}`} data-tone={avatarTone(name)} aria-hidden="true">
    {initials(name)}
  </span>
);

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
  { id: "now", label: "Şu an uygulamada", tone: "ok", test: (u, since, now) => isInAppNow(u, now) },
  { id: "opened", label: "Uygulamayı açtı", test: (u, since) => appStage(u, since) >= 1 },
  { id: "checkout", label: "Sepet / sipariş ekranı", test: (u, since) => appStage(u, since) >= 2 },
  { id: "ordered", label: "Sipariş verdi", test: (u, since) => appStage(u, since) === 3 },
  { id: "noOrder", label: "Açtı, sipariş vermedi", tone: "warn", test: (u, since) => [1, 2].includes(appStage(u, since)) },
  { id: "notOpened", label: "Hiç açmadı", test: (u, since) => appStage(u, since) === 0 },
];

/** WhatsApp bağlantısı (0'la başlayan numaralara ülke kodu eklenir) */
export const whatsappLink = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("0") ? `9${digits}` : digits}`;
};
export const phoneDigits = (phone) => String(phone || "").replace(/\D/g, "");
