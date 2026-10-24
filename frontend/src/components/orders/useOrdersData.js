// Siparişler ekranının veri, canlı eşitleme ve değişiklik kancası (JSX yok).
// Sözleşme: scratchpad/orders-design/CONTRACTS.md §5 (C5, C12, C17, C18, C29).
//
// Yapı: bileşen başına bir kez kurulan düz bir "denetleyici" (createOrdersController) tüm veriyi,
// kaplamaları, zamanlayıcıları ve istek kuyruklarını tutar; React tarafı useSyncExternalStore ile
// abone olur. Tüm birleştirmeler eşzamanlı olarak en güncel duruma uygulanır (eski kapanış/üzerine
// yazma yarışı yok). Ham sunucu verisi (base) değişmez kalır; bekleyen durum değişiklikleri, çıkarılan
// satırlar ve silinmeyi bekleyen siparişler kaplama olarak enrichOrders'tan ÖNCE uygulanır.
import { createElement, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import socketService from "../../lib/socket";
import { useConfirm } from "../ConfirmModal";
import { useProductStore } from "../../stores/useProductStore";
import { usePref } from "../admin/ui";
import { UndoToast } from "./atoms";
import {
  BULK_MAX, DAY, FRESH_MS, FULL_RELOAD_MS, IDS_CHUNK, OLDER_PAGE, ORDERS_COUNT_EVENT, ORDER_STATUSES, POLL_MS,
  QTY_DEBOUNCE_MS, SEARCH_LIMIT, UNDO_MAX_MS, UNDO_MS, VISIBLE_RESYNC_MS, WINDOW_DAYS,
  buildDeleteConfirm, buildStatusConfirm, chunk, enrichOrders, isActiveStatus, isOutsideWindow, lineKey, nextAction,
  orderCode, statusChangeMessage, statusConflictMessage, statusFailMessage, toMs,
} from "./shared";

// ── Sabitler ──────────────────────────────────────────────────────────────
const INCLUDE = "customerStats";
const SYNC_OVERLAP_MS = 5000; // updatedSince = sunucu saati − 5 sn (istek sırasında yazılan değişiklik kaçmasın)
const STATUS_EVENT_DEBOUNCE_MS = 700; // orderStatusUpdated olayları tek istekte birleşir
const IDS_EVENT_DEBOUNCE_MS = 500; // orderUpdated olaylarının ?ids toplu isteği
const RECENT_TOUCH_MS = 2000; // kendi düzenlememizin yankısını tekrar çekme
const NOTICE_MS = 300; // çakışma / hata bildirimleri bu süre içinde birleşir
const CONFIRM_POLL_MS = 120;
const BATCH_SLACK_MS = 50; // zamanlayıcı birkaç ms erken/geç tetiklenebilir; kayıt süresi dolmuş sayılır
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const EMPTY_SET = new Set();
const EMPTY_MAP = new Map();
const STALE_TOAST_ID = "orders-sync-stale";
const PRODUCT_MISSING = "Ürün bulunamadı ya da gizli; stok durumu değiştirilmedi";
const LAST_LINE = "Siparişte en az bir ürün kalmalı; siparişi iptal edin ya da silin";

// ── Saf yardımcılar ───────────────────────────────────────────────────────
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const iso = (ms) => new Date(ms).toISOString();
const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
const idOf = (value) => String((value && typeof value === "object" ? value.orderId : value) ?? "").trim();

/** enrichOrders ile birebir aynı satır anahtarları (aynı ad+fiyat tekrarında "#2", "#3") */
const lineKeysOf = (products) => {
  const seen = new Map();
  return (Array.isArray(products) ? products : []).map((p) => {
    const base = lineKey(p);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}#${n}` : base;
  });
};

/** Kupon varken ara toplam da aynı farkla değişir (sunucu yeniden çekilince kesin değer gelir) */
const withTotalsDelta = (order, delta) => {
  const next = { ...order, totalAmount: round2((Number(order.totalAmount) || 0) + delta) };
  if (order.couponCode && Number(order.subtotalAmount) > 0) next.subtotalAmount = round2(Number(order.subtotalAmount) + delta);
  // Teslimat ücreti kilitlidir: yalnızca ürün tutarı değişir (sunucu da aynı kuralı uygular)
  if (order.productTotal !== undefined && order.productTotal !== null) next.productTotal = Math.max(0, round2(Number(order.productTotal) + delta));
  return next;
};

/** Belirtilen satırları (lineKey) çıkarılmış kopya; toplamlar düzeltilir */
const withoutLines = (order, keys) => {
  const lineKeys = lineKeysOf(order.products);
  let delta = 0;
  const products = (order.products || []).filter((p, i) => {
    if (!keys.has(lineKeys[i])) return true;
    delta -= (Number(p?.price) || 0) * (Number(p?.quantity) || 0);
    return false;
  });
  return withTotalsDelta({ ...order, products }, delta);
};

/** Bekleyen / kaydedilmekte olan durum değişikliklerini sentetik geçmiş kaydıyla uygular */
const withStatusStack = (order, stack) => {
  let status = order.status;
  let updatedAt = order.updatedAt;
  let pending;
  const history = Array.isArray(order.statusHistory) ? [...order.statusHistory] : [];
  for (const entry of stack) {
    const from = status;
    status = entry.to;
    updatedAt = iso(entry.at);
    history.push({ status: entry.to, changedAt: updatedAt });
    pending = entry.state === "pending" ? { from, to: entry.to, at: entry.at } : undefined;
  }
  const next = { ...order, status, updatedAt, statusHistory: history };
  if (pending) next.pending = pending;
  return next;
};

/** Katalog ürününün geçerli birim fiyatı: sunucunun kuralı (haftalık / indirim-flash sale / liste fiyatının en düşüğü) */
const unitPrice = (product) => {
  const price = Number(product?.price) || 0;
  let best = price;
  const discounted = Number(product?.discountedPrice);
  if (product?.isDiscounted && Number.isFinite(discounted) && discounted >= 0 && discounted < best) best = discounted;
  const weekly = Number(product?.weeklyPrice);
  if (product?.weeklyPrice != null && Number.isFinite(weekly) && weekly >= 0 && weekly < best) best = weekly;
  return best;
};

/**
 * Bildirimi kapatır. react-hot-toast, ölçülmeden (aynı karede) kapatılan bildirimin silme zamanlayıcısını
 * yükseklik güncellemesinde iptal ediyor ve görünmez bir "hayalet" bırakıyor; çıkış animasyonundan
 * sonra kesin olarak kaldırılır.
 */
const dropToast = (id) => {
  if (!id) return;
  toast.dismiss(id);
  setTimeout(() => toast.remove(id), 1100);
};

const apiBase = () => String(axios.defaults.baseURL || "/api").replace(/\/+$/, "");

/**
 * İstek: normalde axios; sayfa kapanırken / ekran ayrılırken fetch keepalive (çerezle kimlik doğrulama).
 * keepalive yanıtı axios biçimine çevrilir ({ status, data } ya da error.response).
 */
