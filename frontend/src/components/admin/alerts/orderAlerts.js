// "Sipariş kaçırmamak için" denetleyicisi. React'tan bağımsızdır; useOrderAlerts bileşene bağlar.
//  - Yeni sipariş: ses + panel bildirimi + tarayıcı bildirimi. Sipariş bekledikçe ses tekrar eder (varsayılan 30 sn).
//  - Tekrar biten durumlar: "Gördüm" / "Siparişi incele", sipariş Hazırlanıyor'dan çıktı (orderStatusUpdated), silindi,
//    bir alarm telefonunda onaylandı (GET /api/order-alarm/status → recentAcks), Siparişler ekranında görüldü
//    ("admin-order-seen" olayı ya da ekranın cihaz deposu), müşteri iptal etti ya da ilk duyurudan 30 dk geçti.
//  - Canlı bağlantı 30 sn'den uzun koparsa siparişler 30 sn'de bir HTTP ile kontrol edilir; yeniden bağlanınca, internet
//    gelince ve 1 dk'dan uzun gizli kalan sekme açılınca da kontrol edilir. Panelin hiç duyurmadığı yeni siparişler bir
//    kez duyurulur (ses + bildirim) ve rozet güncellenir.
//  - Alarm telefonlarından kaçının bağlı olduğu (panel görünürken dakikada bir, sipariş çalarken 30 sn'de bir).
//  - Müşteri iptali ("orderCancelledByCustomer"): kendiliğinden kapanmayan kırmızı uyarı ve farklı bir uyarı sesi.
//    Bağlantı kopukken kaçırılan iptaller zil listesinden (sunucuda saklanır) yakalanır.
// Çalan siparişler ve iptal uyarıları cihaza özel saklanır (localStorage): sayfa yenilense de sürer ve aynı cihazdaki
// diğer panel sekmeleriyle eşitlenir. Onaylanan/çözülen kimlikler "done" listesine girer ve bir daha çalmaz.
import axios from "../../../lib/axios";
import socketService from "../../../lib/socket";
import { alertPrefs } from "./alertPrefs";
import { installGestureUnlock, playAlertSound, playCancelWarning, probeAutoplay } from "./alertAudio";
import {
  ALARM_POLL_MS, ALARM_POLL_RINGING_MS, HIDDEN_RESYNC_MS, MINUTE, OFFLINE_AFTER_MS, OFFLINE_POLL_MS, PREPARING, RING_WINDOW_MS,
  countAlarmDevices, flattenActiveOrders, isOrderId, newestCreatedMs, normalizeCancel, orderCode, parseSeenIds, phoneAckIds,
  pickMissedOrders, reconcileRinging, toMs,
} from "./alertRules";

export const RING_STORE_KEY = "admin-order-alerts-v1";
export const CANCEL_STORE_KEY = "admin-cancel-alerts-v1";
/** Siparişler ekranının cihaz deposu (components/orders/shared.js SEEN_KEY); burada yalnızca okunur */
const ORDERS_SEEN_KEY = "admin-order-seen";
/** Sözleşme: Siparişler ekranı bir siparişin çekmecesini açınca / ilerletince / görüldü deyince yayınlar ({ orderId }) */
export const ORDER_SEEN_EVENT = "admin-order-seen";
/** Sunucu: müşteri uygulamadan iptal etti (backend/services/adminFeed.service.js CUSTOMER_CANCEL_EVENT) */
export const CUSTOMER_CANCEL_EVENT = "orderCancelledByCustomer";

const TICK_MS = 5000;
const DONE_TTL_MS = 12 * 60 * MINUTE;
const CANCEL_TTL_MS = 12 * 60 * MINUTE;
const MAX_RINGING = 50;
const MAX_DONE = 500;
const MAX_CANCELS = 20;
const MAX_KNOWN = 2000;
const PLAY_DEBOUNCE_MS = 2500; // aynı anda gelen siparişler (ya da aynı cihazdaki iki sekme) tek ses
const PHONE_CHECK_BEFORE_REPEAT_MS = 15_000; // tekrar çalmadan önce telefon onayları bundan eskiyse tazelenir
const RECONNECT_SYNC_AFTER_MS = 3000; // bundan kısa kopmalarda HTTP kontrolü gerekmez
// Canlı bağlantı açık görünse de (ör. olay sunucuda kaybolduysa) siparişler arada bir HTTP ile de kontrol edilir
const SAFETY_SYNC_MS = 2 * MINUTE;
// Kontrol yanıtı canlı olaydan önce gelirse çok yeni sipariş "kaçırıldı" sayılmasın: canlı olay biraz beklenir
const LIVE_RACE_MS = 10_000;
const LIVE_RACE_WAIT_MS = 4000;

