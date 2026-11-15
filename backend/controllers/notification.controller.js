import mongoose from "mongoose";
import User from "../models/user.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import Settings, { resolveAiConfig } from "../models/settings.model.js";
import { createAiProvider, isDataPolicyError, isModelUnavailableError } from "../services/ai/providers.js";
import { REWRITE_INSTRUCTIONS, buildDraftMessages, buildProofreadMessages, mergeProofread, parseDraftOptions } from "../services/pushDraft.service.js";
import { PUSH_LIBRARY, PUSH_LIBRARY_SIZE, pickLibraryExamples } from "../services/pushLibrary.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import FlashSale from "../models/flashSale.model.js";
import Product from "../models/product.model.js";
import { getStatsSnapshot } from "../services/recommendation.service.js";
import { activeWeeklyFilter, isWeeklyDealLive } from "../services/productPricing.js";
import { weeklyDiscountPercent } from "../services/weeklyPrice.service.js";
import { PUSH_CATEGORIES, inspectPushUser, isPushConfigured, normalizePreferences, sendPushToUsers } from "../services/push.service.js";
import { describeTestSend, getAutomationSettings, normalizeAutomationSettings, resolveTestRecipient, toTestRecipient } from "../services/notificationAutomation.service.js";
import {
  BROADCAST_AUDIENCES, BROADCAST_ZONES, BroadcastError, RESULT_BATCH_LIMIT, TEST_AUDIENCE, ZONE_OPTIONS, buildAudienceFilter, buildBroadcastFilter,
  campaignOptIn, deliverBroadcast, describeDuplicate, describeSendSuccess, findDuplicateBroadcast, getBroadcastResults, istanbulLabel,
  listAudienceCounts, normalizeZone, parseBroadcastInput, sendOutcomeFields, toBroadcastView,
} from "../services/pushBroadcast.service.js";
import {
  MAX_PENDING_SCHEDULES, MAX_SCHEDULE_DAYS, cancelScheduledBroadcast, createScheduledBroadcast, listScheduledBroadcasts, sendScheduledBroadcastNow,
  updateScheduledBroadcast,
} from "../services/pushSchedule.service.js";

// Kitle tanımları ve sorgusu services/pushBroadcast.service.js içindedir (planlı gönderim de kullanır);
// eski içe aktarmalar bozulmasın diye buradan da dışa verilir.
export { BROADCAST_AUDIENCES, TEST_AUDIENCE, buildAudienceFilter };

// Yapay zekâ sağlayıcısı hatasını yöneticinin anlayacağı bir açıklamaya çevirir.
// Uç nokta yalnızca yöneticiye açık olduğu için sağlayıcı ve HTTP kodu mesajda gösterilir.
export const describeAiDraftFailure = (error, providerName = "", model = "") => {
  const code = String(error?.message || "");
  const status = Number(code.match(/^AI_PROVIDER_(\d{3})$/)?.[1]);
  const where = `${providerName || "sağlayıcı"}${model ? ` / ${model}` : ""}`;
  if (code === "AI_API_KEY_MISSING") return { status: 503, message: `Yapay zekâ anahtarı sunucuda tanımlı değil (${where}). .env dosyasındaki ilgili API anahtarını kontrol edin.` };
  if (status === 401 || status === 403) return { status: 502, message: `Yapay zekâ sağlayıcısı API anahtarını kabul etmedi (${where}, HTTP ${status}). Anahtarın geçerli olduğunu kontrol edin.` };
  if (status === 402) return { status: 502, message: `Yapay zekâ hesabında yeterli kredi yok (${where}, HTTP 402). Sağlayıcı hesabına kredi yükleyin.` };
  if (status === 404 && isDataPolicyError(error)) {
    return { status: 502, message: `OpenRouter ücretsiz modellere erişime izin vermiyor (${where}, HTTP 404: veri politikası). OpenRouter hesabınızda Ayarlar › Privacy bölümünde ücretsiz modellere izin verin (Enable free endpoints that may train on inputs / publish prompts).` };
  }
  if (status === 404 || (status === 400 && isModelUnavailableError(error))) {
    return { status: 502, message: `Yapay zekâ modeli bulunamadı (${where}, HTTP ${status}). Seçili model ve denenen yedek modeller bu sağlayıcıda şu an kullanılamıyor; Ayarlar › Yapay zekâ bölümünden canlı listedeki bir modeli seçin.` };
  }
  if (status === 400) return { status: 502, message: `Yapay zekâ sağlayıcısı isteği reddetti (${where}, HTTP ${status}). Ayarlardaki model adının bu sağlayıcıda geçerli olduğunu kontrol edin.` };
  if (status === 429) return { status: 502, message: `Yapay zekâ sağlayıcısının istek limiti doldu (${where}, HTTP 429). Birkaç dakika sonra tekrar deneyin.` };
  if (status >= 500) return { status: 502, message: `Yapay zekâ sağlayıcısı şu anda yanıt vermiyor (${where}, HTTP ${status}). Biraz sonra tekrar deneyin.` };
  if (code === "AI_EMPTY_RESPONSE") return { status: 502, message: `Yapay zekâ boş yanıt döndürdü (${where}). Tekrar deneyin.` };
  if (error?.name === "AbortError") return { status: 504, message: `Yapay zekâ sağlayıcısı zamanında yanıt vermedi (${where}). Tekrar deneyin.` };
  return { status: 502, message: `Metin şu anda oluşturulamadı (${where}). Tekrar deneyin veya hazır metinlerden birini kullanın.` };
};

