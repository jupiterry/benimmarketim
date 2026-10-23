// Yönetici işlem kayıtları. Ayrıntılı kayıtlar (ne, hangi üründe, neyden neye) denetleyicilerde
// recordAdminAction ile yazılır; geri kalan her başarılı yönetici değişikliği auditFallback
// tarafından bölüm adıyla kaydedilir. Kayıt yazımı yanıtı asla bekletmez ya da bozmaz.
import AdminAudit from "../models/adminAudit.model.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const short = (value, max = 160) => {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export const money = (value) =>
  value === null || value === undefined || value === "" || Number.isNaN(Number(value))
    ? "—"
    : `₺${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const yesNo = (value, yes = "Evet", no = "Hayır") => (value ? yes : no);

/** Ayrıntılı kayıt yazar ve isteği "kaydedildi" olarak işaretler (genel yakalayıcı tekrar yazmaz). */
export const recordAdminAction = (req, { action, category = "other", target = "", targetName = "", changes = [], meta } = {}) => {
  if (!req?.user?._id || !action) return null;
  req.auditRecorded = true;
  const entry = {
    actor: req.user._id,
    action,
    category,
    target: short(target || "—", 200),
    targetName: targetName ? short(targetName, 200) : "",
    changes: (changes || [])
      .filter(Boolean)
      .slice(0, 20)
      .map((c) => ({ label: short(c.label, 60), from: short(c.from), to: short(c.to) })),
    summary: `${req.method} ${String(req.originalUrl || "").split("?")[0]}`,
    ...(meta ? { meta } : {}),
  };
  return AdminAudit.create(entry).catch((error) => console.error("Admin audit write failed:", error.message));
};

/** Değişen alanları "etiket: eski → yeni" listesine çevirir. fields: [{ key, label, format? }] */
export const diffFields = (before = {}, after = {}, fields = []) =>
  fields
    .filter(({ key }) => String(before?.[key] ?? "") !== String(after?.[key] ?? ""))
    .map(({ key, label, format = (v) => v }) => ({ label, from: format(before?.[key]), to: format(after?.[key]) }));

// ── Genel yakalayıcı ──
// Yönetici işlemi sayılmayan ya da gürültülü yollar
const SKIP_PREFIXES = [
  "/api/auth", "/api/cart", "/api/chat", "/api/saved-carts", "/api/cart-assistant", "/api/admin-notifications",
  "/api/product-assist", "/api/order-alarm/heartbeat", "/api/order-alarm/ack",
  "/api/orders/", "/api/products/home-feed",
];
const SECTIONS = [
  ["/api/products", "product", "Ürün"],
  ["/api/categories", "product", "Kategori"],
  ["/api/price-watch", "product", "Fiyat bekçisi"],
  ["/api/delivery", "settings", "Teslimat bölgesi"],
  ["/api/flash-sales", "campaign", "Flash sale"],
  ["/api/weekly-products", "campaign", "Haftalık fırsat"],
  ["/api/coupon-requests", "campaign", "Kupon isteği kampanyası"],
  ["/api/coupons", "campaign", "Kupon"],
  ["/api/missions", "campaign", "Sipariş görevi"],
  ["/api/banners", "campaign", "Vitrin görseli"],
  ["/api/notifications", "campaign", "Bildirim"],
  ["/api/cart-reminders", "campaign", "Sepet hatırlatma"],
  ["/api/orders-analytics", "order", "Sipariş"],
  ["/api/users", "customer", "Müşteri"],
  ["/api/referrals", "customer", "Davet"],
  ["/api/feedback", "customer", "Geri bildirim"],
  ["/api/site-messages", "customer", "Başvuru/mesaj"],
  ["/api/support-requests", "customer", "Destek talebi"],
  ["/api/ai", "system", "Yapay zekâ bilgisi"],
  ["/api/settings", "settings", "Mağaza ayarı"],
  ["/api/photocopy", "system", "Fotokopi"],
  ["/api/order-alarm", "system", "Sipariş alarmı"],
  ["/api/analytics", "system", "Analiz"],
  ["/api", "settings", "Uygulama sürümü"],
];
const VERB = { POST: "işlemi", PUT: "değişikliği", PATCH: "değişikliği", DELETE: "silme" };

export const describeRequest = (method, path) => {
  const section = SECTIONS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (!section) return null;
  const [prefix, category, label] = section;
  const rest = path.slice(prefix.length).split("/").filter(Boolean);
  const id = rest.find((part) => /^[0-9a-f]{24}$/i.test(part)) || "";
  const detail = rest.filter((part) => part !== id).join(" / ");
  return {
    category,
    action: `${label} ${VERB[method] || "işlemi"}${detail ? ` (${detail})` : ""}`,
    target: id || label,
  };
};

export const auditFallback = (req, res, next) => {
  if (!MUTATING.has(req.method)) return next();
  res.on("finish", () => {
    // Denetleyici ya da rota bazlı kayıt önce yazılsın; ikisi de yoksa burada yazılır
    setImmediate(() => {
      if (req.auditRecorded || res.statusCode < 200 || res.statusCode >= 300) return;
      if (req.user?.role !== "admin" || !req.user?._id) return;
      const path = String(req.originalUrl || "").split("?")[0];
      if (SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
      const described = describeRequest(req.method, path);
      if (!described) return;
      AdminAudit.create({ actor: req.user._id, ...described, summary: `${req.method} ${path}` })
        .catch((error) => console.error("Admin audit write failed:", error.message));
    });
  });
  return next();
};
