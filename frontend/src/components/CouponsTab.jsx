import { useState, useEffect, useMemo } from "react";
import {
  Tag, Plus, Trash2, Edit2, Percent, DollarSign, Users, Copy, X, Search, Zap,
  RefreshCw, Check, ChevronDown, ShoppingBag, CopyPlus, Clock, CalendarDays,
  Smartphone, MapPin, Sparkles, UserPlus, Layers, Gift, TrendingUp, Ticket,
  ArrowDownUp
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import CouponRequestCampaignPanel from "./CouponRequestCampaignPanel";
import MissionsPanel from "./MissionsPanel";
import "../styles/coupons.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS = 7;

const DAY_LABELS = [['Paz', 0], ['Pzt', 1], ['Sal', 2], ['Çar', 3], ['Per', 4], ['Cum', 5], ['Cmt', 6]];
const DELIVERY_LABELS = { girlsDorm: "Kız Yurdu", boysDorm: "Erkek Yurdu" };
const CHANNEL_LABELS = { web: "Web", android: "Android", ios: "iOS" };

const money = (value, digits = 0) =>
  `₺${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString("tr-TR") : "-");

// Yalnız görünüm için durum; veriyi değiştirmez.
const getCouponStatus = (coupon, now = Date.now()) => {
  const expiresAt = new Date(coupon.expirationDate).getTime();
  const daysLeft = Math.ceil((expiresAt - now) / DAY_MS);
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    return { key: "expired", label: "Süresi doldu", tone: "danger", daysLeft };
  }
  if (!coupon.isActive) return { key: "inactive", label: "Pasif", tone: "", daysLeft };
  if (coupon.usageLimit && (coupon.usageCount || 0) >= coupon.usageLimit) {
    return { key: "limit", label: "Limit doldu", tone: "warn", daysLeft };
  }
  if (daysLeft <= SOON_DAYS) return { key: "soon", label: "Yakında bitiyor", tone: "warn", daysLeft };
  return { key: "active", label: "Aktif", tone: "ok", daysLeft };
};

const isExpired = (coupon, now) => new Date(coupon.expirationDate).getTime() < now;
const isLive = (coupon, now) => coupon.isActive && !isExpired(coupon, now);
const isSoon = (coupon, now) =>
  isLive(coupon, now) && new Date(coupon.expirationDate).getTime() - now <= SOON_DAYS * DAY_MS;

const FILTERS = [
  { key: "all", label: "Tümü", match: () => true },
  { key: "active", label: "Aktif", tone: "ok", match: isLive },
  { key: "soon", label: "Yakında bitiyor", tone: "warn", match: isSoon },
  { key: "inactive", label: "Pasif", match: (c, now) => !c.isActive && !isExpired(c, now) },
  { key: "expired", label: "Süresi dolmuş", tone: "danger", match: isExpired }
];

const SORTS = [
  { key: "newest", label: "En yeni" },
  { key: "usage", label: "En çok kullanılan" },
  { key: "revenue", label: "En çok gelir getiren" },
  { key: "expiring", label: "Bitişi en yakın" }
];

const discountLabel = (coupon) =>
  coupon.discountType === "percentage" ? `%${coupon.discountPercentage || 0}` : money(coupon.discountAmount, 0);

// Kuponun koşullarını kısa etiketler halinde özetler.
const couponConditions = (coupon) => {
  const items = [];
  if (coupon.isReferralCoupon) items.push({ icon: Gift, label: "Referans ödülü" });
  else if (coupon.userId) items.push({ icon: UserPlus, label: coupon.userId?.name ? `Kişiye özel: ${coupon.userId.name}` : "Kişiye özel" });
  if (coupon.firstOrderOnly) items.push({ icon: Sparkles, label: "İlk sipariş" });
  if (coupon.newUsersOnly) items.push({ icon: UserPlus, label: `Yeni kullanıcı (${coupon.newUserDays || 30} gün)` });
  if (coupon.applicableCategories?.length) {
    items.push({ icon: Layers, label: coupon.applicableCategories.length > 2 ? `${coupon.applicableCategories.length} kategori` : coupon.applicableCategories.join(", ") });
  }
  if (coupon.applicableProducts?.length) items.push({ icon: ShoppingBag, label: `${coupon.applicableProducts.length} ürün` });
  if (coupon.validDays?.length && coupon.validDays.length < 7) {
    items.push({ icon: CalendarDays, label: DAY_LABELS.filter(([, d]) => coupon.validDays.includes(d)).map(([l]) => l).join(" ") });
  }
  if (coupon.startTime || coupon.endTime) items.push({ icon: Clock, label: `${coupon.startTime || "00:00"}–${coupon.endTime || "23:59"}` });
  if (coupon.channels?.length) items.push({ icon: Smartphone, label: coupon.channels.map((c) => CHANNEL_LABELS[c] || c).join(", ") });
  if (coupon.deliveryPoints?.length) items.push({ icon: MapPin, label: coupon.deliveryPoints.map((p) => DELIVERY_LABELS[p] || p).join(", ") });
  return items;
};

const ORDER_STATUS_LABELS = {
  Hazırlanıyor: "Hazırlanıyor",
  Yolda: "Yolda",
  "Teslim Edildi": "Teslim edildi",
  "İptal Edildi": "İptal edildi"
};

// Coupon Creation/Edit Modal
const CouponModal = ({ isOpen, onClose, coupon, onSave }) => {
  const isEdit = Boolean(coupon?._id);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discountType: "percentage",
    discountPercentage: 10,
    discountAmount: 0,
    minimumOrderAmount: 0,
    maximumDiscount: null,
    usageLimit: null,
    userUsageLimit: 1,
    expirationDate: "",
    newUsersOnly: false,
    firstOrderOnly: false,
    newUserDays: 30,
    applicableCategories: [],
    applicableProducts: [],
    validDays: [],
    startTime: "",
    endTime: "",
    deliveryPoints: [],
    channels: []
  });
  const [saving, setSaving] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [productQuery, setProductQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    axios.get('/products?limit=5000')
      .then(({ data }) => setProductOptions(data.products || []))
      .catch(() => setProductOptions([]));
  }, [isOpen]);

  useEffect(() => {
    if (coupon) {
      setFormData({
        code: coupon.code || "",
        description: coupon.description || "",
        discountType: coupon.discountType || "percentage",
        discountPercentage: coupon.discountPercentage || 10,
        discountAmount: coupon.discountAmount || 0,
        minimumOrderAmount: coupon.minimumOrderAmount || 0,
        maximumDiscount: coupon.maximumDiscount || null,
        usageLimit: coupon.usageLimit || null,
        userUsageLimit: coupon.userUsageLimit || 1,
        expirationDate: coupon.expirationDate ? new Date(coupon.expirationDate).toISOString().split('T')[0] : "",
        newUsersOnly: coupon.newUsersOnly || false,
        firstOrderOnly: coupon.firstOrderOnly || false,
        newUserDays: coupon.newUserDays || 30,
        applicableCategories: coupon.applicableCategories || [],
        applicableProducts: (coupon.applicableProducts || []).map(String),
        validDays: coupon.validDays || [],
        startTime: coupon.startTime || "",
        endTime: coupon.endTime || "",
        deliveryPoints: coupon.deliveryPoints || [],
        channels: coupon.channels || []
      });
    } else {
      // Default for new coupon
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 30);
      setFormData(prev => ({
        ...prev,
        code: "",
        expirationDate: tomorrow.toISOString().split('T')[0]
      }));
    }
  }, [coupon]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...formData,
        maximumDiscount: formData.maximumDiscount || null,
        usageLimit: formData.usageLimit || null
      };

      if (isEdit) {
        await axios.put(`/coupons/${coupon._id}`, payload);
        toast.success("Kupon güncellendi!");
      } else {
        await axios.post("/coupons", payload);
        toast.success("Kupon oluşturuldu!");
      }
      onSave();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, code }));
  };

  const toggleArrayValue = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((item) => item !== value)
        : [...prev[field], value]
    }));
  };

  const productNameById = useMemo(
    () => new Map(productOptions.map((p) => [String(p._id), p.name])),
    [productOptions]
  );

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLocaleLowerCase("tr-TR");
    const list = q
      ? productOptions.filter((p) =>
        `${p.name || ""} ${p.category || ""}`.toLocaleLowerCase("tr-TR").includes(q))
      : productOptions;
    return list.slice(0, 80);
  }, [productOptions, productQuery]);

  if (!isOpen) return null;

  const isPercent = formData.discountType === "percentage";
  const previewValue = isPercent ? `%${formData.discountPercentage || 0}` : money(formData.discountAmount, 0);
  const previewNotes = [
    formData.minimumOrderAmount > 0 && `${money(formData.minimumOrderAmount)} üzeri`,
    isPercent && formData.maximumDiscount && `en fazla ${money(formData.maximumDiscount)}`,
    formData.expirationDate && `${formatDate(formData.expirationDate)} tarihine kadar`
  ].filter(Boolean);

  return (
    <div className="ui-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal cpn-modal" role="dialog" aria-modal="true" aria-label={isEdit ? "Kupon Düzenle" : "Yeni Kupon Oluştur"}>
        <div className="ui-modal-header">
          <div>
            <h3 className="ui-title">{isEdit ? "Kupon Düzenle" : "Yeni Kupon Oluştur"}</h3>
            <p className="ui-text-xs ui-muted">{isEdit ? "Değişiklikler kaydedildiği anda geçerli olur." : "Boş bırakılan kapsam alanları tüm ürün ve günlerde geçerlidir."}</p>
          </div>
          <button type="button" onClick={onClose} className="ui-icon-btn" aria-label="Kapat">
            <X />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cpn-form">
          <div className="ui-modal-body cpn-form-body">
            {/* Önizleme */}
            <div className="cpn-preview" aria-hidden="true">
              <div className="cpn-preview-value">{previewValue}</div>
              <div className="cpn-preview-text">
                <span className="cpn-preview-code">{formData.code || "KUPONKODU"}</span>
                <span>{previewNotes.join(" · ") || "Koşulsuz indirim"}</span>
              </div>
            </div>

            <fieldset className="cpn-fieldset">
              <legend className="ui-overline">Temel bilgiler</legend>
              <div>
                <label className="ui-label" htmlFor="coupon-code">Kupon Kodu</label>
                <div className="cpn-code-row">
                  <input
                    id="coupon-code"
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="ui-field ui-mono"
                    required
                    placeholder="INDIRIM20"
                  />
                  <button type="button" onClick={generateRandomCode} className="ui-btn" title="Rastgele kod üret">
                    <Zap />
                    Üret
                  </button>
                </div>
              </div>
              <div>
                <label className="ui-label" htmlFor="coupon-description">Açıklama</label>
                <input
                  id="coupon-description"
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="ui-field"
                  placeholder="Yaz indirimi kuponu"
                />
              </div>
            </fieldset>

            <fieldset className="cpn-fieldset">
              <legend className="ui-overline">İndirim</legend>
              <div className="ui-segmented">
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, discountType: "percentage" }))} aria-pressed={isPercent}>
                  <Percent />
                  Yüzde
                </button>
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, discountType: "fixed" }))} aria-pressed={!isPercent}>
                  <DollarSign />
                  Sabit Tutar
                </button>
              </div>
              <div className="ui-grid-2">
                <div>
                  <label className="ui-label" htmlFor="coupon-value">
                    {isPercent ? "İndirim Yüzdesi (%)" : "İndirim Tutarı (₺)"}
                  </label>
                  <input
                    id="coupon-value"
                    type="number"
                    value={isPercent ? formData.discountPercentage : formData.discountAmount}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      [isPercent ? "discountPercentage" : "discountAmount"]: parseFloat(e.target.value)
                    }))}
                    className="ui-field"
                    min="0"
                    max={isPercent ? 100 : undefined}
                    required
                  />
                </div>
                {isPercent ? (
                  <div>
                    <label className="ui-label" htmlFor="coupon-max">Maks. İndirim (₺)</label>
                    <input
                      id="coupon-max"
                      type="number"
                      value={formData.maximumDiscount || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, maximumDiscount: e.target.value ? parseFloat(e.target.value) : null }))}
                      className="ui-field"
                      placeholder="Sınırsız"
                      min="0"
                    />
                  </div>
                ) : <div />}
                <div>
                  <label className="ui-label" htmlFor="coupon-min-order">Min. Sipariş (₺)</label>
                  <input
                    id="coupon-min-order"
                    type="number"
                    value={formData.minimumOrderAmount}
                    onChange={(e) => setFormData(prev => ({ ...prev, minimumOrderAmount: parseFloat(e.target.value) }))}
                    className="ui-field"
                    min="0"
                  />
                </div>
                <div>
                  <label className="ui-label" htmlFor="coupon-expiration">Son Kullanma Tarihi</label>
                  <input
                    id="coupon-expiration"
                    type="date"
                    value={formData.expirationDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, expirationDate: e.target.value }))}
                    className="ui-field"
                    required
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="cpn-fieldset">
              <legend className="ui-overline">Kullanım limitleri</legend>
              <div className="ui-grid-2">
                <div>
                  <label className="ui-label" htmlFor="coupon-usage-limit">Toplam Kullanım Limiti</label>
                  <input
                    id="coupon-usage-limit"
                    type="number"
                    value={formData.usageLimit || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, usageLimit: e.target.value ? parseInt(e.target.value) : null }))}
                    className="ui-field"
                    placeholder="Sınırsız"
                    min="1"
                  />
                </div>
                <div>
                  <label className="ui-label" htmlFor="coupon-user-limit">Kullanıcı Başına Limit</label>
                  <input id="coupon-user-limit" type="number" min="1" value={formData.userUsageLimit}
                    onChange={(e) => setFormData(prev => ({ ...prev, userUsageLimit: Number(e.target.value) || 1 }))}
                    className="ui-field" />
                </div>
              </div>
              <div className="cpn-switches">
                <button type="button" className="ui-toggle" aria-pressed={formData.firstOrderOnly}
                  onClick={() => setFormData(prev => ({ ...prev, firstOrderOnly: !prev.firstOrderOnly }))}>
                  <i />Sadece ilk sipariş için geçerli
                </button>
                <button type="button" className="ui-toggle" aria-pressed={formData.newUsersOnly}
                  onClick={() => setFormData(prev => ({ ...prev, newUsersOnly: !prev.newUsersOnly }))}>
                  <i />Sadece yeni kullanıcılar için
                </button>
              </div>
              {formData.newUsersOnly && (
                <div className="cpn-inline-field">
                  <label className="ui-label" htmlFor="coupon-new-days">Yeni Kullanıcı Süresi (gün)</label>
                  <input id="coupon-new-days" type="number" min="1" value={formData.newUserDays}
                    onChange={(e) => setFormData(prev => ({ ...prev, newUserDays: Number(e.target.value) || 30 }))}
                    className="ui-field" />
                </div>
              )}
            </fieldset>

            <fieldset className="cpn-fieldset">
              <legend className="ui-overline">Kapsam ve zamanlama</legend>
              <div>
                <label className="ui-label" htmlFor="coupon-categories">Geçerli Kategoriler</label>
                <input id="coupon-categories" value={formData.applicableCategories.join(", ")}
                  onChange={(e) => setFormData(prev => ({ ...prev, applicableCategories: e.target.value.split(",").map(v => v.trim()).filter(Boolean) }))}
                  placeholder="Örn: İçecekler, Atıştırmalık (boşsa tümü)"
                  className="ui-field" />
              </div>

              <div>
                <span className="ui-label">Geçerli Ürünler (boşsa tümü)</span>
                {formData.applicableProducts.length > 0 && (
                  <div className="cpn-selected">
                    {formData.applicableProducts.map((id) => (
                      <span key={id} className="ui-badge ui-badge--brand">
                        {productNameById.get(id) || `#${id.slice(-6)}`}
                        <button type="button" onClick={() => toggleArrayValue('applicableProducts', id)} aria-label="Ürünü kaldır">
                          <X />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="cpn-picker">
                  <div className="ui-search">
                    <Search />
                    <input
                      type="text"
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder="Ürün veya kategori ara..."
                      aria-label="Ürün ara"
                      className="ui-field"
                    />
                  </div>
                  <div className="cpn-picker-list" role="group" aria-label="Ürünler">
                    {visibleProducts.length === 0 ? (
                      <p className="ui-hint">{productOptions.length ? "Eşleşen ürün yok." : "Ürünler yükleniyor..."}</p>
                    ) : visibleProducts.map((product) => (
                      <label key={product._id} className="ui-check cpn-picker-item">
                        <input
                          type="checkbox"
                          checked={formData.applicableProducts.includes(String(product._id))}
                          onChange={() => toggleArrayValue('applicableProducts', String(product._id))}
                        />
                        <span className="ui-truncate">{product.name}</span>
                        <small>{product.category}</small>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <span className="ui-label">Geçerli Günler (boşsa her gün)</span>
                <div className="ui-chips cpn-days">
                  {DAY_LABELS.map(([label, day]) => (
                    <button key={day} type="button" onClick={() => toggleArrayValue('validDays', day)}
                      aria-pressed={formData.validDays.includes(day)}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="ui-grid-2">
                <div><label className="ui-label" htmlFor="coupon-start-time">Başlangıç Saati</label><input id="coupon-start-time" type="time" value={formData.startTime} onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))} className="ui-field" /></div>
                <div><label className="ui-label" htmlFor="coupon-end-time">Bitiş Saati</label><input id="coupon-end-time" type="time" value={formData.endTime} onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))} className="ui-field" /></div>
              </div>
              <div className="ui-grid-2">
                <div>
                  <span className="ui-label">Teslimat Noktaları</span>
                  <div className="ui-chips">
                    {Object.entries(DELIVERY_LABELS).map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={formData.deliveryPoints.includes(value)}
                        onClick={() => toggleArrayValue('deliveryPoints', value)}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="ui-label">Kanallar</span>
                  <div className="ui-chips">
                    {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={formData.channels.includes(value)}
                        onClick={() => toggleArrayValue('channels', value)}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="ui-hint">Teslimat noktası ve kanal seçilmezse tümünde geçerlidir.</p>
            </fieldset>
          </div>

          <div className="ui-modal-footer cpn-form-foot">
            <button type="button" onClick={onClose} className="ui-btn">İptal</button>
            <button type="submit" disabled={saving} className="ui-btn ui-btn--primary">
              {saving ? <RefreshCw className="ui-spin" /> : <Check />}
              {isEdit ? "Güncelle" : "Oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Kullanım geçmişi tablosu
const UsageHistory = ({ usedBy }) => (
  <div className="cpn-usage">
    <div className="cpn-usage-head">
      <span>Müşteri</span>
      <span>Sipariş</span>
      <span className="ui-right">Tutar</span>
      <span className="ui-right">İndirim</span>
      <span>Durum</span>
      <span className="ui-right">Tarih</span>
    </div>
    {[...usedBy]
      .sort((a, b) => new Date(b.usedAt || 0) - new Date(a.usedAt || 0))
      .map((usage, index) => {
        const order = usage.orderId && typeof usage.orderId === "object" ? usage.orderId : null;
        const orderNo = String(order?._id || usage.orderId || "").slice(-6).toUpperCase();
        const status = order?.status;
        return (
          <div key={`${usage.user?._id || usage.user}-${usage.usedAt}-${index}`} className="cpn-usage-row">
            <span className="cpn-usage-user">
              <strong>{usage.user?.name || "Silinmiş kullanıcı"}</strong>
              <small className="ui-wrap-anywhere">{usage.user?.email || "E-posta yok"}</small>
            </span>
            <span className="ui-mono">{orderNo ? `#${orderNo}` : "-"}</span>
            <span className="ui-right ui-num" data-label="Tutar">{order ? money(order.totalAmount, 2) : "-"}</span>
            <span className="ui-right ui-num" data-label="İndirim">{order ? money(order.couponDiscount, 2) : "-"}</span>
            <span>
              {status ? (
                <span className={`ui-badge ${status === "Teslim Edildi" ? "ui-badge--ok" : status === "İptal Edildi" ? "ui-badge--danger" : "ui-badge--info"}`}>
                  {ORDER_STATUS_LABELS[status] || status}
                </span>
              ) : <span className="ui-muted">-</span>}
            </span>
            <span className="ui-right ui-num ui-muted">{usage.usedAt ? new Date(usage.usedAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "Tarih yok"}</span>
          </div>
        );
      })}
  </div>
);

// Kupon satırı
const CouponRow = ({ coupon, stats, now, open, onToggleOpen, onToggleStatus, onEdit, onDuplicate, onDelete, onCopy }) => {
  const status = getCouponStatus(coupon, now);
  const usage = coupon.usageCount || 0;
  const limitPct = coupon.usageLimit ? Math.min(100, (usage / coupon.usageLimit) * 100) : null;
  const conditions = couponConditions(coupon);
  const historyCount = coupon.usedBy?.length || 0;

  let expiryNote = "";
  if (status.key === "expired") expiryNote = `${Math.abs(status.daysLeft)} gün önce bitti`;
  else if (status.daysLeft <= 0) expiryNote = "Bugün bitiyor";
  else expiryNote = `${status.daysLeft} gün kaldı`;

  return (
    <article className="cpn-row" data-status={status.key}>
      <div className="cpn-row-main">
        <div className="cpn-ticket" data-type={coupon.discountType}>
          <span className="cpn-ticket-value">{discountLabel(coupon)}</span>
          <span className="cpn-ticket-sub">
            {coupon.discountType === "percentage"
              ? (coupon.maximumDiscount ? `en fazla ${money(coupon.maximumDiscount)}` : "indirim")
              : "sabit indirim"}
          </span>
        </div>

        <div className="cpn-info">
          <div className="cpn-info-top">
            <button type="button" className="cpn-code" onClick={() => onCopy(coupon.code)} title="Kodu kopyala">
              <span>{coupon.code}</span>
              <Copy />
            </button>
            <span className={`ui-badge ${status.tone ? `ui-badge--${status.tone}` : ""}`}>
              <span className={`ui-dot ${status.tone ? `ui-dot--${status.tone}` : ""}`} />
              {status.label}
            </span>
          </div>
          <p className="cpn-desc">{coupon.description || "Açıklama yok"}</p>
          <div className="cpn-tags">
            <span className="cpn-tag">
              <Tag />
              {coupon.minimumOrderAmount > 0 ? `Min. ${money(coupon.minimumOrderAmount)}` : "Alt limit yok"}
            </span>
            {conditions.map(({ icon: Icon, label }) => (
              <span key={label} className="cpn-tag"><Icon />{label}</span>
            ))}
          </div>
        </div>

        <div className="cpn-figures">
          <div className="cpn-fig">
            <span className="cpn-fig-label">Kullanım</span>
            <span className="cpn-fig-value">
              {usage}
              <small>{coupon.usageLimit ? ` / ${coupon.usageLimit}` : " / ∞"}</small>
            </span>
            {limitPct !== null ? (
              <div className="ui-progress cpn-progress" data-full={limitPct >= 100} aria-label={`Limitin %${Math.round(limitPct)}'i kullanıldı`}>
                <div style={{ width: `${limitPct}%` }} />
              </div>
            ) : (
              <span className="cpn-fig-note">Kişi başı {coupon.userUsageLimit || 1}</span>
            )}
          </div>
          <div className="cpn-fig">
            <span className="cpn-fig-label">Sipariş geliri</span>
            <span className="cpn-fig-value">{money(stats?.revenue)}</span>
            <span className="cpn-fig-note">{stats?.discount ? `${money(stats.discount)} indirim` : "Henüz sipariş yok"}</span>
          </div>
          <div className="cpn-fig">
            <span className="cpn-fig-label">Son tarih</span>
            <span className="cpn-fig-value cpn-fig-value--date">{formatDate(coupon.expirationDate)}</span>
            <span className="cpn-fig-note" data-tone={status.key === "soon" ? "warn" : status.key === "expired" ? "danger" : undefined}>{expiryNote}</span>
          </div>
        </div>

        <div className="cpn-actions">
          <button
            type="button"
            className="ui-toggle"
            aria-pressed={Boolean(coupon.isActive)}
            onClick={() => onToggleStatus(coupon._id)}
            title={coupon.isActive ? "Pasife al" : "Aktifleştir"}
            aria-label={coupon.isActive ? "Pasife al" : "Aktifleştir"}
          >
            <i />
          </button>
          <button type="button" onClick={() => onEdit(coupon)} className="ui-icon-btn" title="Düzenle" aria-label="Düzenle">
            <Edit2 />
          </button>
          <button type="button" onClick={() => onDuplicate(coupon)} className="ui-icon-btn" title="Kopyasını oluştur" aria-label="Kopyasını oluştur">
            <CopyPlus />
          </button>
          <button type="button" onClick={() => onDelete(coupon._id)} className="ui-icon-btn ui-icon-btn--danger" title="Sil" aria-label="Sil">
            <Trash2 />
          </button>
        </div>
      </div>

      {historyCount > 0 && (
        <div className="cpn-row-foot">
          <button type="button" onClick={onToggleOpen} aria-expanded={open} className="cpn-history-btn">
            <Users />
            Kullanım geçmişi
            <span className="cpn-count">{historyCount}</span>
            {stats?.lastUsedAt && <span className="cpn-history-last">son kullanım {formatDate(stats.lastUsedAt)}</span>}
            <ChevronDown className="cpn-chevron" data-open={open} />
          </button>
          {open && <UsageHistory usedBy={coupon.usedBy} />}
        </div>
      )}
    </article>
  );
};

const KpiCard = ({ icon: Icon, label, value, note, featured }) => (
  <div className={`cpn-kpi${featured ? " cpn-kpi--featured" : ""}`}>
    <span className="cpn-kpi-icon"><Icon /></span>
    <span className="cpn-kpi-label">{label}</span>
    <span className="cpn-kpi-value">{value}</span>
    {note && <span className="cpn-kpi-note">{note}</span>}
  </div>
);

// Main Component
const CouponsTab = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [section, setSection] = useState("coupons");
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [usageOpenId, setUsageOpenId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setRefreshing(true);
      const [response, analyticsResponse] = await Promise.all([
        axios.get("/coupons/all"),
        axios.get("/coupons/analytics")
      ]);
      setCoupons(response.data.coupons || []);
      setAnalytics(analyticsResponse.data);
    } catch (error) {
      toast.error("Kuponlar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleToggleStatus = async (couponId) => {
    try {
      await axios.patch(`/coupons/${couponId}/toggle`);
      fetchCoupons();
      toast.success("Kupon durumu güncellendi");
    } catch (error) {
      toast.error("Bir hata oluştu");
    }
  };

  const { confirm } = useConfirm();

  const handleDelete = async (couponId) => {
    const confirmed = await confirm({
      title: 'Kuponu Sil',
      message: 'Bu kuponu silmek istediğinize emin misiniz? Kullanım geçmişi de silinir. Geçmişi korumak için kuponu pasife alabilirsiniz.',
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await axios.delete(`/coupons/${couponId}`);
      fetchCoupons();
      toast.success("Kupon silindi");
    } catch (error) {
      toast.error("Silme işlemi başarısız");
    }
  };

  const handleCopyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Kupon kodu kopyalandı!");
    } catch {
      toast.error("Kod kopyalanamadı");
    }
  };

  const openCreate = () => {
    setSection("coupons");
    setEditingCoupon(null);
    setShowModal(true);
  };

  // Kopya: aynı ayarlarla yeni kupon; kod boş, süresi geçmişse 30 gün sonrası.
  const openDuplicate = (coupon) => {
    const expiration = new Date(coupon.expirationDate);
    const fallback = new Date(Date.now() + 30 * DAY_MS);
    setEditingCoupon({
      ...coupon,
      _id: undefined,
      code: "",
      expirationDate: Number.isFinite(expiration.getTime()) && expiration.getTime() > Date.now() ? coupon.expirationDate : fallback
    });
    setShowModal(true);
  };

  const now = Date.now();

  const campaignMap = useMemo(
    () => new Map((analytics?.campaigns || []).map((item) => [item.code, item])),
    [analytics]
  );

  const stats = useMemo(() => {
    const summary = analytics?.summary || {};
    const revenue = Number(summary.attributedRevenue || 0);
    const discount = Number(summary.totalDiscount || 0);
    return {
      total: coupons.length,
      active: coupons.filter((c) => isLive(c, now)).length,
      soon: coupons.filter((c) => isSoon(c, now)).length,
      expired: coupons.filter((c) => isExpired(c, now)).length,
      totalUsage: coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0),
      revenue,
      discount,
      orders: Number(summary.couponOrders || 0),
      discountRate: revenue + discount > 0 ? (discount / (revenue + discount)) * 100 : 0
    };
    // now her render'da değişir; sayımlar kupon listesine bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupons, analytics]);

  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, coupons.filter((c) => f.match(c, now)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coupons]
  );

  const visibleCoupons = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase("tr-TR");
    const activeFilter = FILTERS.find((f) => f.key === filter) || FILTERS[0];
    const list = coupons.filter((coupon) => {
      if (!activeFilter.match(coupon, now)) return false;
      if (!q) return true;
      return (coupon.code || "").toLocaleLowerCase("tr-TR").includes(q) ||
        (coupon.description || "").toLocaleLowerCase("tr-TR").includes(q);
    });
    const time = (value) => new Date(value || 0).getTime() || 0;
    const sorters = {
      newest: (a, b) => time(b.createdAt) - time(a.createdAt),
      usage: (a, b) => (b.usageCount || 0) - (a.usageCount || 0),
      revenue: (a, b) => (campaignMap.get(b.code)?.revenue || 0) - (campaignMap.get(a.code)?.revenue || 0),
      // Bitişi en yakın: önce süresi dolmamışlar (yakından uzağa), sonra dolmuşlar
      expiring: (a, b) => {
        const ea = time(a.expirationDate), eb = time(b.expirationDate);
        const pa = ea < now, pb = eb < now;
        if (pa !== pb) return pa ? 1 : -1;
        return pa ? eb - ea : ea - eb;
      }
    };
    return [...list].sort(sorters[sort] || sorters.newest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupons, searchTerm, filter, sort, campaignMap]);

  if (loading) {
    return (
      <div className="ui-loading">
        <div className="ui-loader"></div>
      </div>
    );
  }

  const sections = [
    { key: "coupons", label: "Kuponlar", count: coupons.length },
    { key: "requests", label: "Kupon isteği kampanyası" },
    { key: "missions", label: "Sipariş görevleri" }
  ];

  return (
    <div className="ui-page cpn">
      <header className="app-pagehead">
        <div>
          <h1>Kuponlar</h1>
          <p>Doğru fırsatı sunun. Kuponları, kampanyaları ve kullanım geçmişini tek yerden yönetin.</p>
        </div>
        <button type="button" onClick={openCreate} className="ui-btn ui-btn--primary">
          <Plus />
          Yeni Kupon
        </button>
      </header>

      <nav className="cpn-sections" role="tablist" aria-label="Kupon bölümleri">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            onClick={() => setSection(s.key)}
            className="cpn-section"
          >
            {s.label}
            {typeof s.count === "number" && <span className="cpn-section-count">{s.count}</span>}
          </button>
        ))}
      </nav>

      {section === "requests" && <CouponRequestCampaignPanel />}
      {section === "missions" && <MissionsPanel />}

      {section === "coupons" && (
        <>
          <div className="cpn-kpis">
            <KpiCard
              featured
              icon={TrendingUp}
              label="Kuponlu sipariş geliri"
              value={money(stats.revenue)}
              note={`${stats.orders.toLocaleString("tr-TR")} sipariş`}
            />
            <KpiCard
              icon={Percent}
              label="Verilen toplam indirim"
              value={money(stats.discount)}
              note={`Sepet tutarının %${stats.discountRate.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}'i`}
            />
            <KpiCard
              icon={Ticket}
              label="Aktif kupon"
              value={<>{stats.active}<small> / {stats.total}</small></>}
              note={stats.soon > 0 ? `${stats.soon} tanesi 7 gün içinde bitiyor` : "7 gün içinde biten yok"}
            />
            <KpiCard
              icon={Users}
              label="Toplam kullanım"
              value={stats.totalUsage.toLocaleString("tr-TR")}
              note={`${stats.expired} kuponun süresi doldu`}
            />
          </div>

          <section className="ui-panel cpn-list">
            <div className="cpn-toolbar">
              <div className="ui-search cpn-search">
                <Search />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Kod veya açıklama ara..."
                  aria-label="Kupon ara"
                  className="ui-field"
                />
              </div>
              <div className="ui-chips cpn-filters" role="group" aria-label="Durum filtresi">
                {FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
                    {f.tone && <span className={`ui-dot ui-dot--${f.tone}`} />}
                    {f.label}
                    <span className="cpn-chip-count">{filterCounts[f.key] || 0}</span>
                  </button>
                ))}
              </div>
              <div className="cpn-toolbar-end">
                <label className="cpn-sort">
                  <ArrowDownUp aria-hidden="true" />
                  <select value={sort} onChange={(e) => setSort(e.target.value)} className="ui-field" aria-label="Sıralama">
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={fetchCoupons} className="ui-icon-btn" title="Yenile" aria-label="Yenile" disabled={refreshing}>
                  <RefreshCw className={refreshing ? "ui-spin" : undefined} />
                </button>
              </div>
            </div>

            {visibleCoupons.length === 0 ? (
              <div className="ui-empty cpn-empty">
                <Tag />
                <p>{coupons.length === 0 ? "Henüz kupon yok" : "Bu filtreye uyan kupon bulunamadı"}</p>
                {coupons.length === 0 ? (
                  <button type="button" onClick={openCreate} className="ui-btn ui-btn--primary ui-btn--sm"><Plus />İlk kuponu oluştur</button>
                ) : (
                  <button type="button" onClick={() => { setFilter("all"); setSearchTerm(""); }} className="ui-btn ui-btn--sm">Filtreleri temizle</button>
                )}
              </div>
            ) : (
              <div className="cpn-rows">
                {visibleCoupons.map((coupon) => (
                  <CouponRow
                    key={coupon._id}
                    coupon={coupon}
                    stats={campaignMap.get(coupon.code)}
                    now={now}
                    open={usageOpenId === coupon._id}
                    onToggleOpen={() => setUsageOpenId(usageOpenId === coupon._id ? null : coupon._id)}
                    onToggleStatus={handleToggleStatus}
                    onEdit={(c) => { setEditingCoupon(c); setShowModal(true); }}
                    onDuplicate={openDuplicate}
                    onDelete={handleDelete}
                    onCopy={handleCopyCode}
                  />
                ))}
              </div>
            )}
            <div className="cpn-list-foot">
              {visibleCoupons.length} / {coupons.length} kupon gösteriliyor
            </div>
          </section>
        </>
      )}

      {showModal && (
        <CouponModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditingCoupon(null); }}
          coupon={editingCoupon}
          onSave={fetchCoupons}
        />
      )}
    </div>
  );
};

export default CouponsTab;
