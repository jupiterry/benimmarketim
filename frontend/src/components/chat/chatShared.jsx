/* eslint-disable react-refresh/only-export-components */
// Mesajlar ve Bekleyen destekler ekranlarının ortak parçaları: sohbet modu etiketleri,
// öncelik etiketleri, avatar, tarih ayracı metni ve varsayılan hızlı cevaplar.
import { Bot, Headphones, Hourglass, Lock } from "lucide-react";
import { formatDate, initials } from "../admin/ui";

/** Sohbet modu → rozet metni/tonu. Backend: AI | WAITING_FOR_AGENT | HUMAN | CLOSED */
export const CHAT_MODES = {
  AI: { label: "Yapay zekâ devrede", short: "Yapay zekâ", badge: "ui-badge--info", icon: Bot },
  WAITING_FOR_AGENT: { label: "Temsilci bekliyor", short: "Bekliyor", badge: "ui-badge--warn", icon: Hourglass },
  HUMAN: { label: "İnsana aktarıldı", short: "İnsan", badge: "ui-badge--ok", icon: Headphones },
  CLOSED: { label: "Kapalı", short: "Kapalı", badge: "", icon: Lock },
};
export const modeOf = (chat) => CHAT_MODES[chat?.status === "closed" ? "CLOSED" : chat?.mode] || CHAT_MODES.AI;

/** Destek talebi önceliği → etiket ve ton */
export const PRIORITIES = {
  urgent: { label: "Acil", badge: "ui-badge--danger", rank: 3 },
  high: { label: "Yüksek", badge: "ui-badge--danger", rank: 2 },
  normal: { label: "Normal", badge: "ui-badge--warn", rank: 1 },
  low: { label: "Düşük", badge: "", rank: 0 },
};
export const priorityOf = (value) => PRIORITIES[value] || PRIORITIES.normal;

/** Destek talebi durumu */
export const REQUEST_STATUS = {
  waiting: { label: "Bekliyor", badge: "ui-badge--warn" },
  accepted: { label: "Üstlenildi", badge: "ui-badge--ok" },
  in_progress: { label: "Görüşülüyor", badge: "ui-badge--ok" },
  closed: { label: "Çözüldü", badge: "" },
};

/** 15 dakikadan uzun bekleyen talepler vurgulanır */
export const LATE_AFTER_MS = 15 * 60 * 1000;

export const DEFAULT_QUICK_REPLIES = [
  "Merhaba, size nasıl yardımcı olabilirim?",
  "Siparişiniz hazırlanıyor, kısa süre içinde yola çıkacak.",
  "Siparişiniz yola çıktı, kuryemiz birazdan sizde olacak.",
  "Siparişiniz teslim edildi. Afiyet olsun!",
  "Kontrol edip hemen dönüş yapıyorum.",
  "Yardımcı olabildiysem ne mutlu, iyi günler dilerim.",
];
export const QUICK_REPLIES_PREF = "chat.quickReplies";
export const MAX_MESSAGE_LENGTH = 2000;

/** Baş harfli yuvarlak avatar; müşteri uygulamadaysa yeşil nokta */
export const ChatAvatar = ({ name, online = false, size = "md" }) => (
  <span className={`cht-avatar ${size === "lg" ? "cht-avatar--lg" : ""}`}>
    <span className="ui-avatar" aria-hidden="true">{initials(name)}</span>
    {online && <span className="cht-online" title="Şu an uygulamada" />}
  </span>
);

/** Mesaj akışındaki gün ayracı: Bugün / Dün / 12 Eki / 12 Eki 2025 */
export const dayLabel = (value, now = new Date()) => {
  const d = new Date(value);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "Bugün";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Dün";
  return formatDate(value, d.getFullYear() === now.getFullYear() ? { weekday: "long" } : { year: "numeric" });
};
export const dayKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Bekleme süresi: "4 dk", "1 sa 12 dk", "2 gün" */
export const waitLabel = (since, now = Date.now()) => {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa ${minutes % 60} dk`;
  return `${Math.floor(hours / 24)} gün`;
};

/** Liste satırı zaman damgası: kısa biçim ("3 dk", "2 sa", "dün", "12 Eki") */
export const shortAgo = (value, now = Date.now()) => {
  if (!value) return "";
  const m = Math.round((now - new Date(value).getTime()) / 60000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m} dk`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa`;
  const d = Math.round(h / 24);
  if (d === 1) return "dün";
  if (d < 7) return `${d} gün`;
  return formatDate(value);
};

/** Son mesajı kim yazdı → önizleme öneki */
export const senderPrefix = (sender) => {
  if (sender === "admin") return "Siz: ";
  if (sender === "ai") return "YZ: ";
  return "";
};
