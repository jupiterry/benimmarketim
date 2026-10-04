import { useEffect, useState, forwardRef } from "react";
import axios from "../lib/axios";
import {
  Search, Package2, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Printer, Filter, X,
  Clock, Truck, CheckCircle2, XCircle, MapPin, Phone, Mail, User, Calendar,
  AlertTriangle, Trash2, Plus, Minus, Timer, Eye, AlertCircle, Tag
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";
import { useConfirm } from "./ConfirmModal";
import { useUserStore } from "../stores/useUserStore";

// Helper: Sipariş süresini hesapla
const getOrderDuration = (createdAt, updatedAt, status) => {
  const start = new Date(createdAt);
  const end = status === "Teslim Edildi" || status === "İptal Edildi" 
    ? new Date(updatedAt) 
    : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Yeni";
  }
  
  const diffMs = end - start;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins}dk`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}s ${mins}dk` : `${hours}s`;
};

// Helper: Bekleyen sipariş uyarı seviyesi
const getWarningLevel = (createdAt, status) => {
  if (status !== "Hazırlanıyor") return null;
  
  const diffMins = Math.floor((new Date() - new Date(createdAt)) / 60000);
  
  if (diffMins >= 30) return "critical"; // Kırmızı
  if (diffMins >= 15) return "warning";  // Turuncu
  return null;
};

// Helper: Dakika cinsinden bekleme süresi
const getWaitingMinutes = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((new Date() - date) / 60000));
};

const formatOrderDate = (date) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Tarih bilgisi yok";
  return parsed.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ── Sunum yardımcıları (yalnızca görünüm) ─────────────────────────────
const ORDER_STATUSES = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];

const STATUS_UI = {
  "Hazırlanıyor": { tone: "warn", icon: Clock, short: "Hazırlanıyor" },
  "Yolda": { tone: "info", icon: Truck, short: "Yolda" },
  "Teslim Edildi": { tone: "ok", icon: CheckCircle2, short: "Teslim" },
  "İptal Edildi": { tone: "danger", icon: XCircle, short: "İptal" },
};

const StatusBadge = ({ status }) => {
  const ui = STATUS_UI[status] || { tone: "neutral", icon: Clock };
  const Icon = ui.icon;
  return (
    <span className={`ui-badge ui-badge--${ui.tone}`}>
      <Icon /> {status}
    </span>
  );
};

const getPlatformLabel = (platform) =>
  platform === "ios" ? "iOS" : platform === "android" ? "Android" : "Web";

// Skeleton Loading Component
const SkeletonCard = () => (
  <div className="ui-card order-card">
    <div className="order-card-section">
      <div className="order-card-head">
        <div className="ui-skeleton" style={{ width: 38, height: 38, borderRadius: "50%" }}></div>
        <div className="order-card-id">
          <div className="ui-skeleton" style={{ width: "55%", height: 14 }}></div>
          <div className="ui-skeleton" style={{ width: "35%", height: 12, marginTop: 6 }}></div>
        </div>
      </div>
      <div className="ui-skeleton" style={{ width: "100%", height: 54 }}></div>
      <div className="ui-skeleton" style={{ width: "100%", height: 36 }}></div>
    </div>
  </div>
);

// Stat Card Component
const StatCard = ({ title, value, tone }) => (
  <div className="ui-stat">
    <span className="ui-stat-label">
      {tone && <span className={`ui-dot ui-dot--${tone}`} />}
      {title}
    </span>
    <span className="ui-stat-value">{value}</span>
  </div>
);