// ── Cihaz deposu ──────────────────────────────────────────────────────────
const readJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // depolama kapalı: bellekteki kopya geçerli kalır
  }
};
/** En yüksek puanlı `max` kaydı tutar */
const capEntries = (object, max, score) => {
  const entries = Object.entries(object);
  return entries.length <= max ? object : Object.fromEntries(entries.sort((a, b) => score(b[1]) - score(a[1])).slice(0, max));
};
const cleanDone = (raw, now, ttl) => {
  const done = {};
  for (const [id, at] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    const ms = Number(at);
    if (isOrderId(id) && Number.isFinite(ms) && now - ms < ttl) done[id] = ms;
  }
  return capEntries(done, MAX_DONE, (ms) => ms);
};
const mergeDone = (a, b) => {
  const done = { ...a };
  for (const [id, ms] of Object.entries(b)) done[id] = Math.max(done[id] || 0, ms);
  return done;
};

/** { ringing: { id: { firstAt, createdAt, name, total } }, done: { id: ms }, lastRingAt } */
const cleanRingStore = (raw, now = Date.now()) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const done = cleanDone(source.done, now, DONE_TTL_MS);
  const ringing = {};
  for (const [id, entry] of Object.entries(source.ringing && typeof source.ringing === "object" ? source.ringing : {})) {
    const firstAt = Number(entry?.firstAt);
    if (!isOrderId(id) || done[id] || !Number.isFinite(firstAt) || now - firstAt >= RING_WINDOW_MS) continue;
    ringing[id] = {
      firstAt,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
      name: String(entry.name || "").slice(0, 80),
      total: Number(entry.total) || 0,
    };
  }
  const lastRingAt = Number(source.lastRingAt);
  return { ringing: capEntries(ringing, MAX_RINGING, (entry) => entry.firstAt), done, lastRingAt: Number.isFinite(lastRingAt) ? lastRingAt : 0 };
};
const mergeRingStores = (a, b) => {
  const ringing = { ...b.ringing, ...a.ringing };
  // Aynı sipariş iki sekmede duyurulduysa ilk duyuru zamanı geçerli
  for (const [id, entry] of Object.entries(b.ringing)) if (entry.firstAt < ringing[id].firstAt) ringing[id] = entry;
  return cleanRingStore({ ringing, done: mergeDone(a.done, b.done), lastRingAt: Math.max(a.lastRingAt, b.lastRingAt) });
};

/** { items: { orderId: uyarı }, done: { orderId: ms } } */
const cleanCancelStore = (raw, now = Date.now()) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const done = cleanDone(source.done, now, CANCEL_TTL_MS);
  const items = {};
  for (const value of Object.values(source.items && typeof source.items === "object" ? source.items : {})) {
    const entry = normalizeCancel(value);
    if (!entry || done[entry.orderId] || now - toMs(entry.at) >= CANCEL_TTL_MS) continue;
    items[entry.orderId] = entry;
  }
  return { items: capEntries(items, MAX_CANCELS, (entry) => toMs(entry.at)), done };
};
const mergeCancelStores = (a, b) =>
  cleanCancelStore({ items: { ...b.items, ...a.items }, done: mergeDone(a.done, b.done) });