// Taslak üretimi yalnızca metin önerir; hiçbir bildirim göndermez.
// Farklı tonlarda en fazla 3 seçenek döner; ilki forma doldurulur, diğerleri panelde seçilebilir.
// Yapay zekânın kullanabileceği gerçek, güncel mağaza bilgileri (uydurmasın diye yalnızca bunlar)
const formatTl = (value) => `${Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;
export const gatherStoreFacts = async (now = new Date()) => {
  const facts = [];
  // Veritabanı bağlı değilse beklemeden boş dön (taslak yine üretilir)
  if (mongoose.connection.readyState !== 1) return facts;
  try {
    const [weekly, flash] = await Promise.all([
      // Yalnızca şu an geçerli haftalık fırsatlar (süresi dolmuş fiyat taslağa girmez)
      WeeklyProduct.find(activeWeeklyFilter(now)).populate("product", "name price isHidden isOutOfStock").sort({ order: 1 }).limit(6).lean(),
      FlashSale.find({ isActive: true, startDate: { $lte: now }, endDate: { $gt: now } }).populate("product", "name price").limit(4).lean(),
    ]);
    for (const item of weekly) {
      if (!item.product || item.product.isHidden || item.product.isOutOfStock || !isWeeklyDealLive(item, now)) continue;
      // İndirim yüzdesi ürünün GÜNCEL liste fiyatından (kayıtlı yüzde, liste fiyatı değişince eskir)
      const percent = weeklyDiscountPercent(item.product.price, item.weeklyPrice);
      facts.push(`Haftalık fırsat: ${item.product.name} ${formatTl(item.weeklyPrice)}${percent ? ` (%${percent} indirimli)` : ""}`);
    }
    for (const sale of flash) {
      if (!sale.product) continue;
      const hours = Math.max(1, Math.round((new Date(sale.endDate) - now) / 3600000));
      facts.push(`Flaş indirim: ${sale.product.name} ürününde %${sale.discountPercentage} indirim, yaklaşık ${hours} saat sonra bitiyor`);
    }
    // Bu haftanın çok satanları (öneri istatistiğinden; yoksa atlanır)
    const stats = getStatsSnapshot();
    const top = Object.entries(stats?.products || {}).sort((a, b) => b[1].units7 - a[1].units7).slice(0, 5).map(([id]) => id);
    if (top.length) {
      const products = await Product.find({ _id: { $in: top }, isHidden: false, isOutOfStock: false }).select("name").lean();
      const names = top.map((id) => products.find((p) => String(p._id) === id)?.name).filter(Boolean);
      if (names.length) facts.push(`Bu hafta en çok satanlar: ${names.join(", ")}`);
    }
  } catch (error) {
    console.error("Bildirim için mağaza bilgisi alınamadı:", error.message);
  }
  return facts.slice(0, 12);
};

// Hazır bildirim kütüphanesi (panel tek seferde alır)
export const getBroadcastLibrary = async (_req, res) => {
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.json({ success: true, size: PUSH_LIBRARY_SIZE, themes: PUSH_LIBRARY });
};

export const generateBroadcastDraft = async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const target = typeof req.body?.target === "string" ? req.body.target : "home";
  const audience = typeof req.body?.audience === "string" && BROADCAST_AUDIENCES[req.body.audience] ? req.body.audience : "";
  const mode = req.body?.mode === "rewrite" ? "rewrite" : "new";
  const current = mode === "rewrite" ? {
    title: typeof req.body?.current?.title === "string" ? req.body.current.title.trim().slice(0, 120) : "",
    body: typeof req.body?.current?.body === "string" ? req.body.current.body.trim().slice(0, 300) : "",
  } : null;
  const instruction = mode === "rewrite"
    ? REWRITE_INSTRUCTIONS[req.body?.instruction] || (typeof req.body?.instruction === "string" ? req.body.instruction.trim().slice(0, 200) : "")
    : "";
  if (mode === "rewrite") {
    if (!current.title || !current.body) return res.status(400).json({ success: false, message: "Geliştirmek için önce başlık ve mesaj yazın." });
  } else if (prompt.length < 3 || prompt.length > 600) {
    return res.status(400).json({ success: false, message: "Kampanya açıklaması 3–600 karakter arasında olmalı." });
  }
  let providerName = "";
  let model = "";
  try {
    const settings = await Settings.getSettings();
    const ai = settings.ai || {};
    ({ provider: providerName, model } = resolveAiConfig(ai));
    // Son başlıklar modele verilir ki aynı kalıpları tekrar etmesin
    let recent = [];
    try {
      recent = await PushBroadcast.find({ audience: { $ne: TEST_AUDIENCE } }).sort({ createdAt: -1 }).limit(5).select("title").lean();
    } catch {
      // Geçmiş okunamazsa taslak yine de üretilir
    }
    const facts = req.body?.useStoreData === false ? [] : await gatherStoreFacts();
    const examples = pickLibraryExamples(mode === "rewrite" ? `${current.title} ${current.body}` : prompt, { count: 3 });
    const messages = buildDraftMessages({
      prompt, target, audience, facts, examples, mode, current, instruction,
      recentTitles: recent.map((item) => item.title).filter(Boolean),
    });
    const provider = createAiProvider({ provider: providerName, model });
    // Yaratıcı metin için asistandan daha yüksek sıcaklık; sınıra uymazsa bir kez daha denenir
    let options = [];
    for (let attempt = 0; attempt < 2 && !options.length; attempt += 1) {
      const response = await provider.complete(messages, [], { temperature: 0.9, maxTokens: 1800, reasoning: false, retryEmpty: true });
      options = parseDraftOptions(response.content);
    }
    if (!options.length) return res.status(502).json({ success: false, message: "Üretilen metin karakter sınırına uymadı. Yeniden deneyin." });
    // Türkçe editör geçişi: ekleri ve söz dizimini düzeltir; başarısız olursa özgün metinler kalır
    try {
      const proof = await provider.complete(buildProofreadMessages(options, { prompt: mode === "rewrite" ? instruction || prompt : prompt }), [], { temperature: 0.2, maxTokens: 1800, reasoning: false });
      options = mergeProofread(options, proof.content);
    } catch (proofError) {
      console.warn("Bildirim taslağı editör geçişi atlandı:", proofError?.message);
    }
    return res.json({ success: true, title: options[0].title, body: options[0].body, options, facts });
  } catch (error) {
    // Gerçek sebep sunucu kaydına yazılır (önceden sessizce yutuluyordu)
    console.error(`Bildirim taslağı üretilemedi [${providerName} / ${model}]:`, error?.name === "AbortError" ? "zaman aşımı" : error?.message, error?.providerMessage || "");
    const { status, message } = describeAiDraftFailure(error, providerName, model);
    return res.status(status).json({ success: false, message });
  }
};

// Gönderim başarısız olduğunda yöneticiye gösterilen açıklama ve HTTP durumu
export const describePushFailure = (result) => {
  const detail = result?.detail ? ` (${result.detail})` : "";
  switch (result?.reason) {
    case "auth": return { status: 502, message: "OneSignal anahtarı kabul edilmedi. Sunucudaki ONESIGNAL_REST_API_KEY ve ONESIGNAL_APP_ID değerlerinin aynı OneSignal uygulamasına ait olduğunu kontrol edin." };
    case "rejected": return { status: 502, message: `OneSignal isteği reddetti${detail}. Sunucu ayarlarındaki OneSignal bilgilerini kontrol edin.` };
    case "network": return { status: 502, message: `OneSignal'a ulaşılamadı${detail}. Sunucunun internet bağlantısını kontrol edip birkaç dakika sonra tekrar deneyin.` };
    case "not_configured": return { status: 503, message: "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)" };
    case "error": return { status: 500, message: "Bildirim gönderilirken sunucu hatası oluştu. Birkaç dakika sonra tekrar deneyin." };
    case "no_devices": return { status: 422, message: "Bildirim gönderilemedi: bu kitledeki müşterilerin hiçbiri bildirimleri destekleyen uygulama sürümünde oturum açmamış. Müşteriler yeni sürümü kurup giriş yaptıkça ulaşılabilir olurlar." };
    default: return { status: 422, message: "Bildirim gönderilemedi: seçilen kişiler bildirim almaya izin vermiyor." };
  }
};

