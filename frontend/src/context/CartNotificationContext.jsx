import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag } from "lucide-react";

/* ─── Context ─── */
const CartNotificationContext = createContext(null);

export const useCartNotification = () => {
    const ctx = useContext(CartNotificationContext);
    if (!ctx) throw new Error("useCartNotification must be inside CartNotificationProvider");
    return ctx;
};

/* ─── Provider ─── */
export const CartNotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);

    const playSound = useCallback(() => {
        try {
            const selectedSound = localStorage.getItem("notificationSound") || "ringtone";
            const audio = new Audio(`/${selectedSound}.mp3`);
            audio.volume = 0.7;
            audio.play().catch(() => { });
        } catch (e) { }
    }, []);

    const showNotification = useCallback(({ customerName, totalAmount, firstProduct, productCount }) => {
        playSound();
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);

        setNotifications((prev) => [
            ...prev,
            {
                id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                customerName: customerName || "Müşteri",
                totalAmount: typeof totalAmount === "number" ? totalAmount.toFixed(2) : totalAmount || "0",
                firstProduct: firstProduct || "Ürün",
                productCount: productCount || 1,
                createdAt: Date.now(),
            },
        ]);
    }, [playSound]);

    const dismiss = useCallback((id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, []);

    const dismissAndView = useCallback((id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, []);

    return (
        <CartNotificationContext.Provider value={{ showNotification, dismiss, dismissAndView, notifications }}>
            {children}
            <CartReminder notifications={notifications} onDismiss={dismiss} onView={dismissAndView} playSound={playSound} />
        </CartNotificationContext.Provider>
    );
};

/* ═══════════════════════════════════════════════════════
   CART REMINDER UI — Apple Glassmorphism + Gold Glow
   ═══════════════════════════════════════════════════════ */
const CartReminder = ({ notifications, onDismiss, onView, playSound }) => {
    const intervalRef = useRef({});

    // 10-minute sound reminder loop per notification
    useEffect(() => {
        notifications.forEach((notif) => {
            if (!intervalRef.current[notif.id]) {
                intervalRef.current[notif.id] = setInterval(() => {
                    playSound();
                    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
                }, 10 * 60 * 1000); // 10 minutes
            }
        });

        // Cleanup intervals for dismissed notifications
        Object.keys(intervalRef.current).forEach((id) => {
            if (!notifications.find((n) => n.id === id)) {
                clearInterval(intervalRef.current[id]);
                delete intervalRef.current[id];
            }
        });

        return () => {
            Object.values(intervalRef.current).forEach(clearInterval);
        };
    }, [notifications, playSound]);

    if (notifications.length === 0) return null;

    const getElapsedTime = (createdAt) => {
        const mins = Math.floor((Date.now() - createdAt) / 60000);
        if (mins < 1) return "Şimdi";
        if (mins < 60) return `${mins}dk önce`;
        return `${Math.floor(mins / 60)}sa ${mins % 60}dk önce`;
    };

    return (
        <>
            {/* Pulsing glow keyframes */}
            <style>{`
        @keyframes notif-glow-pulse {
          0%, 100% { box-shadow: 0 0 15px 2px rgba(217, 169, 56, 0.25), 0 8px 32px -4px rgba(0,0,0,0.12); }
          50% { box-shadow: 0 0 28px 6px rgba(217, 169, 56, 0.45), 0 8px 32px -4px rgba(0,0,0,0.12); }
        }
        @keyframes notif-border-pulse {
          0%, 100% { border-color: rgba(217, 169, 56, 0.3); }
          50% { border-color: rgba(217, 169, 56, 0.6); }
        }
      `}</style>

            <div className="fixed bottom-6 right-6 z-[70] flex flex-col-reverse gap-3 max-w-[380px] w-full pointer-events-none">
                <AnimatePresence>
                    {notifications.map((notif, idx) => (
                        <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, x: 100, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.9 }}
                            transition={{ type: "spring", damping: 20, stiffness: 250, mass: 0.8, delay: idx * 0.08 }}
                            className="rounded-2xl border-2 overflow-hidden pointer-events-auto"
                            style={{
                                animation: "notif-glow-pulse 2.5s ease-in-out infinite, notif-border-pulse 2.5s ease-in-out infinite",
                            }}
                        >
                            <div className="bg-white/80 backdrop-blur-xl rounded-[14px] overflow-hidden">
                                <div className="p-5">
                                    {/* Header row */}
                                    <div className="flex items-start gap-4">
                                        {/* Large icon */}
                                        <div className="w-14 h-14 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
                                            <ShoppingBag className="w-7 h-7 text-emerald-500" strokeWidth={1.6} />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-[16px] font-extrabold text-gray-900 tracking-tight">Yeni Sipariş!</p>
                                                <span className="text-[10px] text-gray-400 font-medium flex-shrink-0 ml-2">
                                                    {getElapsedTime(notif.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-[14px] text-gray-600 font-medium">{notif.customerName}</p>
                                            <p className="text-[22px] font-extrabold text-gray-900 mt-1 tracking-tight tabular-nums">
                                                ₺{notif.totalAmount}
                                            </p>
                                            <p className="text-[12px] text-gray-400 mt-0.5">
                                                {notif.productCount > 1
                                                    ? `${notif.firstProduct} +${notif.productCount - 1} ürün`
                                                    : notif.firstProduct}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2.5 mt-4">
                                        <button
                                            onClick={() => onDismiss(notif.id)}
                                            className="flex-shrink-0 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 text-[12px] font-semibold rounded-xl transition-all duration-200 active:scale-[0.97]"
                                        >
                                            Tamam
                                        </button>
                                        <button
                                            onClick={() => onView(notif.id)}
                                            className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-bold rounded-xl transition-all duration-200 active:scale-[0.97] tracking-wide"
                                        >
                                            ŞİMDİ İNCELE
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </>
    );
};

export default CartNotificationProvider;
