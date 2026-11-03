import { useEffect, useRef, useState } from "react";
import { ArrowRight, BellRing, CheckCheck, ExternalLink, RefreshCw, VolumeX, WifiOff, XCircle } from "lucide-react";
import { formatTime, money, timeAgo, useMediaQuery, useNow } from "../ui";
import { cancelReasonText, intervalEvery } from "./alertRules";
import { openSoundSettings } from "./alertPrefs";

/**
 * Başlığın hemen altındaki uyarı şeritleri, önem sırasıyla: müşteri iptali (kendiliğinden kapanmaz), canlı bağlantı
 * yok, ses kapalı, bekleyen yeni sipariş. App sarmalayıcısı (overflow: hidden) position: sticky'yi kapattığı için
 * sayfa aşağı kaydırılınca şeritler IntersectionObserver ile ekranın üstüne sabitlenir; yer tutucu sıçramayı önler.
 */
export default function AlertStack({
  ringing = [],
  cancels = [],
  offline = false,
  networkDown = false,
  lastCheckAt = null,
  soundBlocked = false,
  prefs,
  onOpenOrder,
  onAck,
  onAckAll,
  onGoOrders,
  onDismissCancel,
  onDismissAllCancels,
  onRetry,
  onUnlockSound,
}) {
  const now = useNow(15000);
  const touch = useMediaQuery("(pointer: coarse)");
  const [retrying, setRetrying] = useState(false);
  const sentinelRef = useRef(null);
  const boxRef = useRef(null);
  const [floating, setFloating] = useState(false);
  const floatingRef = useRef(false);
  floatingRef.current = floating;
  const [height, setHeight] = useState(0);
  const visible = cancels.length > 0 || offline || soundBlocked || ringing.length > 0;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!visible || !sentinel || typeof IntersectionObserver === "undefined") {
      setFloating(false);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible]);
  // Yer tutucu, şeritlerin sayfadaki (sabitlenmemiş) yüksekliğini tutar: sabitlenince içerik kaymaz
  useEffect(() => {
    const box = boxRef.current;
    if (!visible || !box || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (!floatingRef.current) setHeight(box.offsetHeight);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [visible]);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry?.();
    } finally {
      setRetrying(false);
    }
  };
  // "Gördüm" / "Tamam, ilgilendim" basılan düğmeyi kaldırır: klavye odağı sayfanın başına düşmesin, şeritteki ilk
  // düğmeye (şerit kalktıysa içerik alanına) geçsin
  const keepFocus = (action) => {
    const hadFocus = Boolean(boxRef.current?.contains(document.activeElement));
    action();
    if (!hadFocus) return;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const target = boxRef.current?.querySelector("button") || document.getElementById("admin-workspace");
      target?.focus?.({ preventScroll: true });
    });
  };

  if (!visible) return <div ref={sentinelRef} className="app-alerts-sentinel" aria-hidden="true" />;

  const single = ringing.length === 1 ? ringing[0] : null;
  const oldest = ringing[0];
  const silent = !prefs || prefs.muted || prefs.volume <= 0;
  const ringHint = silent
    ? "Bildirim sesi kapalı"
    : prefs.repeat
      ? `Ses ${intervalEvery(prefs.intervalSec)} tekrar çalıyor`
      : "Tekrar çalma kapalı";

  return (
    <>
      <div ref={sentinelRef} className="app-alerts-sentinel" aria-hidden="true" />
      <div className="app-alerts-slot" style={floating && height ? { height } : undefined}>
        <div ref={boxRef} className="app-alerts" data-floating={floating || undefined} role="region" aria-label="Önemli uyarılar">
          {cancels.length > 0 && (
            <section className="app-alert app-alert--danger app-alert--cancel" role="alert" aria-label="Müşteri iptalleri">
              <XCircle className="app-alert-icon" aria-hidden="true" />
              <div className="app-alert-body">
                {cancels.length > 1 && (
                  <div className="app-alert-head">
                    <strong>{cancels.length} sipariş müşteri tarafından iptal edildi</strong>
                    <button type="button" className="app-alert-link" onClick={() => keepFocus(() => onDismissAllCancels?.())}>
                      Hepsini kapat
                    </button>
                  </div>
                )}
                <ul className="app-alert-list">
                  {cancels.map((entry) => (
                    <li key={entry.orderId}>
                      <div className="app-alert-text">
                        <p>
                          <strong>{entry.code} müşteri tarafından iptal edildi</strong>
                          <span> · {cancelReasonText(entry)}</span>
                        </p>
                        <p className="app-alert-meta">
                          {[entry.customerName, entry.totalAmount ? money(entry.totalAmount) : "", formatTime(entry.at)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="app-alert-actions">
                        <button type="button" className="app-alert-btn" onClick={() => onOpenOrder?.(entry.orderId)}>
                          <ExternalLink aria-hidden="true" />Siparişi aç
                        </button>
                        <button type="button" className="app-alert-btn app-alert-btn--solid" onClick={() => keepFocus(() => onDismissCancel?.(entry.orderId))}>
                          <CheckCheck aria-hidden="true" />Tamam, ilgilendim
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {offline && (
            <div className="app-alert app-alert--danger app-alert--offline" role="alert">
              <WifiOff className="app-alert-icon" aria-hidden="true" />
              <p className="app-alert-text">
                <strong>{networkDown ? "İnternet bağlantısı yok" : "Canlı bağlantı yok"}</strong>
                <span>
                  {networkDown
                    ? " · bağlantı gelince siparişler hemen kontrol edilecek"
                    : " · siparişler 30 sn'de bir kontrol ediliyor"}
                  {lastCheckAt ? ` · son kontrol ${formatTime(lastCheckAt)}` : ""}
                </span>
              </p>
              <div className="app-alert-actions">
                <button type="button" className="app-alert-btn" onClick={retry} disabled={retrying}>
                  <RefreshCw className={retrying ? "ui-spin" : ""} aria-hidden="true" />
                  {retrying ? "Deneniyor…" : "Şimdi dene"}
                </button>
              </div>
            </div>
          )}

          {soundBlocked && (
            <button type="button" className="app-alert app-alert--warn app-alert--sound" data-audio-unlock="" onClick={onUnlockSound}>
              <VolumeX className="app-alert-icon" aria-hidden="true" />
              <span className="app-alert-text">
                <strong>Ses kapalı · açmak için {touch ? "dokunun" : "tıklayın"}</strong>
                <span className="app-alert-sub">Tarayıcı bu sayfada sesi engelledi; yeni siparişte ses duyulmaz.</span>
              </span>
            </button>
          )}

          {ringing.length > 0 && (
            <div className="app-alert app-alert--ring" role="status">
              <BellRing className="app-alert-icon app-alert-bell" aria-hidden="true" />
              <div className="app-alert-text">
                {single ? (
                  <p>
                    <strong>Yeni sipariş bekliyor</strong>
                    <span> · {single.code} · {single.customerName || "Müşteri"}{single.totalAmount ? ` · ${money(single.totalAmount)}` : ""}</span>
                  </p>
                ) : (
                  <p>
                    <strong>{ringing.length} yeni sipariş bekliyor</strong>
                    <span> · {ringing.slice(0, 4).map((entry) => entry.code).join(", ")}{ringing.length > 4 ? "…" : ""}</span>
                  </p>
                )}
                <p className="app-alert-meta">
                  {oldest ? `${ringing.length > 1 ? "En eskisi " : ""}${timeAgo(oldest.createdAt || oldest.firstAt, now)} geldi · ` : ""}
                  {ringHint}
                  {silent && (
                    <>
                      {" · "}
                      <button type="button" className="app-alert-link app-alert-link--inline" onClick={openSoundSettings}>
                        Ses ayarları
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div className="app-alert-actions">
                {single ? (
                  <>
                    <button type="button" className="app-alert-btn" onClick={() => keepFocus(() => onAck?.(single.id))}>
                      <CheckCheck aria-hidden="true" />Gördüm
                    </button>
                    <button type="button" className="app-alert-btn app-alert-btn--solid" onClick={() => onOpenOrder?.(single.id)}>
                      Siparişi incele<ArrowRight aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="app-alert-btn" onClick={() => keepFocus(() => onAckAll?.())}>
                      <CheckCheck aria-hidden="true" />Hepsini gördüm
                    </button>
                    <button type="button" className="app-alert-btn app-alert-btn--solid" onClick={() => onGoOrders?.()}>
                      Siparişlere git<ArrowRight aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
