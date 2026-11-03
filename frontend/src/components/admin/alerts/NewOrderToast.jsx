import { Package } from "lucide-react";
import { formatTime, money } from "../ui";
import { orderCode } from "./alertRules";

/** Yurt adı, adres siparişinde bölge; eski kayıtlarda şehir */
const placeOf = (order) => order.deliveryPointName || order.deliveryZoneName || order.city || "Teslimat";

/**
 * Yeni sipariş bildirimi (react-hot-toast içinde, panel düzeninin dışında çizilir).
 * "Gördüm" ve "Siparişi incele" bu cihazda sesin tekrarını bitirir; inceleme siparişin çekmecesini açar.
 */
export default function NewOrderToast({ t, order, missed = false, onSeen, onOpen }) {
  const products = Array.isArray(order.products) ? order.products.length : Number(order.productCount) || 0;
  return (
    <div className={`${t.visible ? "animate-enter" : "animate-leave"} admin-toast`} role="alert">
      <div className="admin-toast-head">
        <span className="admin-toast-icon">
          <Package size={16} />
        </span>
        <div>
          <p className="admin-toast-title">{missed ? "Bağlantı kesikken gelen sipariş" : "Yeni sipariş alındı"}</p>
          <p className="admin-toast-name">{order.customerName || "Müşteri"}</p>
        </div>
        {order.createdAt && <time className="admin-toast-time">{formatTime(order.createdAt)}</time>}
      </div>
      <p className="admin-toast-meta">
        {orderCode(order.id)} · {products} ürün · {placeOf(order)}
      </p>
      <div className="admin-toast-foot">
        <p className="admin-toast-amount">{money(order.totalAmount)}</p>
        <div className="admin-toast-actions">
          <button type="button" onClick={onSeen} className="admin-toast-secondary">
            Gördüm
          </button>
          <button type="button" onClick={onOpen} className="admin-toast-action">
            Siparişi incele
          </button>
        </div>
      </div>
    </div>
  );
}
