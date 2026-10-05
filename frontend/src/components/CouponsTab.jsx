import { useState, useEffect } from "react";
import {
  Tag, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, Percent,
  DollarSign, Users, Copy, X, Search, Zap,
  RefreshCw, Check, ChevronDown, ChevronUp, ShoppingBag
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import CouponRequestCampaignPanel from "./CouponRequestCampaignPanel";

// Stat Card Component
const StatCard = ({ title, value, tone, subtext }) => (
  <div className="ui-stat">
    <span className="ui-stat-label">
      {tone && <span className={`ui-dot ui-dot--${tone}`} />}
      {title}
    </span>
    <span className="ui-stat-value">{value}</span>
    {subtext && <span className="ui-text-xs ui-muted">{subtext}</span>}
  </div>
);

// Coupon Creation/Edit Modal
const CouponModal = ({ isOpen, onClose, coupon, onSave }) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const payload = {
        ...formData,
        maximumDiscount: formData.maximumDiscount || null,
        usageLimit: formData.usageLimit || null
      };

      if (coupon?._id) {
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

  if (!isOpen) return null;

  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label={coupon ? "Kupon Düzenle" : "Yeni Kupon Oluştur"}>
        <div className="ui-modal-header">
          <h3 className="ui-title">
            {coupon ? "Kupon Düzenle" : "Yeni Kupon Oluştur"}
          </h3>
          <button onClick={onClose} className="ui-icon-btn" aria-label="Kapat">
            <X />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="ui-modal-body ui-stack">
          {/* Kupon Kodu */}
          <div>
            <label className="ui-label" htmlFor="coupon-code">Kupon Kodu</label>
            <div className="order-detail-tracking">
              <input
                id="coupon-code"
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                className="ui-field ui-mono"
                required
                placeholder="INDIRIM20"
              />
              <button
                type="button"
                onClick={generateRandomCode}
                className="ui-btn"
                style={{ minHeight: 38 }}
                title="Rastgele kod üret"
              >
                <Zap />
                Üret
              </button>
            </div>
          </div>

          {/* Açıklama */}
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

          {/* İndirim Tipi */}
          <div>
            <span className="ui-label">İndirim Tipi</span>
            <div className="ui-segmented">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, discountType: "percentage" }))}
                aria-pressed={formData.discountType === "percentage"}
              >
                <Percent />
                Yüzde
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, discountType: "fixed" }))}
                aria-pressed={formData.discountType === "fixed"}
              >
                <DollarSign />
                Sabit Tutar
              </button>
            </div>
          </div>

          {/* İndirim Değeri */}
          <div className="ui-grid-2">
            <div>
              <label className="ui-label" htmlFor="coupon-value">
                {formData.discountType === "percentage" ? "İndirim Yüzdesi (%)" : "İndirim Tutarı (₺)"}
              </label>
              <input
                id="coupon-value"
                type="number"
                value={formData.discountType === "percentage" ? formData.discountPercentage : formData.discountAmount}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  [formData.discountType === "percentage" ? "discountPercentage" : "discountAmount"]: parseFloat(e.target.value)
                }))}
                className="ui-field"
                min="0"
                max={formData.discountType === "percentage" ? 100 : undefined}
                required
              />
            </div>
            {formData.discountType === "percentage" && (
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
            )}
          </div>

          <div className="ui-grid-2">
            <div>
              <label className="ui-label" htmlFor="coupon-user-limit">Kullanıcı Başına Limit</label>
              <input id="coupon-user-limit" type="number" min="1" value={formData.userUsageLimit}
                onChange={(e) => setFormData(prev => ({ ...prev, userUsageLimit: Number(e.target.value) || 1 }))}
                className="ui-field" />
            </div>
            {formData.newUsersOnly && (
              <div>
                <label className="ui-label" htmlFor="coupon-new-days">Yeni Kullanıcı Süresi (gün)</label>
                <input id="coupon-new-days" type="number" min="1" value={formData.newUserDays}
                  onChange={(e) => setFormData(prev => ({ ...prev, newUserDays: Number(e.target.value) || 30 }))}
                  className="ui-field" />
              </div>
            )}
          </div>

          {/* Limitler */}
          <div className="ui-grid-2">
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
          </div>

          {/* Son Kullanma Tarihi */}
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

          <hr className="ui-divider" style={{ margin: 0 }} />
          <h4 className="ui-overline">Kapsam ve zamanlama</h4>

          <div>
            <label className="ui-label" htmlFor="coupon-categories">Geçerli Kategoriler</label>
            <input id="coupon-categories" value={formData.applicableCategories.join(", ")}
              onChange={(e) => setFormData(prev => ({ ...prev, applicableCategories: e.target.value.split(",").map(v => v.trim()).filter(Boolean) }))}
              placeholder="Örn: İçecekler, Atıştırmalık (boşsa tümü)"
              className="ui-field" />
          </div>
          <div>
            <label className="ui-label" htmlFor="coupon-products">Geçerli Ürünler (boşsa tümü)</label>
            <select id="coupon-products" multiple value={formData.applicableProducts}
              onChange={(e) => setFormData(prev => ({ ...prev, applicableProducts: Array.from(e.target.selectedOptions, option => option.value) }))}
              className="ui-field" style={{ minHeight: 128, padding: "6px 8px" }}>
              {productOptions.map(product => <option key={product._id} value={product._id}>{product.name} — {product.category}</option>)}
            </select>
            <p className="ui-hint">Birden fazla ürün için Ctrl/Command tuşuyla seçim yapın.</p>
          </div>

          <div>
            <span className="ui-label">Geçerli Günler (boşsa her gün)</span>
            <div className="ui-cluster" style={{ gap: 6 }}>
              {[['Paz',0],['Pzt',1],['Sal',2],['Çar',3],['Per',4],['Cum',5],['Cmt',6]].map(([label, day]) => (
                <button key={day} type="button" onClick={() => toggleArrayValue('validDays', day)}
                  aria-pressed={formData.validDays.includes(day)}
                  className="ui-btn ui-btn--sm">{label}</button>
              ))}
            </div>
          </div>
          <div className="ui-grid-2">
            <div><label className="ui-label" htmlFor="coupon-start-time">Başlangıç Saati</label><input id="coupon-start-time" type="time" value={formData.startTime} onChange={(e) => setFormData(prev => ({...prev,startTime:e.target.value}))} className="ui-field" /></div>
            <div><label className="ui-label" htmlFor="coupon-end-time">Bitiş Saati</label><input id="coupon-end-time" type="time" value={formData.endTime} onChange={(e) => setFormData(prev => ({...prev,endTime:e.target.value}))} className="ui-field" /></div>
          </div>
          <div className="ui-grid-2">
            <div className="ui-stack ui-stack--sm"><span className="ui-label" style={{ marginBottom: 0 }}>Teslimat Noktaları</span>{[['Kız Yurdu','girlsDorm'],['Erkek Yurdu','boysDorm']].map(([label,value]) => <label key={value} className="ui-check"><input type="checkbox" checked={formData.deliveryPoints.includes(value)} onChange={() => toggleArrayValue('deliveryPoints',value)} />{label}</label>)}</div>
            <div className="ui-stack ui-stack--sm"><span className="ui-label" style={{ marginBottom: 0 }}>Kanallar</span>{[['Web','web'],['Android','android'],['iOS','ios']].map(([label,value]) => <label key={value} className="ui-check"><input type="checkbox" checked={formData.channels.includes(value)} onChange={() => toggleArrayValue('channels',value)} />{label}</label>)}</div>
          </div>

          {/* Özel Koşullar */}
          <div className="ui-stack ui-stack--sm">
            <span className="ui-label" style={{ marginBottom: 0 }}>Özel Koşullar</span>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={formData.firstOrderOnly}
                onChange={(e) => setFormData(prev => ({ ...prev, firstOrderOnly: e.target.checked }))}
              />
              <span>Sadece ilk sipariş için geçerli</span>
            </label>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={formData.newUsersOnly}
                onChange={(e) => setFormData(prev => ({ ...prev, newUsersOnly: e.target.checked }))}
              />
              <span>Sadece yeni kullanıcılar için</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="orders-queue-actions">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="ui-btn ui-btn--primary"
            >
              {saving ? (
                <RefreshCw className="ui-spin" />
              ) : (
                <Check />
              )}
              {coupon ? "Güncelle" : "Oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Component
const CouponsTab = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all"); // all, active, expired
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [usageOpenId, setUsageOpenId] = useState(null);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
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
      message: 'Bu kuponu silmek istediğinize emin misiniz?',
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

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success("Kupon kodu kopyalandı!");
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = coupon.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coupon.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const now = new Date();
    const isExpired = new Date(coupon.expirationDate) < now;
    
    if (filter === "active") return matchesSearch && coupon.isActive && !isExpired;
    if (filter === "expired") return matchesSearch && isExpired;
    return matchesSearch;
  });

  const stats = {
    total: coupons.length,
    active: coupons.filter(c => c.isActive && new Date(c.expirationDate) > new Date()).length,
    expired: coupons.filter(c => new Date(c.expirationDate) < new Date()).length,
    totalUsage: coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0)
  };

  if (loading) {
    return (
      <div className="ui-loading">
        <div className="ui-loader"></div>
      </div>
    );
  }

  return (
    <div className="ui-page">
      {/* Header */}
      <header className="app-pagehead">
        <div>
          <h1>Kuponlar</h1>
          <p>Doğru fırsatı sunun. Kuponları ve kullanım geçmişlerini takip edin.</p>
        </div>
        <button
          onClick={() => { setEditingCoupon(null); setShowModal(true); }}
          className="ui-btn ui-btn--primary"
        >
          <Plus />
          Yeni Kupon
        </button>
      </header>

      <CouponRequestCampaignPanel />

      {/* Stats */}
      <div className="ui-stats">
        <StatCard title="Toplam Kupon" value={stats.total} />
        <StatCard title="Aktif" value={stats.active} tone="ok" />
        <StatCard title="Süresi Dolmuş" value={stats.expired} tone="danger" />
        <StatCard title="Toplam Kullanım" value={stats.totalUsage} />
        {analytics?.summary && (
          <>
            <StatCard title="Kuponlu Sipariş Geliri" value={`₺${Number(analytics.summary.attributedRevenue || 0).toFixed(2)}`} subtext={`${analytics.summary.couponOrders || 0} sipariş`} />
            <StatCard title="Sağlanan Toplam İndirim" value={`₺${Number(analytics.summary.totalDiscount || 0).toFixed(2)}`} />
          </>
        )}
      </div>

      {/* Coupons List */}
      <section className="ui-card" style={{ overflow: "hidden" }}>
        {/* Search & Filter */}
        <div className="ui-card-body ui-cluster" style={{ borderBottom: "1px solid var(--ui-line)" }}>
          <div className="ui-search ui-grow" style={{ flexBasis: 240 }}>
            <Search />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Kupon kodu veya açıklama ara..."
              aria-label="Kupon ara"
              className="ui-field"
            />
          </div>
          <div className="ui-segmented">
            {[
              { key: "all", label: "Tümü" },
              { key: "active", label: "Aktif" },
              { key: "expired", label: "Süresi Dolmuş" }
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ui-list-head coupons-cols">
          <div>Kupon</div>
          <div>İndirim</div>
          <div>Kullanım</div>
          <div>Sipariş Geliri</div>
          <div>Son Tarih</div>
          <div className="ui-right">İşlemler</div>
        </div>
        {filteredCoupons.length === 0 ? (
          <div className="ui-empty">
            <Tag />
            <p>Kupon bulunamadı</p>
          </div>
        ) : (
          filteredCoupons.map(coupon => {
            const isExpired = new Date(coupon.expirationDate) < new Date();
            const campaignStats = analytics?.campaigns?.find(item => item.code === coupon.code);
            
            return (
              <div key={coupon._id} className="coupons-item" data-muted={isExpired || !coupon.isActive}>
                <div className="ui-list-row coupons-cols" style={{ borderBottom: 0 }}>
                  <div className="ui-grow">
                    <div className="ui-cluster" style={{ gap: 6 }}>
                      <span className="ui-list-title ui-mono">{coupon.code}</span>
                      <button
                        onClick={() => handleCopyCode(coupon.code)}
                        className="ui-icon-btn ui-icon-btn--sm"
                        title="Kodu kopyala"
                        aria-label="Kodu kopyala"
                      >
                        <Copy />
                      </button>
                      {isExpired ? (
                        <span className="ui-badge ui-badge--danger">Süresi Dolmuş</span>
                      ) : coupon.isActive ? (
                        <span className="ui-badge ui-badge--ok">Aktif</span>
                      ) : (
                        <span className="ui-badge">Pasif</span>
                      )}
                    </div>
                    <p className="ui-list-sub ui-truncate">{coupon.description || "Açıklama yok"}</p>
                  </div>

                  <div>
                    <span className="ui-cell-label">İndirim</span>
                    <span className="ui-strong ui-num">
                      {coupon.discountType === "percentage" 
                        ? `%${coupon.discountPercentage}` 
                        : `₺${coupon.discountAmount}`}
                    </span>
                  </div>
                  <div>
                    <span className="ui-cell-label">Kullanım</span>
                    <span className="ui-num">{coupon.usageCount || 0}</span>
                  </div>
                  <div>
                    <span className="ui-cell-label">Sipariş Geliri</span>
                    <span className="ui-num">₺{Number(campaignStats?.revenue || 0).toFixed(0)}</span>
                  </div>
                  <div>
                    <span className="ui-cell-label">Son Tarih</span>
                    <span className="ui-num ui-text-sm">
                      {new Date(coupon.expirationDate).toLocaleDateString('tr-TR')}
                    </span>
                  </div>

                  <div className="products-actions">
                    <button
                      onClick={() => handleToggleStatus(coupon._id)}
                      className="ui-icon-btn"
                      style={coupon.isActive ? { color: "var(--ui-ok)" } : undefined}
                      title={coupon.isActive ? "Pasife al" : "Aktifleştir"}
                      aria-label={coupon.isActive ? "Pasife al" : "Aktifleştir"}
                    >
                      {coupon.isActive ? <ToggleRight style={{ width: 22, height: 22 }} /> : <ToggleLeft style={{ width: 22, height: 22 }} />}
                    </button>
                    <button
                      onClick={() => { setEditingCoupon(coupon); setShowModal(true); }}
                      className="ui-icon-btn"
                      title="Düzenle"
                      aria-label="Düzenle"
                    >
                      <Edit2 />
                    </button>
                    <button
                      onClick={() => handleDelete(coupon._id)}
                      className="ui-icon-btn ui-icon-btn--danger"
                      title="Sil"
                      aria-label="Sil"
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
                {(coupon.usedBy?.length || 0) > 0 && (
                  <div className="coupons-usage">
                    <button
                      onClick={() => setUsageOpenId(usageOpenId === coupon._id ? null : coupon._id)}
                      aria-expanded={usageOpenId === coupon._id}
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      <Users /> Kullanım geçmişi ({coupon.usedBy.length})
                      {usageOpenId === coupon._id ? <ChevronUp /> : <ChevronDown />}
                    </button>
                    {usageOpenId === coupon._id && (
                      <div className="ui-stack ui-stack--sm" style={{ marginTop: 8 }}>
                        {coupon.usedBy.map((usage) => (
                          <div key={`${usage.user?._id || usage.user}-${usage.usedAt}`} className="ui-row ui-between ui-text-xs">
                            <span className="ui-strong">{usage.user?.name || "Silinmiş kullanıcı"}</span>
                            <span className="ui-muted ui-wrap-anywhere">{usage.user?.email || "E-posta yok"}</span>
                            <span className="orders-meta ui-text-xs"><ShoppingBag /> #{String(usage.orderId?._id || usage.orderId || "").slice(-6).toUpperCase() || "-"}</span>
                            <span className="ui-muted ui-num">{usage.usedAt ? new Date(usage.usedAt).toLocaleString("tr-TR") : "Tarih yok"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Modal */}
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
