// Bildirim ekranının açılış yanıtı: kitleler, bölgeler, planlı liste, geçmiş (eski kayıtlar dahil) ve saat ayarları.
import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";
import AutomationSettings from "../models/automationSettings.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { getBroadcastOverview } from "../controllers/notification.controller.js";

const oid = (n) => `65f0000000000000000${String(n).padStart(5, "0")}`;
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const OLD = new Date("2025-01-05T10:00:00Z");
const SENT = new Date("2026-03-10T12:00:00Z");

const setup = (t, { history, scheduled = [] }) => {
  Order.distinct ||= async () => [];
  t.mock.method(Order, "distinct", async () => [oid(1)]);
  t.mock.method(User, "countDocuments", async (filter) => (filter.pushNotificationsEnabled ? 4 : 5));
  const pipelines = [];
  t.mock.method(PushBroadcast, "aggregate", async (pipeline) => {
    pipelines.push(pipeline);
    return pipeline.some((stage) => stage.$group) ? [{ _id: "all", last: SENT }] : history.map((doc) => ({ ...doc }));
  });
  t.mock.method(PushBroadcast, "populate", async (docs) => docs);
  let scheduledFilter;
  t.mock.method(PushBroadcast, "find", (filter) => {
    scheduledFilter = filter;
    const q = { sort: () => q, limit: () => q, populate: () => q, lean: async () => scheduled };
    return q;
  });
  return { pipelines, scheduledFilter: () => scheduledFilter };
};

test("overview lists history (old records included), plans, zones and the hours used for warnings", async (t) => {
  const fx = setup(t, {
    history: [
      { _id: oid(1), title: "Planlı giden", body: "b", audience: "inactive30", zone: "devrek", status: "sent", sent: true, route: "/cart", scheduledFor: SENT, sentAt: SENT, at: SENT, targetedCount: 12 },
      { _id: oid(2), title: "Eski kayıt", body: "b", audience: "all", sent: true, route: "/home", createdAt: OLD, at: OLD, targetedCount: 80 },
      { _id: oid(3), title: "Eski başarısız", body: "b", audience: "all", sent: false, failureReason: "network", createdAt: OLD, at: OLD },
    ],
    scheduled: [{ _id: oid(9), title: "Akşam", body: "b", audience: "all", zone: "girlsDorm", status: "scheduled", route: "/orders", scheduledFor: SENT }],
  });
  t.mock.method(Settings, "getSettings", async () => ({ orderStartHour: 10, orderStartMinute: 0, orderEndHour: 1, orderEndMinute: 30 }));
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => ({ key: "default", window: { start: "09:30", end: "22:00" } }) }));
  const res = response();
  await getBroadcastOverview({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.audiences.map((item) => item.id), ["all", "cart", "active30", "inactive30", "noOrder"]);
  assert.deepEqual(res.body.audiences[0], { id: "all", label: "Tüm müşteriler", total: 5, reachable: 4, lastSentAt: SENT });
  assert.deepEqual(res.body.zones.map((zone) => zone.id), ["", "girlsDorm", "boysDorm", "devrek"]);
  assert.deepEqual(res.body.limits, { maxScheduled: 20, maxScheduleDays: 30 });
  assert.deepEqual(res.body.orderHours, { startHour: 10, startMinute: 0, endHour: 1, endMinute: 30 });
  assert.deepEqual(res.body.sendWindow, { start: "09:30", end: "22:00" });
  // Geçmiş: eski kayıtlar durum ve bölge alanı olmadan da doğru okunur
  assert.deepEqual(res.body.history.map((item) => [item.status, item.zone, item.target]), [["sent", "devrek", "cart"], ["sent", "", "home"], ["failed", "", "home"]]);
  assert.deepEqual(res.body.scheduled.map((item) => [item.status, item.zone, item.target]), [["scheduled", "girlsDorm", "orders"]]);
  // Geçmiş sorgusu: planlı ve iptal edilenler hariç (status alanı olmayan eski kayıtlar dahil), alıcı listesi dışarıda,
  // sıra bildirimin işlendiği ana göre
  const historyPipeline = fx.pipelines.find((pipeline) => !pipeline.some((stage) => stage.$group));
  assert.deepEqual(historyPipeline[0], { $match: { status: { $nin: ["scheduled", "cancelled"] } } });
  assert.deepEqual(historyPipeline[1], { $project: { recipients: 0 } });
  assert.deepEqual(historyPipeline.at(-2), { $sort: { at: -1, _id: -1 } });
  assert.deepEqual(historyPipeline.at(-1), { $limit: 20 });
  assert.deepEqual(fx.scheduledFilter(), { status: "scheduled" });
});

test("overview still works when settings cannot be read", async (t) => {
  setup(t, { history: [] });
  t.mock.method(console, "error", () => {});
  t.mock.method(Settings, "getSettings", async () => { throw new Error("down"); });
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => { throw new Error("down"); } }));
  const res = response();
  await getBroadcastOverview({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.orderHours, null);
  // Otomatik bildirim ayarı okunamazsa varsayılan gönderim aralığı kullanılır
  assert.match(res.body.sendWindow.start, /^\d{2}:\d{2}$/);
  assert.deepEqual(res.body.history, []);
  assert.deepEqual(res.body.scheduled, []);
});