// ── Müşteri: bildirim tercihleri ─────────────────────────────────────────────
export const getNotificationPreferences = async (req, res) => {
  res.json({ success: true, preferences: normalizePreferences(req.user) });
};

export const updateNotificationPreferences = async (req, res) => {
  const updates = {};
  for (const category of PUSH_CATEGORIES) {
    if (req.body?.[category] === undefined) continue;
    if (typeof req.body[category] !== "boolean") return res.status(400).json({ success: false, message: "Geçersiz bildirim tercihi" });
    updates[`notificationPreferences.${category}`] = req.body[category];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ success: false, message: "Güncellenecek tercih bulunamadı" });
  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true }).select("notificationPreferences").lean();
  res.json({ success: true, preferences: normalizePreferences(user) });
};

// ── Yönetici: toplu bildirim ─────────────────────────────────────────────────
const OBJECT_ID = /^[a-f\d]{24}$/i;
const HISTORY_LIMIT = 20;
const HISTORY_QUERY_MAX_MS = 8000;

// BroadcastError → yanıt; diğer hatalar rota sarmalayıcısına (500) gider
const failWith = (res, error) => {
  if (!(error instanceof BroadcastError)) throw error;
  return res.status(error.status).json({ success: false, reason: error.code, message: error.message });
};

