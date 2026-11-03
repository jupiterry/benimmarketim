// "Sipariş kaçırmamak için" denetleyicisinin (frontend/src/components/admin/alerts/orderAlerts.js) uçtan uca akışları.
// Panel modülleri tarayıcı içindir: axios, socket ve react içe aktarımları modül çözümleme kancasıyla sahte modüllere
// yönlendirilir; window/document/localStorage/Audio basit taklitlerdir. Saat ve zamanlayıcılar sahte saatle ilerler
// (tek oturum, testler arasında hep ileri gider). Veritabanı ve ağ yok; dosya ~0,2 sn sürer.
import assert from "node:assert/strict";
import { register } from "node:module";
import test, { after, mock } from "node:test";

const hooks = `
const stub = (code) => ({ url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true });
export async function resolve(specifier, context, next) {
  if (specifier.endsWith("/lib/axios")) return stub("export default globalThis.__p1alerts.axios;");
  if (specifier.endsWith("/lib/socket")) return stub("export default globalThis.__p1alerts.socketService;");
  if (specifier === "react") return stub("export const useSyncExternalStore = () => { throw new Error('yalnızca tarayıcıda'); };");
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\\.[cm]?jsx?$/.test(specifier)) {
    return next(specifier + ".js", context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);

// ── Tarayıcı taklidi ────────────────────────────────────────────────────────
class Target {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  dispatchEvent(event) {
    for (const fn of [...(this.listeners.get(event.type) || [])]) fn(event);
    return true;
  }
}
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const plays = [];
let audioMode = "ok"; // ok | blocked | file-error (mp3 yüklenemiyor)
class FakeAudio {
  constructor() {
    this.src = "";
    this.volume = 1;
  }
  addEventListener() {}
  pause() {}
  play() {
    plays.push({ src: this.src, volume: this.volume });
    if (audioMode === "blocked") return Promise.reject(Object.assign(new Error("izin yok"), { name: "NotAllowedError" }));
    if (audioMode === "file-error" && this.src.endsWith(".mp3")) {
      return Promise.reject(Object.assign(new Error("yüklenemedi"), { name: "NotSupportedError" }));
    }
    return Promise.resolve();
  }
}
const win = new Target();
win.Audio = FakeAudio;
win.btoa = (text) => Buffer.from(text, "binary").toString("base64");
win.focus = () => {};
globalThis.window = win;
const doc = new Target();
doc.visibilityState = "visible";
globalThis.document = doc;

// ── Sahte socket ve HTTP ───────────────────────────────────────────────────
class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.connected = true;
  }
  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
  }
  off(event, fn) {
    this.handlers.get(event)?.delete(fn);
  }
  fire(event, payload) {
    for (const fn of [...(this.handlers.get(event) || [])]) fn(payload);
  }
}
const socket = new FakeSocket();
const requests = [];
let activeOrders = [];
let ordersFail = false;
let alarm = { devices: [], recentAcks: [] };
globalThis.__p1alerts = {
  socketService: { socket, connect: () => socket, reconnectNow: () => false },
  axios: {
    get: async (url) => {
      requests.push(url);
      if (url === "/orders-analytics") {
        if (ordersFail) throw new Error("ağ hatası");
        return {
          data: {
            orderAnalyticsData: {
              usersOrders: activeOrders.map((order) => ({ user: { name: order.name || "Ece" }, orders: [{ products: [], totalAmount: 100, ...order }] })),
              meta: { serverTime: new Date().toISOString() },
            },
          },
        };
      }
      if (url === "/order-alarm/status") return { data: alarm, headers: { date: new Date().toUTCString() } };
      throw new Error(`beklenmeyen istek ${url}`);
    },
  },
};

mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: new Date("2026-11-02T18:00:00Z") });
after(() => mock.timers.reset());

const ALERTS = "../../frontend/src/components/admin/alerts";
const { createOrderAlerts, CANCEL_STORE_KEY } = await import(`${ALERTS}/orderAlerts.js`);
const { alertPrefs } = await import(`${ALERTS}/alertPrefs.js`);
const { audioState, unlockWithSound } = await import(`${ALERTS}/alertAudio.js`);

const flush = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setImmediate(resolve));
};
const advance = async (ms) => {
  for (let passed = 0; passed < ms; passed += 5000) {
    mock.timers.tick(Math.min(5000, ms - passed));
    await flush();
  }
};
const id = (n) => `65f1c0ffee00000000${String(n).padStart(6, "0")}`;
const preparing = (n, createdAt = new Date()) => ({ orderId: id(n), status: "Hazırlanıyor", createdAt: new Date(createdAt).toISOString() });
const liveOrder = (n) => ({ order: { id: id(n), createdAt: new Date().toISOString(), customerName: "Ali", totalAmount: 75, status: "Hazırlanıyor", products: [{}] } });
const ringSounds = () => plays.filter((play) => play.src.endsWith(".mp3")).length;

/** Her senaryo bir saat sonra, temiz cihaz deposuyla ve bağlı socket ile başlar */
const startPanel = async ({ connected = true, orders = [], ui = {}, failFirstCheck = false, audio = "ok" } = {}) => {
  mock.timers.tick(3_600_000);
  await flush();
  storage.clear();
  plays.length = 0;
  requests.length = 0;
  audioMode = audio;
  ordersFail = failFirstCheck;
  alarm = { devices: [], recentAcks: [] };
  alertPrefs.set({ muted: false, volume: 0.75, repeat: true, intervalSec: 30 });
  socket.connected = connected;
  activeOrders = orders;
  const events = [];
  const controller = createOrderAlerts({
    newOrders: (list, source) => events.push(["new", list.map((order) => order.id), source]),
    resolved: (ids) => events.push(["resolved", ids]),
    cancelled: (entry) => events.push(["cancelled", entry.orderId]),
    cancelBell: (entry) => events.push(["cancelBell", entry.orderId]),
    preparingCount: (count) => events.push(["count", count]),
    offlineCheck: () => events.push(["offlineCheck"]),
    ...ui,
  });
  controller.start();
  await flush();
  return { controller, events };
};

test("canlı yeni sipariş çalar, 30 sn'de bir tekrar eder; durum değişince susar", async () => {
  const { controller, events } = await startPanel({ orders: [preparing(1, Date.now() - 20 * 60_000)] });
  assert.deepEqual(events.filter(([kind]) => kind === "new"), [], "panel açılırken bekleyen eski sipariş duyurulmaz");
  assert.deepEqual(events.filter(([kind]) => kind === "count"), [["count", 1]], "rozet HTTP kontrolünden");

  socket.fire("newOrder", liveOrder(2));
  await flush();
  assert.deepEqual(events.filter(([kind]) => kind === "new"), [["new", [id(2)], "live"]]);
  assert.deepEqual(controller.getSnapshot().ringing.map((entry) => entry.id), [id(2)]);
  assert.equal(ringSounds(), 1);

  await advance(30_000);
  assert.equal(ringSounds(), 2, "30 sn sonra tekrar çaldı");
  socket.fire("newOrder", liveOrder(2));
  await flush();
  assert.equal(events.filter(([kind]) => kind === "new").length, 1, "aynı sipariş ikinci kez duyurulmaz");

  socket.fire("orderStatusUpdated", { orderId: id(2), newStatus: "Yolda" });
  await flush();
  assert.equal(controller.getSnapshot().ringing.length, 0);
  assert.deepEqual(events.at(-1), ["resolved", [id(2)]], "bildirim kartı da kapanır");
  await advance(120_000);
  assert.equal(ringSounds(), 2, "susan sipariş bir daha çalmaz");
  controller.stop();
});

test("tekrarı bitirenler: Gördüm, Siparişler ekranının admin-order-seen olayı, alarm telefonu onayı; süre 30 dk", async () => {
  const { controller } = await startPanel();
  alarm = { devices: [{ id: "t1", name: "Kasa", lastSeenAt: new Date().toISOString(), revokedAt: null }], recentAcks: [] };
  for (const n of [3, 4, 5, 6]) socket.fire("newOrder", liveOrder(n));
  await flush();
  assert.equal(controller.getSnapshot().ringing.length, 4);

  controller.actions.ack(id(3));
  win.dispatchEvent(new CustomEvent("admin-order-seen", { detail: { orderId: id(4) } }));
  await flush();
  assert.deepEqual(controller.getSnapshot().ringing.map((entry) => entry.id), [id(5), id(6)]);

  alarm = { ...alarm, recentAcks: [{ orderId: id(5), action: "seen" }] };
  await advance(30_000);
  assert.deepEqual(controller.getSnapshot().ringing.map((entry) => entry.id), [id(6)], "telefonda onaylanan sipariş susar");
  assert.equal(controller.getSnapshot().alarm.paired, 1);
  assert.equal(controller.getSnapshot().alarm.connected, 1);

  await advance(30 * 60_000);
  assert.equal(controller.getSnapshot().ringing.length, 0, "30 dk sonra tekrar biter");
  const sounds = ringSounds();
  await advance(60_000);
  assert.equal(ringSounds(), sounds);
  controller.stop();
});

test("bağlantı 30 sn'den uzun koparsa siparişler 30 sn'de bir kontrol edilir; kaçırılan sipariş bir kez duyurulur", async () => {
  const { controller, events } = await startPanel();
  socket.connected = false;
  socket.fire("disconnect");
  await advance(25_000);
  assert.equal(controller.getSnapshot().offline, false, "kısa kopma şerit göstermez");

  activeOrders = [preparing(7)];
  await advance(10_000);
  assert.equal(controller.getSnapshot().offline, true);
  assert.deepEqual(events.filter(([kind]) => kind === "new"), [["new", [id(7)], "missed"]]);
  assert.deepEqual(controller.getSnapshot().ringing.map((entry) => entry.id), [id(7)]);

  const checks = requests.filter((url) => url === "/orders-analytics").length;
  await advance(30_000);
  assert.equal(requests.filter((url) => url === "/orders-analytics").length, checks + 1, "kopukken 30 sn'de bir kontrol");
  assert.equal(events.filter(([kind]) => kind === "new").length, 1, "aynı sipariş ikinci kontrolde duyurulmaz");
  assert.equal(events.filter(([kind]) => kind === "offlineCheck").length, 2, "zil listesi (müşteri iptalleri) de 30 sn'de bir tazelenir");

  socket.connected = true;
  socket.fire("connect");
  await flush();
  assert.equal(controller.getSnapshot().offline, false);
  assert.equal(controller.getSnapshot().connected, true);
  controller.stop();
});

test("sayfa yenilenince önceki sınırdan devam edilir: çalan sipariş sürer, aradaki sipariş duyurulur", async () => {
  const first = await startPanel();
  socket.fire("newOrder", liveOrder(8));
  await flush();
  first.controller.stop();

  await advance(20_000);
  activeOrders = [preparing(8, Date.now() - 20_000), preparing(9, Date.now() - 12_000)];
  const events = [];
  const controller = createOrderAlerts({ newOrders: (list, source) => events.push([list.map((order) => order.id), source]) });
  controller.start();
  await flush();
  assert.deepEqual(events, [[[id(9)], "missed"]], "yenileme sırasında gelen sipariş yutulmaz; çalan sipariş tekrar duyurulmaz");
  assert.deepEqual(controller.getSnapshot().ringing.map((entry) => entry.id).sort(), [id(8), id(9)].sort());
  controller.stop();
});

test("ilk kontrol başarısızsa panel açıldıktan sonra verilen siparişler kaçırılmış sayılır, öncekiler sayılmaz", async () => {
  const { controller, events } = await startPanel({ connected: false, failFirstCheck: true });
  assert.equal(requests.filter((url) => url === "/orders-analytics").length, 1, "açılış kontrolü denendi");
  const old = preparing(10, Date.now() - 10 * 60_000);
  await advance(5_000);
  ordersFail = false;
  activeOrders = [old, preparing(11)];
  await advance(30_000);
  assert.deepEqual(events.filter(([kind]) => kind === "new"), [["new", [id(11)], "missed"]]);
  controller.stop();
});

test("müşteri iptali: kalıcı uyarı, her sekmede zil satırı; kapatılan uyarı zil listesinden geri gelmez", async () => {
  const { controller, events } = await startPanel();
  socket.fire("newOrder", liveOrder(12));
  await flush();
  const at = new Date().toISOString();
  socket.fire("orderCancelledByCustomer", { orderId: id(12), code: "#000012", customerName: "Ece", reason: "Fikrimi değiştirdim", note: "", totalAmount: 75, at });
  await flush();
  assert.deepEqual(controller.getSnapshot().cancels.map((entry) => entry.orderId), [id(12)]);
  assert.equal(controller.getSnapshot().ringing.length, 0, "iptal edilen sipariş susar");
  assert.deepEqual(events.filter(([kind]) => kind === "cancelled" || kind === "cancelBell"), [["cancelBell", id(12)], ["cancelled", id(12)]]);

  // Aynı cihazdaki başka sekme bu iptali önce eklemiş: uyarı burada da görünür, zil satırı eklenir, ses/bildirim yok
  const otherTab = { orderId: id(13), code: "#000013", customerName: "", reason: "", note: "", totalAmount: 0, at };
  storage.set(CANCEL_STORE_KEY, JSON.stringify({ items: { [id(13)]: otherTab }, done: {} }));
  socket.fire("orderCancelledByCustomer", otherTab);
  await flush();
  assert.deepEqual(controller.getSnapshot().cancels.map((entry) => entry.orderId).sort(), [id(12), id(13)].sort());
  assert.deepEqual(events.filter((event) => event[1] === id(13)), [["cancelBell", id(13)]]);

  controller.actions.dismissCancel(id(12));
  controller.actions.dismissAllCancels();
  assert.equal(controller.getSnapshot().cancels.length, 0);

  // Zil listesi: ilk yükleme yalnızca sınırı belirler; sonra gelen yeni iptal uyarıya eklenir, kapatılan eklenmez
  const feedItem = (n, when) => ({ id: `cancel-${id(n)}`, kind: "cancel", orderId: id(n), cancel: { code: `#0000${n}` }, at: when });
  controller.actions.ingestFeed([feedItem(12, at)]);
  await advance(60_000);
  controller.actions.ingestFeed([feedItem(14, new Date().toISOString()), feedItem(12, new Date().toISOString())]);
  assert.deepEqual(controller.getSnapshot().cancels.map((entry) => entry.orderId), [id(14)]);
  controller.stop();
});

