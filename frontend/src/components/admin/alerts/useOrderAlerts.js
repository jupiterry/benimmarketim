// Yönetim paneli ile sipariş uyarıları denetleyicisi (orderAlerts.js) arasındaki bağ: React durumu, panel içi yeni
// sipariş bildirimi, tarayıcı bildirimi ve zil listesine eklenecek satırlar. AdminPage bir kez kullanır.
import { createElement, useEffect, useRef, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import { money } from "../ui";
import NewOrderToast from "./NewOrderToast";
import { cancelReasonText, toMs } from "./alertRules";
import { createOrderAlerts } from "./orderAlerts";

const TOAST_LIMIT = 3; // bağlantı dönünce çok sayıda kaçırılan sipariş varsa en yeni üçü ayrı ayrı gösterilir
const TOAST_MS = 12000;

const isoOr = (value, fallback = new Date()) => {
  const ms = toMs(value);
  return (Number.isFinite(ms) ? new Date(ms) : fallback).toISOString();
};

/** Tarayıcı bildirimi (izin verildiyse). Android Chrome'da "new Notification" desteklenmez; hata yutulur. */
const browserNotify = (title, body, tag, onClick) => {
  if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") return;
  try {
    const notification = new window.Notification(title, { body, icon: "/favicon.ico", tag });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // odak alınamadı
      }
      onClick?.();
      notification.close();
    };
  } catch {
    // desteklenmiyor: panel içi bildirim yeterli
  }
};

/** Zil listesi satırları: sunucunun kaydettiği biçimle aynı (adminFeed.service toClientItem) */
const bellOrderItem = (order) => ({
  id: order.id,
  at: isoOr(order.createdAt),
  order: {
    id: order.id,
    totalAmount: Number(order.totalAmount) || 0,
    customerName: order.customerName || "Müşteri",
    deliveryPointName: order.deliveryPointName || order.deliveryZoneName || order.city || "",
    productCount: Array.isArray(order.products) ? order.products.length : 0,
  },
});
const bellCancelItem = (entry) => ({
  id: `cancel-${entry.orderId}`,
  kind: "cancel",
  title: "Müşteri siparişi iptal etti",
  detail: [entry.code, entry.customerName, cancelReasonText(entry)].filter(Boolean).join(" · "),
  orderId: entry.orderId,
  cancel: { code: entry.code, customerName: entry.customerName, reason: entry.reason, note: entry.note, totalAmount: entry.totalAmount },
  at: isoOr(entry.at),
});

/**
 * handlers (her çizimde güncel olanı kullanılır):
 *  - onOpenOrder(id): siparişin çekmecesini açar (HANDOFF + Siparişler sekmesi)
 *  - onPreparingCount(n): HTTP kontrolünden gelen bekleyen sipariş sayısı (rozet)
 *  - onBellItem(item): zil listesine satır ekler (kaçırılan sipariş, müşteri iptali)
 * Dönüş: { state, actions } — actions'ın kimliği sabittir.
 */
export default function useOrderAlerts({ enabled = true, onOpenOrder, onPreparingCount, onBellItem } = {}) {
  const handlersRef = useRef({});
  handlersRef.current = { onOpenOrder, onPreparingCount, onBellItem };
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    const handlers = handlersRef;
    const controller = createOrderAlerts({
      openOrder: (id) => handlers.current.onOpenOrder?.(id),
      preparingCount: (count) => handlers.current.onPreparingCount?.(count),
      newOrders: (orders, source) => {
        const missed = source === "missed";
        // Canlı siparişi zile AdminPage ekler; bağlantı kopukken gelenler burada eklenir
        if (missed) orders.forEach((order) => handlers.current.onBellItem?.(bellOrderItem(order)));
        const shown = orders.slice(-TOAST_LIMIT);
        for (const order of shown) {
          toast.custom(
            (t) =>
              createElement(NewOrderToast, {
                t,
                order,
                missed,
                onSeen: () => {
                  toast.dismiss(t.id);
                  controller.actions.ack(order.id);
                },
                onOpen: () => {
                  toast.dismiss(t.id);
                  controller.actions.open(order.id);
                },
              }),
            { id: `order-${order.id}`, duration: TOAST_MS, position: "top-right" },
          );
          browserNotify(
            missed ? "Benim Marketim · Bağlantı kesikken gelen sipariş" : "Benim Marketim · Yeni Sipariş",
            `${order.customerName || "Müşteri"} · ${money(order.totalAmount)}`,
            `order-${order.id}`,
            () => controller.actions.open(order.id),
          );
        }
        const rest = orders.length - shown.length;
        if (rest > 0) toast(`${rest} sipariş daha bekliyor`, { id: "orders-more", icon: "🛍️", duration: TOAST_MS, position: "top-right" });
      },
      cancelled: (entry, { live }) => {
        if (live) handlers.current.onBellItem?.(bellCancelItem(entry));
        // Sekme açıkken kırmızı uyarı ve ses yeterli; arka plandaysa masaüstü bildirimi de gider
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          browserNotify(
            "Benim Marketim · Sipariş iptal edildi",
            `${entry.code} müşteri tarafından iptal edildi · ${cancelReasonText(entry)}`,
            `cancel-${entry.orderId}`,
            () => handlers.current.onOpenOrder?.(entry.orderId),
          );
        }
      },
    });
    controllerRef.current = controller;
  }
  const controller = controllerRef.current;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => (enabled ? controller.start() : undefined), [controller, enabled]);
  return { state, actions: controller.actions };
}
