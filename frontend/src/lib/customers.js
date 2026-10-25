// Müşteriler ekranının yardımcıları (saf fonksiyonlar).

const DAY = 86400000;

// Kayıt zamanı: createdAt yoksa (çok eski hesaplar) MongoDB kimliğinin içindeki oluşturma zamanı
export const registeredAt = (user) => {
  if (user?.createdAt) return new Date(user.createdAt);
  const id = String(user?._id || "");
  if (/^[a-f0-9]{24}$/i.test(id)) return new Date(parseInt(id.slice(0, 8), 16) * 1000);
  return null;
};

// Son görülme: web etkinliği, giriş ve mobil uygulama içinden en yenisi
export const lastSeenAt = (user) => {
  const times = [user?.lastActive, user?.lastLoginAt, user?.appActivity?.lastSeenAt]
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter(Boolean);
  return times.length ? new Date(Math.max(...times)) : null;
};

export const startOfDay = (date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

/** "az önce", "5 dk önce", "3 sa önce", "dün", "4 gün önce", "2 ay önce", "1 yıl önce" */
export const relativeTime = (date, now = Date.now()) => {
  if (!date) return "";
  const time = new Date(date).getTime();
  const diff = Math.max(0, now - time);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
  if (days === 0) return `${hours} sa önce`;
  if (days === 1) return "dün";
  if (days < 30) return `${days} gün önce`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
};

// İsimden sabit bir avatar tonu (aynı kişi her yerde aynı renkte)
export const avatarTone = (name) => {
  let hash = 0;
  for (const char of String(name || "?")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 6;
};

export const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR"))
    .join("") || "?";

// CSV: Excel'in Türkçe karakterleri doğru açması için BOM ve ; ayırıcı, alanlar tırnaklı
export const toCsv = (rows) =>
  `\ufeff${rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n")}`;
