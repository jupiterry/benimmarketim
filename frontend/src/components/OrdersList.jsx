import { Fragment, useEffect, useState } from "react";
import axios from "../lib/axios";
import {
  Search, Package2, ChevronLeft, ChevronRight, RefreshCw, Printer, SlidersHorizontal, X,
  Clock, Truck, CheckCircle2, XCircle, MapPin, Phone, Mail, Calendar,
  AlertTriangle, Trash2, Plus, Minus, Timer, AlertCircle, Tag, Bookmark
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

const STATUS_CHIPS = [
  { value: "all", label: "Tümü" },
  { value: "active", label: "Aktif" },
  { value: "Hazırlanıyor", label: "Hazırlanıyor", tone: "warn" },
  { value: "Yolda", label: "Yolda", tone: "info" },
  { value: "Teslim Edildi", label: "Teslim edildi", tone: "ok" },
  { value: "İptal Edildi", label: "İptal", tone: "danger" },
];

const StatusBadge = ({ status }) => {
  const ui = STATUS_UI[status] || { tone: "neutral", icon: Clock };
  return (
    <span className={`ui-badge ui-badge--${ui.tone}`}>
      <i className={`ui-dot ui-dot--${ui.tone}`} /> {status}
    </span>
  );
};

// Liste ve detayda kullanılan görsel yardımcılar
const STATUS_FLOW = ["Hazırlanıyor", "Yolda", "Teslim Edildi"];

const getInitials = (name) =>
  String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR")).join("") || "?";

const formatOrderClock = (createdAt) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

// Listeyi günlere ayıran başlık: "Bugün", "Dün" veya "4 Ekim Cumartesi"
const getDayLabel = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (dayDiff === 0) return "Bugün";
  if (dayDiff === 1) return "Dün";
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
};

const getPlatformLabel = (platform) =>
  platform === "ios" ? "iOS" : platform === "android" ? "Android" : "Web";

// Aktif siparişin bir sonraki adımı (liste ve "Sıradaki" şeridindeki hızlı düğme)
const NEXT_STEP = {
  "Hazırlanıyor": { status: "Yolda", label: "Yola çıkar", icon: Truck },
  "Yolda": { status: "Teslim Edildi", label: "Teslim et", icon: CheckCircle2 },
};

// Liste satırı: müşteri (avatar, sipariş no, teslimat noktası), süre, durum, tutar ve hızlı adım
const OrderRow = ({ order, active, selected, onSelectChange, onOpen, onAdvance }) => {
  const warningLevel = getWarningLevel(order.createdAt, order.status);
  const next = NEXT_STEP[order.status];
  const NextIcon = next?.icon;

  return (
    <div className="ord-row" data-active={active} data-checked={selected} data-tone={STATUS_UI[order.status]?.tone}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelectChange}
        aria-label={`#${String(order.orderId).slice(-6)} siparişini seç`}
      />
      <button
        className="ord-row-main"
        onClick={() => onOpen(order)}
        aria-label={`${order.user?.name || "Müşteri"} siparişinin detayını aç`}
        aria-current={active ? "true" : undefined}
      >
        <span className="ord-avatar" aria-hidden="true">{getInitials(order.user?.name)}</span>
        <span className="ord-c-customer">
          <strong>
            <span>{order.user?.name}</span>
            {order.isFirstOrder && <span className="ui-badge ui-badge--brand">Yeni</span>}
          </strong>
          <small>
            <span className="ui-mono">#{order.orderId.slice(-6).toUpperCase()}</span>
            <span>{order.products?.length || 0} ürün</span>
            <span className="ord-c-point"><MapPin />{order.deliveryPointName || order.city || "Belirtilmemiş"}</span>
          </small>
        </span>
        <span className="ord-c-time" data-level={warningLevel || undefined} title="Sipariş süresi">
          {warningLevel ? <AlertCircle /> : <Timer />}
          {getOrderDuration(order.createdAt, order.updatedAt, order.status)}
        </span>
        <span className="ord-c-status">
          <StatusBadge status={order.status} />
        </span>
        <span className="ord-c-total">
          <strong>₺{order.totalAmount?.toFixed(2)}</strong>
          <small>{formatOrderClock(order.createdAt)}</small>
        </span>
      </button>
      <span className="ord-row-act">
        {next && onAdvance && (
          <button type="button" className="ui-btn ui-btn--sm" data-next={next.status === "Yolda" ? "way" : "done"}
            onClick={() => onAdvance(order.orderId, next.status)}
            aria-label={`${order.user?.name || "Müşteri"} siparişini “${next.status}” yap`}>
            <NextIcon />{next.label}
          </button>
        )}
      </span>
    </div>
  );
};