test("tarayıcı sesi engellerse uyarı çıkar; sayfada bir tıklama ya da uyarının kendisi sesi açar", async () => {
  const panel = await startPanel({ audio: "blocked" });
  assert.equal(audioState.get().blocked, true, "açılıştaki sessiz deneme engeli ilk siparişi beklemeden fark eder");
  socket.fire("newOrder", liveOrder(15));
  await flush();
  assert.equal(audioState.get().blocked, true);
  audioMode = "ok";
  win.dispatchEvent({ type: "click", target: { closest: () => null } });
  await flush();
  assert.equal(audioState.get().blocked, false, "ilk tıklama sesi sessizce açar");

  // Uyarıya tıklanınca ses dosyası yüklenemese de (internet yok) kilit açılır, uyarı boşuna kalmaz
  audioMode = "blocked";
  await unlockWithSound({ sound: "bell", volume: 0.5 }).catch(() => {});
  assert.equal(audioState.get().blocked, true);
  audioMode = "file-error";
  assert.equal(await unlockWithSound({ sound: "bell", volume: 0.5 }), "played");
  assert.equal(audioState.get().blocked, false);
  panel.controller.stop();
});

test("ses kapalıyken çalmaz ama sipariş bekleyen listede kalır", async () => {
  const { controller } = await startPanel();
  alertPrefs.set({ muted: true });
  socket.fire("newOrder", liveOrder(16));
  await flush();
  await advance(60_000);
  assert.equal(ringSounds(), 0);
  assert.deepEqual(controller.getSnapshot().ringing.map((entry) => entry.id), [id(16)]);
  alertPrefs.set({ muted: false });
  await advance(5_000);
  assert.equal(ringSounds(), 1, "ses açılınca bekleyen sipariş yine çalar");
  controller.stop();
});
