// Kuponlar ekranı için saf yardımcılar (veriyi değiştirmez, yalnız görünüm hesaplar).

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SOON_DAYS = 7;

export const DAY_LABELS = [
  ["Pzt", 1], ["Sal", 2], ["Çar", 3], ["Per", 4], ["Cum", 5], ["Cmt", 6], ["Paz", 0]
];
export const DELIVERY_LABELS = { girlsDorm: "Kız Yurdu", boysDorm: "Erkek Yurdu" };
export const CHANNEL_LABELS = { web: "Web", android: "Android", ios: "iOS" };

export const ORDER_STATUS = {
  Hazırlanıyor: { label: "Hazırlanıyor", tone: "info" },
  Yolda: { label: "Yolda", tone: "info" },
  "Teslim Edildi": { label: "Teslim edildi", tone: "ok" },
  "İptal Edildi": { label: "İptal edildi", tone: "danger" }
};

export const money = (value, digits = 0) =>
  `₺${Number(value || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;

export const compactMoney = (value) => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `₺${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mn`;
  if (Math.abs(n) >= 10_000) return `₺${(n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B`;
  return money(n);
};

export const formatDate = (value) => (value ? new Date(value).toLocaleDateString("tr-TR") : "-");

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
    : "-";

export const relativeDays = (value, now = Date.now()) => {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const days = Math.round((now - t) / DAY_MS);
  if (days <= 0) return "bugün";
  if (days === 1) return "dün";
  if (days < 30) return `${days} gün önce`;
  return formatDate(value);
};

const time = (value) => {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

export const isExpired = (c, now) => time(c.expirationDate) < now;
export const isLive = (c, now) => Boolean(c.isActive) && !isExpired(c, now);
export const isSoon = (c, now) => isLive(c, now) && time(c.expirationDate) - now <= SOON_DAYS * DAY_MS;
export const isLimitFull = (c) => Boolean(c.usageLimit) && (c.usageCount || 0) >= c.usageLimit;

export const daysLeft = (c, now) => Math.ceil((time(c.expirationDate) - now) / DAY_MS);

// Rozet durumu: sıra önemlidir.
export const getStatus = (c, now = Date.now()) => {
  if (isExpired(c, now)) return { key: "expired", label: "Süresi doldu", tone: "danger" };
  if (!c.isActive) return { key: "inactive", label: "Pasif", tone: "" };
  if (isLimitFull(c)) return { key: "limit", label: "Limit doldu", tone: "warn" };
  if (daysLeft(c, now) <= SOON_DAYS) return { key: "soon", label: "Yakında bitiyor", tone: "warn" };
  return { key: "active", label: "Aktif", tone: "ok" };
};

export const expiryText = (c, now = Date.now()) => {
  const d = daysLeft(c, now);
  if (isExpired(c, now)) return `${Math.max(1, Math.abs(d))} gün önce bitti`;
  if (d <= 0) return "Bugün bitiyor";
  if (d === 1) return "Yarın bitiyor";
  return `${d} gün kaldı`;
};

export const FILTERS = [
  { key: "all", label: "Tümü", match: () => true },
  { key: "active", label: "Aktif", tone: "ok", match: isLive },
  { key: "soon", label: "Yakında bitiyor", tone: "warn", match: isSoon },
  { key: "inactive", label: "Pasif", match: (c, now) => !c.isActive && !isExpired(c, now) },
  { key: "expired", label: "Süresi dolmuş", tone: "danger", match: isExpired }
];

export const TYPE_FILTERS = [
  { key: "all", label: "Tüm türler" },
  { key: "percentage", label: "Yüzde indirim" },
  { key: "fixed", label: "Sabit tutar" },
  { key: "referral", label: "Referans ödülü" },
  { key: "personal", label: "Kişiye özel" }
];

export const matchesType = (c, type) => {
  if (type === "percentage") return c.discountType === "percentage";
  if (type === "fixed") return c.discountType === "fixed";
  if (type === "referral") return Boolean(c.isReferralCoupon);
  if (type === "personal") return Boolean(c.userId) && !c.isReferralCoupon;
  return true;
};

export const SORTS = [
  { key: "newest", label: "En yeni" },
  { key: "usage", label: "En çok kullanılan" },
  { key: "revenue", label: "En çok gelir getiren" },
  { key: "expiring", label: "Bitişi en yakın" },
  { key: "code", label: "Koda göre (A–Z)" }
];

export const sortCoupons = (list, sort, campaignMap, now) => {
  const revenueOf = (c) => campaignMap.get(c.code)?.revenue || 0;
  const sorters = {
    newest: (a, b) => time(b.createdAt) - time(a.createdAt),
    usage: (a, b) => (b.usageCount || 0) - (a.usageCount || 0),
    revenue: (a, b) => revenueOf(b) - revenueOf(a),
    code: (a, b) => (a.code || "").localeCompare(b.code || "", "tr"),
    // Önce süresi dolmamışlar (yakından uzağa), sonra dolmuşlar (yeniden eskiye)
    expiring: (a, b) => {
      const ea = time(a.expirationDate);
      const eb = time(b.expirationDate);
      const pa = ea < now;
      const pb = eb < now;
      if (pa !== pb) return pa ? 1 : -1;
      return pa ? eb - ea : ea - eb;
    }
  };
  return [...list].sort(sorters[sort] || sorters.newest);
};

export const discountLabel = (c) =>
  c.discountType === "percentage" ? `%${c.discountPercentage || 0}` : money(c.discountAmount);

export const discountSub = (c) => {
  if (c.discountType !== "percentage") return "sabit indirim";
  return c.maximumDiscount ? `en fazla ${money(c.maximumDiscount)}` : "indirim";
};

export const couponKind = (c) => {
  if (c.isReferralCoupon) return "Referans ödülü";
  if (c.userId) return "Kişiye özel";
  return "Genel";
};

const dayList = (days = []) =>
  DAY_LABELS.filter(([, d]) => days.includes(d)).map(([l]) => l).join(", ");

// Kuponun kurallarını okunur cümleler halinde döndürür.
export const describeRules = (c) => {
  const rules = [];
  const value =
    c.discountType === "percentage"
      ? `Sepette %${c.discountPercentage || 0} indirim${c.maximumDiscount ? `, en fazla ${money(c.maximumDiscount)}` : ""}`
      : `Sepetten ${money(c.discountAmount)} indirim`;
  rules.push({ key: "value", icon: "percent", text: value });
  rules.push({
    key: "min",
    icon: "cart",
    text: c.minimumOrderAmount > 0 ? `${money(c.minimumOrderAmount)} ve üzeri siparişlerde` : "Alt sipariş tutarı yok"
  });
  const limit = c.usageLimit ? `Toplam ${c.usageLimit} kullanım` : "Toplam kullanım sınırsız";
  rules.push({ key: "limit", icon: "users", text: `${limit}, kişi başı ${c.userUsageLimit || 1}` });
  if (c.firstOrderOnly) rules.push({ key: "first", icon: "sparkles", text: "Yalnız ilk siparişte" });
  if (c.newUsersOnly) rules.push({ key: "new", icon: "userplus", text: `Son ${c.newUserDays || 30} günde üye olanlara` });
  if (c.applicableCategories?.length) {
    rules.push({ key: "cat", icon: "layers", text: `Kategoriler: ${c.applicableCategories.join(", ")}` });
  }
  if (c.applicableProducts?.length) {
    rules.push({ key: "prod", icon: "bag", text: `${c.applicableProducts.length} seçili üründe` });
  }
  if (c.validDays?.length && c.validDays.length < 7) {
    rules.push({ key: "days", icon: "calendar", text: `Günler: ${dayList(c.validDays)}` });
  }
  if (c.startTime || c.endTime) {
    rules.push({ key: "time", icon: "clock", text: `Saat ${c.startTime || "00:00"} – ${c.endTime || "23:59"} arası` });
  }
  if (c.channels?.length) {
    rules.push({ key: "ch", icon: "phone", text: `Kanal: ${c.channels.map((x) => CHANNEL_LABELS[x] || x).join(", ")}` });
  }
  if (c.deliveryPoints?.length) {
    rules.push({ key: "dp", icon: "pin", text: `Teslimat: ${c.deliveryPoints.map((x) => DELIVERY_LABELS[x] || x).join(", ")}` });
  }
  if (c.isReferralCoupon) {
    rules.push({ key: "ref", icon: "gift", text: c.referredBy?.name ? `Referans ödülü (${c.referredBy.name})` : "Referans ödülü" });
  } else if (c.userId) {
    rules.push({ key: "user", icon: "userplus", text: c.userId?.name ? `Yalnız ${c.userId.name} kullanabilir` : "Kişiye özel kupon" });
  }
  return rules;
};

// Kısa etiketler (liste satırı için)
export const shortTags = (c) => {
  const tags = [];
  if (c.minimumOrderAmount > 0) tags.push(`Min. ${money(c.minimumOrderAmount)}`);
  if (c.firstOrderOnly) tags.push("İlk sipariş");
  if (c.newUsersOnly) tags.push("Yeni üye");
  if (c.isReferralCoupon) tags.push("Referans");
  else if (c.userId) tags.push("Kişiye özel");
  if (c.applicableCategories?.length || c.applicableProducts?.length) tags.push("Sınırlı kapsam");
  if ((c.validDays?.length && c.validDays.length < 7) || c.startTime || c.endTime) tags.push("Zamanlı");
  if (c.channels?.length) tags.push(c.channels.map((x) => CHANNEL_LABELS[x] || x).join("/"));
  return tags;
};

// Son N günün günlük kullanım sayıları (usedBy.usedAt'ten)
export const dailyUsage = (coupons, days = 30, now = Date.now()) => {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = end.getTime() - (days - 1) * DAY_MS;
  const buckets = Array.from({ length: days }, (_, i) => ({ date: new Date(start + i * DAY_MS), count: 0 }));
  let previous = 0;
  for (const c of coupons) {
    for (const u of c.usedBy || []) {
      const t = time(u.usedAt);
      if (!t) continue;
      const idx = Math.floor((t - start) / DAY_MS);
      if (idx >= 0 && idx < days) buckets[idx].count += 1;
      else if (idx < 0 && idx >= -days) previous += 1;
    }
  }
  const current = buckets.reduce((s, b) => s + b.count, 0);
  return { buckets, current, previous };
};

// Yöneticinin dikkatini gerektiren kuponlar
export const attentionItems = (coupons, now = Date.now()) => {
  const items = [];
  for (const c of coupons) {
    if (!isLive(c, now)) continue;
    const left = daysLeft(c, now);
    const used = c.usageCount || 0;
    if (isLimitFull(c)) {
      items.push({ id: c._id, code: c.code, tone: "warn", rank: 0, text: "Kullanım limiti doldu, müşteriler artık kullanamıyor" });
    } else if (left <= 3) {
      items.push({ id: c._id, code: c.code, tone: "warn", rank: 1, text: left <= 0 ? "Bugün sona eriyor" : `${left} gün içinde sona eriyor` });
    } else if (c.usageLimit && used / c.usageLimit >= 0.8) {
      items.push({ id: c._id, code: c.code, tone: "info", rank: 2, text: `Limitin %${Math.round((used / c.usageLimit) * 100)}'i kullanıldı` });
    } else if (used === 0 && !c.isReferralCoupon && !c.userId && now - time(c.createdAt) > 14 * DAY_MS) {
      items.push({ id: c._id, code: c.code, tone: "", rank: 3, text: "14 günden uzun süredir aktif, hiç kullanılmadı" });
    }
  }
  return items.sort((a, b) => a.rank - b.rank);
};