const http = async (method, url, data, keepalive = false) => {
  if (!keepalive || typeof fetch !== "function") return axios.request({ method, url, data });
  const res = await fetch(`${apiBase()}${url}`, {
    method: method.toUpperCase(),
    keepalive: true,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const error = new Error(body?.message || `HTTP ${res.status}`);
    error.response = { status: res.status, data: body };
    throw error;
  }
  return { status: res.status, data: body };
};

// ── Sipariş başına istek kuyruğu (modül düzeyi: ekran yeniden açılsa da sıralama korunur) ──
// Aynı sipariş için asla iki istek aynı anda gitmez (sunucu findById + save ile toplam kaybeder).
const orderQueues = new Map();
const enqueue = (ids, task) => {
  const keys = [...new Set(ids.map(String))];
  const previous = keys.map((id) => orderQueues.get(id)).filter(Boolean);
  const run = Promise.all(previous).then(() => task());
  const tail = run.then(() => undefined, () => undefined);
  keys.forEach((id) => orderQueues.set(id, tail));
  tail.then(() => keys.forEach((id) => { if (orderQueues.get(id) === tail) orderQueues.delete(id); }));
  return run;
};
/** pagehide: kuyruk beklenmez, istek hemen (eşzamanlı) çıkar */
const schedule = (ids, task, mode) => (mode === "pagehide" ? task() : enqueue(ids, task));

// ── Ürün kataloğu (oturumda en fazla bir kez) ─────────────────────────────
let catalogRequest = null;
let catalogLoaded = false;

/**
 * useConfirm iptalde sözünü hiç çözmez (ConfirmModal yalnızca onayda resolve eder). Pencere açılıp
 * onaysız kapanınca false döner; böylece "iptal → false" sözleşmesi tutar ve bekleyen söz birikmez.
 */
const confirmSafe = (confirm, spec) => new Promise((resolve) => {
  let settled = false;
  let seen = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    clearInterval(poll);
    resolve(value);
  };
  const poll = setInterval(() => {
    const open = typeof document !== "undefined" && document.querySelector(".confirm-root");
    if (open) seen = true;
    else if (seen) finish(false);
  }, CONFIRM_POLL_MS);
  Promise.resolve()
    .then(() => confirm(spec))
    .then((value) => finish(Boolean(value)), () => finish(false));
});

