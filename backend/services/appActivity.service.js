import User from "../models/user.model.js";

// Mobil uygulama kullanım takibi.
//
// Uygulamada değişiklik gerektirmez: uygulamanın zaten yaptığı istekler izlenir.
//  - "Uygulamayı açtı": oturum açmış müşterinin uygulamadan gelen herhangi bir isteği.
//    30 dakikadan uzun aradan sonra gelen ilk istek yeni bir ziyaret sayılır ve
//    yönetici paneline `appOpened` olayı gönderilir.
//  - "checkout": sepet / sipariş ekranı açılırken yapılan kampanya sorgusu.
//  - "order": uygulamadan verilen sipariş.
// Aynı ziyaret içindeki sonraki istekler panele sessiz bir `appSeen` olayıyla bildirilir.
//
// Oturum açmamış ziyaretçiler tanınamadığı için izlenmez. Hiçbir hata, çağıran
// isteği etkilemez.

export const VISIT_GAP_MS = 30 * 60 * 1000;
const SEEN_WRITE_GAP_MS = 60 * 1000;
const STAGE_FIELDS = {
  checkout: "appActivity.checkoutAt",
  order: "appActivity.orderAt",
};

// Aynı müşteri için "son görülme" en fazla dakikada bir yazılır (işlem başına bellek içi)
const lastSeenWrites = new Map();

// Web sitesi oturumu çerezle taşır; uygulama ise çerezsiz, Authorization başlığıyla istek atar.
export const isAppRequest = (req) => {
  const agent = String(req?.headers?.["user-agent"] || "");
  if (/^dart\//i.test(agent)) return true;
  const bearer = /^Bearer\s+\S+/i.test(String(req?.headers?.authorization || ""));
  return bearer && !req?.cookies?.accessToken;
};

export const recordAppActivity = async (user, stage = null, { io = null, now = new Date() } = {}) => {
  if (!user?._id || user.role === "admin") return null;
  const stageField = stage ? STAGE_FIELDS[stage] : null;
  if (stage && !stageField) return null;

  const userId = user._id.toString();
  const nowMs = now.getTime();
  if (!stageField && nowMs - (lastSeenWrites.get(userId) || 0) < SEEN_WRITE_GAP_MS) return null;
  if (lastSeenWrites.size > 5000) lastSeenWrites.clear();
  lastSeenWrites.set(userId, nowMs);

  const set = { "appActivity.lastSeenAt": now };
  if (stageField) set[stageField] = now;

  // Yeni ziyaret tek bir koşullu güncellemeyle başlatılır; aynı anda gelen
  // istekler ya da birden fazla sunucu işlemi çift bildirim üretmez.
  const started = await User.findOneAndUpdate(
    {
      _id: user._id,
      $or: [
        { "appActivity.lastSeenAt": null },
        { "appActivity.lastSeenAt": { $lt: new Date(nowMs - VISIT_GAP_MS) } },
      ],
    },
    { $set: { ...set, "appActivity.visitStartedAt": now }, $inc: { "appActivity.visitCount": 1 } },
    { new: true, timestamps: false },
  )
    .select("name phone appActivity")
    .lean();

  if (!started) {
    await User.updateOne({ _id: user._id }, { $set: set }, { timestamps: false });
    // Panel "şu an uygulamada" bilgisini ve adımları yenilemeden güncel tutar
    io?.to("adminRoom").emit("appSeen", {
      userId,
      lastSeenAt: now.toISOString(),
      ...(stage ? { [`${stage}At`]: now.toISOString() } : {}),
    });
    return { newVisit: false };
  }

  io?.to("adminRoom").emit("appOpened", {
    userId,
    name: started.name || "Müşteri",
    phone: started.phone || "",
    at: now.toISOString(),
    visitCount: started.appActivity?.visitCount || 1,
    appActivity: started.appActivity || null,
  });
  return { newVisit: true };
};

// İsteği bekletmeden kaydeder. `user` verilmezse protectRoute'un doğruladığı kullanıcı kullanılır.
export const noteAppRequest = (req, stage = null, user = req?.user) => {
  try {
    if (!isAppRequest(req)) return;
    recordAppActivity(user, stage, { io: req.app?.get?.("io") }).catch((error) =>
      console.error("Uygulama etkinliği kaydedilemedi:", error.message),
    );
  } catch (error) {
    console.error("Uygulama etkinliği kaydedilemedi:", error.message);
  }
};

// Yalnızca başarıyla tamamlanan istekler aşama olarak sayılır (protectRoute'tan sonra kullanılır)
export const trackAppStage = (stage) => (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) noteAppRequest(req, stage);
  });
  next();
};