/**
 * Son gönderimler: planlı ve iptal edilmiş kayıtlar hariç. Sıra, bildirimin gerçekten işlendiği ana göredir
 * (günler önce planlanıp bugün giden bildirim en üstte görünsün). Eski kayıtlarda yalnızca createdAt vardır.
 */
const loadHistory = async () => {
  const rows = await PushBroadcast.aggregate([
    { $match: { status: { $nin: ["scheduled", "cancelled"] } } },
    // Alıcı listesi (select: false) toplama sorgusunda kendiliğinden gizlenmez
    { $project: { recipients: 0 } },
    { $addFields: { at: { $ifNull: ["$sentAt", { $ifNull: ["$claimedAt", { $ifNull: ["$scheduledFor", "$createdAt"] }] }] } } },
    { $sort: { at: -1, _id: -1 } },
    { $limit: HISTORY_LIMIT },
  ], { maxTimeMS: HISTORY_QUERY_MAX_MS });
  await PushBroadcast.populate(rows, [{ path: "sentBy", select: "name" }, { path: "testRecipient", select: "name email" }]);
  return rows.map(toBroadcastView);
};

// Planlama uyarıları için: sipariş saatleri (Ayarlar) ve otomatik bildirimlerin gönderim aralığı. Okunamazsa
// uyarı gösterilmez; gönderim ekranı yine çalışır.
const loadSendHours = async () => {
  const [settings, automation] = await Promise.all([
    Settings.getSettings().catch((error) => { console.error("Sipariş saatleri okunamadı:", error.message); return null; }),
    getAutomationSettings().catch((error) => { console.error("Bildirim gönderim saatleri okunamadı:", error.message); return normalizeAutomationSettings(null); }),
  ]);
  const orderHours = settings ? {
    startHour: Number(settings.orderStartHour) || 0, startMinute: Number(settings.orderStartMinute) || 0,
    endHour: Number(settings.orderEndHour) || 0, endMinute: Number(settings.orderEndMinute) || 0,
  } : null;
  return { orderHours, sendWindow: automation?.window ? { start: automation.window.start, end: automation.window.end } : null };
};