// ── Denetleyici ───────────────────────────────────────────────────────────
function createOrdersController({ confirm }) {
  // Sunucu verisi: orderId → ham sipariş, orderId → müşteri anahtarı, müşteri anahtarı → user (en yeni yanıttan)
  let base = { orders: new Map(), userKey: new Map(), users: new Map() };
  let hasOlder = false;
  let windowStart = iso(Date.now() - WINDOW_DAYS * DAY);

  // Kaplamalar
  const stacks = new Map(); // orderId → durum kayıtları [{token, from, to, expected, at, state:'pending'|'committing', cancelled}]
  const removedLines = new Map(); // orderId → Map<lineKey, {name, timer, toastId, committing, prior}>
  const removedOrders = new Map(); // orderId → {timer, toastId, committing}
  let batch = null; // açık geri alma penceresi {id, toastId, items: Map<orderId, entry>, openedAt, timer}
  // Bu oturumda durumu değiştirilen pencere içi siparişler: 30 günden eski bir aktif sipariş teslim / iptal edilince
  // (bekleyen kaplama ya da kayıt sonrası) arşive düşüp görünümlerden kaybolmasın; bir sonraki TAM yüklemeye kadar
  // pencerede kalır (eski ekranla aynı). ?ids / ?q ile gelen arşiv siparişleri buraya hiç girmez.
  const keepInWindow = new Set();

  // Kilitler ve koruma
  const locks = new Map(); // orderId → sayaç (kaydedilmemiş / uçuştaki ürün düzenlemesi)
  const skippedWhileLocked = new Set();
  const guard = new Map(); // orderId → bu sıra numarasına kadar gönderilmiş isteklerin kopyası eskidir
  const touchedAt = new Map();
  const tombstones = new Set(); // silinen siparişler bu oturumda geri gelmez
  const deleteInflight = new Set();
  const qtySessions = new Map(); // `${orderId}|${lineKey}` → {id, lk, original, final, timer}

  // Eşitleme
  let syncRef = null;
  let lastFull = 0;
  let knownIds = null;
  let reqSeq = 0;
  let loadInflight = null;
  let loadQueued = null;
  let started = false;
  let alive = false;
  let uid = 0;
  let batchSeq = 0;
  let tokenSeq = 0;
  const freshTimers = new Set();
  let statusEventTimer = null;
  let idsEventTimer = null;
  const idsEventBatch = new Set();

  // Arayüz durumu
  let ui = {
    status: "loading", error: null, lastSyncAt: null, syncing: false, stale: false, loadingOlder: false,
    freshIds: EMPTY_SET, socketConnected: false, changeLog: EMPTY_MAP,
  };

  // ── Abonelik / anlık görüntü ──
  const listeners = new Set();
  let dataDirty = true;
  let uiDirty = true;
  let derived = null;
  let snapshot = null;

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const emit = (data = true) => {
    if (data) dataDirty = true;
    uiDirty = true;
    listeners.forEach((listener) => listener());
  };
  const setUi = (patch) => {
    ui = { ...ui, ...patch };
    emit(false);
  };

  const buildUsersOrders = () => {
    const groups = new Map();
    for (const [id, raw] of base.orders) {
      if (removedOrders.has(id)) continue;
      let order = raw;
      const removed = removedLines.get(id);
      if (removed?.size) order = withoutLines(order, new Set(removed.keys()));
      const stack = stacks.get(id);
      if (stack?.length) order = withStatusStack(order, stack);
      const key = base.userKey.get(id) ?? "null";
      let group = groups.get(key);
      if (!group) {
        group = { user: base.users.get(key) || { id: null }, orders: [] };
        groups.set(key, group);
      }
      group.orders.push(order);
    }
    return [...groups.values()];
  };

  const derive = () => {
    const orders = enrichOrders(buildUsersOrders(), { hasOlder, windowStart });
    const windowOrders = [];
    const extraIds = new Set();
    const ordersById = new Map();
    let preparing = 0;
    for (const order of orders) {
      ordersById.set(order.orderId, order);
      if (!keepInWindow.has(order.orderId) && isOutsideWindow(order, windowStart)) {
        extraIds.add(order.orderId);
      } else {
        windowOrders.push(order);
        if (order.status === "Hazırlanıyor") preparing += 1;
      }
    }
    const pendingIds = batch?.items.size ? new Set(batch.items.keys()) : EMPTY_SET;
    return {
      orders, windowOrders, ordersById, extraIds, hasOlder, windowStart, pendingIds,
      hasPending: pendingIds.size > 0, preparing,
    };
  };

  const getSnapshot = () => {
    if (dataDirty || !derived) {
      derived = derive();
      dataDirty = false;
      uiDirty = true;
    }
    if (uiDirty || !snapshot) {
      snapshot = { ...derived, ...ui };
      uiDirty = false;
    }
    return snapshot;
  };

  // ── Taban veriyi güncelleme ──
  const isLocked = (id) => locks.has(id);
  const isProtected = (id, seq) => isLocked(id) || (guard.get(id) ?? -1) >= seq;

  const patchBase = (id, fn) => {
    const raw = base.orders.get(id);
    if (!raw) return false;
    const next = fn(raw);
    if (!next || next === raw) return false;
    const orders = new Map(base.orders);
    orders.set(id, next);
    base = { ...base, orders };
    return true;
  };

  /**
   * Gelen müşteri grupları tabana işlenir. replace: tam yükleme (pencere verisi baştan) —
   * pencere dışı ek siparişler (ids / q ile gelenler), kilitli ve korunan siparişler korunur.
   * since: tam yüklemenin İSTENDİĞİ andaki pencere başı; yanıt yalnızca since sonrasını (+ aktifleri) kapsar, daha
   * eskiler (istek uçuştayken "daha eskileri yükle" ile gelenler dahil) budanmaz.
   * Kilitli ya da korunan siparişlerin gelen kopyası yok sayılır. user her zaman en yeni yanıttan.
   * → yanıtta gelen sipariş kimlikleri
   */
  const ingest = (groups, { replace = false, seq = 0, since = windowStart } = {}) => {
    const prev = base;
    const orders = replace ? new Map() : new Map(prev.orders);
    const userKey = replace ? new Map() : new Map(prev.userKey);
    const users = new Map(prev.users);
    const incoming = [];
    for (const group of Array.isArray(groups) ? groups : []) {
      if (!group) continue;
      const key = String(group.user?.id ?? null);
      if (group.user) users.set(key, group.user);
      for (const raw of Array.isArray(group.orders) ? group.orders : []) {
        if (!raw?.orderId) continue;
        const id = String(raw.orderId);
        if (tombstones.has(id)) continue;
        incoming.push(id);
        if (prev.orders.has(id) && isProtected(id, seq)) {
          if (isLocked(id)) skippedWhileLocked.add(id);
          if (replace) {
            orders.set(id, prev.orders.get(id));
            userKey.set(id, prev.userKey.get(id));
          }
          continue;
        }
        orders.set(id, raw);
        userKey.set(id, key);
      }
    }
    if (replace) {
      const windowMs = toMs(since ?? windowStart);
      for (const [id, raw] of prev.orders) {
        if (orders.has(id)) continue;
        const extra = toMs(raw.createdAt) < windowMs && !isActiveStatus(raw.status);
        if (extra || isProtected(id, seq) || removedOrders.has(id)) {
          orders.set(id, raw);
          userKey.set(id, prev.userKey.get(id));
        }
      }
      const used = new Set(userKey.values());
      for (const key of [...users.keys()]) if (!used.has(key)) users.delete(key);
    }
    base = { orders, userKey, users };
    return incoming;
  };

  /** Yeni gelenler (önceki bilinen kimliklerde olmayan, pencere içi) FRESH_MS boyunca vurgulanır */
  const markFresh = () => {
    if (!knownIds) {
      knownIds = new Set(base.orders.keys());
      return;
    }
    const windowMs = toMs(windowStart);
    const added = [];
    for (const [id, raw] of base.orders) {
      if (knownIds.has(id)) continue;
      knownIds.add(id);
      if (!(toMs(raw.createdAt) < windowMs && !isActiveStatus(raw.status))) added.push(id);
    }
    if (!added.length) return;
    ui = { ...ui, freshIds: new Set([...ui.freshIds, ...added]) };
    const timer = setTimeout(() => {
      freshTimers.delete(timer);
      const next = new Set(ui.freshIds);
      added.forEach((id) => next.delete(id));
      setUi({ freshIds: next.size ? next : EMPTY_SET });
    }, FRESH_MS);
    freshTimers.add(timer);
  };
  /** Eski / ek siparişler vurgulanmaz */
  const rememberIds = (ids) => {
    if (knownIds) ids.forEach((id) => knownIds.add(id));
  };

  // ── Oturum değişiklik günlüğü (Change[]) ──
  const setLog = (id, fn) => {
    const current = ui.changeLog.get(id) || [];
    const next = fn(current);
    if (next === current) return;
    const map = new Map(ui.changeLog);
    if (next.length) map.set(id, next);
    else map.delete(id);
    setUi({ changeLog: map.size ? map : EMPTY_MAP });
  };
  const logQty = (id, product, lk, before, after) => setLog(id, (list) => {
    const price = Number(product?.price) || 0;
    const index = list.findIndex((c) => c.type === "qty" && c.lineKey === lk);
    if (index >= 0) {
      const change = list[index];
      if (after === change.from) return list.filter((_, i) => i !== index);
      const next = [...list];
      next[index] = { ...change, to: after, amount: round2(price * (after - change.from)), at: Date.now() };
      return next;
    }
    if (after === before) return list;
    return [...list, {
      type: "qty", name: product?.name || "Ürün", from: before, to: after, amount: round2(price * (after - before)),
      productId: product?.productId ? String(product.productId) : null, lineKey: lk, at: Date.now(),
    }];
  });
  const logRemoved = (id, product, lk) => {
    let prior = null;
    setLog(id, (list) => {
      const index = list.findIndex((c) => c.type === "qty" && c.lineKey === lk);
      prior = index >= 0 ? list[index] : null;
      const from = prior ? prior.from : Number(product?.quantity) || 0;
      const rest = index >= 0 ? list.filter((_, i) => i !== index) : list;
      return [...rest, {
        type: "removed", name: product?.name || "Ürün", from, amount: round2(-(Number(product?.price) || 0) * from),
        productId: product?.productId ? String(product.productId) : null, lineKey: lk, at: Date.now(),
      }];
    });
    return prior;
  };
  const unlogRemoved = (id, lk, prior) => setLog(id, (list) => {
    const rest = list.filter((c) => !(c.type === "removed" && c.lineKey === lk));
    return prior ? [...rest, prior] : rest;
  });
  const logAdded = (id, change) => setLog(id, (list) => [...list, { type: "added", at: Date.now(), ...change }]);
  const dismissChanges = (orderId) => setLog(idOf(orderId), (list) => (list.length ? [] : list));

  // ── Kilitler ──
  const lock = (id) => {
    locks.set(id, (locks.get(id) || 0) + 1);
    touchedAt.set(id, Date.now());
  };
  /** Son kilit kalkınca sipariş sunucudan tazelenir (refetch:false → yalnızca kilitliyken gelen kopya atlandıysa) */
  const unlock = (id, { refetch = true } = {}) => {
    const count = (locks.get(id) || 0) - 1;
    if (count > 0) {
      locks.set(id, count);
      return Promise.resolve([]);
    }
    locks.delete(id);
    touchedAt.set(id, Date.now());
    guard.set(id, reqSeq);
    const needed = refetch || skippedWhileLocked.has(id);
    skippedWhileLocked.delete(id);
    if (!needed || !alive || tombstones.has(id)) return Promise.resolve([]);
    return fetchByIds([id]);
  };

  /** Siparişi yerelde tamamen kaldırır (silindi / bulunamadı) */
  const removeLocal = (id) => {
    tombstones.add(id);
    const stack = stacks.get(id);
    if (stack) {
      stack.forEach((entry) => { entry.cancelled = true; });
      stacks.delete(id);
    }
    keepInWindow.delete(id);
    if (batch?.items.has(id)) {
      batch.items.delete(id);
      syncBatchToast();
    }
    const removed = removedLines.get(id);
    if (removed) {
      removed.forEach((entry) => { clearTimeout(entry.timer); dropToast(entry.toastId); });
      removedLines.delete(id);
    }
    for (const [key, session] of qtySessions) {
      if (session.id === id) { clearTimeout(session.timer); qtySessions.delete(key); }
    }
    const pendingDelete = removedOrders.get(id);
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      dropToast(pendingDelete.toastId);
      removedOrders.delete(id);
    }
    locks.delete(id);
    skippedWhileLocked.delete(id);
    if (base.orders.has(id)) {
      const orders = new Map(base.orders);
      const userKey = new Map(base.userKey);
      orders.delete(id);
      userKey.delete(id);
      base = { ...base, orders, userKey };
    }
    if (ui.changeLog.has(id)) {
      const map = new Map(ui.changeLog);
      map.delete(id);
      ui = { ...ui, changeLog: map.size ? map : EMPTY_MAP };
    }
    emit(true);
  };

  // ── Yükleme ve eşitleme (C17) ──
  const runLoad = async (forceFull) => {
    const needFull = forceFull || !syncRef || Date.now() - lastFull > FULL_RELOAD_MS;
    // İstek anındaki pencere: loadOlder bu arada pencereyi geri çekerse yanıt onu kapsamaz (budama / hasOlder buna göre)
    const since = windowStart;
    const params = needFull
      ? { since, active: 1, include: INCLUDE }
      : { updatedSince: syncRef, include: INCLUDE };
    const seq = ++reqSeq;
    setUi({ syncing: true });
    try {
      const res = await axios.get("/orders-analytics", { params });
      const data = res?.data?.orderAnalyticsData || {};
      const meta = data.meta || null;
      const serverMs = toMs(meta?.serverTime);
      syncRef = Number.isFinite(serverMs) ? iso(serverMs - SYNC_OVERLAP_MS) : null;
      const replace = needFull || !meta;
      if (replace) {
        lastFull = Date.now();
        // Pencere istek uçuştayken geri çekildiyse hasMore eski pencereye göredir; loadOlder'ın değeri korunur
        if (windowStart === since) hasOlder = Boolean(meta?.hasMore);
        // Tam yükleme: oturumda tutulan pencere içi siparişler bırakılır (bekleyen / kaydedilen değişikliği olanlar hariç)
        for (const id of [...keepInWindow]) if (!stacks.has(id)) keepInWindow.delete(id);
      }
      ingest(data.usersOrders, { replace, seq, since });
      markFresh();
      ui = { ...ui, status: "ready", error: null, lastSyncAt: Date.now(), syncing: false, stale: false };
      emit(true);
    } catch (error) {
      const message = errorMessage(error, "Siparişler yüklenemedi");
      if (ui.status !== "ready") {
        setUi({ status: "error", error: message, syncing: false });
      } else {
        if (!ui.stale) toast.error("Siparişler güncellenemedi, tekrar denenecek", { id: STALE_TOAST_ID });
        setUi({ stale: true, error: message, syncing: false });
      }
    }
  };

  /** Yüklemeler üst üste binmez: uçuştayken gelen istek, bitince bir kez daha çalışır (tam ise tam) */
  const load = ({ full = false } = {}) => {
    if (loadInflight) {
      loadQueued = { full: Boolean(loadQueued?.full || full) };
      return loadInflight;
    }
    loadInflight = runLoad(Boolean(full)).finally(() => {
      loadInflight = null;
      const queued = loadQueued;
      loadQueued = null;
      if (queued && alive) load(queued);
    });
    return loadInflight;
  };
  const refresh = (opts) => load({ full: Boolean(opts?.full) }).then(() => undefined);

  const loadOlder = async () => {
    if (ui.loadingOlder || !hasOlder) return;
    setUi({ loadingOlder: true });
    const seq = ++reqSeq;
    try {
      const res = await axios.get("/orders-analytics", {
        params: { before: windowStart, limit: OLDER_PAGE, include: INCLUDE },
      });
      const data = res?.data?.orderAnalyticsData || {};
      const meta = data.meta || {};
      const ids = ingest(data.usersOrders, { seq });
      rememberIds(ids);
      if (meta.oldestCreatedAt && Number.isFinite(toMs(meta.oldestCreatedAt))) windowStart = String(meta.oldestCreatedAt);
      hasOlder = Boolean(meta.hasMore);
      ui = { ...ui, loadingOlder: false };
      emit(true);
    } catch {
      toast.error("Eski siparişler yüklenemedi");
      setUi({ loadingOlder: false });
    }
  };

  /**
   * ?ids ile siparişleri çeker (50'lik parçalar). meta.ids bayrağı olmayan (eski sunucu) yanıtlar yok
   * sayılır. Hata fırlatmaz; bulunan zenginleştirilmiş siparişleri döner.
   * prune: yeni sunucuda yanıtta olmayan kimlikler yerelde kaldırılır (toplu işlemde 404 sonrası uzlaştırma).
   */
  const fetchByIds = async (ids, { prune = false } = {}) => {
    const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map((id) => idOf(id).toLowerCase()).filter((id) => OBJECT_ID.test(id)))];
    if (!list.length) return [];
    let changed = false;
    await Promise.all(chunk(list, IDS_CHUNK).map(async (part) => {
      const seq = ++reqSeq;
      const now = Date.now();
      part.forEach((id) => touchedAt.set(id, now));
      try {
        const res = await axios.get("/orders-analytics", {
          params: { ids: part.join(","), limit: IDS_CHUNK, include: INCLUDE },
        });
        const data = res?.data?.orderAnalyticsData || {};
        if (data.meta?.ids !== true) return;
        const got = ingest(data.usersOrders, { seq });
        rememberIds(got);
        changed = true;
        if (prune) {
          const found = new Set(got);
          part.filter((id) => !found.has(id) && base.orders.has(id)).forEach(removeLocal);
        }
      } catch {
        /* sessiz: çağıran bulunamadı olarak ele alır */
      }
    }));
    if (changed) emit(true);
    const { ordersById } = getSnapshot();
    return list.map((id) => ordersById.get(id)).filter(Boolean);
  };

  /** Sunucu araması (?q). meta.search yoksa (eski sunucu) ya da hata olursa fırlatır. */
  const searchServer = async (q) => {
    const query = String(q ?? "").trim();
    if (!query) return { count: 0, ids: [] };
    const seq = ++reqSeq;
    let res;
    try {
      res = await axios.get("/orders-analytics", { params: { q: query, limit: SEARCH_LIMIT, include: INCLUDE } });
    } catch (error) {
      throw new Error(errorMessage(error, "Sunucu araması yapılamadı"));
    }
    const data = res?.data?.orderAnalyticsData || {};
    if (data.meta?.search !== true) throw new Error("Sunucu araması bu sürümde desteklenmiyor");
    const ids = ingest(data.usersOrders, { seq });
    rememberIds(ids);
    emit(true);
    const count = Number(data.meta.count);
    return { count: Number.isFinite(count) ? count : ids.length, ids };
  };

  // ── Durum hattı (C5) ──
  const currentStatus = (id) => {
    const stack = stacks.get(id);
    return stack?.length ? stack[stack.length - 1].to : base.orders.get(id)?.status;
  };
  const pendingEntry = (id) => {
    const stack = stacks.get(id);
    const last = stack?.[stack.length - 1];
    return last?.state === "pending" && batch?.items.get(id) === last ? last : null;
  };
  /** Kaydı yığından çıkarır; cascade → ondan sonra gelen (ona bağlı) kayıtlar da düşer */
  const dropEntry = (id, entry, cascade = false) => {
    const stack = stacks.get(id);
    if (!stack || !entry) return;
    const index = stack.indexOf(entry);
    if (index < 0) return;
    const removed = cascade ? stack.splice(index) : stack.splice(index, 1);
    for (const item of removed) {
      item.cancelled = true;
      if (batch?.items.get(id) === item) batch.items.delete(id);
    }
    if (!stack.length) stacks.delete(id);
  };

  const notices = (() => {
    let conflicts = [];
    let fails = [];
    let timer = null;
    const flush = () => {
      timer = null;
      if (conflicts.length > 2) {
        toast.error(`${conflicts.length} sipariş bu arada değişmiş; değişiklik uygulanmadı`);
      } else {
        conflicts.forEach(({ id, status }) => toast.error(ORDER_STATUSES.includes(status)
          ? statusConflictMessage({ orderId: id }, status)
          : `${orderCode(id)} bu arada değişmiş; değişiklik uygulanmadı`));
      }
      if (fails.length > 2) toast.error(`${fails.length} siparişin durumu güncellenemedi`);
      else fails.forEach((id) => toast.error(statusFailMessage({ orderId: id })));
      conflicts = [];
      fails = [];
    };
    const later = () => { if (!timer) timer = setTimeout(flush, NOTICE_MS); };
    return {
      conflict: (id, status) => { conflicts.push({ id, status }); later(); },
      fail: (id) => { fails.push(id); later(); },
    };
  })();

  /** Tek birleşik geri alma bildirimi (sabit kimlik, yerinde güncellenir) */
  const syncBatchToast = () => {
    if (!batch) return;
    if (!batch.items.size) {
      closeBatch();
      return;
    }
    const current = batch;
    const message = statusChangeMessage([...current.items].map(([orderId, entry]) => ({ order: { orderId }, to: entry.to })));
    toast(() => createElement(UndoToast, { message, onUndo: () => { if (batch === current) undoLast(); } }), {
      id: current.toastId,
      duration: Infinity,
    });
  };
  const closeBatch = () => {
    if (!batch) return;
    clearTimeout(batch.timer);
    dropToast(batch.toastId);
    batch = null;
  };
  const openBatch = (now) => {
    if (!batch) {
      batchSeq += 1;
      batch = { id: batchSeq, toastId: `orders-status-undo-${batchSeq}`, items: new Map(), openedAt: now, timer: null };
    }
    return batch;
  };
  /**
   * Her yeni değişiklik süreyi UNDO_MS'e sıfırlar; pencere açıldıktan en geç UNDO_MAX_MS sonra tetiklenir.
   * Tetiklenince yalnızca kendi UNDO_MS'ini doldurmuş kayıtlar kaydedilir; geç katılanlar aynı pencerede (aynı
   * bildirimde) kalır ve tam 5 sn geri alınabilir (iptal onayındaki "5 sn içinde geri alabilirsiniz" sözü tutar).
   */
  const scheduleBatch = (now) => {
    if (!batch) return;
    clearTimeout(batch.timer);
    const delay = Math.max(0, Math.min(UNDO_MS, batch.openedAt + UNDO_MAX_MS - now));
    batch.timer = setTimeout(fireBatch, delay);
  };
  const fireBatch = () => {
    const current = batch;
    if (!current) return;
    const now = Date.now();
    const due = [];
    let earliest = Infinity;
    let latest = -Infinity;
    for (const [id, e] of current.items) {
      if (e.at + UNDO_MS <= now + BATCH_SLACK_MS) {
        due.push({ id, e });
      } else {
        earliest = Math.min(earliest, e.at);
        latest = Math.max(latest, e.at);
      }
    }
    if (due.length === current.items.size) {
      commitBatch("normal");
      return;
    }
    // Kısmi kayıt: süresi dolanlar gider, kalanlar için pencere en eski kalan kayıttan yeniden sayılır
    due.forEach(({ id }) => current.items.delete(id));
    current.openedAt = earliest;
    current.timer = setTimeout(fireBatch, Math.max(0, latest + UNDO_MS - now));
    if (!due.length) return;
    commitEntries(due, "normal");
    syncBatchToast();
    emit(true);
  };

  const sendStatus = async (ids, to, expected, mode) => {
    const keepalive = mode !== "normal";
    const extra = expected ? { status: to, expectedStatus: expected } : { status: to };
    if (ids.length === 1) {
      const [id] = ids;
      try {
        const res = await http("put", "/orders-analytics/update-status", { orderId: id, ...extra }, keepalive);
        return res?.data?.unchanged ? { unchanged: [id] } : { ok: [id] };
      } catch (error) {
        const code = error?.response?.status;
        if (code === 409) return { conflicts: [{ id, status: error.response.data?.status }] };
        if (code === 404) return { missing: [id] };
        return { failed: [id] };
      }
    }
    try {
      const res = await http("put", "/orders-analytics/bulk-status", { orderIds: ids, ...extra }, keepalive);
      const skipped = new Map((Array.isArray(res?.data?.skipped) ? res.data.skipped : []).map((s) => [String(s?.orderId), s]));
      const out = { ok: [], unchanged: [], conflicts: [], missing: [] };
      for (const id of ids) {
        const skip = skipped.get(id);
        if (!skip) out.ok.push(id);
        else if (skip.reason === "missing") out.missing.push(id);
        else if (skip.reason === "unchanged") out.unchanged.push(id);
        else out.conflicts.push({ id, status: skip.status });
      }
      return out;
    } catch (error) {
      // Yeni sunucu: hepsi yok → 404; eski sunucu: biri yoksa 404. İkisinde de ?ids ile uzlaştırılır.
      if (error?.response?.status === 404) return { reconcile: ids };
      return { failed: ids };
    }
  };

  const settleStatus = (live, result) => {
    const entries = new Map(live.map((item) => [item.id, item.e]));
    const nowIso = iso(Date.now());
    const confirmStatus = (id, withHistory) => {
      const entry = entries.get(id);
      patchBase(id, (order) => ({
        ...order,
        status: entry.to,
        updatedAt: nowIso,
        ...(withHistory ? { statusHistory: [...(order.statusHistory || []), { status: entry.to, changedAt: nowIso }] } : {}),
      }));
      dropEntry(id, entry);
      guard.set(id, reqSeq);
    };
    (result.ok || []).forEach((id) => confirmStatus(id, true));
    (result.unchanged || []).forEach((id) => confirmStatus(id, false));
    const refetch = [];
    for (const { id, status } of result.conflicts || []) {
      dropEntry(id, entries.get(id), true);
      if (ORDER_STATUSES.includes(status)) {
        patchBase(id, (order) => (order.status === status ? order : { ...order, status }));
        guard.set(id, reqSeq);
      }
      notices.conflict(id, status);
      refetch.push(id);
    }
    for (const id of result.failed || []) {
      dropEntry(id, entries.get(id), true);
      notices.fail(id);
    }
    (result.missing || []).forEach((id) => removeLocal(id));
    if (result.reconcile?.length) {
      result.reconcile.forEach((id) => dropEntry(id, entries.get(id), true));
      if (alive) fetchByIds(result.reconcile, { prune: true });
    }
    if (refetch.length && alive) fetchByIds(refetch);
    syncBatchToast();
    emit(true);
  };

  /** Aynı hedef + beklenen durum grupları; tek sipariş update-status, birden çok bulk-status (≤100) */
  const commitEntries = (items, mode) => {
    const groups = new Map();
    for (const item of items) {
      if (item.e.cancelled) continue;
      item.e.state = "committing";
      const key = `${item.e.to}\u0000${item.e.expected ?? ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const list of groups.values()) {
      for (const part of chunk(list, BULK_MAX)) {
        const ids = part.map((item) => item.id);
        const task = async () => {
          const live = part.filter((item) => !item.e.cancelled && stacks.get(item.id)?.includes(item.e));
          if (!live.length) return;
          const result = await sendStatus(live.map((item) => item.id), live[0].e.to, live[0].e.expected, mode);
          settleStatus(live, result);
        };
        Promise.resolve(schedule(ids, task, mode)).catch(() => {});
      }
    }
  };

  const commitBatch = (mode = "normal") => {
    const current = batch;
    if (!current) return;
    batch = null;
    clearTimeout(current.timer);
    dropToast(current.toastId);
    commitEntries([...current.items].map(([id, e]) => ({ id, e })), mode);
    emit(true);
  };

  /** Bekleyen değişikliği hemen kaydeder (aynı siparişe ikinci değişiklik, silme) */
  /** sync:false → pencere boşalsa da açık kalır (hemen yeni değişiklik eklenecek; bildirim yerinde güncellenir) */
  const flushPendingFor = (id, { sync = true } = {}) => {
    const entry = pendingEntry(id);
    if (!entry) return;
    batch.items.delete(id);
    commitEntries([{ id, e: entry }], "normal");
    if (sync) syncBatchToast();
  };

  const undoOne = (id) => {
    if (!batch?.items.has(id)) return false;
    const entry = batch.items.get(id);
    batch.items.delete(id);
    dropEntry(id, entry);
    return true;
  };
  const undo = (orderId) => {
    if (undoOne(idOf(orderId))) {
      syncBatchToast();
      emit(true);
    }
  };
  const undoLast = () => {
    if (!batch?.items.size) return false;
    for (const [id, entry] of batch.items) dropEntry(id, entry);
    batch.items.clear();
    closeBatch();
    emit(true);
    return true;
  };

  const resolveTargets = (target, to) => {
    const { ordersById } = getSnapshot();
    const list = Array.isArray(target) ? target : [target];
    const seen = new Set();
    const changing = [];
    const reverts = [];
    for (const item of list) {
      const id = idOf(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const latest = ordersById.get(id);
      if (!latest || !base.orders.has(id)) continue;
      const current = currentStatus(id);
      if (current === to) continue;
      // Bekleyen değişikliğin başladığı duruma geri taşımak = o değişikliği geri almak (istek yok)
      const pending = pendingEntry(id);
      if (pending && pending.from === to) {
        reverts.push(id);
        continue;
      }
      changing.push(latest.status === current ? latest : { ...latest, status: current });
    }
    return { changing, reverts };
  };

  const applyStatus = (changing, to, reverts) => {
    const now = Date.now();
    reverts.forEach(undoOne);
    const windowMs = toMs(windowStart);
    for (const order of changing) {
      const id = order.orderId;
      flushPendingFor(id, { sync: false }); // flush-then-queue: öncekini hemen kaydet, yenisi onun arkasına
      const raw = base.orders.get(id);
      if (raw && !(toMs(raw.createdAt) < windowMs && !isActiveStatus(raw.status))) keepInWindow.add(id);
      const from = currentStatus(id);
      const entry = { token: ++tokenSeq, from, to, expected: from, at: now, state: "pending", cancelled: false };
      const stack = stacks.get(id) || [];
      stack.push(entry);
      stacks.set(id, stack);
      openBatch(now).items.set(id, entry);
    }
    if (changing.length) scheduleBatch(now);
    syncBatchToast();
    emit(true);
  };

  /**
   * C5: onaylar geçince kaplama EŞZAMANLI uygulanır (onay yoksa hiç await'ten önce; sürükle-bırak geri
   * zıplamaz) ve true döner — sunucu kaydı beklenmez. Hiçbir şey değişmediyse / onay iptalse false.
   */
  const changeStatus = async (target, to) => {
    if (!ORDER_STATUSES.includes(to)) return false;
    let { changing, reverts } = resolveTargets(target, to);
    if (!changing.length && !reverts.length) return false;
    const spec = changing.length ? buildStatusConfirm(changing, to) : null;
    if (spec) {
      const ok = await confirmSafe(confirm, spec);
      if (!ok) return false;
      ({ changing, reverts } = resolveTargets(target, to)); // onay beklerken değişmiş olabilir
      if (!changing.length && !reverts.length) return false;
    }
    applyStatus(changing, to, reverts);
    return true;
  };
  const advance = (order) => {
    const next = nextAction(currentStatus(idOf(order)) ?? order?.status);
    return next ? changeStatus(order, next.status, { source: "card" }) : Promise.resolve(false);
  };
  const advanceMany = async (orders) => {
    const groups = new Map();
    for (const order of Array.isArray(orders) ? orders : []) {
      const next = nextAction(currentStatus(idOf(order)) ?? order?.status);
      if (!next) continue;
      if (!groups.has(next.status)) groups.set(next.status, []);
      groups.get(next.status).push(order);
    }
    let applied = false;
    for (const [to, list] of groups) {
      if (await changeStatus(list, to, { source: "bulk" })) applied = true;
    }
    return applied;
  };

  // ── Ürün düzenlemeleri (C12) ──
  const lineAt = (id, lk) => {
    const raw = base.orders.get(id);
    if (!raw) return null;
    const index = lineKeysOf(raw.products).indexOf(lk);
    return index < 0 ? null : { raw, index, product: raw.products[index] };
  };
  const lineRef = (line) => ({
    ...(line.product?.lineId ? { lineId: String(line.product.lineId) } : {}),
    productIndex: line.index,
  });
  const patchQuantity = (id, lk, qty) => patchBase(id, (order) => {
    const index = lineKeysOf(order.products).indexOf(lk);
    if (index < 0) return order;
    const product = order.products[index];
    const old = Number(product.quantity) || 0;
    if (old === qty) return order;
    const products = [...order.products];
    products[index] = { ...product, quantity: qty };
    return withTotalsDelta({ ...order, products }, (Number(product.price) || 0) * (qty - old));
  });

  const commitQty = (key, mode = "normal") => {
    const session = qtySessions.get(key);
    if (!session) return;
    qtySessions.delete(key);
    clearTimeout(session.timer);
    const { id, lk } = session;
    const task = async () => {
      const line = lineAt(id, lk);
      if (!line) return;
      try {
        await http("put", "/orders-analytics/update-item-quantity", {
          orderId: id, ...lineRef(line), newQuantity: session.final,
        }, mode !== "normal");
      } catch (error) {
        toast.error(errorMessage(error, "Adet güncellenemedi"));
        const current = lineAt(id, lk);
        if (current) {
          logQty(id, current.product, lk, Number(current.product.quantity) || 0, session.original);
          patchQuantity(id, lk, session.original);
          emit(true);
        }
      }
    };
    Promise.resolve(schedule([id], task, mode)).catch(() => {}).finally(() => unlock(id));
  };

  const updateQuantity = (order, lk, qty) => {
    const id = idOf(order);
    const value = Math.round(Number(qty));
    if (!Number.isFinite(value) || removedOrders.has(id) || removedLines.get(id)?.has(lk)) return;
    const line = lineAt(id, lk);
    if (!line) return;
    const next = Math.min(999, Math.max(1, value));
    const before = Number(line.product.quantity) || 0;
    if (next === before) return;
    const key = `${id}|${lk}`;
    let session = qtySessions.get(key);
    if (!session) {
      session = { id, lk, original: before, final: next, timer: null };
      qtySessions.set(key, session);
      lock(id);
    }
    session.final = next;
    patchQuantity(id, lk, next);
    logQty(id, line.product, lk, before, next);
    clearTimeout(session.timer);
    session.timer = setTimeout(() => commitQty(key), QTY_DEBOUNCE_MS);
    emit(true);
  };

  const dropRemoval = (id, lk) => {
    const map = removedLines.get(id);
    if (!map) return;
    map.delete(lk);
    if (!map.size) removedLines.delete(id);
  };
  const commitRemove = (id, lk, mode = "normal") => {
    const entry = removedLines.get(id)?.get(lk);
    if (!entry || entry.committing) return;
    entry.committing = true;
    clearTimeout(entry.timer);
    dropToast(entry.toastId);
    const task = async () => {
      const line = lineAt(id, lk);
      if (!line) {
        dropRemoval(id, lk);
        emit(true);
        return;
      }
      try {
        await http("delete", "/orders-analytics/remove-item", { orderId: id, ...lineRef(line) }, mode !== "normal");
        patchBase(id, (order) => withoutLines(order, new Set([lk])));
        dropRemoval(id, lk);
      } catch (error) {
        dropRemoval(id, lk);
        unlogRemoved(id, lk, entry.prior);
        toast.error(errorMessage(error, "Ürün çıkarılamadı"));
      }
      emit(true);
    };
    Promise.resolve(schedule([id], task, mode)).catch(() => {}).finally(() => unlock(id));
  };
  const undoRemove = (id, lk) => {
    const entry = removedLines.get(id)?.get(lk);
    if (!entry || entry.committing) return;
    clearTimeout(entry.timer);
    dropToast(entry.toastId);
    dropRemoval(id, lk);
    unlogRemoved(id, lk, entry.prior);
    unlock(id, { refetch: false });
    emit(true);
  };
  const removeItem = (order, lk) => {
    const id = idOf(order);
    if (removedOrders.has(id) || removedLines.get(id)?.has(lk)) return;
    const line = lineAt(id, lk);
    if (!line) return;
    const removed = removedLines.get(id);
    const remaining = lineKeysOf(line.raw.products).filter((key) => !removed?.has(key)).length;
    if (remaining <= 1) {
      toast.error(LAST_LINE);
      return;
    }
    const key = `${id}|${lk}`;
    if (qtySessions.has(key)) commitQty(key);
    lock(id);
    const fresh = lineAt(id, lk) || line;
    const name = fresh.product?.name || "Ürün";
    const entry = { name, toastId: `orders-remove-${++uid}`, timer: null, committing: false, prior: null };
    entry.prior = logRemoved(id, fresh.product, lk);
    if (!removedLines.has(id)) removedLines.set(id, new Map());
    removedLines.get(id).set(lk, entry);
    toast(() => createElement(UndoToast, { message: `${name} çıkarıldı`, onUndo: () => undoRemove(id, lk) }), {
      id: entry.toastId,
      duration: Infinity,
    });
    entry.timer = setTimeout(() => commitRemove(id, lk), UNDO_MS);
    emit(true);
  };

  const addProduct = async (order, product, qty) => {
    const id = idOf(order);
    if (!base.orders.has(id) || removedOrders.has(id) || !product?._id) return false;
    const quantity = Math.min(99, Math.max(1, Math.round(Number(qty)) || 1));
    lock(id);
    let ok = false;
    try {
      await enqueue([id], () => http("put", "/orders-analytics/add-product", {
        orderId: id, productId: String(product._id), quantity,
      }));
      logAdded(id, {
        name: product.name || "Ürün", to: quantity, amount: round2(unitPrice(product) * quantity), productId: String(product._id),
      });
      ok = true;
    } catch (error) {
      toast.error(errorMessage(error, "Ürün eklenemedi"));
    }
    await unlock(id).catch(() => {});
    return ok;
  };

  const addCustomItem = async (order, amount, name) => {
    const id = idOf(order);
    const value = round2(amount);
    if (!base.orders.has(id) || removedOrders.has(id) || !(value > 0)) return false;
    const label = String(name ?? "").trim().slice(0, 80);
    lock(id);
    let ok = false;
    try {
      await enqueue([id], () => http("put", "/orders-analytics/add-item", { orderId: id, amount: value, name: label }));
      logAdded(id, { name: label || "Özel Ekleme", to: 1, amount: value, productId: null });
      ok = true;
    } catch (error) {
      toast.error(errorMessage(error, "Tutar eklenemedi"));
    }
    await unlock(id).catch(() => {});
    return ok;
  };

  const saveTracking = async (order, text) => {
    const id = idOf(order);
    if (!base.orders.has(id) || removedOrders.has(id)) return false;
    const value = String(text ?? "").trim().slice(0, 120);
    lock(id);
    let ok = false;
    try {
      await enqueue([id], () => http("put", "/orders-analytics/delivery-tracking", { orderId: id, deliveryTracking: value }));
      patchBase(id, (raw) => ({ ...raw, deliveryTracking: value }));
      ok = true;
    } catch {
      toast.error("Teslimat notu kaydedilemedi");
    }
    unlock(id, { refetch: false });
    emit(true);
    return ok;
  };

  // ── Teslimat operasyonu: telefon teyidi, kurye ataması, teslim edilemedi ──
  const confirmCallback = async (order) => {
    const id = idOf(order);
    if (!base.orders.has(id) || removedOrders.has(id)) return false;
    lock(id);
    let ok = false;
    try {
      const res = await enqueue([id], () => http("put", "/orders-analytics/confirm-callback", { orderId: id }));
      const at = res?.data?.order?.callbackConfirmedAt || new Date().toISOString();
      patchBase(id, (raw) => ({ ...raw, callbackConfirmedAt: at }));
      ok = true;
    } catch (error) {
      toast.error(errorMessage(error, "Teyit kaydedilemedi"));
    }
    unlock(id, { refetch: !ok });
    emit(true);
    return ok;
  };

  /** courier: { _id, name } ya da null (atamayı kaldır) */
  const assignCourier = async (orders, courier) => {
    const ids = [...new Set((Array.isArray(orders) ? orders : [orders]).map(idOf))]
      .filter((id) => base.orders.has(id) && !removedOrders.has(id));
    if (!ids.length) return false;
    ids.forEach(lock);
    let ok = false;
    try {
      await enqueue(ids, () => http("put", "/orders-analytics/assign-courier", { orderIds: ids, courierId: courier?._id || null }));
      const value = courier ? { id: String(courier._id), name: courier.name } : null;
      ids.forEach((id) => patchBase(id, (raw) => ({ ...raw, courier: value })));
      ok = true;
    } catch (error) {
      toast.error(errorMessage(error, "Kurye atanamadı"));
    }
    ids.forEach((id) => unlock(id, { refetch: !ok }));
    emit(true);
    return ok;
  };

  const markDeliveryFailed = async (order, code, note) => {
    const id = idOf(order);
    if (!base.orders.has(id) || removedOrders.has(id)) return false;
    if (pendingEntry(id)) {
      toast.error("Önce bekleyen durum değişikliğinin kaydedilmesini bekleyin ya da geri alın");
      return false;
    }
    lock(id);
    let ok = false;
    try {
      const res = await enqueue([id], () => http("put", "/orders-analytics/delivery-failed", { orderId: id, code, note }));
      const outcome = res?.data?.deliveryOutcome || { code, note };
      const at = new Date().toISOString();
      patchBase(id, (raw) => ({
        ...raw,
        status: "İptal Edildi",
        deliveryOutcome: outcome,
        statusHistory: [...(Array.isArray(raw.statusHistory) ? raw.statusHistory : []), { status: "İptal Edildi", changedAt: at }],
      }));
      ok = true;
    } catch (error) {
      toast.error(errorMessage(error, "Kaydedilemedi"));
    }
    emit(true);
    await unlock(id).catch(() => {});
    return ok;
  };

  // ── Silme (geri alınabilir) ──
  const commitDelete = (id, mode = "normal") => {
    const entry = removedOrders.get(id);
    if (!entry || entry.committing) return;
    entry.committing = true;
    clearTimeout(entry.timer);
    dropToast(entry.toastId);
    deleteInflight.add(id);
    const task = async () => {
      try {
        await http("delete", `/orders-analytics/delete-order/${encodeURIComponent(id)}`, undefined, mode !== "normal");
        removeLocal(id);
      } catch (error) {
        if (error?.response?.status === 404) {
          removeLocal(id);
        } else {
          if (removedOrders.get(id) === entry) removedOrders.delete(id);
          toast.error(errorMessage(error, "Sipariş silinemedi"));
          emit(true);
        }
      } finally {
        deleteInflight.delete(id);
      }
    };
    Promise.resolve(schedule([id], task, mode)).catch(() => {});
  };
  const undoDelete = (id, entry) => {
    if (removedOrders.get(id) !== entry || entry.committing) return;
    clearTimeout(entry.timer);
    dropToast(entry.toastId);
    removedOrders.delete(id);
    emit(true);
  };
  /** Onaydan sonra gizlenir ve "#KOD silindi · Geri al" gösterilir; zamanlanınca true döner */
  const deleteOrder = async (order) => {
    const id = idOf(order);
    if (!base.orders.has(id) || removedOrders.has(id)) return false;
    const latest = getSnapshot().ordersById.get(id) || order;
    const spec = buildDeleteConfirm({ ...latest, status: currentStatus(id) ?? latest?.status });
    if (spec && !(await confirmSafe(confirm, spec))) return false;
    if (!base.orders.has(id) || removedOrders.has(id)) return false;
    flushPendingFor(id);
    const entry = { toastId: `orders-delete-${++uid}`, timer: null, committing: false };
    removedOrders.set(id, entry);
    toast(() => createElement(UndoToast, { message: `${orderCode(id)} silindi`, onUndo: () => undoDelete(id, entry) }), {
      id: entry.toastId,
      duration: Infinity,
    });
    entry.timer = setTimeout(() => commitDelete(id), UNDO_MS);
    emit(true);
    return true;
  };

  // ── Stok (tükendi işaretle) ──
  const patchProductStore = (pid, flag) => {
    useProductStore.setState((state) => ({
      products: Array.isArray(state.products)
        ? state.products.map((p) => (String(p?._id) === pid ? { ...p, isOutOfStock: flag } : p))
        : state.products,
    }));
  };
  /** Önce taze GET; yalnızca stoktaysa işaretler (uç nokta yalnızca tersine çevirir) */
  const markOutOfStock = async (productId) => {
    const pid = String(productId ?? "").trim();
    if (!OBJECT_ID.test(pid)) {
      toast.error(PRODUCT_MISSING);
      return false;
    }
    let product;
    try {
      const res = await axios.get(`/products/${pid}`);
      product = res?.data;
    } catch (error) {
      const code = error?.response?.status;
      toast.error(code === 404 || code === 400 ? PRODUCT_MISSING : errorMessage(error, "Stok durumu kontrol edilemedi"));
      return false;
    }
    if (!product?._id) {
      toast.error(PRODUCT_MISSING);
      return false;
    }
    if (product.isOutOfStock === true) {
      patchProductStore(pid, true);
      toast("Ürün zaten tükendi olarak işaretli");
      return true;
    }
    try {
      const res = await axios.patch(`/products/toggle-out-of-stock/${pid}`);
      const flag = res?.data?.product?.isOutOfStock;
      const marked = flag === undefined ? true : Boolean(flag);
      patchProductStore(pid, marked);
      if (marked) toast.success("Ürün tükendi olarak işaretlendi");
      else toast.error("Ürün bu arada stoka alınmış; tekrar deneyin");
      return marked;
    } catch (error) {
      toast.error(errorMessage(error, "Stok durumu değiştirilemedi"));
      return false;
    }
  };

  // ── Bekleyen her şeyi gönder (ekrandan ayrılma / sayfa kapanışı) ──
  const flushAll = (mode) => {
    for (const key of [...qtySessions.keys()]) commitQty(key, mode);
    commitBatch(mode);
    for (const [id, map] of [...removedLines]) for (const lk of [...map.keys()]) commitRemove(id, lk, mode);
    for (const id of [...removedOrders.keys()]) commitDelete(id, mode);
  };

  // ── Canlı olaylar ──
  const handleOrderUpdated = (payload) => {
    const id = idOf(payload?.orderId).toLowerCase();
    if (!OBJECT_ID.test(id)) return;
    if (payload?.kind === "deleted") {
      // Kendi bekleyen / uçuştaki silmemiz kendi akışında kapanır
      if (!removedOrders.has(id) && !deleteInflight.has(id) && (base.orders.has(id) || stacks.has(id))) removeLocal(id);
      return;
    }
    if (!base.orders.has(id) || isLocked(id) || Date.now() - (touchedAt.get(id) || 0) < RECENT_TOUCH_MS) return;
    idsEventBatch.add(id);
    clearTimeout(idsEventTimer);
    idsEventTimer = setTimeout(() => {
      const ids = [...idsEventBatch].filter((item) => !isLocked(item));
      idsEventBatch.clear();
      if (ids.length && alive) fetchByIds(ids);
    }, IDS_EVENT_DEBOUNCE_MS);
  };

  const connectSocket = (token) => {
    const socket = socketService.connect();
    if (!socket) return undefined;
    let dropped = false;
    const join = () => socketService.joinAdminRoom(token);
    const onConnect = () => {
      join();
      setUi({ socketConnected: true });
      if (dropped) {
        dropped = false;
        load();
      }
    };
    const onDisconnect = () => {
      dropped = true;
      setUi({ socketConnected: false });
    };
    const onNewOrder = () => { load(); };
    const onStatusUpdated = () => {
      clearTimeout(statusEventTimer);
      statusEventTimer = setTimeout(() => load(), STATUS_EVENT_DEBOUNCE_MS);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("newOrder", onNewOrder);
    socket.on("orderStatusUpdated", onStatusUpdated);
    socket.on("orderUpdated", handleOrderUpdated);
    if (socket.connected) join();
    setUi({ socketConnected: Boolean(socket.connected) });
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("newOrder", onNewOrder);
      socket.off("orderStatusUpdated", onStatusUpdated);
      socket.off("orderUpdated", handleOrderUpdated);
      clearTimeout(statusEventTimer);
      clearTimeout(idsEventTimer);
      idsEventBatch.clear();
    };
  };

  /** Bağlanınca: ilk yükleme (bir kez), görünürlük/sayfa kapanışı dinleyicileri. Ayrılınca: hepsini gönder. */
  const mount = () => {
    alive = true;
    if (!started) {
      started = true;
      load({ full: true });
    }
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!ui.lastSyncAt || Date.now() - ui.lastSyncAt > VISIBLE_RESYNC_MS) load();
    };
    const onPageHide = () => flushAll("pagehide");
    const onPageShow = (event) => { if (event.persisted) load({ full: true }); };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("freeze", onPageHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("freeze", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      flushAll("unmount");
      freshTimers.forEach(clearTimeout);
      freshTimers.clear();
      if (ui.freshIds.size) ui = { ...ui, freshIds: EMPTY_SET };
      alive = false;
    };
  };

  const poll = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") load();
  };

  return {
    subscribe, getSnapshot, mount, connectSocket, poll,
    refresh, loadOlder, fetchByIds: (ids) => fetchByIds(ids), searchServer,
    changeStatus, advance, advanceMany, undo, undoLast,
    updateQuantity, removeItem, addProduct, addCustomItem, saveTracking, deleteOrder, markOutOfStock,
    dismissChanges, confirmCallback, assignCourier, markDeliveryFailed,
  };
}

/**
 * Siparişler ekranının tek veri kaynağı. Dönüş biçimi CONTRACTS.md §5.1 (+ ürün kataloğu alanları
 * ve preparingCount). Ayrıca yüklü "Hazırlanıyor" sayısı her değiştiğinde window'a
 * 'admin-orders-count' { preparing } olayını gönderir (kenar çubuğu / başlık rozeti).
 */
export default function useOrdersData({ accessToken } = {}) {
  const { confirm } = useConfirm();
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const controllerRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = createOrdersController({ confirm: (spec) => confirmRef.current(spec) });
  const ctl = controllerRef.current;

  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [autoRefresh, setAutoRefresh] = usePref("admin-order-live", true);

  useEffect(() => ctl.mount(), [ctl]);
  useEffect(() => ctl.connectSocket(accessToken), [ctl, accessToken]);
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(ctl.poll, POLL_MS);
    return () => clearInterval(timer);
  }, [ctl, autoRefresh]);

  // Kenar çubuğu / başlık rozeti: yüklü Hazırlanıyor sayısı (kaplamalar dahil)
  const lastCountRef = useRef(null);
  useEffect(() => {
    if (snap.status !== "ready" || lastCountRef.current === snap.preparing) return;
    lastCountRef.current = snap.preparing;
    window.dispatchEvent(new CustomEvent(ORDERS_COUNT_EVENT, { detail: { preparing: snap.preparing } }));
  }, [snap.status, snap.preparing]);

  // Ürün ekleme paneli için katalog: kendi yükleme / hata durumu (mağaza loading/error paylaşımlı)
  const storeProducts = useProductStore((state) => state.products);
  const products = useMemo(() => (Array.isArray(storeProducts) ? storeProducts : []), [storeProducts]);
  const [catalog, setCatalog] = useState({ loading: false, error: null });
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const loadProducts = useCallback(async (opts) => {
    if (catalogLoaded && !opts?.force) return;
    if (!catalogRequest) {
      catalogRequest = axios.get("/products")
        .then((res) => {
          useProductStore.setState({ products: Array.isArray(res?.data?.products) ? res.data.products : [] });
          catalogLoaded = true;
        })
        .finally(() => { catalogRequest = null; });
    }
    setCatalog({ loading: true, error: null });
    try {
      await catalogRequest;
      if (mountedRef.current) setCatalog({ loading: false, error: null });
    } catch {
      if (mountedRef.current) setCatalog({ loading: false, error: "Ürünler yüklenemedi" });
    }
  }, []);

  return useMemo(() => ({
    status: snap.status,
    error: snap.error,
    orders: snap.orders,
    windowOrders: snap.windowOrders,
    ordersById: snap.ordersById,
    extraIds: snap.extraIds,
    hasOlder: snap.hasOlder,
    windowStart: snap.windowStart,
    loadingOlder: snap.loadingOlder,
    loadOlder: ctl.loadOlder,
    lastSyncAt: snap.lastSyncAt,
    syncing: snap.syncing,
    stale: snap.stale,
    socketConnected: snap.socketConnected,
    refresh: ctl.refresh,
    autoRefresh,
    setAutoRefresh,
    freshIds: snap.freshIds,
    fetchByIds: ctl.fetchByIds,
    searchServer: ctl.searchServer,
    changeStatus: ctl.changeStatus,
    advance: ctl.advance,
    advanceMany: ctl.advanceMany,
    undo: ctl.undo,
    undoLast: ctl.undoLast,
    pendingIds: snap.pendingIds,
    hasPending: snap.hasPending,
    updateQuantity: ctl.updateQuantity,
    removeItem: ctl.removeItem,
    addProduct: ctl.addProduct,
    addCustomItem: ctl.addCustomItem,
    saveTracking: ctl.saveTracking,
    confirmCallback: ctl.confirmCallback,
    assignCourier: ctl.assignCourier,
    markDeliveryFailed: ctl.markDeliveryFailed,
    deleteOrder: ctl.deleteOrder,
    markOutOfStock: ctl.markOutOfStock,
    changeLog: snap.changeLog,
    dismissChanges: ctl.dismissChanges,
    preparingCount: snap.preparing,
    products,
    productsLoading: catalog.loading && products.length === 0,
    productsError: catalog.error,
    loadProducts,
  }), [snap, ctl, autoRefresh, setAutoRefresh, products, catalog, loadProducts]);
}
