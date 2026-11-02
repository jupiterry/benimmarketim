// Müşteri eylemleri (yalnızca yönetici): Müşteriler ekranında seçilen kişilere ya da süzgece uyan herkese bildirim
// ve kişiye özel kupon. Uçlar (routes/customerActions.route.js, /api/customer-actions):
//  POST /preview  { target, channel: "push"|"coupon" } → { total, reachable, sample, capped, ... }
//  POST /push     { target, title, body, route?, confirmDuplicate?, confirmQuietHours? } → { sent, failed, skipped, ... }
//  POST /coupons  { target, coupon, notify?, message?, route?, confirmQuietHours? } → { created, skipped, pushed, ... }
// Kurallar ve doğrulama services/customerActions.service.js içindedir; burada HTTP yanıtı ve işlem kaydı yazılır.
import { recordAdminAction } from "../services/adminAudit.service.js";
import {
  AUDIT_ID_LIMIT, CustomerActionError, giveCustomerCoupons, previewCustomerAction, sendCustomerPush, tl,
} from "../services/customerActions.service.js";
import { describePushFailure } from "./notification.controller.js";

const num = (value) => Number(value || 0).toLocaleString("tr-TR");

const sendError = (res, error, context) => {
  if (error instanceof CustomerActionError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message, ...error.extra });
  }
  console.error(`${context}:`, error);
  return res.status(500).json({ success: false, code: "server_error", message: "Sunucu hatası. Birkaç dakika sonra tekrar deneyin." });
};

/** Tek müşteriye yapılan eylem müşterinin kimliğiyle kaydedilir (müşteri geçmişinde süzülebilsin) */
const auditTarget = (userIds, total) => (userIds.length === 1 && total === 1 ? userIds[0] : `${num(total)} müşteri`);

/** "18 kişiye gönderildi · 2 kişinin cihazına ulaşılamadı · 3 kişi atlandı (...)" */
export const pushSummary = ({ sent, failed, skipped }) => [
  `${num(sent)} kişiye gönderildi`,
  failed ? `${num(failed)} kişinin cihazına ulaşılamadı` : null,
  skipped ? `${num(skipped)} kişi atlandı (bildirimi kapalı ya da uygulaması yok)` : null,
].filter(Boolean).join(" · ");

/** Kupon bildiriminin sonucu: yalnızca yeni kupon alanlara gider */
const couponPushText = (outcome) => {
  if (!outcome.notify || !outcome.created) return null;
  if (outcome.pushed) {
    return `${num(outcome.pushed)} kişiye bildirim gitti${outcome.pushFailed ? ` (${num(outcome.pushFailed)} kişinin cihazına ulaşılamadı)` : ""}`;
  }
  return outcome.pushReason ? "bildirim gönderilemedi" : "bildirim alabilecek kimse yok";
};

/** "23 kupon oluşturuldu · 18 kişiye bildirim gitti · ..." */
export const couponSummary = (outcome) => [
  `${num(outcome.created)} kupon oluşturuldu`,
  couponPushText(outcome),
  outcome.duplicates ? `${num(outcome.duplicates)} kişi bu kuponu az önce aldığı için atlandı` : null,
  outcome.missing ? `${num(outcome.missing)} hesap atlandı (yönetici ya da silinmiş)` : null,
  outcome.failed ? `${num(outcome.failed)} kupon oluşturulamadı` : null,
].filter(Boolean).join(" · ");

/** POST /api/customer-actions/preview — yalnızca okur (POST: hedefte 1000'e kadar kimlik taşınır) */
export const previewCustomerActions = async (req, res) => {
  // Okuma işlemi: genel işlem kaydı yakalayıcısı (auditFallback) bunu bir değişiklik sanıp kayıt yazmasın
  req.auditRecorded = true;
  try {
    const preview = await previewCustomerAction(req.body || {}, { now: Date.now() });
    res.json({ success: true, ...preview });
  } catch (error) {
    sendError(res, error, "Müşteri eylemi önizlenemedi");
  }
};

