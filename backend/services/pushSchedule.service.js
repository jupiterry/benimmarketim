// Planlı toplu bildirimler: planlama, düzenleme, iptal, "şimdi gönder" ve zamanı geleni gönderen dakikalık iş.
//
// Güvenlik kuralları:
// - Bir plan yalnızca koşullu güncellemeyle (status "scheduled" → "sending") sahiplenilerek gönderilir; aynı planı
//   iki tur, iki süreç ya da zamanlayıcı ile "Şimdi gönder" aynı anda sahiplenemez. Bu yüzden Redis kilidi gerekmez
//   (Redis kapalıyken de aynı şekilde çalışır).
// - "sending" durumunda 15 dakikadan uzun kalan kayıt (sunucu gönderim sırasında kapandı) "failed / interrupted"
//   olarak işaretlenir ve KENDİLİĞİNDEN yeniden gönderilmez: bildirimin bir kısmı gitmiş olabilir.
// - Sunucu kapalıyken zamanı geçen plan, 2 saatten fazla gecikmişse gönderilmez ("missed").
// - Kitle, gönderim anında yeniden hesaplanır; gönderim anlık gönderimle aynı yoldan (deliverBroadcast) geçer.
import cron from "node-cron";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { isPushConfigured, sendPushToUsers } from "./push.service.js";
import {
  BroadcastError, buildBroadcastFilter, campaignOptIn, deliverBroadcast, describeDuplicate, findDuplicateBroadcast, istanbulLabel, parseBroadcastInput,
} from "./pushBroadcast.service.js";

const MINUTE = 60 * 1000;
export const MAX_PENDING_SCHEDULES = 20;
export const MAX_SCHEDULE_DAYS = 30;
export const MIN_SCHEDULE_LEAD_MS = MINUTE;
export const MISSED_AFTER_MS = 2 * 60 * MINUTE;
export const STUCK_AFTER_MS = 15 * MINUTE;
const DUE_BATCH = 10;
const OBJECT_ID = /^[a-f\d]{24}$/i;
// Saat dilimi açıkça yazılmış ISO zamanı (panel İstanbul saatini UTC'ye çevirip gönderir). Dilimsiz değer
// sunucunun yerel saatine göre yorumlanacağı için kabul edilmez.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Planlanan zamanı doğrular ve dakikaya yuvarlar (saniye atılır) */
export const parseScheduledFor = (value, now = new Date()) => {
  if (typeof value !== "string" || !ISO_WITH_ZONE.test(value)) throw new BroadcastError(400, "Geçersiz gönderim zamanı");
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new BroadcastError(400, "Geçersiz gönderim zamanı");
  const at = Math.floor(time / MINUTE) * MINUTE;
  const current = new Date(now).getTime();
  if (at < current + MIN_SCHEDULE_LEAD_MS) throw new BroadcastError(400, "Gönderim zamanı en az 1 dakika sonrası olmalı. Hemen göndermek için “Şimdi”yi seçin.", "past");
  if (at > current + MAX_SCHEDULE_DAYS * 24 * 60 * MINUTE) throw new BroadcastError(400, `Bildirim en fazla ${MAX_SCHEDULE_DAYS} gün sonrasına planlanabilir.`, "too_far");
  return new Date(at);
};

const requireId = (id) => {
  if (!OBJECT_ID.test(String(id || ""))) throw new BroadcastError(400, "Geçersiz bildirim");
  return String(id);
};
const goneError = () => new BroadcastError(409, "Bu bildirim artık planlı değil: gönderilmiş ya da iptal edilmiş olabilir. Listeyi yenileyin.", "not_scheduled");

/** Bekleyen planlar (zamanı en yakın olan önce) */
export const listScheduledBroadcasts = async () => PushBroadcast.find({ status: "scheduled" }).sort({ scheduledFor: 1 }).limit(MAX_PENDING_SCHEDULES).populate("sentBy", "name").lean();