export const getBroadcastOverview = async (_req, res) => {
  const [audiences, history, scheduled, hours] = await Promise.all([listAudienceCounts(""), loadHistory(), listScheduledBroadcasts(), loadSendHours()]);
  res.json({
    success: true,
    configured: isPushConfigured(),
    audiences,
    zones: ZONE_OPTIONS,
    history,
    scheduled: (scheduled || []).map(toBroadcastView),
    limits: { maxScheduled: MAX_PENDING_SCHEDULES, maxScheduleDays: MAX_SCHEDULE_DAYS },
    ...hours,
  });
};

// GET /api/notifications/broadcasts/audience-count?zone=devrek[&audience=inactive30]
// Seçili bölgede her kitlenin (ya da yalnızca verilen kitlenin) büyüklüğü ve o kitle + bölgeye son gönderim.
export const getAudienceCounts = async (req, res) => {
  const zone = normalizeZone(typeof req.query?.zone === "string" ? req.query.zone : undefined);
  if (zone === null) return res.status(400).json({ success: false, message: "Geçersiz bölge" });
  const audience = typeof req.query?.audience === "string" && req.query.audience ? req.query.audience : null;
  if (audience && !Object.hasOwn(BROADCAST_AUDIENCES, audience)) return res.status(400).json({ success: false, message: "Geçersiz hedef kitle" });
  res.json({ success: true, zone, zoneLabel: zone ? BROADCAST_ZONES[zone] : "Tümü", audiences: await listAudienceCounts(zone, new Date(), audience) });
};