// Sağ detay paneli: seçili siparişin tüm bilgisi ve aksiyonları
const OrderDetail = ({ order, onClose, onStatusUpdate, onDeliveryTracking, onPrint, onDelete, onAddItem, onRemoveItem, onUpdateQuantity }) => {
  const warningLevel = getWarningLevel(order.createdAt, order.status);
  const duration = getOrderDuration(order.createdAt, order.updatedAt, order.status);

  return (
    <>
      <div className="ord-d-head">
        <span className="ord-avatar ord-avatar--lg" aria-hidden="true">{getInitials(order.user?.name)}</span>
        <div className="ord-d-title">
          <h2>
            {order.user?.name}
            {order.isFirstOrder && <span className="ui-badge ui-badge--brand">Yeni</span>}
          </h2>
          <p>
            #{order.orderId.slice(-8).toUpperCase()} · {order.userOrderCount || 1}. sipariş
            {order.device && <> · {getPlatformLabel(order.device.platform)}</>}
          </p>
        </div>
        <button onClick={onClose} className="ui-icon-btn ord-d-close" aria-label="Detayı kapat">
          <X />
        </button>
      </div>

      <div className="ord-d-body">
        {/* Durum */}
        <section className="ord-d-section">
          <div className="ord-d-tags">
            <StatusBadge status={order.status} />
            <span className="ui-badge" title="Sipariş süresi">
              <Timer /> {duration}
            </span>
            {warningLevel && (
              <span className={`ui-badge ${warningLevel === 'critical' ? 'ui-badge--danger' : 'ui-badge--warn'}`} title="Bekleme süresi">
                <AlertCircle /> {getWaitingMinutes(order.createdAt)}dk bekliyor
              </span>
            )}
          </div>
          <div className="ord-steps" role="group" aria-label="Sipariş durumunu değiştir" data-cancelled={order.status === "İptal Edildi"}>
            {ORDER_STATUSES.map(status => {
              const ui = STATUS_UI[status];
              const Icon = ui.icon;
              const stepIndex = STATUS_FLOW.indexOf(status);
              const currentIndex = STATUS_FLOW.indexOf(order.status);
              return (
                <button
                  key={status}
                  onClick={() => { onStatusUpdate(order.orderId, status); onClose(); }}
                  title={`${status} olarak güncelle`}
                  aria-pressed={order.status === status}
                  data-tone={ui.tone}
                  data-step={stepIndex === -1 ? "cancel" : stepIndex < currentIndex ? "done" : stepIndex === currentIndex ? "current" : "todo"}
                >
                  <span className="ord-step-dot"><Icon /></span>
                  <span className="ord-step-label">{ui.short}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Müşteri notu */}
        {order.note && (
          <div className="ui-note">
            <AlertTriangle />
            <div>
              <p className="ui-note-label">Müşteri Notu</p>
              <p className="ui-note-body">{order.note}</p>
            </div>
          </div>
        )}

        {/* Müşteri ve teslimat */}
        <section className="ord-d-section">
          <h3 className="ui-overline">Müşteri ve teslimat</h3>
          <dl className="ord-d-facts">
            <div><dt><Mail /> E-posta</dt><dd>{order.user?.email ? <a className="ui-link" href={`mailto:${order.user.email}`}>{order.user.email}</a> : "E-posta yok"}</dd></div>
            <div><dt><Phone /> Telefon</dt><dd>{(order.phone || order.user?.phone) ? <a className="ui-link ui-num" href={`tel:${order.phone || order.user?.phone}`}>{order.phone || order.user?.phone}</a> : '-'}</dd></div>
            <div><dt><MapPin /> Teslimat</dt><dd>{order.deliveryPointName || order.deliveryPoint || order.city || 'Belirtilmemiş'}</dd></div>
            <div><dt><Calendar /> Sipariş zamanı</dt><dd>{formatOrderDate(order.createdAt)}</dd></div>
          </dl>
          <label className="ui-label" htmlFor="delivery-tracking-input">Kargo / teslimat takibi</label>
          <div className="ord-d-tracking">
            <input key={order.orderId} id="delivery-tracking-input" defaultValue={order.deliveryTracking || ""} maxLength={120} placeholder="Takip numarası veya teslimat notu" className="ui-field" />
            <button className="ui-btn" onClick={() => onDeliveryTracking(order.orderId, document.getElementById("delivery-tracking-input")?.value || "")}>Takibi kaydet</button>
          </div>
        </section>

        {/* Ürünler */}
        <section className="ord-d-section">
          <div className="ui-between">
            <h3 className="ui-overline">
              Ürünler · {order.products?.length || 0} ürün, {order.products?.reduce((s, p) => s + (p.quantity || 1), 0)} adet
            </h3>
            <button onClick={() => onAddItem(order.orderId)} className="ui-btn ui-btn--sm">
              <Plus /> Ekle
            </button>
          </div>
          <div className="ord-d-items">
            {order.products?.map((product, idx) => (
              <div key={idx} className="ord-d-item">
                <div className="ui-thumb">
                  {product.image ? (
                    <img src={product.image} alt={product.name} />
                  ) : (
                    <Package2 size={16} />
                  )}
                </div>
                <div className="ord-d-item-text">
                  <p>{product.name}</p>
                  <small>Birim: ₺{product.price}</small>
                </div>
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
                <strong className="ord-d-item-total">₺{(product.price * product.quantity).toFixed(2)}</strong>
                <button
                  onClick={() => onRemoveItem(order.orderId, idx, product.name)}
                  className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger"
                  title="Ürünü Sil"
                  aria-label="Ürünü Sil"
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <dl className="ord-d-totals">
            {order.couponCode && order.subtotalAmount > 0 && (
              <div><dt>Ara toplam</dt><dd>₺{order.subtotalAmount?.toFixed(2)}</dd></div>
            )}
            {order.couponCode && (
              <div>
                <dt><span className="ui-badge"><Tag /> {order.couponCode}</span></dt>
                <dd>₺{(order.couponDiscount || 0).toFixed(0)} indirim</dd>
              </div>
            )}
            <div className="ord-d-grand"><dt>Toplam Tutar</dt><dd>₺{order.totalAmount?.toFixed(2)}</dd></div>
          </dl>
        </section>
      </div>

      <div className="ord-d-foot">
        <button onClick={() => { onPrint(order); onClose(); }} className="ui-btn">
          <Printer /> Yazdır
        </button>
        <button onClick={() => { onDelete(order.orderId); onClose(); }} className="ui-btn ui-btn--danger">
          <Trash2 /> Sil
        </button>
      </div>
    </>
  );
};

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
  const ordersPerPage = 10;

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
  
      // Termal yazıcı yalnızca siyah/beyaz basar: renk, gri ve emoji noktalı (silik)
      // çıkar. Fişte yalnızca düz siyah metin ve çizgi kullanılır.
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
            padding: 4mm 5mm;
            overflow: hidden;
          }
          .header { text-align: center; }
          .brand { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
          .order-no { font-size: 20px; font-weight: bold; margin-top: 2px; }
          .meta { font-size: 11px; }
          .flag { font-size: 11px; font-weight: bold; }
          .point {
            margin: 5px 0 4px;
            padding: 3px 4px;
            border: 2px solid #000;
            text-align: center;
            font-size: 15px;
            font-weight: bold;
            text-transform: uppercase;
            word-break: break-word;
          }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin: 2px 0;
            gap: 8px;
          }
          .row > div:last-child { text-align: right; word-break: break-word; }
          .strong > div:last-child { font-weight: bold; }
          .phone > div:last-child { font-size: 14px; font-weight: bold; }
          .note {
            margin: 5px 0 2px;
            padding: 3px 5px;
            border: 1.5px dashed #000;
            font-size: 12px;
            font-weight: bold;
            word-break: break-word;
          }
          .rule { border-top: 1px dashed #000; margin: 5px 0; }
          .rule-solid { border-top: 2px solid #000; margin: 5px 0; }
          .item {
            display: grid;
            grid-template-columns: auto 1fr auto;
            column-gap: 6px;
            font-size: 11px;
            margin: 3px 0;
            align-items: start;
          }
          .item .qty { font-weight: bold; min-width: 22px; }
          .item .name { word-break: break-word; }
          .item .unit { font-size: 10px; }
          .item .price { text-align: right; font-weight: bold; white-space: nowrap; }
          .count { font-size: 10px; text-align: right; }
          .discount { font-weight: bold; }
          .total {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            font-size: 18px;
            font-weight: bold;
          }
          .footer { text-align: center; margin-top: 6px; }
          .footer div { font-size: 10px; font-weight: bold; margin-top: 2px; }
          * { page-break-inside: avoid; }
        </style>
      `;

      // Müşterinin yazdığı not, ürün adı vb. HTML olarak çalışmasın diye kaçırılır
      const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
      ));
      const money = (value) => `₺${Number(value || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const createdAt = new Date(order.createdAt).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const shortId = String(order.orderId || order._id || '').slice(-6).toUpperCase();
      const products = order.products || [];
      const unitCount = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

      // Fiyat birim fiyattır; satırda adet × birim fiyat tutarı gösterilir
      const itemsHtml = products.map(p => {
        const qty = Number(p.quantity) || 0;
        const unit = Number(p.price || 0);
        return `
        <div class="item">
          <div class="qty">${qty}x</div>
          <div class="name">${esc(p.name)}${qty > 1 ? `<div class="unit">${qty} × ${money(unit)}</div>` : ''}</div>
          <div class="price">${money(unit * qty)}</div>
        </div>
      `;
      }).join('');

      const deliveryInfo = order.deliveryPointName || order.city || 'Teslimat noktası belirtilmemiş';
      const phone = order.phone || order.user?.phone || '-';
      const orderCount = Number(order.userOrderCount) || 0;
      const flagHtml = orderCount === 1
        ? '<div class="flag">* İLK SİPARİŞ *</div>'
        : orderCount > 1 ? `<div class="meta">Müşterinin ${orderCount}. siparişi</div>` : '';
      const noteHtml = order.note && String(order.note).trim()
        ? `<div class="note">NOT: ${esc(String(order.note).trim())}</div>`
        : '';
      const discountHtml = order.couponCode ? `
              <div class="row"><div>Ara Toplam</div><div>${money(order.subtotalAmount || order.totalAmount)}</div></div>
              <div class="row discount"><div>Kupon indirimi (${esc(order.couponCode)})</div><div>-${money(order.couponDiscount)}</div></div>
      ` : '';

      const html = `
        <html>
          <head><meta charset="utf-8"/><title>Sipariş #${esc(shortId)}</title>${css}</head>
          <body>
            <div class="receipt">
              <div class="header">
                <div class="brand">BENİM MARKETİM</div>
                <div class="order-no">#${esc(shortId)}</div>
                <div class="meta">${esc(createdAt)}</div>
                ${flagHtml}
              </div>
              <div class="point">${esc(deliveryInfo)}</div>
              <div class="row strong"><div>Müşteri</div><div>${esc(order.user?.name || '-')}</div></div>
              <div class="row phone"><div>Telefon</div><div>${esc(phone)}</div></div>
              ${order.user?.address ? `<div class="row"><div>Adres</div><div>${esc(order.user.address)}</div></div>` : ''}
              ${noteHtml}
              <div class="rule"></div>
              ${itemsHtml}
              <div class="count">${products.length} çeşit · ${unitCount} adet</div>
              <div class="rule"></div>
              ${discountHtml}
              <div class="rule-solid"></div>
              <div class="total"><div>TOPLAM</div><div>${money(order.totalAmount)}</div></div>
              <div class="rule-solid"></div>
              <div class="footer">
                <div>Bizi tercih ettiğiniz için teşekkür ederiz!</div>
                <div>Uygulamayı güncellemeyi unutmayın!</div>
              </div>
            </div>
            <script>
              // Fiş tek etikete sığmıyorsa yazı küçültülür. Önceki yöntem kutuyu
              // kesip sonra küçülttüğü için uzun siparişlerde toplam kayboluyordu;
              // burada kutu genişletilip yeniden ölçülür, yazı en fazla %60'a iner,
              // daha uzunsa fiş ikinci sayfaya devam eder.
              window.onload = function(){
                try {
                  const el = document.querySelector('.receipt');
                  const width = el.clientWidth;
                  const maxH = el.clientHeight;
                  const MIN_SCALE = 0.6;
                  el.style.height = 'auto';
                  el.style.overflow = 'visible';
                  let scale = 1;
                  for (let i = 0; i < 8 && el.offsetHeight * scale > maxH + 1; i++) {
                    scale = Math.max(MIN_SCALE, maxH / el.offsetHeight);
                    el.style.width = (width / scale) + 'px';
                    if (scale === MIN_SCALE) break;
                  }
                  if (scale < 1) el.style.zoom = String(scale);
                  if (el.offsetHeight * scale > maxH + 1) {
                    document.documentElement.style.height = 'auto';
                    document.body.style.height = 'auto';
                  } else {
                    el.style.height = (maxH / scale) + 'px';
                    el.style.overflow = 'hidden';
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
      <div className="ord" aria-busy="true">
        <div className="ui-skeleton" style={{ height: 40, width: 240 }}></div>
        <div className="ui-skeleton" style={{ height: 76 }}></div>
        <div className="ui-panel ord-list">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="ord-row">
              <div className="ui-skeleton" style={{ width: "100%", height: 18, gridColumn: "1 / -1" }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty State
  if (!orderAnalyticsData || !orderAnalyticsData.usersOrders || orderAnalyticsData.usersOrders.length === 0) {
    return (
      <div className="ord">
        <header className="app-pagehead">
          <div>
            <h1>Siparişler</h1>
            <p>Yeni siparişten teslimata, tüm süreci tek yerden yönetin.</p>
          </div>
        </header>
        <div className="ui-panel ui-empty">
          <Package2 />
          <h3 className="ui-title">Henüz sipariş yok</h3>
          <p>Yeni siparişler burada görünecek</p>
        </div>
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

  // ── Sunum için türetilen değerler (veri akışını değiştirmez) ─────────
  // Detay paneli yalnızca kullanıcı bir sipariş seçtiğinde açılır; seçili kaydın güncel hâlini gösterir.
  const detailOrder = detailModalOrder
    ? filteredOrders.find((o) => o.orderId === detailModalOrder.orderId) || detailModalOrder
    : null;
  const advancedFilterCount =
    (deliveryPointFilter !== "all" ? 1 : 0) + (minAmount ? 1 : 0) + (maxAmount ? 1 : 0) + (problemOnly ? 1 : 0) + (delayedOnly ? 1 : 0);
  const allOnPageSelected = currentOrders.length > 0 && currentOrders.every(o => selectedOrderIds.includes(o.orderId));

  return (
    <div className="ord">
      {/* Header */}
      <header className="app-pagehead">
        <div>
          <h1>Siparişler</h1>
          <p>
            Son güncelleme: <span className="ui-num">{lastRefresh.toLocaleTimeString('tr-TR')}</span>
          </p>
        </div>
        <div className="app-pagehead-actions">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            aria-pressed={autoRefresh}
            className="ui-toggle"
          >
            <i />
            <span>{autoRefresh ? 'Otomatik Yenileme Açık' : 'Otomatik Yenileme Kapalı'}</span>
          </button>
        </div>
      </header>

      {/* Operasyon metrikleri: tek şerit */}
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
          <section className="ord-overview" aria-label="Sipariş özeti">
            <div className="ord-today">
              <span className="ord-today-label">Bugün</span>
              <strong className="ord-today-value">{todayOrders.length} <small>sipariş</small></strong>
              <dl className="ord-today-facts">
                <div><dt>Ciro</dt><dd>₺{todayRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</dd></div>
                <div><dt>Ort. sepet</dt><dd>₺{avgOrderValue.toFixed(0)}</dd></div>
                <div><dt>Bekleyen</dt><dd>{pendingOrders > 0 ? pendingOrders : "Yok"}</dd></div>
              </dl>
            </div>
            <div className="ord-flow">
              <div className="ord-flow-head">
                <span className="ui-overline">Sipariş akışı</span>
                <span className="ord-flow-total"><strong className="ui-num">{stats.total}</strong> sipariş</span>
              </div>
              <ol className="ord-flow-steps">
                {[
                  { status: "Hazırlanıyor", count: stats.preparing },
                  { status: "Yolda", count: stats.onWay },
                  { status: "Teslim Edildi", count: stats.delivered },
                  { status: "İptal Edildi", count: stats.cancelled },
                ].map(({ status, count }) => {
                  const ui = STATUS_UI[status];
                  const Icon = ui.icon;
                  const share = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <li key={status} className="ord-flow-step" data-tone={ui.tone} data-empty={count === 0}>
                      <span className="ord-flow-icon"><Icon /></span>
                      <span className="ord-flow-text">
                        <strong className="ui-num">{count}</strong>
                        <span>{status}</span>
                      </span>
                      <span className="ord-flow-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
                      <span className="ord-flow-share ui-num">%{share}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        );
      })()}

      {/* Araç çubuğu: arama, durum, tarih, filtreler */}
      <div className="ord-toolbar">
        <div className="ui-search ord-search">
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

        <div className="ui-chips" role="group" aria-label="Durum filtresi">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              aria-pressed={statusFilter === chip.value}
              onClick={() => setStatusFilter(chip.value)}
            >
              {chip.tone && <i className={`ui-dot ui-dot--${chip.tone}`} />}
              {chip.label}
            </button>
          ))}
        </div>

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
          aria-expanded={showAdvancedFilters}
          className="ui-btn"
        >
          <SlidersHorizontal />
          <span>Filtreler</span>
          {advancedFilterCount > 0 && <b className="ui-count">{advancedFilterCount}</b>}
        </button>
      </div>

      {/* Etkin filtre etiketleri */}
      {advancedFilterCount > 0 && (
        <div className="ord-tags">
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
          {problemOnly && (
            <span className="ui-badge ui-badge--brand">
              <AlertTriangle /> Sorunlu siparişler
            </span>
          )}
          {delayedOnly && (
            <span className="ui-badge ui-badge--brand">
              <Clock /> Geciken siparişler
            </span>
          )}
          <button onClick={clearFilters} className="ui-btn ui-btn--ghost ui-btn--sm">
            Temizle
          </button>
        </div>
      )}

      {/* Sıradaki aksiyonlar: en eski aktif siparişler */}
      <section className="ord-next" aria-label="Operasyon kuyruğu">
          <div className="ord-next-head">
            <span className="ui-overline">Sıradaki</span>
            <button onClick={() => { setStatusFilter("Hazırlanıyor"); setCurrentPage(1); }} className="ui-btn ui-btn--sm ui-btn--ghost"><i className="ui-dot ui-dot--warn" />{stats.preparing} hazırlanıyor</button>
            <button onClick={() => { setStatusFilter("Yolda"); setCurrentPage(1); }} className="ui-btn ui-btn--sm ui-btn--ghost"><i className="ui-dot ui-dot--info" />{stats.onWay} yolda</button>
          </div>
          {priorityOrders.length === 0 && (
            <p className="ord-next-empty"><CheckCircle2 /> Şu an aksiyon bekleyen aktif sipariş bulunmuyor.</p>
          )}
          {priorityOrders.map((order) => {
            const waitingMinutes = getWaitingMinutes(order.createdAt);
            const needsAttention = order.status === "Hazırlanıyor" && waitingMinutes >= 20;
            const nextStatus = order.status === "Hazırlanıyor" ? "Yolda" : "Teslim Edildi";
            const nextLabel = order.status === "Hazırlanıyor" ? "Yola çıkar" : "Teslim edildi";
            const NextIcon = order.status === "Hazırlanıyor" ? Truck : CheckCircle2;
            return (
              <div key={`priority-${order.orderId}`} className="ord-next-item" data-attention={needsAttention} data-tone={STATUS_UI[order.status]?.tone}>
                <button className="ord-next-open" onClick={() => setDetailModalOrder(order)} title="Detay">
                  <span className="ord-next-top">
                    <span className="ord-avatar" aria-hidden="true">{getInitials(order.user?.name)}</span>
                    <span className="ord-next-name">
                      <strong>{order.user?.name || "Müşteri"}</strong>
                      <small>
                        <span className="ui-mono">#{String(order.orderId).slice(-6).toUpperCase()}</span> · {order.products?.length || 0} ürün · ₺{Number(order.totalAmount || 0).toFixed(2)}
                      </small>
                    </span>
                  </span>
                  <span className="ord-next-meta">
                    <span className="ord-next-wait">{needsAttention ? <AlertCircle /> : <Timer />}{getOrderDuration(order.createdAt, order.updatedAt, order.status)}</span>
                    <span className="ord-next-point"><MapPin />{order.deliveryPointName || order.city || "Belirtilmemiş"}</span>
                  </span>
                </button>
                <button onClick={() => updateOrderStatus(order.orderId, nextStatus)} className="ui-btn ui-btn--sm ui-btn--primary ord-next-go"><NextIcon />{nextLabel}</button>
              </div>
            );
          })}
      </section>

      {/* Liste + sağ detay paneli */}
      <div className="ord-split" data-detail-open={!!detailModalOrder}>
        <section className="ui-panel ord-list" aria-label="Sipariş listesi">
          <div className="ord-list-head" data-selecting={selectedOrderIds.length > 0}>
            <input
              type="checkbox"
              aria-label="Bu sayfadakileri seç"
              title="Bu sayfadakileri seç"
              checked={allOnPageSelected}
              onChange={e => setSelectedOrderIds(e.target.checked ? [...new Set([...selectedOrderIds, ...currentOrders.map(o => o.orderId)])] : selectedOrderIds.filter(id => !currentOrders.some(o => o.orderId === id)))}
            />
            {selectedOrderIds.length > 0 ? (
              <div className="ord-bulk">
                <strong className="ui-num">{selectedOrderIds.length} seçili</strong>
                <select className="ui-field ui-field--auto ui-field--sm" aria-label="Toplu durum değiştir" defaultValue="" onChange={e => { bulkUpdateStatus(e.target.value); e.target.value = ""; }}><option value="" disabled>Toplu durum değiştir</option>{["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"].map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
            ) : (
              <div className="ord-cols" aria-hidden="true">
                <span>Müşteri</span>
                <span>Süre</span>
                <span>Durum</span>
                <span>Tutar</span>
              </div>
            )}
          </div>

          {currentOrders.length > 0 ? (
            currentOrders.map((order, index) => {
              const dayLabel = getDayLabel(order.createdAt);
              const startsDay = index === 0 || getDayLabel(currentOrders[index - 1].createdAt) !== dayLabel;
              return (
                <Fragment key={order.orderId}>
                  {startsDay && <div className="ord-day">{dayLabel}</div>}
                  <OrderRow
                    order={order}
                    active={detailOrder?.orderId === order.orderId}
                    selected={selectedOrderIds.includes(order.orderId)}
                    onSelectChange={e => setSelectedOrderIds(e.target.checked ? [...selectedOrderIds, order.orderId] : selectedOrderIds.filter(id => id !== order.orderId))}
                    onOpen={(order) => setDetailModalOrder(order)}
                    onAdvance={updateOrderStatus}
                  />
                </Fragment>
              );
            })
          ) : (
            <div className="ui-empty">
              <Search />
              <h3 className="ui-title">Eşleşen sipariş yok</h3>
              <p>Arama veya filtreleri değiştirerek tekrar deneyin.</p>
            </div>
          )}

          <div className="ord-list-foot">
            <span className="ui-num">{filteredOrders.length} sipariş</span>
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
          </div>
        </section>

        <div className="ord-detail-scrim" onClick={() => setDetailModalOrder(null)} />
        <aside className="ui-panel ord-detail" aria-label="Sipariş detayı">
          {detailOrder ? (
            <OrderDetail
              order={detailOrder}
              onClose={() => setDetailModalOrder(null)}
              onStatusUpdate={updateOrderStatus}
              onDeliveryTracking={updateDeliveryTracking}
              onPrint={handlePrint}
              onDelete={handleDeleteOrder}
              onAddItem={handleOpenAddItemModal}
              onRemoveItem={handleRemoveItem}
              onUpdateQuantity={handleUpdateQuantity}
            />
          ) : (
            <div className="ui-empty">
              <Package2 />
              <h3 className="ui-title">Sipariş seçin</h3>
              <p>Detayları görmek için listeden bir sipariş seçin.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Filtre çekmecesi */}
      {showAdvancedFilters && (
        <div className="ui-drawer-backdrop" onClick={() => setShowAdvancedFilters(false)}>
          <aside
            className="ui-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Gelişmiş Filtreler"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-drawer-head">
              <h3 className="ui-title">Filtreler</h3>
              <button onClick={() => setShowAdvancedFilters(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>

            <div className="ui-drawer-body">
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

              <div className="ui-grid-2">
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

              {/* Hazır ve kayıtlı filtreler */}
              <div>
                <span className="ui-label">Hazır filtreler</span>
                <button className="ui-option" aria-pressed={problemOnly} onClick={() => { setProblemOnly(true); setDelayedOnly(false); setCurrentPage(1); }}><AlertTriangle />Sorunlu siparişler</button>
              </div>

              <div>
                <span className="ui-label">Kayıtlı filtreler</span>
                <div className="ord-saved">
                  {savedFilters.map((item, index) => <span key={index} className="ord-saved-item"><button className="ui-btn ui-btn--sm" onClick={() => { setStatusFilter(item.statusFilter); setDateFilter(item.dateFilter); setProblemOnly(item.problemOnly); setDelayedOnly(item.delayedOnly || false); setCurrentPage(1); }}><Bookmark />{item.name}</button><button aria-label={`${item.name} filtresini sil`} className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" onClick={() => { const next = savedFilters.filter((_, i) => i !== index); setSavedFilters(next); localStorage.setItem("admin-order-filters", JSON.stringify(next)); }}><X /></button></span>)}
                  {savedFilters.length === 0 && <p className="ui-hint">Henüz kayıtlı filtre yok.</p>}
                </div>
                <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => { const name = window.prompt("Filtre adı"); if (!name?.trim()) return; const next = [...savedFilters, { name: name.trim().slice(0, 40), statusFilter, dateFilter, problemOnly, delayedOnly }].slice(-8); setSavedFilters(next); localStorage.setItem("admin-order-filters", JSON.stringify(next)); }}><Plus />Bu filtreyi kaydet</button>
              </div>
            </div>

            <div className="ui-drawer-foot">
              <button onClick={clearFilters} className="ui-btn">
                <X />
                Temizle
              </button>
              <button onClick={() => setShowAdvancedFilters(false)} className="ui-btn ui-btn--primary">
                {filteredOrders.length} siparişi göster
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Siparişe ürün ekleme çekmecesi */}
      {showAddItemModal && (
        <div className="ui-drawer-backdrop" onClick={() => setShowAddItemModal(false)}>
          <aside
            className="ui-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Siparişe Ürün Ekle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-drawer-head">
              <h3 className="ui-title">Siparişe Ürün Ekle</h3>
              <button onClick={() => setShowAddItemModal(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>

            <div className="ui-drawer-tabs">
              {/* Tab Buttons */}
              <div className="ui-segmented">
                <button onClick={() => setAddItemTab("catalog")} aria-pressed={addItemTab === "catalog"}>
                  Katalogdan Seç
                </button>
                <button onClick={() => setAddItemTab("manual")} aria-pressed={addItemTab === "manual"}>
                  Manuel Ekle
                </button>
              </div>
            </div>

            {/* Catalog Tab */}
            {addItemTab === "catalog" && (
              <>
                <div className="ui-drawer-body">
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
                  <div className="ord-catalog">
                    {loadingProducts ? (
                      <div className="ui-empty">
                        <RefreshCw className="ui-spin" />
                        Ürünler yükleniyor...
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="ui-empty">
                        Ürün bulunamadı
                      </div>
                    ) : (
                      filteredProducts.slice(0, 20).map((product) => (
                        <div
                          key={product._id}
                          onClick={() => setSelectedProduct(product)}
                          className="ord-catalog-item"
                          data-selected={selectedProduct?._id === product._id}
                        >
                          <div className="ui-thumb">
                            {product.image ? (
                              <img src={product.image} alt={product.name} />
                            ) : (
                              <Package2 size={16} />
                            )}
                          </div>
                          <div className="ord-d-item-text">
                            <p>{product.name}</p>
                            <small>{product.category}</small>
                          </div>
                          <strong className="ord-d-item-total">₺{product.price}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Selected Product & Quantity */}
                {selectedProduct && (
                  <div className="ord-pick">
                    <div className="ord-d-item-text">
                      <p>{selectedProduct.name}</p>
                      <small>Adet</small>
                    </div>
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
                    <strong className="ord-d-item-total">₺{(selectedProduct.price * productQuantity).toFixed(2)}</strong>
                  </div>
                )}

                {/* Actions */}
                <div className="ui-drawer-foot">
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
              </>
            )}

            {/* Manual Tab */}
            {addItemTab === "manual" && (
              <form onSubmit={handleAddCustomItem} className="ui-drawer-form">
                <div className="ui-drawer-body">
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
                </div>

                <div className="ui-drawer-foot">
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
          </aside>
        </div>
      )}
    </div>
  );
};

export default OrdersList;