const csvCell = (value) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Excel (TR) için ; ayraçlı, BOM'lu CSV
export const buildCsv = (coupons, campaignMap, now = Date.now()) => {
  const header = [
    "Kod", "Açıklama", "Tür", "Durum", "İndirim türü", "İndirim", "Maks. indirim", "Min. sipariş",
    "Kullanım", "Toplam limit", "Kişi başı limit", "Sipariş geliri", "Verilen indirim",
    "Son tarih", "Oluşturulma"
  ];
  const rows = coupons.map((c) => {
    const s = campaignMap.get(c.code) || {};
    return [
      c.code,
      c.description || "",
      couponKind(c),
      getStatus(c, now).label,
      c.discountType === "percentage" ? "Yüzde" : "Sabit",
      c.discountType === "percentage" ? c.discountPercentage || 0 : c.discountAmount || 0,
      c.maximumDiscount ?? "",
      c.minimumOrderAmount || 0,
      c.usageCount || 0,
      c.usageLimit ?? "Sınırsız",
      c.userUsageLimit || 1,
      Number(s.revenue || 0).toFixed(2).replace(".", ","),
      Number(s.discount || 0).toFixed(2).replace(".", ","),
      formatDate(c.expirationDate),
      formatDate(c.createdAt)
    ];
  });
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
};

export const downloadText = (text, filename, type = "text/csv;charset=utf-8") => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const readPref = (key, fallback) => {
  try {
    const v = window.localStorage.getItem(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

export const writePref = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* depolama kapalıysa yok say */
  }
};