// GET /api/notifications/broadcasts/results?ids=a,b,c (en fazla 20)
// Görünen geçmiş satırları için "bildirimden sonra sipariş verenler" sayıları.
export const getBroadcastResultsBatch = async (req, res) => {
  const ids = [...new Set(String(typeof req.query?.ids === "string" ? req.query.ids : "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return res.json({ success: true, results: {} });
  if (ids.length > RESULT_BATCH_LIMIT || ids.some((id) => !OBJECT_ID.test(id))) {
    return res.status(400).json({ success: false, message: `Geçersiz istek: en fazla ${RESULT_BATCH_LIMIT} gönderim sorulabilir.` });
  }
  res.json({ success: true, results: await getBroadcastResults(ids) });
};

// ── Yönetici: planlı bildirim ────────────────────────────────────────────────
export const scheduleBroadcast = async (req, res) => {
  try {
    const record = await createScheduledBroadcast(req.body, req.user);
    const broadcast = toBroadcastView(typeof record.toObject === "function" ? record.toObject() : record);
    res.status(201).json({ success: true, broadcast, message: `Bildirim ${istanbulLabel(broadcast.scheduledFor)} için planlandı` });
  } catch (error) {
    failWith(res, error);
  }
};

export const updateScheduled = async (req, res) => {
  try {
    const broadcast = toBroadcastView(await updateScheduledBroadcast(req.params?.id, req.body, req.user));
    res.json({ success: true, broadcast, message: `Planlı bildirim güncellendi (${istanbulLabel(broadcast.scheduledFor)})` });
  } catch (error) {
    failWith(res, error);
  }
};

export const cancelScheduled = async (req, res) => {
  try {
    await cancelScheduledBroadcast(req.params?.id, req.user);
    res.json({ success: true, message: "Planlı bildirim iptal edildi" });
  } catch (error) {
    failWith(res, error);
  }
};

export const sendScheduledNow = async (req, res) => {
  try {
    const outcome = await sendScheduledBroadcastNow(req.params?.id);
    if (!outcome.sent) {
      const failure = outcome.reason === "no_audience"
        ? { status: 400, message: "Bu hedef kitlede bildirim alabilecek müşteri yok" }
        : describePushFailure(outcome.result || { reason: outcome.reason });
      return res.status(failure.status).json({ success: false, reason: outcome.reason || "opted_out", message: failure.message });
    }
    res.json({ success: true, targeted: outcome.result.targeted, unreachable: outcome.result.unreachable || 0, message: describeSendSuccess(outcome.result) });
  } catch (error) {
    failWith(res, error);
  }
};

// Tanılama sonucunun yöneticiye gösterilen açıklaması ve yapılacaklar
export const describeDiagnosis = (state, who) => {
  switch (state) {
    case "ready": return { ok: true, title: "Bildirim almaya hazır", steps: [`${who} en az bir cihazda bildirim alabiliyor.`] };
    case "not_found": return { ok: false, title: "Bu hesap OneSignal'da hiç görünmüyor", steps: [
      "Telefonda uygulamanın güncel sürümünde tam olarak bu hesapla (aynı e-posta) oturum açın; başka bir hesapla girildiyse çıkış yapıp bununla girin.",
      "Giriş yaptıktan sonra uygulamayı tamamen kapatıp yeniden açın, bir dakika bekleyip yeniden denetleyin.",
      "Sonuç değişmezse telefondaki sürüm bildirim desteği olmayan eski bir derleme olabilir.",
    ] };
    case "no_subscription": return { ok: false, title: "Hesap tanınıyor ama telefon bildirim aboneliği oluşturmamış", steps: [
      "Telefonun Ayarlar > Bildirimler bölümünde Benim Marketim için bildirimlere izin verin.",
      "iPhone için: OneSignal panelinde Settings > Push & In-App > Apple iOS (APNs) ayarının yapılmış olması gerekir (.p8 anahtarı, Team ID ve paket adı com.jupi.benimmarketim). Bu ayar yoksa hiçbir iPhone bildirim alamaz.",
    ] };
    case "no_token": return { ok: false, title: "Telefon, bildirim adresini alamamış", steps: [
      "iPhone için: OneSignal panelinde Settings > Push & In-App > Apple iOS (APNs) ayarını kontrol edin (.p8 anahtarı, Key ID, Team ID, paket adı com.jupi.benimmarketim).",
      "Apple Developer hesabında uygulama kimliğinde Push Notifications yetkisinin açık olduğunu doğrulayın.",
      "Android için: OneSignal panelinde Google Android (FCM) ayarının yapılmış olması gerekir.",
    ] };
    case "disabled": return { ok: false, title: "Telefonda bildirim izni kapalı", steps: [
      "Telefonun Ayarlar > Bildirimler bölümünde Benim Marketim için bildirimleri açın, ardından uygulamayı kapatıp yeniden açın.",
    ] };
    case "auth": return { ok: false, title: "OneSignal anahtarı kabul edilmedi", steps: ["Sunucudaki ONESIGNAL_REST_API_KEY ve ONESIGNAL_APP_ID değerlerinin aynı OneSignal uygulamasına ait olduğunu kontrol edin ve sunucuyu yeniden başlatın."] };
    case "not_configured": return { ok: false, title: "Bildirim servisi yapılandırılmamış", steps: ["Sunucu ayarlarına OneSignal anahtarlarını ekleyip sunucuyu yeniden başlatın."] };
    case "network": return { ok: false, title: "OneSignal'a ulaşılamadı", steps: ["Sunucunun internet bağlantısını kontrol edip birkaç dakika sonra tekrar deneyin."] };
    default: return { ok: false, title: "OneSignal isteği reddetti", steps: ["Sunucu ayarlarındaki OneSignal bilgilerini kontrol edin."] };
  }
};

// GET /api/notifications/broadcasts/diagnose?email=...
// Bir hesabın bildirim alıp alamadığını ve alamıyorsa nedenini gösterir. E-posta verilmezse yöneticinin kendi hesabı denetlenir.
export const diagnosePush = async (req, res) => {
  const email = String(req.query?.email || "").trim().toLowerCase();
  let target = req.user;
  if (email) {
    target = await User.findOne({ email }).select("_id name email pushNotificationsEnabled notificationPreferences").lean();
    if (!target) return res.status(404).json({ success: false, message: "Bu e-posta ile kayıtlı hesap bulunamadı." });
  }
  const who = email ? `${target.name || target.email}` : "Hesabınız";
  const result = await inspectPushUser(target._id);
  const diagnosis = describeDiagnosis(result.state, who);
  const preferences = normalizePreferences(target);
  const optedOut = target.pushNotificationsEnabled === false || preferences.campaigns === false;
  if (optedOut) diagnosis.steps = [...diagnosis.steps, "Bu hesapta uygulama içi bildirim ayarlarında bildirimler ya da kampanya bildirimleri kapalı; toplu bildirimler bu hesaba gönderilmez."];
  res.json({
    success: true,
    account: { name: target.name || "", email: target.email || "" },
    state: result.state,
    ready: diagnosis.ok && !optedOut,
    title: diagnosis.ok && optedOut ? "Cihaz hazır ama hesapta kampanya bildirimleri kapalı" : diagnosis.title,
    steps: diagnosis.steps,
    devices: result.devices,
  });
};

export const sendBroadcast = async (req, res) => {
  let input;
  try {
    input = parseBroadcastInput(req.body, { allowTest: true });
  } catch (error) {
    return failWith(res, error);
  }
  const { title, body, audience, zone, route, isTest } = input;
  if (!isPushConfigured()) return res.status(503).json({ success: false, message: "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)" });

  let userIds;
  let recipient = null;
  if (isTest) {
    // Deneme: yalnızca test alıcısına gider (gövdedeki recipientId > kayıtlı test alıcısı > gönderen yönetici)
    try {
      ({ user: recipient } = await resolveTestRecipient({ recipientId: req.body?.recipientId, requester: req.user }));
    } catch (error) {
      if (error.status === 400 || error.status === 404) return res.status(error.status).json({ success: false, message: error.message });
      throw error;
    }
    userIds = [recipient._id];
  } else {
    // Yanlışlıkla çift gönderimi engelle (başarısız denemeler yeniden gönderilebilir). Aynı metin şu sıralarda
    // gönderilmek üzere planlıysa ya da başka bir pencerede gönderiliyorsa da engellenir.
    const duplicate = await findDuplicateBroadcast({ title, body });
    if (duplicate) return res.status(409).json({ success: false, reason: "duplicate", message: describeDuplicate(duplicate) });
    const filter = await buildBroadcastFilter(audience, zone);
    const users = await User.find({ ...filter, ...campaignOptIn }).select("_id").lean();
    if (!users.length) return res.status(400).json({ success: false, message: "Bu hedef kitlede bildirim alabilecek müşteri yok" });
    userIds = users.map((user) => user._id);
  }

  // Deneme de kayda "self" kitlesiyle yazılır (gerçek gönderim sayılmaz) ve alıcısı saklanır.
  // Kayıt "sending" olarak açılır; sunucu gönderim sırasında kapanırsa zamanlayıcı "yarıda kaldı" olarak işaretler.
  const startedAt = new Date();
  const record = await PushBroadcast.create({
    title, body, audience, zone, route, audienceSize: userIds.length, sentBy: req.user._id, status: "sending", claimedAt: startedAt,
    ...(isTest ? { testRecipient: recipient._id } : {}),
  });
  if (isTest) {
    const data = { type: "broadcast", broadcastId: String(record._id), route };
    // Denemede kampanya tercihi atlanır (kapalı tercih denemeyi sessizce engellemesin); bildirimler tamamen kapalıysa gönderilmez
    const result = recipient.pushNotificationsEnabled === false
      ? { targeted: 0, sent: false, reason: "push_disabled", detail: "", unreachable: 0 }
      : await sendPushToUsers(userIds, { title, body }, data, { category: "campaigns", respectCategory: false });
    await PushBroadcast.updateOne({ _id: record._id }, { $set: sendOutcomeFields(result, [], startedAt, { test: true }) });
    const outcome = describeTestSend(result, recipient, { systemMessage: result.sent ? "" : describePushFailure(result).message });
    const summary = toTestRecipient(recipient);
    if (!outcome.success) return res.status(outcome.status).json({ success: false, reason: outcome.reason, message: outcome.message, recipient: summary });
    return res.json({ success: true, targeted: result.targeted, unreachable: result.unreachable || 0, message: outcome.message, recipient: summary });
  }
  // Gerçek gönderim: planlı bildirimlerle aynı yoldan (alıcılar sonuç ölçümü için kayda yazılır)
  const result = await deliverBroadcast({ broadcastId: record._id, title, body, route, userIds, sentAt: startedAt });
  if (!result.sent) {
    const failure = describePushFailure(result);
    return res.status(failure.status).json({ success: false, reason: result.reason || "opted_out", message: failure.message });
  }
  res.json({ success: true, targeted: result.targeted, unreachable: result.unreachable || 0, message: describeSendSuccess(result) });
};
