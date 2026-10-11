import assert from "node:assert/strict";
import test from "node:test";
import { capFeed, clearAdminFeed, feedItemFromEvent, listAdminFeed, notifyAdmins, recordAdminEvent, toClientItem } from "../services/adminFeed.service.js";

const NOW = new Date("2026-10-11T16:00:00Z");

// Bellek içi koleksiyon: yalnızca kullanılan işlemler
const memoryDb = () => {
  const data = {};
  const matches = (doc, filter = {}) =>
    Object.entries(filter).every(([key, cond]) => (cond && typeof cond === "object" && "$gt" in cond ? new Date(doc[key]) > cond.$gt : String(doc[key]) === String(cond)));
  return {
    data,
    collection(name) {
      data[name] ||= [];
      const docs = data[name];
      return {
        createIndex: async () => {},
        findOne: async (filter) => docs.find((doc) => matches(doc, filter)) || null,
        find: (filter) => {
          let rows = docs.filter((doc) => matches(doc, filter));
          const cursor = {
            sort: () => { rows = [...rows].sort((a, b) => new Date(b.at) - new Date(a.at)); return cursor; },
            limit: (n) => { rows = rows.slice(0, n); return cursor; },
            toArray: async () => rows,
          };
          return cursor;
        },
        updateOne: async (filter, update, { upsert } = {}) => {
          let doc = docs.find((item) => matches(item, filter));
          if (!doc && upsert) docs.push((doc = { ...filter }));
          if (doc) Object.assign(doc, update.$set);
        },
      };
    },
  };
};

test("socket olayları zil kaydına dönüşür (anahtarlar paneldekiyle aynı)", () => {
  const order = feedItemFromEvent("newOrder", { order: { id: "o1", totalAmount: 120.5, customerName: "Ece Su", createdAt: NOW, products: [{}, {}], deliveryPointName: "Kız KYK" } });
  assert.deepEqual(order, { key: "o1", kind: "order", title: "Ece Su", detail: "", order: { id: "o1", totalAmount: 120.5, customerName: "Ece Su", deliveryPointName: "Kız KYK", productCount: 2 }, at: NOW });
  assert.equal(feedItemFromEvent("newOrder", { order: { id: "test" } }), null, "test siparişi saklanmaz");
  assert.equal(feedItemFromEvent("SupportRequestCreated", { supportRequestId: "s1", customerName: "Sude", reason: "İade", conversationId: "c1" }, NOW).key, "support-s1");
  const message = feedItemFromEvent("newChatMessage", { chatId: "c9", message: { content: "Merhaba" }, senderName: "Ecem" }, NOW);
  assert.equal(message.key, "message-c9");
  assert.equal(message.detail, "Merhaba");
  const app = feedItemFromEvent("appOpened", { userId: "u1", name: "Selin", at: NOW.toISOString() });
  assert.deepEqual([app.key, app.kind, app.detail], ["app-u1", "app-open", "Uygulamayı açtı"]);
  assert.equal(feedItemFromEvent("appSeen", { userId: "u1" }), null, "sessiz olaylar saklanmaz");
  assert.equal(toClientItem({ ...order }).kind, undefined, "sipariş paneldeki gibi türsüz");
  assert.equal(toClientItem({ ...app }).id, "app-u1");
});

test("liste: en yeni önce, en çok 10 uygulama açılışı, toplam 30", () => {
  const items = [
    ...Array.from({ length: 15 }, (_, i) => ({ key: `app-${i}`, kind: "app-open", at: new Date(NOW - i * 1000) })),
    ...Array.from({ length: 25 }, (_, i) => ({ key: `o${i}`, kind: "order", at: new Date(NOW - 100000 - i * 1000) })),
  ];
  const capped = capFeed(items);
  assert.equal(capped.length, 30);
  assert.equal(capped.filter((item) => item.kind === "app-open").length, 10);
  assert.equal(capped[0].key, "app-0");
});

test("kayıt sunucuda tutulur; aynı hesap her cihazda aynı listeyi görür, temizle hesaba işlenir", async () => {
  const db = memoryDb();
  await recordAdminEvent("newOrder", { order: { id: "o1", totalAmount: 50, customerName: "Ece", createdAt: new Date(NOW - 60000) } }, { db, now: NOW });
  await recordAdminEvent("appOpened", { userId: "u1", name: "Selin", at: new Date(NOW - 30000).toISOString() }, { db, now: NOW });
  await recordAdminEvent("appOpened", { userId: "u1", name: "Selin", at: NOW.toISOString() }, { db, now: NOW });
  assert.equal(db.data.admin_notifications.length, 2, "aynı müşterinin açılışı tek satır");

  const firstPc = await listAdminFeed(db, "admin1");
  const secondPc = await listAdminFeed(db, "admin1");
  assert.deepEqual(firstPc, secondPc);
  assert.deepEqual(firstPc.map((item) => item.id), ["app-u1", "o1"]);
  assert.equal(firstPc[0].at, NOW.toISOString());

  await clearAdminFeed(db, "admin1", NOW);
  assert.deepEqual(await listAdminFeed(db, "admin1"), [], "temizlenen liste tüm cihazlarda boş");
  assert.equal((await listAdminFeed(db, "admin2")).length, 2, "diğer yöneticinin listesi etkilenmez");

  await recordAdminEvent("newChatMessage", { chatId: "c1", message: "Selam", senderName: "Ecem", timestamp: new Date(NOW.getTime() + 5000) }, { db, now: NOW });
  assert.deepEqual((await listAdminFeed(db, "admin1")).map((item) => item.id), ["message-c1"], "temizledikten sonra gelenler görünür");
});

test("canlı olay yine gönderilir; veritabanı bağlı değilse yalnızca canlı olay", () => {
  const sent = [];
  const io = { to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };
  notifyAdmins(io, "appOpened", { userId: "u1" });
  assert.deepEqual(sent, [{ room: "adminRoom", event: "appOpened", payload: { userId: "u1" } }]);
  assert.doesNotThrow(() => notifyAdmins(null, "newOrder", {}));
});