// Order Detail Modal Component
const OrderDetailModal = ({ order, isOpen, onClose, onStatusUpdate, onDeliveryTracking, onPrint, onDelete }) => {
  if (!isOpen || !order) return null;

  const warningLevel = getWarningLevel(order.createdAt, order.status);
  const duration = getOrderDuration(order.createdAt, order.updatedAt, order.status);

  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div
        className="ui-modal ui-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Sipariş detayı"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="order-card-head">
            <div className="ui-avatar">
              {order.user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="order-card-id">
              <h2 className="ui-title">{order.user?.name}</h2>
              <p className="order-card-sub">#{order.orderId.slice(-8).toUpperCase()}</p>
              {/* Status & Duration */}
              <div className="order-card-tags" style={{ marginTop: 8 }}>
                <StatusBadge status={order.status} />
                <span className="ui-badge">
                  <Timer /> {duration}
                </span>
                {warningLevel && (
                  <span className={`ui-badge ${warningLevel === 'critical' ? 'ui-badge--danger' : 'ui-badge--warn'}`}>
                    <AlertCircle /> {getWaitingMinutes(order.createdAt)}dk bekliyor
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="ui-icon-btn" aria-label="Kapat">
            <X />
          </button>
        </div>

        {/* Content */}
        <div className="ui-modal-body orders-stack">
          {/* Customer Info */}
          <div className="order-detail-grid">
            <div className="order-detail-box">
              <h3 className="ui-overline">Müşteri Bilgileri</h3>
              <p className="orders-meta"><User /> <span>{order.user?.name}</span></p>
              <p className="orders-meta"><Mail /> <span>{order.user?.email || '-'}</span></p>
              <p className="orders-meta"><Phone /> <span>{order.phone || order.user?.phone || '-'}</span></p>
            </div>
            <div className="order-detail-box">
              <h3 className="ui-overline">Teslimat</h3>
              <p className="orders-meta"><MapPin /> <span>{order.deliveryPointName || order.deliveryPoint}</span></p>
              <p className="orders-meta"><Calendar /> <span>{new Date(order.createdAt).toLocaleString('tr-TR')}</span></p>
              <p className="orders-meta"><Package2 /> <span>{order.products?.length || 0} ürün</span></p>
              <label className="ui-label" htmlFor="delivery-tracking-input" style={{ margin: "6px 0 0" }}>Kargo / teslimat takibi</label>
              <div className="order-detail-tracking">
                <input key={order.orderId} id="delivery-tracking-input" defaultValue={order.deliveryTracking || ""} maxLength={120} placeholder="Takip numarası veya teslimat notu" className="ui-field" />
                <button className="ui-btn" onClick={() => onDeliveryTracking(order.orderId, document.getElementById("delivery-tracking-input")?.value || "")}>Takibi kaydet</button>
              </div>
            </div>
          </div>

          {/* Order Note */}
          {order.note && (
            <div className="ui-note">
              <AlertTriangle />
              <div>
                <p className="ui-note-label">Müşteri Notu</p>
                <p className="ui-note-body">{order.note}</p>
              </div>
            </div>
          )}

          {/* Products */}
          <div className="order-items">
            <h3 className="ui-overline">Ürünler</h3>
            {order.products?.map((product, idx) => (
              <div key={idx} className="ui-row">
                <div className="ui-thumb">
                  {product.image ? (
                    <img src={product.image} alt={product.name} />
                  ) : (
                    <Package2 size={20} />
                  )}
                </div>
                <div className="order-item-text">
                  <p className="order-item-name">{product.name}</p>
                  <p className="order-item-sub">₺{product.price} × {product.quantity}</p>
                </div>
                <p className="order-item-total">₺{(product.price * product.quantity).toFixed(2)}</p>
              </div>
            ))}

            {/* Total */}
            <div className="order-detail-total">
              <span>Toplam Tutar</span>
              <strong>₺{order.totalAmount?.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="ui-modal-footer">
          <select
            className="ui-field"
            style={{ flex: "1 1 200px", width: "auto" }}
            aria-label="Sipariş durumu"
            value={order.status}
            onChange={(e) => { onStatusUpdate(order.orderId, e.target.value); onClose(); }}
          >
            <option value="Hazırlanıyor">Hazırlanıyor</option>
            <option value="Yolda">Yolda</option>
            <option value="Teslim Edildi">Teslim Edildi</option>
            <option value="İptal Edildi">İptal Edildi</option>
          </select>
          <button onClick={() => { onPrint(order); onClose(); }} className="ui-btn">
            <Printer /> Yazdır
          </button>
          <button onClick={() => { onDelete(order.orderId); onClose(); }} className="ui-btn ui-btn--danger">
            <Trash2 /> Sil
          </button>
        </div>
      </div>
    </div>
  );
};

// Order Card Component
const OrderCard = forwardRef(({ order, selected, onSelectChange, onStatusUpdate, onPrint, onAddItem, onDelete, onRemoveItem, onUpdateQuantity, onViewDetail }, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const warningLevel = getWarningLevel(order.createdAt, order.status);

  return (
    <article ref={ref} className="ui-card order-card" data-status={order.status} data-selected={selected}>
      {/* Header Section */}
      <div className="order-card-section">
        <div className="order-card-head">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelectChange}
            aria-label={`#${String(order.orderId).slice(-6)} siparişini seç`}
          />
          {/* Name & Meta */}
          <div className="order-card-id">
            <h3 className="order-card-name">
              {order.user?.name}
              {order.isFirstOrder && (
                <span className="ui-badge ui-badge--brand">Yeni</span>
              )}
            </h3>
            <p className="order-card-sub">
              #{order.orderId.slice(-6).toUpperCase()} · {order.userOrderCount || 1}. sipariş
              {order.device && <> · {getPlatformLabel(order.device.platform)}</>}
            </p>
          </div>

          {/* Actions */}
          <div className="order-card-actions">
            <button onClick={() => onViewDetail(order)} title="Sipariş detayını aç" aria-label="Sipariş detayını aç" className="ui-icon-btn">
              <Eye />
            </button>
            <button onClick={() => onPrint(order)} title="Siparişi yazdır" aria-label="Siparişi yazdır" className="ui-icon-btn">
              <Printer />
            </button>
            <button onClick={() => onDelete(order.orderId)} title="Siparişi sil" aria-label="Siparişi sil" className="ui-icon-btn ui-icon-btn--danger">
              <Trash2 />
            </button>
          </div>
        </div>

        {/* Status & Duration Row */}
        <div className="order-card-tags">
          <StatusBadge status={order.status} />
          <span className="ui-badge" title="Sipariş süresi">
            <Timer />
            {getOrderDuration(order.createdAt, order.updatedAt, order.status)}
          </span>
          {warningLevel && (
            <span className={`ui-badge ${warningLevel === 'critical' ? 'ui-badge--danger' : 'ui-badge--warn'}`} title="Bekleme süresi">
              <AlertCircle />
              {getWaitingMinutes(order.createdAt)}dk
            </span>
          )}
          <button onClick={() => onAddItem(order.orderId)} className="ui-btn ui-btn--sm">
            <Plus /> Ekle
          </button>
        </div>
      </div>

      {/* Body Section */}
      <div className="order-card-section">
        {/* Quick Info Row */}
        <div className="order-card-contact">
          <span className="orders-meta"><Mail /> <span>{order.user?.email || "E-posta yok"}</span></span>
          <span className="orders-meta"><Phone /> <span>{order.user?.phone || '-'}</span></span>
          <span className="orders-meta"><MapPin /> <span>{order.deliveryPointName || order.city || 'Belirtilmemiş'}</span></span>
          <span className="orders-meta"><Calendar /> <span>{formatOrderDate(order.createdAt)}</span></span>
        </div>

        {/* Order Summary Compact */}
        <div className="order-card-total">
          <div className="order-card-counts">
            <span><strong>{order.products?.length || 0}</strong>ürün</span>
            <span><strong>{order.products?.reduce((s, p) => s + (p.quantity || 1), 0)}</strong>adet</span>
          </div>
          <p className="order-card-price">
            ₺{order.totalAmount?.toFixed(2)}
            {order.couponCode && order.subtotalAmount > 0 && (
              <small>₺{order.subtotalAmount?.toFixed(2)}</small>
            )}
          </p>
        </div>
        {order.couponCode && (
          <div className="order-card-coupon">
            <span className="ui-badge"><Tag /> {order.couponCode}</span>
            <span>₺{(order.couponDiscount || 0).toFixed(0)} indirim</span>
          </div>
        )}

        {/* Status Change Row */}
        <div className="ui-segmented" role="group" aria-label="Sipariş durumunu değiştir">
          {ORDER_STATUSES.map(status => {
            const ui = STATUS_UI[status];
            const Icon = ui.icon;
            return (
              <button
                key={status}
                onClick={() => onStatusUpdate(order.orderId, status)}
                title={`${status} olarak güncelle`}
                aria-pressed={order.status === status}
                data-tone={ui.tone}
              >
                <Icon /> {ui.short}
              </button>
            );
          })}
        </div>

        {/* Order Note */}
        {order.note && (
          <div className="ui-note">
            <AlertTriangle />
            <div>
              <p className="ui-note-label">Müşteri Notu</p>
              <p className="ui-note-body">{order.note}</p>
            </div>
          </div>
        )}

        {/* Products Toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="ui-btn ui-btn--ghost ui-btn--block"
        >
          <Package2 />
          {isExpanded ? "Ürünleri Gizle" : "Ürünleri Göster"}
          <ChevronDown style={{ transform: isExpanded ? "rotate(180deg)" : "none" }} />
        </button>

        {/* Products List */}
        {isExpanded && (
          <div className="order-items">
            {order.products.map((product, idx) => (
              <div key={idx} className="ui-row order-item">
                <div className="order-item-line">
                  {/* Ürün Görseli */}
                  <div className="ui-thumb">
                    {product.image ? (
                      <img src={product.image} alt={product.name} />
                    ) : (
                      <Package2 size={18} />
                    )}
                  </div>
                  <div className="order-item-text">
                    <p className="order-item-name">{product.name}</p>
                    <p className="order-item-sub">Birim: ₺{product.price}</p>
                  </div>
                  {/* Silme Butonu */}
                  <button
                    onClick={() => onRemoveItem(order.orderId, idx, product.name)}
                    className="ui-icon-btn ui-icon-btn--danger"
                    title="Ürünü Sil"
                    aria-label="Ürünü Sil"
                  >
                    <Trash2 />
                  </button>
                </div>
                <div className="order-item-line">
                  {/* Miktar Kontrolleri */}
                  <div className="ui-stepper">
                    <button
                      onClick={() => onUpdateQuantity(order.orderId, idx, product.quantity - 1)}
                      disabled={product.quantity <= 1}
                      title={product.quantity <= 1 ? "Minimum miktar: 1" : "Miktarı Azalt"}
                      aria-label="Miktarı Azalt"
                    >
                      <Minus />
                    </button>
                    <span>{product.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(order.orderId, idx, product.quantity + 1)}
                      title="Miktarı Artır"
                      aria-label="Miktarı Artır"
                    >
                      <Plus />
                    </button>
                  </div>
                  <p className="order-item-total">
                    ₺{(product.price * product.quantity).toFixed(2)}
                    <span className="order-item-sub"> · {product.quantity} adet</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});
OrderCard.displayName = "OrderCard";

// Main Component
const OrdersList = () => {
  const { user } = useUserStore();
  const accessToken = user?.accessToken;
  const [orderAnalyticsData, setOrderAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [savedFilters, setSavedFilters] = useState(() => { try { return JSON.parse(localStorage.getItem("admin-order-filters") || "[]"); } catch { return []; } });
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [problemOnly, setProblemOnly] = useState(false);
  const [delayedOnly, setDelayedOnly] = useState(false);
  useEffect(() => { const preset = sessionStorage.getItem("admin-order-preset"); if (preset === "active") setStatusFilter("active"); if (preset === "delayed") setDelayedOnly(true); sessionStorage.removeItem("admin-order-preset"); }, []);
  const [dateFilter, setDateFilter] = useState("all");
  const [deliveryPointFilter, setDeliveryPointFilter] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const ordersPerPage = 6;

  // Custom item modal states
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [customItemAmount, setCustomItemAmount] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  
  // Product selection states
  const [addItemTab, setAddItemTab] = useState("catalog"); // "catalog" veya "manual"
  const [productList, setProductList] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  
  // Order Detail Modal state
  const [detailModalOrder, setDetailModalOrder] = useState(null);

  const handleOpenAddItemModal = async (orderId) => {
    setSelectedOrderId(orderId);
    setCustomItemAmount("");
    setCustomItemName("");
    setAddItemTab("catalog");
    setProductSearch("");
    setSelectedProduct(null);
    setProductQuantity(1);
    setShowAddItemModal(true);
    
    // Ürün listesini çek
    await fetchProducts();
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await axios.get("/products");
      setProductList(response.data.products || []);
    } catch (error) {
      console.error("Ürünler yüklenirken hata:", error);
      toast.error("Ürünler yüklenemedi");
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleAddProductFromCatalog = async () => {
    if (!selectedOrderId || !selectedProduct) {
      toast.error("Lütfen bir ürün seçin");
      return;
    }

    try {
      await axios.put("/orders-analytics/add-product", {
        orderId: selectedOrderId,
        productId: selectedProduct._id,
        quantity: productQuantity
      });
      
      toast.success(`${selectedProduct.name} siparişe eklendi`);
      setShowAddItemModal(false);
      fetchOrderAnalyticsData();
    } catch (error) {
      console.error("Ürün eklenirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu");
    }
  };

  const handleAddCustomItem = async (e) => {
    e.preventDefault();
    if (!selectedOrderId || !customItemAmount) return;

    try {
      await axios.put("/orders-analytics/add-item", {
        orderId: selectedOrderId,
        amount: customItemAmount,
        name: customItemName
      });
      
      toast.success("Ürün başarıyla eklendi");
      setShowAddItemModal(false);
      fetchOrderAnalyticsData();
    } catch (error) {
      console.error("Ürün eklenirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu");
    }
  };

  // Filtrelenmiş ürün listesi
  const filteredProducts = productList.filter(product => 
    product.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.category?.toLowerCase().includes(productSearch.toLowerCase())
  );


  const handlePrint = (order) => {
    try {
      const printWindow = window.open('', '_blank', 'width=400,height=700');
      if (!printWindow) return;
  
      const css = `
        <style>
          @page { size: 76mm 127mm; margin: 0; }
          html, body {
            width: 76mm;
            height: 127mm;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: Arial, sans-serif;
            color: #000;
            line-height: 1.25;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
  
          .receipt {
            width: 76mm;
            height: 127mm;
            box-sizing: border-box;
            padding: 6mm;
            overflow: hidden;
          }
          .header { text-align: center; margin-bottom: 6px; }
          .title { font-size: 14px; font-weight: bold; }
          .meta { font-size: 11px; }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin: 3px 0;
            gap: 6px;
          }
          .items {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 4px 0;
            margin: 4px 0;
          }
          .item {
            display: grid;
            grid-template-columns: 1fr auto;
            column-gap: 8px;
            font-size: 11px;
            align-items: start;
          }
          .item .name { max-width: 60%; word-break: break-word; }
          .item .price { min-width: 48px; text-align: right; font-weight: bold; }
          .totals { font-size: 12px; font-weight: bold; }
          * { page-break-inside: avoid; }
        </style>
      `;
  
      const createdAt = new Date(order.createdAt).toLocaleString('tr-TR');
      const itemsHtml = order.products.map(p => `
        <div class="item">
          <div class="name">${p.name} x ${p.quantity}</div>
          <div class="price">₺${Number(p.price || 0).toFixed(2)}</div>
        </div>
      `).join('');
  
      const noteHtml = order.note
        ? `<div class="row"><div>Not:</div><div>${order.note}</div></div>`
        : '';
  
      const deliveryInfo = order.deliveryPointName || order.city || 'Teslimat Noktası Belirtilmemiş';
      
      const html = `
        <html>
          <head><meta charset="utf-8"/>${css}</head>
          <body>
            <div class="receipt">
              <div class="header">
                <div class="title">Benim Marketim</div>
                <div class="meta">Sipariş ID: ${order.orderId}</div>
                <div class="meta">Tarih: ${createdAt}</div>
                <div class="meta">📍 ${deliveryInfo}</div>
              </div>
              <div class="row"><div>Müşteri</div><div>${order.user.name}</div></div>
              <div class="row"><div>Telefon</div><div>${order.user.phone || '-'}</div></div>
              <div class="row"><div>Adres</div><div style="max-width: 170px; text-align:right;">${order.user.address || '-'}</div></div>
              <div class="items">${itemsHtml}</div>
              ${order.couponCode ? `
                <div class="row"><div>Ara Toplam</div><div>₺${(order.subtotalAmount || order.totalAmount).toFixed(2)}</div></div>
                <div class="row" style="color: #9333ea;"><div>🎟️ Kupon (${order.couponCode})</div><div>-₺${(order.couponDiscount || 0).toFixed(2)}</div></div>
              ` : ''}
              <div class="totals row"><div>Toplam</div><div>₺${(order.totalAmount).toFixed(2)}</div></div>
              ${noteHtml}
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #000; text-align: center;">
                <div style="font-size: 11px; font-weight: bold;">Bizi tercih ettiğiniz için teşekkür ederiz! ❤️</div>
                <div style="font-size: 10px; margin-top: 4px; color: #666;">📲 Uygulamayı güncellemeyi unutmayın!</div>
              </div>
            </div>
            <script>
              window.onload = function(){
                try {
                  const el = document.querySelector('.receipt');
                  const maxH = el.clientHeight;
                  const actual = el.scrollHeight;
                  if (actual > maxH) {
                    const scale = maxH / actual;
                    el.style.transformOrigin = 'top left';
                    el.style.transform = 'scale(' + scale.toFixed(3) + ')';
                    el.style.height = maxH + 'px';
                  }
                } catch(e){}
                window.print();
                setTimeout(()=>window.close(), 500);
              }
            <\/script>
          </body>
        </html>
      `;
  
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (e) {
      console.error('Yazdırma hatası:', e);
      toast.error('Yazdırma sırasında hata oluştu');
    }
  };
  
  const fetchOrderAnalyticsData = async () => {
    try {
      const response = await axios.get("/orders-analytics");
      const sortedUsersOrders = response.data.orderAnalyticsData?.usersOrders?.map(userOrder => ({
        ...userOrder,
        orders: userOrder.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      })) || [];

      setOrderAnalyticsData({
        totalOrders: response.data.orderAnalyticsData?.totalOrders || 0,
        usersOrders: sortedUsersOrders,
      });
      setLastRefresh(new Date());
    } catch (error) {
      console.error("API isteği sırasında hata:", error.response || error.message);
      toast.error("Siparişler yüklenirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderAnalyticsData();

    // Browser Notification izni iste
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const socket = socketService.connect();

    if (socket.connected) {
        socket.emit('joinAdminRoom', { token: accessToken });
    } else {
        socket.on('connect', () => {
            socket.emit('joinAdminRoom', { token: accessToken });
        });
    }

    const handleNewOrder = (data) => {
      console.log('Yeni sipariş bildirimi alındı:', data);
      fetchOrderAnalyticsData();
      // Bildirim, ses ve tarayıcı uyarısı AdminPage tarafından tek noktadan
      // yönetilir. Bu bileşen yalnızca sipariş listesini yeniler.
    };

    socket.on('newOrder', handleNewOrder);

    return () => {
      socket.off('newOrder', handleNewOrder);
    };
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchOrderAnalyticsData();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put("/orders-analytics/update-status", { orderId, status });
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.map((order) =>
            order.orderId === orderId ? { ...order, status } : order
          ),
        })),
      }));
      toast.success("Sipariş durumu güncellendi");
    } catch (error) {
      console.error("Sipariş durumu güncellenirken hata:", error);
      toast.error("Sipariş durumu güncellenirken hata oluştu");
    }
  };

  const updateDeliveryTracking = async (orderId, deliveryTracking) => {
    try {
      await axios.put("/orders-analytics/delivery-tracking", { orderId, deliveryTracking });
      toast.success("Teslimat bilgisi kaydedildi");
      fetchOrderAnalyticsData();
    } catch { toast.error("Teslimat bilgisi kaydedilemedi"); }
  };

  const bulkUpdateStatus = async (status) => {
    if (!selectedOrderIds.length) return;
    try {
      await axios.put("/orders-analytics/bulk-status", { orderIds: selectedOrderIds, status });
      setSelectedOrderIds([]);
      fetchOrderAnalyticsData();
      toast.success("Seçili siparişler güncellendi");
    } catch { toast.error("Toplu işlem tamamlanamadı"); }
  };

  const { confirm } = useConfirm();

  const handleDeleteOrder = async (orderId) => {
    const confirmed = await confirm({
      title: 'Siparişi Sil',
      message: 'Bu siparişi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!',
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    
    if (!confirmed) return;
    
    try {
      await axios.delete(`/orders-analytics/delete-order/${orderId}`);
      
      // State'ten siparişi kaldır
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.filter((order) => order.orderId !== orderId),
        })).filter(userOrder => userOrder.orders.length > 0),
      }));
      
      toast.success("Sipariş başarıyla silindi!");
    } catch (error) {
      console.error("Sipariş silinirken hata:", error);
      toast.error(error.response?.data?.message || "Sipariş silinirken hata oluştu");
    }
  };

  // Siparişten ürün silme handler'ı
  const handleRemoveItem = async (orderId, productIndex, productName) => {
    const confirmed = await confirm({
      title: 'Ürünü Sil',
      message: `"${productName}" ürününü siparişten silmek istediğinize emin misiniz?`,
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      type: 'warning'
    });
    
    if (!confirmed) return;
    
    try {
      await axios.delete("/orders-analytics/remove-item", {
        data: { orderId, productIndex }
      });
      
      toast.success(`${productName} siparişten silindi`);
      fetchOrderAnalyticsData();
    } catch (error) {
      console.error("Ürün silinirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün silinirken hata oluştu");
    }
  };

  // Ürün miktarını güncelleme handler'ı
  const handleUpdateQuantity = async (orderId, productIndex, newQuantity) => {
    if (newQuantity < 1) {
      toast.error("Miktar en az 1 olmalı!");
      return;
    }
    
    try {
      await axios.put("/orders-analytics/update-item-quantity", {
        orderId,
        productIndex,
        newQuantity
      });
      
      // Optimistic update - state'i hemen güncelle
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.map((order) => {
            if (order.orderId === orderId) {
              const updatedProducts = [...order.products];
              const oldQuantity = updatedProducts[productIndex].quantity;
              const priceDiff = updatedProducts[productIndex].price * (newQuantity - oldQuantity);
              updatedProducts[productIndex] = {
                ...updatedProducts[productIndex],
                quantity: newQuantity
              };
              return {
                ...order,
                products: updatedProducts,
                totalAmount: order.totalAmount + priceDiff
              };
            }
            return order;
          }),
        })),
      }));
      
      toast.success("Miktar güncellendi");
    } catch (error) {
      console.error("Miktar güncellenirken hata:", error);
      toast.error(error.response?.data?.message || "Miktar güncellenirken hata oluştu");
      // Hata durumunda veriyi yeniden çek
      fetchOrderAnalyticsData();
    }
  };

  // Ürünün manuel işaretini değiştirme handler'ı
  const handleToggleManual = async (orderId, productIndex, isManual) => {
    try {
      await axios.put("/orders-analytics/toggle-manual", {
        orderId,
        productIndex,
        isManual
      });
      
      // Optimistic update - state'i hemen güncelle
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.map((order) => {
            if (order.orderId === orderId) {
              const updatedProducts = [...order.products];
              updatedProducts[productIndex] = {
                ...updatedProducts[productIndex],
                isManual
              };
              return {
                ...order,
                products: updatedProducts
              };
            }
            return order;
          }),
        })),
      }));
      
      toast.success(isManual ? "Ürün manuel olarak işaretlendi" : "Manuel işaret kaldırıldı");
    } catch (error) {
      console.error("Manuel işaret güncellenirken hata:", error);
      toast.error(error.response?.data?.message || "Manuel işaret güncellenirken hata oluştu");
      // Hata durumunda veriyi yeniden çek
      fetchOrderAnalyticsData();
    }
  };


  const filterOrders = (orders) => {
    return orders.filter((order) => {
      const matchesSearch = 
        (order.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.products?.some(product => 
          (product.name || '').toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        (order.user?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = 
        statusFilter === "all" || order.status === statusFilter || (statusFilter === "active" && ["Hazırlanıyor", "Yolda"].includes(order.status));

      const matchesDeliveryPoint = 
        deliveryPointFilter === "all" || 
        order.deliveryPoint === deliveryPointFilter ||
        order.deliveryPointName?.toLowerCase().includes(deliveryPointFilter.toLowerCase());

      const matchesAmount = 
        (!minAmount || order.totalAmount >= parseFloat(minAmount)) &&
        (!maxAmount || order.totalAmount <= parseFloat(maxAmount));

      const orderDate = new Date(order.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      let matchesDate = true;
      if (dateFilter === "today") {
        matchesDate = orderDate.toDateString() === today.toDateString();
      } else if (dateFilter === "yesterday") {
        matchesDate = orderDate.toDateString() === yesterday.toDateString();
      } else if (dateFilter === "lastWeek") {
        matchesDate = orderDate >= lastWeek;
      } else if (dateFilter === "lastMonth") {
        matchesDate = orderDate >= lastMonth;
      }

      const needsAttention = order.status === "Hazırlanıyor" && getWaitingMinutes(order.createdAt) >= 20;
      return matchesSearch && matchesStatus && matchesDate && matchesDeliveryPoint && matchesAmount && (!problemOnly || needsAttention || order.status === "İptal Edildi") && (!delayedOnly || needsAttention);
    });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFilter("all");
    setDeliveryPointFilter("all");
    setMinAmount("");
    setMaxAmount("");
    setProblemOnly(false);
    setDelayedOnly(false);
    setCurrentPage(1);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="orders" aria-busy="true">
        <div className="orders-stats">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="ui-stat">
              <div className="ui-skeleton" style={{ width: 90, height: 13 }}></div>
              <div className="ui-skeleton" style={{ width: 48, height: 26 }}></div>
            </div>
          ))}
        </div>
        <div className="orders-grid">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty State
  if (!orderAnalyticsData || !orderAnalyticsData.usersOrders || orderAnalyticsData.usersOrders.length === 0) {
    return (
      <div className="ui-card ui-empty">
        <Package2 />
        <h3 className="ui-title">Henüz sipariş yok</h3>
        <p>Yeni siparişler burada görünecek</p>
      </div>
    );
  }

  const filteredOrders = orderAnalyticsData.usersOrders.flatMap(userOrder => {
    // Kullanıcının en eski siparişini bul (ilk sipariş)
    const sortedByDate = [...userOrder.orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const firstOrderId = sortedByDate.length > 0 ? sortedByDate[0].orderId : null;
    const totalOrders = userOrder.orders.length;
    
    // Önce user bilgisini ekle
    const ordersWithUser = userOrder.orders.map(order => ({
      ...order,
      user: userOrder.user,
      isFirstOrder: order.orderId === firstOrderId,
      userOrderCount: totalOrders
    }));
    
    // Sonra filtrele
    return filterOrders(ordersWithUser);
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const currentOrders = filteredOrders.slice(
    (currentPage - 1) * ordersPerPage,
    currentPage * ordersPerPage
  );

  const stats = {
    total: filteredOrders.length,
    preparing: filteredOrders.filter(o => o.status === "Hazırlanıyor").length,
    onWay: filteredOrders.filter(o => o.status === "Yolda").length,
    delivered: filteredOrders.filter(o => o.status === "Teslim Edildi").length,
    cancelled: filteredOrders.filter(o => o.status === "İptal Edildi").length
  };

  const priorityOrders = filteredOrders
    .filter((order) => order.status === "Hazırlanıyor" || order.status === "Yolda")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, 3);

  return (
    <div className="orders">
      {/* Header */}
      <div className="orders-topbar">
        <p className="ui-subtitle">
          Son güncelleme: <span className="ui-num">{lastRefresh.toLocaleTimeString('tr-TR')}</span>
        </p>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          aria-pressed={autoRefresh}
          className="ui-btn"
        >
          <RefreshCw />
          <span>{autoRefresh ? 'Otomatik Yenileme Açık' : 'Otomatik Yenileme Kapalı'}</span>
        </button>
      </div>

      {/* Mini Daily Stats Bar */}
      {(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrders = filteredOrders.filter(o => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= today;
        });
        const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const avgOrderValue = todayOrders.length > 0 ? todayRevenue / todayOrders.length : 0;
        const pendingOrders = todayOrders.filter(o => o.status === 'Hazırlanıyor').length;

        return (
          <div className="ui-card orders-today">
            <span className="ui-overline">Bugün</span>
            <span className="orders-today-item">
              <strong>{todayOrders.length}</strong> sipariş
            </span>
            <span className="orders-today-item">
              <strong>₺{todayRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong> ciro
            </span>
            <span className="orders-today-item">
              <strong>₺{avgOrderValue.toFixed(0)}</strong> ort.
            </span>
            <span className="orders-today-spacer" />
            {pendingOrders > 0 && (
              <span className="ui-badge ui-badge--warn">
                <Clock /> {pendingOrders} bekliyor
              </span>
            )}
          </div>
        );
      })()}

      {/* Stats Cards */}
      <div className="orders-stats">
        <StatCard
          title="Toplam Sipariş"
          value={stats.total}
        />
        <StatCard
          title="Hazırlanıyor"
          value={stats.preparing}
          tone="warn"
        />
        <StatCard
          title="Yolda"
          value={stats.onWay}
          tone="info"
        />
        <StatCard
          title="Teslim Edildi"
          value={stats.delivered}
          tone="ok"
        />
        <StatCard
          title="İptal Edildi"
          value={stats.cancelled}
          tone="danger"
        />
      </div>

      {/* Operations queue: the next actions are visible without opening each card */}
      <section className="ui-card">
        <div className="ui-card-header">
          <div>
            <h3 className="ui-title">Operasyon kuyruğu</h3>
            <p className="ui-subtitle">Sıradaki aksiyon gerektiren siparişler</p>
          </div>
          <div className="orders-filter-row">
            <button onClick={() => { setStatusFilter("Hazırlanıyor"); setCurrentPage(1); }} className="ui-btn ui-btn--sm"><span className="ui-dot ui-dot--warn" />{stats.preparing} hazırlanıyor</button>
            <button onClick={() => { setStatusFilter("Yolda"); setCurrentPage(1); }} className="ui-btn ui-btn--sm"><span className="ui-dot ui-dot--info" />{stats.onWay} yolda</button>
          </div>
        </div>
        {priorityOrders.length > 0 ? (
          <div className="orders-queue">
            {priorityOrders.map((order) => {
              const waitingMinutes = getWaitingMinutes(order.createdAt);
              const needsAttention = order.status === "Hazırlanıyor" && waitingMinutes >= 20;
              const nextStatus = order.status === "Hazırlanıyor" ? "Yolda" : "Teslim Edildi";
              const nextLabel = order.status === "Hazırlanıyor" ? "Yola çıkar" : "Teslim edildi";
              return (
                <div key={`priority-${order.orderId}`} className="orders-queue-item">
                  <div className="orders-queue-line">
                    <div className="order-card-id">
                      <p className="order-card-name">{order.user?.name || "Müşteri"}</p>
                      <p className="order-card-sub">#{String(order.orderId).slice(-6).toUpperCase()} · {order.products?.length || 0} ürün</p>
                    </div>
                    <span className={`ui-badge ${needsAttention ? "ui-badge--danger" : ""}`}><Timer />{getOrderDuration(order.createdAt, order.updatedAt, order.status)}</span>
                  </div>
                  <div className="orders-queue-line">
                    <span className="orders-meta"><MapPin /><span>{order.deliveryPointName || order.deliveryPoint || "Teslimat noktası"}</span></span>
                    <span className="orders-amount">₺{Number(order.totalAmount || 0).toFixed(2)}</span>
                  </div>
                  <div className="orders-queue-actions">
                    <button onClick={() => setDetailModalOrder(order)} className="ui-btn ui-btn--sm">Detay</button>
                    <button onClick={() => updateOrderStatus(order.orderId, nextStatus)} className="ui-btn ui-btn--sm ui-btn--primary">{nextLabel}</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ui-card-body orders-meta"><CheckCircle2 /><span>Şu an aksiyon bekleyen aktif sipariş bulunmuyor.</span></div>
        )}
      </section>

      {/* Filters */}
      <div className="ui-card ui-card-body">
        <div className="orders-filter-row">
          {/* Search */}
          <div className="ui-search">
            <Search />
            <input
              type="text"
              placeholder="Sipariş ID, ürün veya müşteri ara..."
              aria-label="Sipariş ara"
              className="ui-field"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Quick Filters */}
          <select
            className="ui-field ui-field--auto"
            aria-label="Durum filtresi"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif siparişler</option>
            <option value="Hazırlanıyor">Hazırlanıyor</option>
            <option value="Yolda">Yolda</option>
            <option value="Teslim Edildi">Teslim Edildi</option>
            <option value="İptal Edildi">İptal Edildi</option>
          </select>

          <select
            className="ui-field ui-field--auto"
            aria-label="Tarih filtresi"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            <option value="all">Tüm Tarihler</option>
            <option value="today">Bugün</option>
            <option value="yesterday">Dün</option>
            <option value="lastWeek">Son 7 Gün</option>
            <option value="lastMonth">Son 30 Gün</option>
          </select>

          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            aria-pressed={showAdvancedFilters}
            aria-expanded={showAdvancedFilters}
            className="ui-btn"
            style={{ minHeight: 38 }}
          >
            <Filter />
            <span>Gelişmiş</span>
          </button>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div>
            <hr className="orders-filter-divider" />
            <div className="orders-topbar" style={{ marginBottom: 12 }}>
              <h3 className="ui-overline">Gelişmiş Filtreler</h3>
              <button onClick={clearFilters} className="ui-btn ui-btn--ghost ui-btn--sm">
                <X />
                Temizle
              </button>
            </div>

            <div className="orders-advanced">
              <div>
                <label className="ui-label" htmlFor="orders-delivery-point">Teslimat Noktası</label>
                <select
                  id="orders-delivery-point"
                  className="ui-field"
                  value={deliveryPointFilter}
                  onChange={(e) => setDeliveryPointFilter(e.target.value)}
                >
                  <option value="all">Tümü</option>
                  <option value="girlsDorm">Kız KYK Yurdu</option>
                  <option value="boysDorm">Erkek KYK Yurdu</option>
                </select>
              </div>

              <div>
                <label className="ui-label" htmlFor="orders-min-amount">Minimum Tutar (₺)</label>
                <input
                  id="orders-min-amount"
                  type="number"
                  placeholder="0"
                  className="ui-field"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="ui-label" htmlFor="orders-max-amount">Maximum Tutar (₺)</label>
                <input
                  id="orders-max-amount"
                  type="number"
                  placeholder="∞"
                  className="ui-field"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Active Filters Tags */}
            {(deliveryPointFilter !== "all" || minAmount || maxAmount) && (
              <div className="orders-filter-row" style={{ marginTop: 12 }}>
                {deliveryPointFilter !== "all" && (
                  <span className="ui-badge ui-badge--brand">
                    <MapPin /> {deliveryPointFilter === "girlsDorm" ? "Kız Yurdu" : "Erkek Yurdu"}
                    <button onClick={() => setDeliveryPointFilter("all")} aria-label="Teslimat noktası filtresini kaldır">
                      <X />
                    </button>
                  </span>
                )}
                {minAmount && (
                  <span className="ui-badge ui-badge--brand">
                    Min: ₺{minAmount}
                    <button onClick={() => setMinAmount("")} aria-label="Minimum tutar filtresini kaldır">
                      <X />
                    </button>
                  </span>
                )}
                {maxAmount && (
                  <span className="ui-badge ui-badge--brand">
                    Max: ₺{maxAmount}
                    <button onClick={() => setMaxAmount("")} aria-label="Maximum tutar filtresini kaldır">
                      <X />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Hazır ve kayıtlı filtreler */}
        <hr className="orders-filter-divider" />
        <div className="orders-filter-row">
          <button className="ui-btn ui-btn--sm" aria-pressed={problemOnly} onClick={() => { setProblemOnly(true); setDelayedOnly(false); setCurrentPage(1); }}><AlertTriangle />Sorunlu siparişler</button>
          {savedFilters.map((item, index) => <span key={index} className="orders-saved"><button className="ui-btn ui-btn--sm" onClick={() => { setStatusFilter(item.statusFilter); setDateFilter(item.dateFilter); setProblemOnly(item.problemOnly); setDelayedOnly(item.delayedOnly || false); setCurrentPage(1); }}>{item.name}</button><button aria-label={`${item.name} filtresini sil`} className="ui-icon-btn ui-icon-btn--danger" onClick={() => { const next = savedFilters.filter((_, i) => i !== index); setSavedFilters(next); localStorage.setItem("admin-order-filters", JSON.stringify(next)); }}><X /></button></span>)}
          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => { const name = window.prompt("Filtre adı"); if (!name?.trim()) return; const next = [...savedFilters, { name: name.trim().slice(0, 40), statusFilter, dateFilter, problemOnly, delayedOnly }].slice(-8); setSavedFilters(next); localStorage.setItem("admin-order-filters", JSON.stringify(next)); }}><Plus />Bu filtreyi kaydet</button>
        </div>
      </div>

      {/* Toplu işlem */}
      <div className="ui-card orders-bulk">
        <label className="ui-check"><input type="checkbox" checked={currentOrders.length > 0 && currentOrders.every(o => selectedOrderIds.includes(o.orderId))} onChange={e => setSelectedOrderIds(e.target.checked ? [...new Set([...selectedOrderIds, ...currentOrders.map(o => o.orderId)])] : selectedOrderIds.filter(id => !currentOrders.some(o => o.orderId === id)))} /> Bu sayfadakileri seç</label>
        <span className="ui-muted ui-num">{selectedOrderIds.length} seçili</span>
        <span className="orders-today-spacer" />
        <select className="ui-field ui-field--auto" aria-label="Toplu durum değiştir" defaultValue="" onChange={e => { bulkUpdateStatus(e.target.value); e.target.value = ""; }}><option value="" disabled>Toplu durum değiştir</option>{["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"].map(s => <option key={s} value={s}>{s}</option>)}</select>
      </div>

      {/* Orders Grid */}
      {currentOrders.length > 0 ? (
        <div className="orders-grid">
          {currentOrders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              selected={selectedOrderIds.includes(order.orderId)}
              onSelectChange={e => setSelectedOrderIds(e.target.checked ? [...selectedOrderIds, order.orderId] : selectedOrderIds.filter(id => id !== order.orderId))}
              onStatusUpdate={updateOrderStatus}
              onPrint={handlePrint}
              onAddItem={handleOpenAddItemModal}
              onDelete={handleDeleteOrder}
              onRemoveItem={handleRemoveItem}
              onUpdateQuantity={handleUpdateQuantity}
              onViewDetail={(order) => setDetailModalOrder(order)}
            />
          ))}
        </div>
      ) : (
        <div className="ui-card ui-empty">
          <Search />
          <h3 className="ui-title">Eşleşen sipariş yok</h3>
          <p>Arama veya filtreleri değiştirerek tekrar deneyin.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="ui-pagination" aria-label="Sayfalama">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            aria-label="Önceki sayfa"
          >
            <ChevronLeft />
          </button>

          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            return (
              <button
                key={i}
                onClick={() => setCurrentPage(pageNum)}
                aria-current={currentPage === pageNum ? "page" : undefined}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            aria-label="Sonraki sayfa"
          >
            <ChevronRight />
          </button>
        </nav>
      )}

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="ui-modal-backdrop" onClick={() => setShowAddItemModal(false)}>
          <div
            className="ui-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Siparişe Ürün Ekle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-modal-header">
              <h3 className="ui-title">Siparişe Ürün Ekle</h3>
              <button onClick={() => setShowAddItemModal(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>

            <div className="ui-modal-body orders-stack">
              {/* Tab Buttons */}
              <div className="ui-segmented">
                <button onClick={() => setAddItemTab("catalog")} aria-pressed={addItemTab === "catalog"}>
                  Katalogdan Seç
                </button>
                <button onClick={() => setAddItemTab("manual")} aria-pressed={addItemTab === "manual"}>
                  Manuel Ekle
                </button>
              </div>

              {/* Catalog Tab */}
              {addItemTab === "catalog" && (
                <div className="orders-stack">
                  {/* Search */}
                  <div className="ui-search">
                    <Search />
                    <input
                      type="text"
                      placeholder="Ürün ara..."
                      aria-label="Ürün ara"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="ui-field"
                    />
                  </div>

                  {/* Product List */}
                  <div className="orders-product-list">
                    {loadingProducts ? (
                      <div className="ui-empty" style={{ padding: "28px 12px" }}>
                        <RefreshCw className="ui-spin" style={{ width: 22, height: 22 }} />
                        Ürünler yükleniyor...
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="ui-empty" style={{ padding: "28px 12px" }}>
                        Ürün bulunamadı
                      </div>
                    ) : (
                      filteredProducts.slice(0, 20).map((product) => (
                        <div
                          key={product._id}
                          onClick={() => setSelectedProduct(product)}
                          className="ui-row ui-row--selectable"
                          data-selected={selectedProduct?._id === product._id}
                        >
                          <div className="ui-thumb" style={{ width: 38, height: 38 }}>
                            {product.image ? (
                              <img src={product.image} alt={product.name} />
                            ) : (
                              <Package2 size={16} />
                            )}
                          </div>
                          <div className="order-item-text">
                            <p className="order-item-name">{product.name}</p>
                            <p className="order-item-sub">{product.category}</p>
                          </div>
                          <p className="order-item-total">₺{product.price}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Selected Product & Quantity */}
                  {selectedProduct && (
                    <div className="order-detail-box" style={{ background: "var(--ui-surface-2)" }}>
                      <div className="orders-queue-line">
                        <span className="order-item-name">{selectedProduct.name}</span>
                        <span className="orders-amount">₺{(selectedProduct.price * productQuantity).toFixed(2)}</span>
                      </div>
                      <div className="orders-queue-line" style={{ justifyContent: "flex-start" }}>
                        <span className="ui-muted">Adet:</span>
                        <div className="ui-stepper">
                          <button
                            type="button"
                            onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))}
                            aria-label="Adedi azalt"
                          >
                            <Minus />
                          </button>
                          <span>{productQuantity}</span>
                          <button
                            type="button"
                            onClick={() => setProductQuantity(productQuantity + 1)}
                            aria-label="Adedi artır"
                          >
                            <Plus />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="orders-queue-actions">
                    <button
                      type="button"
                      onClick={() => setShowAddItemModal(false)}
                      className="ui-btn"
                    >
                      İptal
                    </button>
                    <button
                      type="button"
                      onClick={handleAddProductFromCatalog}
                      disabled={!selectedProduct}
                      className="ui-btn ui-btn--primary"
                    >
                      Ekle
                    </button>
                  </div>
                </div>
              )}

              {/* Manual Tab */}
              {addItemTab === "manual" && (
                <form onSubmit={handleAddCustomItem} className="orders-stack">
                  <div>
                    <label className="ui-label" htmlFor="orders-custom-amount">Tutar (TL) *</label>
                    <input
                      id="orders-custom-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={customItemAmount}
                      onChange={(e) => setCustomItemAmount(e.target.value)}
                      className="ui-field"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="ui-label" htmlFor="orders-custom-name">Ürün Adı (Opsiyonel)</label>
                    <input
                      id="orders-custom-name"
                      type="text"
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      className="ui-field"
                      placeholder="Özel Ekleme"
                    />
                  </div>

                  <div className="orders-queue-actions">
                    <button
                      type="button"
                      onClick={() => setShowAddItemModal(false)}
                      className="ui-btn"
                    >
                      İptal
                    </button>
                    <button type="submit" className="ui-btn ui-btn--primary">
                      Ekle
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={detailModalOrder}
        isOpen={!!detailModalOrder}
        onClose={() => setDetailModalOrder(null)}
        onStatusUpdate={updateOrderStatus}
        onDeliveryTracking={updateDeliveryTracking}
        onPrint={handlePrint}
        onDelete={handleDeleteOrder}
      />
    </div>
  );
};

export default OrdersList;