const isoOrNull = (value) => {
  const ms = toMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const remember = (set, id) => {
  set.add(id);
  if (set.size > MAX_KNOWN) set.delete(set.values().next().value);
};

// ── Denetleyici ───────────────────────────────────────────────────────────
/**
 * ui: { openOrder(id), preparingCount(n), newOrders(orders, source: "live"|"missed"), cancelled(entry, { live }) }
 * Arayüz geri çağrıları denetleyiciyi bekletmez; hataları denetleyiciyi bozmaz.
 */
export function createOrderAlerts(ui = {}) {
  let state = {
    ringing: [], // [{ id, code, customerName, totalAmount, createdAt, firstAt }] eskiden yeniye
    cancels: [], // [{ orderId, code, customerName, reason, note, totalAmount, at }] eskiden yeniye
    connected: Boolean(socketService.socket?.connected),
    offline: false, // canlı bağlantı 30 sn'den uzun kopuk
    networkDown: false, // tarayıcı çevrimdışı (navigator.onLine)
    lastCheckAt: null, // son başarılı HTTP sipariş kontrolü (ms)
    alarm: { ready: false, error: false, paired: 0, connected: 0, devices: [], skewMs: 0, checkedAt: 0 },
  };
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const callUi = (name, ...args) => {
    try {
      ui[name]?.(...args);
    } catch (error) {
      console.error("Sipariş uyarısı gösterilemedi:", error);
    }
  };

  let stopped = true;
  let cleanups = [];
  let startedAt = 0;
  let ringStore = cleanRingStore(null);
  let cancelStore = cleanCancelStore(null);
  let phoneAcked = new Set();
  const knownIds = new Set(); // panelin gördüğü siparişler (kontrol ya da canlı olay)
  const alertedIds = new Set(); // duyurulan siparişler (bir sipariş bir kez duyurulur)
  let baselineMs = null; // bilinen en yeni sipariş / anlık görüntü zamanı (sunucu saati)
  let baselineReady = false;
  let firstSyncFailed = false;
  let ringReady = false; // ilk sipariş kontrolü bitmeden (yenilenen sayfada) tekrar çalınmaz
  let disconnectedAt = null;
  let hiddenAt = null;
  let lastOfflinePollAt = 0;
  let lastSyncAt = 0; // son HTTP kontrolü denemesi
  let lastPlayAt = 0;
  let raceTimers = new Set();
  let syncing = null;
  let syncAgain = false;
  let alarmInflight = null;
  let repeating = false;
  let feedPrimed = false;
  let feedHighWater = -Infinity;

  // ── Çalan siparişler ──
  const ringEntries = () =>
    Object.entries(ringStore.ringing)
      .map(([id, entry]) => ({ id, code: orderCode(id), customerName: entry.name, totalAmount: entry.total, createdAt: entry.createdAt, firstAt: entry.firstAt }))
      .sort((a, b) => a.firstAt - b.firstAt);
  const applyRing = () => {
    const next = ringEntries();
    const same = next.length === state.ringing.length && next.every((entry, index) => entry.id === state.ringing[index].id);
    if (!same) set({ ringing: next });
  };
  /** Diğer sekmelerin yazdıklarıyla birleştirip değiştirir ve yazar */
  const mutateRing = (change) => {
    ringStore = mergeRingStores(ringStore, cleanRingStore(readJson(RING_STORE_KEY)));
    change(ringStore);
    ringStore = cleanRingStore(ringStore);
    writeJson(RING_STORE_KEY, ringStore);
    applyRing();
  };
  /** Çalmayı bitirir; kimlik bir daha çalmaz (onaylandı, durumu değişti, görüldü…) */
  const resolveIds = (ids) => {
    const list = [...new Set(ids)].filter((id) => isOrderId(id) && (ringStore.ringing[id] || !ringStore.done[id]));
    if (!list.length) return;
    mutateRing((store) => {
      const now = Date.now();
      for (const id of list) {
        delete store.ringing[id];
        store.done[id] = now;
      }
    });
  };
  const ordersScreenSeen = () => {
    try {
      return parseSeenIds(localStorage.getItem(ORDERS_SEEN_KEY));
    } catch {
      return new Set();
    }
  };
  /** Süresi dolan, onaylanan, görülen ve (anlık görüntü verildiyse) Hazırlanıyor'dan çıkanları bırakır */
  const reconcile = ({ active = null, snapshotMs = NaN } = {}) => {
    const entries = ringEntries();
    if (!entries.length) return;
    const seen = ordersScreenSeen();
    const keep = new Set(reconcileRinging(entries, {
      nowMs: Date.now(),
      isDone: (id) => seen.has(id) || phoneAcked.has(id),
      active,
      snapshotMs,
    }).map((entry) => entry.id));
    const drop = entries.filter((entry) => !keep.has(entry.id)).map((entry) => entry.id);
    if (drop.length) resolveIds(drop);
  };

  // ── Ses ──
  const ring = async () => {
    const prefs = alertPrefs.get();
    if (prefs.muted || prefs.volume <= 0) return "muted";
    const now = Date.now();
    if (now - Math.max(lastPlayAt, ringStore.lastRingAt) < PLAY_DEBOUNCE_MS) return "debounced";
    lastPlayAt = now;
    const result = await playAlertSound(prefs);
    if (result === "played" && !stopped) {
      mutateRing((store) => {
        store.lastRingAt = Date.now();
      });
    }
    return result;
  };
  const phoneCheckUseful = () => !state.alarm.ready || state.alarm.error || state.alarm.paired > 0;
  const maybeRepeat = async () => {
    if (repeating || stopped || !ringReady || !state.ringing.length) return;
    const prefs = alertPrefs.get();
    if (!prefs.repeat || prefs.muted || prefs.volume <= 0) return;
    // 5 sn'lik tik 30 sn'ye denk gelsin diye 1 sn pay
    if (Date.now() - Math.max(lastPlayAt, ringStore.lastRingAt) < prefs.intervalSec * 1000 - 1000) return;
    repeating = true;
    try {
      // Telefonda "Gördüm" denmiş sipariş bir kez daha çalmasın
      if (phoneCheckUseful() && Date.now() - state.alarm.checkedAt > PHONE_CHECK_BEFORE_REPEAT_MS) await refreshAlarm();
      if (stopped) return;
      reconcile();
      if (state.ringing.length) await ring();
    } finally {
      repeating = false;
    }
  };

  // ── Duyuru ──
  const raise = (orders, source) => {
    const seen = ordersScreenSeen();
    const fresh = [];
    const ringable = [];
    for (const order of orders) {
      const id = String(order?.id ?? "");
      if (!isOrderId(id) || alertedIds.has(id)) continue;
      remember(alertedIds, id);
      remember(knownIds, id);
      // Zaten ilgilenilmiş sipariş (durumu ilerledi, görüldü, telefonda onaylandı) çalmaz; kaçırılmışsa duyurulmaz da
      const handled = Boolean(ringStore.done[id] || seen.has(id) || phoneAcked.has(id) || (order.status && order.status !== PREPARING));
      if (handled && source === "missed") continue;
      fresh.push({ ...order, id });
      if (!handled) ringable.push({ ...order, id });
    }
    if (!fresh.length) return;
    if (ringable.length) {
      const now = Date.now();
      mutateRing((store) => {
        for (const order of ringable) {
          if (store.ringing[order.id] || store.done[order.id]) continue;
          store.ringing[order.id] = {
            firstAt: now,
            createdAt: isoOrNull(order.createdAt),
            name: String(order.customerName || "Müşteri").slice(0, 80),
            total: Number(order.totalAmount) || 0,
          };
        }
      });
      ring();
    }
    callUi("newOrders", fresh, source);
  };

  // ── HTTP kontrolü (GET /api/orders-analytics?active=1) ──
  const ingestSnapshot = (orders, { snapshotMs, skewMs }) => {
    callUi("preparingCount", orders.filter((order) => order.status === PREPARING).length);
    let missed = [];
    if (baselineReady) {
      missed = pickMissedOrders(orders, { knownIds, baselineMs });
    } else if (firstSyncFailed) {
      // Açılıştaki kontrol başarısız olmuştu: panel açıldıktan sonra verilenler kaçırılmış sayılır
      const openedAt = startedAt + skewMs;
      missed = pickMissedOrders(orders, { knownIds, baselineMs: openedAt });
    }
    for (const order of orders) remember(knownIds, order.id);
    const newest = Math.max(newestCreatedMs(orders), Number.isFinite(snapshotMs) ? snapshotMs : -Infinity);
    if (Number.isFinite(newest)) baselineMs = Math.max(baselineMs ?? -Infinity, newest);
    baselineReady = true;
    reconcile({ active: new Map(orders.map((order) => [order.id, order.status])), snapshotMs });
    if (missed.length && state.connected && Number.isFinite(snapshotMs)) {
      // Birkaç saniye önce verilen sipariş canlı olaydan önce bu yanıtla gelmiş olabilir: canlı olay beklenir,
      // gelmezse kaçırılmış sayılıp duyurulur (raise aynı siparişi iki kez duyurmaz)
      const racing = missed.filter((order) => toMs(order.createdAt) > snapshotMs - LIVE_RACE_MS);
      if (racing.length) {
        missed = missed.filter((order) => !racing.includes(order));
        const timer = setTimeout(() => {
          raceTimers.delete(timer);
          if (!stopped) raise(racing, "missed");
        }, LIVE_RACE_WAIT_MS);
        raceTimers.add(timer);
      }
    }
    if (missed.length) raise(missed, "missed");
  };
  const runSync = async () => {
    const requestedAt = Date.now();
    lastSyncAt = requestedAt;
    try {
      const response = await axios.get("/orders-analytics", { params: { active: 1 }, timeout: 20000 });
      if (stopped) return;
      const data = response?.data?.orderAnalyticsData;
      if (!data || !Array.isArray(data.usersOrders)) return;
      const snapshotMs = toMs(data.meta?.serverTime);
      // Sunucu ile bu cihazın saat farkı (yalnızca açılış sınırını sunucu saatine çevirmek için)
      const skewMs = Number.isFinite(snapshotMs) ? snapshotMs - Math.round((requestedAt + Date.now()) / 2) : 0;
      ingestSnapshot(flattenActiveOrders(data), { snapshotMs, skewMs });
      set({ lastCheckAt: Date.now() });
    } catch {
      if (!baselineReady) firstSyncFailed = true;
    } finally {
      ringReady = true;
    }
  };
  /** Tek istek: sürerken gelen çağrılar aynı sonucu bekler; fresh ise bittikten sonra bir kez daha çalışır. */
  const sync = ({ fresh = false } = {}) => {
    if (syncing) {
      if (fresh) syncAgain = true;
      return syncing;
    }
    syncing = runSync().finally(() => {
      syncing = null;
      if (syncAgain && !stopped) {
        syncAgain = false;
        sync();
      }
    });
    return syncing;
  };

  // ── Alarm telefonları (GET /api/order-alarm/status) ──
  const refreshAlarm = () => {
    if (alarmInflight) return alarmInflight;
    alarmInflight = (async () => {
      try {
        const response = await axios.get("/order-alarm/status", { timeout: 15000 });
        if (stopped) return;
        // lastSeenAt sunucu saatidir; cihaz saati kaymışsa "bağlı" yanlış hesaplanmasın
        const serverNow = Date.parse(response?.headers?.date || "");
        const skewMs = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
        const devices = (Array.isArray(response?.data?.devices) ? response.data.devices : [])
          .filter((device) => device && !device.revokedAt)
          .map((device) => ({
            id: String(device.id ?? ""),
            name: String(device.name || "Sipariş telefonu").slice(0, 40),
            lastSeenAt: device.lastSeenAt || null,
            appVersion: String(device.appVersion || "").slice(0, 20),
          }));
        phoneAcked = phoneAckIds(response?.data?.recentAcks);
        set({ alarm: { ready: true, error: false, devices, skewMs, ...countAlarmDevices(devices, Date.now() + skewMs), checkedAt: Date.now() } });
        reconcile();
      } catch {
        if (!stopped) set({ alarm: { ...state.alarm, ready: true, error: true, checkedAt: Date.now() } });
      } finally {
        alarmInflight = null;
      }
    })();
    return alarmInflight;
  };

  // ── Müşteri iptali ──
  const applyCancels = () => {
    const next = Object.values(cancelStore.items).sort((a, b) => toMs(a.at) - toMs(b.at));
    const same = next.length === state.cancels.length && next.every((entry, index) => entry.orderId === state.cancels[index].orderId);
    if (!same) set({ cancels: next });
  };
  const mutateCancels = (change) => {
    cancelStore = mergeCancelStores(cancelStore, cleanCancelStore(readJson(CANCEL_STORE_KEY)));
    change(cancelStore);
    cancelStore = cleanCancelStore(cancelStore);
    writeJson(CANCEL_STORE_KEY, cancelStore);
    applyCancels();
  };
  /** Yeni iptalleri uyarıya ekler (zaten gösterilen ya da kapatılanlar atlanır); en az biri eklendiyse bir kez ses */
  const addCancels = (entries, { live }) => {
    cancelStore = mergeCancelStores(cancelStore, cleanCancelStore(readJson(CANCEL_STORE_KEY)));
    const fresh = entries.filter((entry) => !cancelStore.items[entry.orderId] && !cancelStore.done[entry.orderId]);
    resolveIds(entries.map((entry) => entry.orderId));
    if (!fresh.length) return;
    mutateCancels((store) => {
      for (const entry of fresh) store.items[entry.orderId] = entry;
    });
    const prefs = alertPrefs.get();
    if (!prefs.muted && prefs.volume > 0) playCancelWarning(prefs);
    for (const entry of fresh) callUi("cancelled", entry, { live });
  };

  // ── Olaylar ──
  const onNewOrder = (data) => {
    const order = data?.order;
    if (!order?.id || order.id === "test") return;
    const createdMs = toMs(order.createdAt);
    if (Number.isFinite(createdMs)) baselineMs = Math.max(baselineMs ?? -Infinity, createdMs);
    raise([order], "live");
  };
  // Hazırlanıyor'dan çıkan ya da silinen sipariş bir daha çalmaz (çalıyorsa susar)
  const onStatusUpdated = (payload) => {
    if (!payload?.newStatus || payload.newStatus === PREPARING) return;
    resolveIds([String(payload.orderId ?? "")]);
  };
  const onOrderUpdated = (payload) => {
    if (payload?.kind === "deleted") resolveIds([String(payload.orderId ?? "")]);
  };
  const onCustomerCancel = (payload) => {
    const entry = normalizeCancel(payload);
    if (!entry) return;
    feedHighWater = Math.max(feedHighWater, toMs(entry.at));
    addCancels([entry], { live: true });
  };
  const onConnect = () => {
    const downFor = disconnectedAt === null ? 0 : Date.now() - disconnectedAt;
    disconnectedAt = null;
    set({ connected: true, offline: false });
    if (downFor > RECONNECT_SYNC_AFTER_MS) sync({ fresh: true });
  };
  const onDisconnect = () => {
    if (disconnectedAt === null) disconnectedAt = Date.now();
    if (state.connected) set({ connected: false });
  };
  const onConnectError = () => {
    if (!socketService.socket?.connected) onDisconnect();
  };
  const onSeenEvent = (event) => {
    const detail = event?.detail || {};
    const ids = [detail.orderId, ...(Array.isArray(detail.orderIds) ? detail.orderIds : [])]
      .map((value) => String(value ?? "").trim())
      .filter(isOrderId);
    if (ids.length) resolveIds(ids);
  };
  const onStorage = (event) => {
    if (event.key === null || event.key === RING_STORE_KEY) {
      ringStore = mergeRingStores(ringStore, cleanRingStore(readJson(RING_STORE_KEY)));
      applyRing();
    }
    if (event.key === null || event.key === CANCEL_STORE_KEY) {
      cancelStore = mergeCancelStores(cancelStore, cleanCancelStore(readJson(CANCEL_STORE_KEY)));
      applyCancels();
    }
    if (event.key === null || event.key === ORDERS_SEEN_KEY) reconcile();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (hiddenAt === null) hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (away > HIDDEN_RESYNC_MS) sync({ fresh: true });
    if (Date.now() - state.alarm.checkedAt > ALARM_POLL_MS) refreshAlarm();
    reconcile();
  };
  const onOnline = () => {
    set({ networkDown: false });
    sync({ fresh: true });
  };
  const onOffline = () => set({ networkDown: true });

  const tick = () => {
    if (stopped) return;
    const now = Date.now();
    if (!state.connected && disconnectedAt !== null && now - disconnectedAt >= OFFLINE_AFTER_MS && !state.offline) {
      set({ offline: true });
      lastOfflinePollAt = now;
      sync();
    } else if (state.offline && now - lastOfflinePollAt >= OFFLINE_POLL_MS) {
      lastOfflinePollAt = now;
      sync();
    } else if (now - lastSyncAt >= SAFETY_SYNC_MS) {
      sync();
    }
    const visible = document.visibilityState !== "hidden";
    const alarmEvery = state.ringing.length ? ALARM_POLL_RINGING_MS : visible ? ALARM_POLL_MS : Infinity;
    if (now - state.alarm.checkedAt >= alarmEvery) refreshAlarm();
    reconcile();
    maybeRepeat();
  };

  // ── Yaşam döngüsü ──
  const start = () => {
    if (!stopped) return stop;
    stopped = false;
    startedAt = Date.now();
    ringStore = mergeRingStores(ringStore, cleanRingStore(readJson(RING_STORE_KEY)));
    cancelStore = mergeCancelStores(cancelStore, cleanCancelStore(readJson(CANCEL_STORE_KEY)));
    applyRing();
    applyCancels();

    const socket = socketService.connect();
    const connected = Boolean(socket?.connected);
    disconnectedAt = connected ? null : startedAt;
    hiddenAt = document.visibilityState === "hidden" ? startedAt : null;
    set({ connected, offline: false, networkDown: navigator.onLine === false });

    const socketEvents = [
      ["connect", onConnect],
      ["disconnect", onDisconnect],
      ["connect_error", onConnectError],
      ["newOrder", onNewOrder],
      ["orderStatusUpdated", onStatusUpdated],
      ["orderUpdated", onOrderUpdated],
      [CUSTOMER_CANCEL_EVENT, onCustomerCancel],
    ];
    socketEvents.forEach(([name, handler]) => socket.on(name, handler));
    window.addEventListener(ORDER_SEEN_EVENT, onSeenEvent);
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    const removeGestureUnlock = installGestureUnlock();
    const timer = setInterval(tick, TICK_MS);
    cleanups = [
      () => socketEvents.forEach(([name, handler]) => socket.off(name, handler)),
      () => window.removeEventListener(ORDER_SEEN_EVENT, onSeenEvent),
      () => window.removeEventListener("storage", onStorage),
      () => window.removeEventListener("online", onOnline),
      () => window.removeEventListener("offline", onOffline),
      () => document.removeEventListener("visibilitychange", onVisibility),
      removeGestureUnlock,
      () => clearInterval(timer),
    ];

    sync();
    refreshAlarm();
    // Tarayıcı sesi engelliyorsa uyarı ilk siparişi beklemeden görünsün (sessiz deneme)
    if (!alertPrefs.get().muted) probeAutoplay();
    return stop;
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    raceTimers.forEach((timer) => clearTimeout(timer));
    raceTimers = new Set();
  };

  // ── Dışa açık eylemler (kimlikleri sabittir) ──
  const actions = {
    /** Bu cihazda "Gördüm": tekrar biter */
    ack: (id) => resolveIds([String(id ?? "")]),
    ackAll: () => resolveIds(Object.keys(ringStore.ringing)),
    /** Siparişi açar (Siparişler ekranı çekmecesi) ve tekrarı bitirir */
    open: (id) => {
      const key = String(id ?? "");
      if (!isOrderId(key)) return;
      resolveIds([key]);
      callUi("openOrder", key);
    },
    dismissCancel: (orderId) =>
      mutateCancels((store) => {
        delete store.items[orderId];
        store.done[orderId] = Date.now();
      }),
    dismissAllCancels: () =>
      mutateCancels((store) => {
        const now = Date.now();
        for (const id of Object.keys(store.items)) store.done[id] = now;
        store.items = {};
      }),
    /**
     * Siparişleri HTTP ile kontrol eder (rozet de güncellenir). Süren bir kontrol varsa onu bekler; fresh ise o
     * bittikten sonra bir kez daha kontrol eder (ör. "Verileri yenile").
     */
    sync: ({ fresh = false } = {}) => sync({ fresh }),
    /** "Şimdi dene": canlı bağlantıyı beklemeden yeniden kurar ve siparişleri kontrol eder */
    retry: () => {
      socketService.reconnectNow();
      return sync({ fresh: true });
    },
    refreshAlarm: () => refreshAlarm(),
    /**
     * Zil listesi (GET /api/admin-notifications) yüklendikçe çağrılır: ilk yüklemede yalnızca sınır belirlenir; sonraki
     * yüklemelerde sınırdan yeni iptal kayıtları (bağlantı kopukken kaçırılanlar) uyarıya eklenir.
     */
    ingestFeed: (items) => {
      const cancels = (Array.isArray(items) ? items : []).filter((item) => item?.kind === "cancel").map(normalizeCancel).filter(Boolean);
      const newest = cancels.reduce((max, entry) => Math.max(max, toMs(entry.at)), -Infinity);
      if (!feedPrimed) {
        feedPrimed = true;
        feedHighWater = Math.max(feedHighWater, newest);
        return;
      }
      const fresh = cancels.filter((entry) => toMs(entry.at) > feedHighWater).sort((a, b) => toMs(a.at) - toMs(b.at));
      feedHighWater = Math.max(feedHighWater, newest);
      if (fresh.length) addCancels(fresh, { live: false });
    },
  };

  return {
    start,
    stop,
    actions,
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
