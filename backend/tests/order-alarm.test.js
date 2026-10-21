import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  ACKS_COLLECTION,
  DEVICES_COLLECTION,
  SETTLE_MS,
  acknowledgeOrder,
  canPhoneChangeStatus,
  createDevice,
  findDeviceByToken,
  hashToken,
  istanbulDayStart,
  listPendingOrders,
  listTodayOrders,
  orderNumber,
  parseKnown,
  parseWait,
  paymentLabel,
  pendingKey,
  revokeDevice,
  signalOrderAlarm,
  summarizeOrders,
  toAlarmOrder,
  tokenFromRequest,
  waitForPendingChange,
  waiterCount,
} from "../services/orderAlarm.service.js";

const oid = (n) => n.toString(16).padStart(24, "0");
const NOW = new Date("2026-10-14T12:00:00Z");
const minutesAgo = (m, from = NOW) => new Date(from.getTime() - m * 60000);

// Bellek içi koleksiyonlar: yalnızca servisin kullandığı işlemler
const memoryDb = () => {
  const data = {};
  const value = (v) => (v instanceof Date ? v.getTime() : v == null ? null : String(v));
  const matches = (doc, filter = {}) => Object.entries(filter).every(([key, cond]) => {
    const actual = doc[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !(cond instanceof mongoose.Types.ObjectId)) {
      if ("$in" in cond) return cond.$in.map(String).includes(String(actual));
      if ("$gte" in cond && !(actual >= cond.$gte)) return false;
      if ("$lte" in cond && !(actual <= cond.$lte)) return false;
      return true;
    }
    return value(actual) === value(cond);
  });
  return {
    data,
    collection(name) {
      data[name] ||= [];
      const docs = data[name];
      return {
        createIndex: async () => {},
        insertOne: async (doc) => { docs.push({ ...doc }); return { insertedId: doc._id }; },
        findOne: async (filter) => docs.find((doc) => matches(doc, filter)) || null,
        find: (filter) => {
          let rows = docs.filter((doc) => matches(doc, filter));
          const cursor = {
            sort: (spec) => {
              const [[field, dir]] = Object.entries(spec);
              rows = [...rows].sort((a, b) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0));
              return cursor;
            },
            limit: (n) => { rows = rows.slice(0, n); return cursor; },
            toArray: async () => rows,
          };
          return cursor;
        },
        updateOne: async (filter, update, { upsert } = {}) => {
          let doc = docs.find((item) => matches(item, filter));
          if (!doc && !upsert) return { matchedCount: 0, modifiedCount: 0 };
          if (!doc) {
            docs.push((doc = { ...filter }));
            Object.assign(doc, update.$setOnInsert);
          }
          Object.assign(doc, update.$set);
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };
};

const order = (n, extra = {}) => ({
  _id: new mongoose.Types.ObjectId(oid(n)),
  user: new mongoose.Types.ObjectId(oid(1000 + n)),
  products: [{ name: "Süt 1 L", quantity: 2, price: 32.5 }, { name: "Ekmek", quantity: 1, price: 15 }],
  totalAmount: 80,
  subtotalAmount: 80,
  city: "Kız KYK Yurdu",
  phone: "0555 111 22 33",
  note: "Gelince arayın",
  deliveryPoint: "girlsDorm",
  deliveryPointName: "Kız KYK Yurdu",
  status: "Hazırlanıyor",
  createdAt: minutesAgo(5),
  ...extra,
});

test("sipariş özeti: numara, adres, ödeme, ürünler ve tutarlar", () => {
  const summary = toAlarmOrder(order(0xabc123, { couponCode: "HOSGELDIN", couponDiscount: 10, totalAmount: 70, subtotalAmount: 80, city: "Devrek" }), "Ece Su");
  assert.equal(summary.number, "#00ABC123");
  assert.equal(summary.customerName, "Ece Su");
  assert.equal(summary.address, "Kız KYK Yurdu · Devrek");
  assert.equal(summary.paymentMethod, "Teslimatta ödeme");
  assert.equal(summary.itemCount, 3);
  assert.deepEqual(summary.products[0], { name: "Süt 1 L", quantity: 2, price: 32.5, lineTotal: 65 });
  assert.deepEqual([summary.subtotalAmount, summary.couponDiscount, summary.totalAmount], [80, 10, 70]);
  assert.equal(toAlarmOrder(order(2, { deliveryPointName: "", city: "" })).address, "Kız KYK Yurdu", "boş isimde teslimat noktası kodundan");
  assert.equal(toAlarmOrder(order(3)).customerName, "Müşteri");
  assert.equal(orderNumber(oid(255)), "#000000FF");
});

test("ödeme yöntemi: alan varsa o, yoksa ortam ayarı ya da varsayılan", () => {
  assert.equal(paymentLabel({ paymentMethod: "cash" }), "Kapıda nakit");
  assert.equal(paymentLabel({ paymentMethod: "Kart" }), "Kapıda kart (POS)");
  assert.equal(paymentLabel({ paymentMethod: "card" }), "Kapıda kart (POS)");
  assert.equal(paymentLabel({ paymentMethod: "bank_transfer" }), "Havale / EFT");
  assert.equal(paymentLabel({ paymentMethod: "Yemek kartı" }), "Yemek kartı");
  process.env.ORDER_ALARM_PAYMENT_LABEL = "Kapıda nakit / kart";
  try {
    assert.equal(paymentLabel({}), "Kapıda nakit / kart");
  } finally {
    delete process.env.ORDER_ALARM_PAYMENT_LABEL;
  }
  assert.equal(paymentLabel({}), "Teslimatta ödeme");
});

test("cihaz anahtarı: yalnızca oa_ anahtarı kabul edilir, veritabanında özeti tutulur, kaldırılınca geçersiz", async () => {
  const db = memoryDb();
  const { token, device } = await createDevice(db, { name: "  Kasa   telefonu ", userId: "admin1" }, NOW);
  assert.match(token, /^oa_[A-Za-z0-9_-]{40,}$/);
  assert.equal(device.name, "Kasa telefonu");
  const stored = db.data[DEVICES_COLLECTION][0];
  assert.equal(stored.tokenHash, hashToken(token));
  assert.ok(!JSON.stringify(stored).includes(token), "anahtarın kendisi saklanmaz");

  assert.equal(tokenFromRequest({ headers: { authorization: `Bearer ${token}` } }), token);
  assert.equal(tokenFromRequest({ headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x" } }), null, "yönetici JWT'si cihaz anahtarı sayılmaz");
  assert.equal(tokenFromRequest({ headers: {} }), null);

  const later = new Date(NOW.getTime() + 5 * 60000);
  const found = await findDeviceByToken(db, token, { appVersion: "1.0.0", now: later });
  assert.equal(found._id, device._id);
  assert.equal(stored.appVersion, "1.0.0");
  assert.equal(stored.lastSeenAt, later);
  assert.equal(await findDeviceByToken(db, "oa_yanlis-anahtar-yanlis-anahtar"), null);

  assert.equal(await revokeDevice(db, device._id, later), true);
  assert.equal(await findDeviceByToken(db, token), null, "kaldırılan telefon artık okuyamaz");
  assert.equal(await revokeDevice(db, device._id, later), false);
});

test("bekleyen siparişler: eşlemeden sonra, pencere içinde, hazırlanıyor, yeterince eski, onaylanmamış", async () => {
  const db = memoryDb();
  const device = { _id: "d1", name: "Kasa", createdAt: minutesAgo(60) };
  db.data.orders = [
    order(1, { createdAt: minutesAgo(30) }),
    order(2, { createdAt: minutesAgo(90) }), // eşlemeden önce
    order(3, { createdAt: minutesAgo(10), status: "Yolda" }),
    order(4, { createdAt: minutesAgo(5), status: "İptal Edildi" }),
    order(5, { createdAt: new Date(NOW.getTime() - SETTLE_MS + 500) }), // henüz çok yeni
    order(6, { createdAt: minutesAgo(2) }),
    order(7, { createdAt: minutesAgo(20) }),
  ];
  db.data.users = [{ _id: new mongoose.Types.ObjectId(oid(1001)), name: "Ece Su" }];
  db.data[ACKS_COLLECTION] = [{ _id: oid(7), action: "seen" }];

  const pending = await listPendingOrders(db, device, { now: NOW });
  assert.deepEqual(pending.map((item) => item.id), [oid(1), oid(6)], "en eski önce");
  assert.equal(pending[0].customerName, "Ece Su");
  assert.equal(pending[1].customerName, "Müşteri");

  const longAgoDevice = { _id: "d2", createdAt: new Date("2026-01-01T00:00:00Z") };
  db.data.orders.push(order(8, { createdAt: minutesAgo(13 * 60) }));
  const old = await listPendingOrders(db, longAgoDevice, { now: NOW });
  assert.ok(!old.some((item) => item.id === oid(8)), "12 saatten eski sipariş çalmaz");
  assert.ok(old.some((item) => item.id === oid(2)), "eski eşlenmiş telefon pencere içindekileri görür");
});

test("onay: ilk onay geçerli, tüm telefonlarda susar, geçersiz istekler reddedilir", async () => {
  const db = memoryDb();
  db.data.orders = [order(1), order(2)];
  const kasa = { _id: "d1", name: "Kasa", createdAt: minutesAgo(60) };
  const kurye = { _id: "d2", name: "Kurye", createdAt: minutesAgo(60) };

  const first = await acknowledgeOrder(db, kasa, oid(1), "accepted", NOW);
  assert.deepEqual([first.action, first.deviceName], ["accepted", "Kasa"]);
  const second = await acknowledgeOrder(db, kurye, oid(1), "seen", NOW);
  assert.deepEqual([second.action, second.deviceName], ["accepted", "Kasa"], "ikinci onay kaydı değiştirmez");
  assert.deepEqual((await listPendingOrders(db, kurye, { now: NOW })).map((item) => item.id), [oid(2)]);

  await assert.rejects(acknowledgeOrder(db, kasa, oid(2), "delete", NOW), { statusCode: 400 });
  await assert.rejects(acknowledgeOrder(db, kasa, "abc", "seen", NOW), { statusCode: 400 });
  await assert.rejects(acknowledgeOrder(db, kasa, oid(99), "seen", NOW), { statusCode: 404 });
});

test("parametreler: bilinen liste ve bekleme süresi sınırlanır", () => {
  assert.deepEqual(parseKnown(`${oid(1)}, x ,${oid(2)}`), [oid(1), oid(2)]);
  assert.deepEqual(parseKnown(undefined), []);
  assert.equal(parseWait("25"), 25);
  assert.equal(parseWait("500"), 30);
  assert.equal(parseWait("-3"), 0);
  assert.equal(pendingKey(["b", "a", "a"]), pendingKey(["a", "b"]));
});

test("uzun bekletme: liste farklıysa hemen, sinyal gelince hızlıca, yoksa süre dolunca döner", async () => {
  let current = [{ id: "a" }];
  const load = async () => current;

  let started = Date.now();
  assert.deepEqual(await waitForPendingChange(load, [], { waitSeconds: 20 }), [{ id: "a" }]);
  assert.ok(Date.now() - started < 200, "telefonun bilmediği sipariş varsa beklemez");

  started = Date.now();
  assert.deepEqual(await waitForPendingChange(load, ["a"], { waitSeconds: 1, recheckMs: 300 }), [{ id: "a" }]);
  assert.ok(Date.now() - started >= 900, "değişiklik yoksa süre dolana kadar bekler");

  started = Date.now();
  const waiting = waitForPendingChange(load, ["a"], { waitSeconds: 20, recheckMs: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(waiterCount(), 1);
  current = [{ id: "a" }, { id: "b" }];
  signalOrderAlarm();
  assert.deepEqual((await waiting).map((item) => item.id), ["a", "b"]);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= SETTLE_MS && elapsed < SETTLE_MS + 2000, `sinyalden sonra sipariş oturunca döner (${elapsed} ms)`);
  assert.equal(waiterCount(), 0, "bekleyen kalmaz");

  let closed = false;
  started = Date.now();
  const abandoned = waitForPendingChange(load, ["a", "b"], { waitSeconds: 20, recheckMs: 200, isClosed: () => closed });
  closed = true;
  await abandoned;
  assert.ok(Date.now() - started < 1000, "bağlantı kapanınca bekleme biter");
});

test("telefondan durum: yalnızca ileri adımlar, iptal ve geri alma panelde", () => {
  assert.equal(canPhoneChangeStatus("Hazırlanıyor", "Yolda"), true);
  assert.equal(canPhoneChangeStatus("Hazırlanıyor", "Teslim Edildi"), true);
  assert.equal(canPhoneChangeStatus("Yolda", "Teslim Edildi"), true);
  assert.equal(canPhoneChangeStatus("Yolda", "Hazırlanıyor"), false);
  assert.equal(canPhoneChangeStatus("Hazırlanıyor", "İptal Edildi"), false);
  assert.equal(canPhoneChangeStatus("Teslim Edildi", "Yolda"), false);
  assert.equal(canPhoneChangeStatus("İptal Edildi", "Teslim Edildi"), false);
});

test("bugün: İstanbul gün başlangıcı, özet ve onay bilgisi", async () => {
  assert.equal(istanbulDayStart(new Date("2026-10-14T12:00:00Z")).toISOString(), "2026-10-13T21:00:00.000Z");
  assert.equal(istanbulDayStart(new Date("2026-10-14T22:30:00Z")).toISOString(), "2026-10-14T21:00:00.000Z", "gece 01.30 yeni gün");
  assert.equal(istanbulDayStart(new Date("2026-10-14T20:59:00Z")).toISOString(), "2026-10-13T21:00:00.000Z");

  const summary = summarizeOrders([{ status: "Hazırlanıyor", totalAmount: 100 }, { status: "Teslim Edildi", totalAmount: 50.5 }, { status: "İptal Edildi", totalAmount: 999 }]);
  assert.deepEqual(summary, { count: 2, cancelled: 1, revenue: 150.5, byStatus: { "Hazırlanıyor": 1, "Yolda": 0, "Teslim Edildi": 1, "İptal Edildi": 1 } });

  const db = memoryDb();
  db.data.orders = [
    order(1, { createdAt: new Date("2026-10-13T20:00:00Z") }), // dün (İstanbul 23.00)
    order(2, { createdAt: new Date("2026-10-14T06:00:00Z"), status: "Teslim Edildi" }),
    order(3, { createdAt: new Date("2026-10-14T11:00:00Z") }),
  ];
  db.data.users = [{ _id: new mongoose.Types.ObjectId(oid(1003)), name: "Ece Su" }];
  db.data[ACKS_COLLECTION] = [{ _id: oid(3), action: "accepted", deviceName: "Kasa", at: NOW }];
  const today = await listTodayOrders(db, { now: NOW });
  assert.deepEqual(today.orders.map((item) => item.id), [oid(3), oid(2)], "yalnızca bugün, en yeni önce");
  assert.deepEqual(today.orders[0].ack, { action: "accepted", deviceName: "Kasa", at: NOW });
  assert.equal(today.orders[0].customerName, "Ece Su");
  assert.equal(today.orders[1].ack, null);
  assert.equal(today.orders[1].status, "Teslim Edildi");
  assert.deepEqual([today.summary.count, today.summary.revenue], [2, 160]);
});