/** POST /api/customer-actions/push */
export const pushToCustomers = async (req, res) => {
  try {
    const outcome = await sendCustomerPush(req.body || {}, { actorId: req.user?._id, now: Date.now() });
    const counts = { sent: outcome.sent, failed: outcome.failed, skipped: outcome.skipped };
    const base = {
      ...counts,
      total: outcome.total,
      reachable: outcome.reachable,
      capped: outcome.capped,
      matched: outcome.matched,
      missing: outcome.missing,
      broadcastId: outcome.broadcastId,
    };
    if (!outcome.delivered) {
      // Kayıt "gönderilemedi" olarak kaldı; tekrar denetimi yalnızca başarılı gönderimleri sayar, yeniden denenebilir
      const failure = describePushFailure({ reason: outcome.reason, detail: outcome.detail });
      return res.status(failure.status).json({ success: false, code: outcome.reason || "opted_out", message: failure.message, ...base });
    }
    const summary = pushSummary(counts);
    recordAdminAction(req, {
      action: "Müşterilere bildirim",
      category: "campaign",
      target: auditTarget(outcome.userIds, outcome.total),
      targetName: outcome.targetLabel,
      changes: [
        { label: "Başlık", from: "", to: outcome.message.title },
        { label: "Mesaj", from: "", to: outcome.message.body },
        { label: "Kime", from: "", to: `${num(outcome.total)} müşteri · ${num(outcome.reachable)} kişiye ulaşabilir` },
        { label: "Sonuç", from: "", to: summary },
        ...(outcome.quietHours?.active ? [{ label: "Sessiz saat", from: "", to: "Onaylanarak gönderildi" }] : []),
      ],
      meta: {
        kind: "push",
        broadcastId: outcome.broadcastId,
        targetType: outcome.targetType,
        route: outcome.message.route,
        ...counts,
        total: outcome.total,
        capped: outcome.capped,
        userIds: outcome.userIds.slice(0, AUDIT_ID_LIMIT),
      },
    });
    res.json({ success: true, ...base, message: summary });
  } catch (error) {
    sendError(res, error, "Müşterilere bildirim gönderilemedi");
  }
};

/** POST /api/customer-actions/coupons */
export const giveCouponsToCustomers = async (req, res) => {
  try {
    const outcome = await giveCustomerCoupons(req.body || {}, { actorId: req.user?._id, now: Date.now() });
    const summary = couponSummary(outcome);
    const pushProblem = outcome.pushReason ? describePushFailure({ reason: outcome.pushReason }).message : "";
    if (outcome.created > 0) {
      const { coupon } = outcome;
      recordAdminAction(req, {
        action: "Müşterilere özel kupon",
        category: "campaign",
        target: auditTarget(outcome.userIds, outcome.created),
        targetName: outcome.targetLabel,
        changes: [
          { label: "İndirim", from: "", to: coupon.label },
          { label: "Alt sepet", from: "", to: coupon.minimumOrderAmount > 0 ? tl(coupon.minimumOrderAmount) : "Yok" },
          { label: "Son gün", from: "", to: `${coupon.expiresOn} 23:59` },
          { label: "Bildirim", from: "", to: outcome.notify ? `${outcome.message.title} · ${num(outcome.pushed)} kişiye gitti` : "Gönderilmedi" },
          { label: "Sonuç", from: "", to: summary },
        ],
        meta: {
          kind: "coupon",
          targetType: outcome.targetType,
          created: outcome.created,
          skipped: outcome.skipped,
          failed: outcome.failed,
          pushed: outcome.pushed,
          broadcastId: outcome.broadcastId,
          total: outcome.total,
          capped: outcome.capped,
          userIds: outcome.userIds.slice(0, AUDIT_ID_LIMIT),
          codes: outcome.codes.slice(0, AUDIT_ID_LIMIT),
        },
      });
    } else {
      // Kimseye yeni kupon yazılmadı (hepsi az önce almış): değişiklik yok, kayıt da yok
      req.auditRecorded = true;
    }
    res.json({
      success: true,
      created: outcome.created,
      skipped: outcome.skipped,
      pushed: outcome.pushed,
      duplicates: outcome.duplicates,
      failed: outcome.failed,
      missing: outcome.missing,
      pushFailed: outcome.pushFailed,
      pushReason: outcome.pushReason,
      pushProblem,
      notify: outcome.notify,
      total: outcome.total,
      reachable: outcome.reachable,
      capped: outcome.capped,
      matched: outcome.matched,
      broadcastId: outcome.broadcastId,
      coupon: outcome.coupon,
      // Tek müşteriye verilen kuponun kodu (ör. telefonda müşteriye söylemek için); toplu verilişte kodlar dönmez
      code: outcome.created === 1 ? outcome.codes[0] : null,
      message: summary,
    });
  } catch (error) {
    sendError(res, error, "Müşterilere kupon verilemedi");
  }
};