/** POST /broadcasts/scheduled */
export const createScheduledBroadcast = async (source, actor, { now = new Date() } = {}) => {
  const input = parseBroadcastInput(source);
  const scheduledFor = parseScheduledFor(source?.scheduledFor, now);
  if (!isPushConfigured()) throw new BroadcastError(503, "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)", "not_configured");
  if ((await PushBroadcast.countDocuments({ status: "scheduled" })) >= MAX_PENDING_SCHEDULES) {
    throw new BroadcastError(409, `En fazla ${MAX_PENDING_SCHEDULES} planlı bildirim bekleyebilir. Yenisini eklemek için birini iptal edin ya da gönderilmesini bekleyin.`, "limit");
  }
  const duplicate = await findDuplicateBroadcast({ title: input.title, body: input.body, at: scheduledFor });
  if (duplicate) throw new BroadcastError(409, describeDuplicate(duplicate), "duplicate");
  return PushBroadcast.create({
    title: input.title, body: input.body, audience: input.audience, zone: input.zone, route: input.route,
    status: "scheduled", scheduledFor, sentBy: actor._id,
  });
};

/** PUT /broadcasts/scheduled/:id: yalnızca hâlâ planlı olan kayıt değişir (gönderimi başlamışsa 409) */
export const updateScheduledBroadcast = async (id, source, actor, { now = new Date() } = {}) => {
  const _id = requireId(id);
  const input = parseBroadcastInput(source);
  const scheduledFor = parseScheduledFor(source?.scheduledFor, now);
  const duplicate = await findDuplicateBroadcast({ title: input.title, body: input.body, at: scheduledFor, excludeId: _id });
  if (duplicate) throw new BroadcastError(409, describeDuplicate(duplicate), "duplicate");
  const updated = await PushBroadcast.findOneAndUpdate(
    { _id, status: "scheduled" },
    { $set: { title: input.title, body: input.body, audience: input.audience, zone: input.zone, route: input.route, scheduledFor, updatedBy: actor._id } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw goneError();
  return updated;
};

/** DELETE /broadcasts/scheduled/:id */
export const cancelScheduledBroadcast = async (id, actor, { now = new Date() } = {}) => {
  const cancelled = await PushBroadcast.findOneAndUpdate(
    { _id: requireId(id), status: "scheduled" },
    { $set: { status: "cancelled", cancelledAt: new Date(now), updatedBy: actor._id } },
    { new: true },
  ).lean();
  if (!cancelled) throw goneError();
  return cancelled;
};

/**
 * Bir planı sahiplenir ve gönderir. Sahiplenme koşullu güncellemedir: kayıt hâlâ "scheduled" ise "sending" olur ve
 * yalnızca bu çağrı gönderir; değilse (başka bir tur aldı, iptal edildi, düzenlenip ertelendi) hiçbir şey yapılmaz.
 * Kitle şimdi hesaplanır. Hata fırlatmaz.
 * @returns {{claimed: false} | {claimed: true, sent: boolean, reason: string|null, result?: object, broadcast: object}}
 */
export const processScheduledBroadcast = async (id, { now = new Date(), send = sendPushToUsers, dueOnly = false } = {}) => {
  const at = new Date(now);
  const broadcast = await PushBroadcast.findOneAndUpdate(
    // dueOnly (zamanlayıcı): zamanı gelmemiş (az önce ertelenmiş) ya da 2 saatten fazla gecikmiş plan alınmaz
    { _id: id, status: "scheduled", ...(dueOnly ? { scheduledFor: { $lte: at, $gte: new Date(at.getTime() - MISSED_AFTER_MS) } } : {}) },
    { $set: { status: "sending", claimedAt: at } },
    { new: true },
  ).lean();
  if (!broadcast) return { claimed: false };
  const fail = async (reason) => {
    try {
      await PushBroadcast.updateOne({ _id: broadcast._id, status: "sending" }, { $set: { status: "failed", sent: false, failureReason: reason } });
    } catch (error) {
      console.error("Planlı bildirim kaydı güncellenemedi:", error.message);
    }
    return { claimed: true, sent: false, reason, broadcast };
  };
  try {
    if (!isPushConfigured()) return await fail("not_configured");
    const filter = await buildBroadcastFilter(broadcast.audience, broadcast.zone || "", at, { fresh: true });
    if (!filter) return await fail("invalid_audience");
    const users = await User.find({ ...filter, ...campaignOptIn }).select("_id").lean();
    if (!users.length) return await fail("no_audience");
    const userIds = users.map((user) => user._id);
    const result = await deliverBroadcast({
      broadcastId: broadcast._id, title: broadcast.title, body: broadcast.body, route: broadcast.route, userIds, audienceSize: userIds.length, sentAt: at, send,
    });
    return { claimed: true, sent: result.sent === true, reason: result.sent ? null : result.reason || "opted_out", result, broadcast };
  } catch (error) {
    // Buraya yalnızca gönderimden ÖNCEKİ adımlar (kitle sorgusu) düşer; deliverBroadcast hata fırlatmaz
    console.error("Planlı bildirim gönderilemedi:", error.message);
    return fail("error");
  }
};

/** POST /broadcasts/scheduled/:id/send: planı beklemeden hemen gönderir */
export const sendScheduledBroadcastNow = async (id, { now = new Date(), send = sendPushToUsers } = {}) => {
  const _id = requireId(id);
  const existing = await PushBroadcast.findOne({ _id, status: "scheduled" }).select("title body").lean();
  if (!existing) throw goneError();
  if (!isPushConfigured()) throw new BroadcastError(503, "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)", "not_configured");
  const duplicate = await findDuplicateBroadcast({ title: existing.title, body: existing.body, at: now, excludeId: _id });
  if (duplicate) throw new BroadcastError(409, describeDuplicate(duplicate), "duplicate");
  const outcome = await processScheduledBroadcast(_id, { now, send });
  if (!outcome.claimed) throw goneError();
  return outcome;
};

/**
 * Dakikalık tur: (1) yarıda kalan gönderimleri kapatır, (2) 2 saatten fazla geciken planları "missed" yapar,
 * (3) zamanı gelen planları sırayla gönderir. Adımlar birbirinden bağımsızdır; biri hata verirse diğerleri çalışır.
 */
export const runPushScheduleTick = async ({ now = new Date(), send = sendPushToUsers } = {}) => {
  const at = new Date(now);
  const out = { interrupted: 0, missed: 0, sent: 0, failed: 0 };
  const step = async (label, work) => {
    try {
      await work();
    } catch (error) {
      console.error(`Planlı bildirim turu (${label}) başarısız:`, error.message);
      out.error = error.message;
    }
  };
  await step("yarıda kalanlar", async () => {
    const stuck = await PushBroadcast.updateMany(
      { status: "sending", claimedAt: { $lt: new Date(at.getTime() - STUCK_AFTER_MS) } },
      { $set: { status: "failed", sent: false, failureReason: "interrupted" } },
    );
    out.interrupted = stuck?.modifiedCount || 0;
  });
  await step("kaçanlar", async () => {
    const missed = await PushBroadcast.updateMany(
      { status: "scheduled", scheduledFor: { $lt: new Date(at.getTime() - MISSED_AFTER_MS) } },
      { $set: { status: "missed", sent: false, failureReason: "missed" } },
    );
    out.missed = missed?.modifiedCount || 0;
    if (out.missed) console.warn(`Planlı bildirim: ${out.missed} bildirim 2 saatten fazla geciktiği için gönderilmedi`);
  });
  await step("zamanı gelenler", async () => {
    const due = await PushBroadcast.find({ status: "scheduled", scheduledFor: { $lte: at, $gte: new Date(at.getTime() - MISSED_AFTER_MS) } })
      .sort({ scheduledFor: 1 }).limit(DUE_BATCH).select("_id").lean();
    for (const item of due || []) {
      const outcome = await processScheduledBroadcast(item._id, { now: at, send, dueOnly: true });
      if (!outcome.claimed) continue;
      if (outcome.sent) out.sent += 1;
      else out.failed += 1;
      console.log(`Planlı bildirim ${outcome.sent ? "gönderildi" : `gönderilemedi (${outcome.reason})`}: "${outcome.broadcast.title}" · plan ${istanbulLabel(outcome.broadcast.scheduledFor)}`);
    }
  });
  return out;
};

let running = false;
/** Zamanlayıcının çağırdığı güvenli tur: üst üste binmez, veritabanı bağlı değilse beklemeden çıkar, hata fırlatmaz */
export const runPushScheduleTickSafe = async (options = {}) => {
  if (running) return { skipped: "busy" };
  if (mongoose.connection.readyState !== 1) return { skipped: "database" };
  running = true;
  try {
    return await runPushScheduleTick(options);
  } catch (error) {
    console.error("Planlı bildirim turu başarısız:", error.message);
    return { error: error.message };
  } finally {
    running = false;
  }
};

let job = null;
/** server.js açılışta çağırır: dakikada bir tur */
export const startPushScheduleJob = () => {
  if (job) return job;
  job = cron.schedule("* * * * *", () => {
    runPushScheduleTickSafe().catch((error) => console.error("Planlı bildirim zamanlayıcısı hatası:", error.message));
  }, { scheduled: true });
  return job;
};
export const stopPushScheduleJob = () => {
  job?.stop();
  job = null;
};
