// "Sipariş kaçırmamak için" uyarılarının saf kuralları: hangi sipariş çalmaya devam eder, bağlantı kopukken hangi
// sipariş kaçırılmıştır, alarm telefonlarından kaçı bağlı, ses tercihleri nasıl okunur.
// Bu dosya bilerek bağımlılıksızdır (React, ağ, tarayıcı API'si yok): backend/tests/p1-alerts.test.js onu Node ile
// doğrudan içe aktarıp sınar. Süreler milisaniye, saatler İstanbul saatidir (UTC+3, yaz saati uygulanmaz).

export const PREPARING = "Hazırlanıyor";
export const MINUTE = 60_000;
const TR_OFFSET_MS = 3 * 60 * MINUTE;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

// ── Süreler ───────────────────────────────────────────────────────────────
/** Yeni sipariş, panelde ilk duyurulduğu andan itibaren en çok bu kadar tekrar çalar; sonra sessizce bırakılır. */
export const RING_WINDOW_MS = 30 * MINUTE;
/** Tekrar aralığı seçenekleri (sn) */
export const REPEAT_INTERVALS = [30, 60, 120];
/** Alarm telefonu "bağlı": son 3 dk içinde sunucuya uğramış (sunucu lastSeenAt'i en sık dakikada bir yazar). */
export const ALARM_ONLINE_MS = 3 * MINUTE;
/** Canlı bağlantı bu kadar kopuk kalırsa kırmızı şerit çıkar ve siparişler HTTP ile kontrol edilir. */
export const OFFLINE_AFTER_MS = 30_000;
export const OFFLINE_POLL_MS = 30_000;
/** Sekme bundan uzun gizli kaldıysa görünür olunca siparişler HTTP ile kontrol edilir. */
export const HIDDEN_RESYNC_MS = MINUTE;
/** Alarm telefonu durumu: normalde dakikada bir (panel görünürken), sipariş çalarken 30 sn'de bir. */
export const ALARM_POLL_MS = MINUTE;
export const ALARM_POLL_RINGING_MS = 30_000;
/** Uzun parçalar (ör. Vivaldi) her uyarıda en çok bu kadar çalar; tekrarlar üst üste binmez. */
export const ALERT_SOUND_MAX_MS = 15_000;
/** Anlık görüntü (snapshot) bu kadar eski siparişleri kesin içerir; daha yenisi henüz listeye girmemiş olabilir. */
export const SNAPSHOT_GRACE_MS = 5_000;
/**
 * Sayfa yenilenince (ya da sekme kapanıp hemen açılınca) önceki oturumun sınırı bu süre içindeyse sürdürülür: aradaki
 * birkaç saniyede gelen sipariş "bilinen" sayılıp sessizce yutulmaz. Kontrol en geç 2 dk'da bir yapıldığı için 5 dk
 * yeniden yüklemeyi kapsar; daha uzun kapalı kalan panel açılınca eski siparişler için çalmaz.
 */
export const RESUME_WINDOW_MS = 5 * MINUTE;

// ── Ses tercihleri ────────────────────────────────────────────────────────
/** frontend/public içindeki dosyalar (/{id}.mp3) */
export const SOUND_OPTIONS = [
  { id: "ringtone", label: "Telefon zili" },
  { id: "bell", label: "Zil" },
  { id: "chime", label: "Çan" },
  { id: "notification", label: "Bildirim" },
  { id: "fur-elise", label: "Für Elise" },
  { id: "gnosienne-no1", label: "Gnossienne No. 1" },
  { id: "vivaldi-winter", label: "Vivaldi · Kış" },
];
export const DEFAULT_SOUND = "ringtone";
const SOUND_IDS = new Set(SOUND_OPTIONS.map((option) => option.id));
// Eski ayar ekranı bu kısa adları yazıyordu; dosya adları farklı olduğu için ses hiç çalmıyordu.
const LEGACY_SOUNDS = { furelise: "fur-elise", gnosienne: "gnosienne-no1", vivaldi: "vivaldi-winter" };

/** localStorage "notificationSound" değeri → bilinen ses kimliği (bilinmeyen/boş → varsayılan) */
export const normalizeSound = (raw) => {
  const id = String(raw ?? "").trim();
  if (SOUND_IDS.has(id)) return id;
  return LEGACY_SOUNDS[id] || DEFAULT_SOUND;
};
export const soundLabel = (id) => SOUND_OPTIONS.find((option) => option.id === normalizeSound(id))?.label || "";
export const soundUrl = (id) => `/${normalizeSound(id)}.mp3`;

export const DEFAULT_PREFS = Object.freeze({ volume: 0.75, muted: false, repeat: true, intervalSec: 30 });
/** Kayıtlı tercih (bozuk/eksik olabilir) → { volume 0–1, muted, repeat, intervalSec } */
export const normalizePrefs = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const volume = Number(source.volume);
  const interval = Number(source.intervalSec);
  return {
    volume: source.volume !== null && source.volume !== "" && Number.isFinite(volume)
      ? Math.min(1, Math.max(0, Math.round(volume * 100) / 100))
      : DEFAULT_PREFS.volume,
    muted: source.muted === true,
    repeat: source.repeat !== false,
    intervalSec: REPEAT_INTERVALS.includes(interval) ? interval : DEFAULT_PREFS.intervalSec,
  };
};
/** "30 sn", "1 dk", "2 dk" */
export const intervalLabel = (seconds) => (seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} dk` : `${seconds} sn`);
/** "30 sn'de bir", "1 dk'da bir" (kısaltma okunduğu gibi çekimlenir: saniyede, dakikada) */
export const intervalEvery = (seconds) => (seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} dk'da bir` : `${seconds} sn'de bir`);

// ── Yardımcılar ───────────────────────────────────────────────────────────
/** Date | ISO | ms → ms (geçersizse NaN) */
export const toMs = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
};
const isoOrNull = (value) => {
  const ms = toMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const isOrderId = (value) => OBJECT_ID.test(String(value ?? ""));
/** Panelde her yerde aynı kısa kod: son 6 hane, büyük harf ("#AB12CD") */
export const orderCode = (id) => `#${String(id ?? "").slice(-6).toUpperCase()}`;

// ── Sipariş saatleri ──────────────────────────────────────────────────────
/** İstanbul saatine göre günün dakikası (0–1439) */
export const istanbulMinutes = (nowMs) => {
  const local = new Date(nowMs + TR_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};
const settingNumber = (value, fallback) => {
  const number = Number(value);
  return value === undefined || value === null || value === "" || !Number.isFinite(number) ? fallback : number;
};
/**
 * Mağaza sipariş alıyor mu? Sunucudaki kuralın (cart.controller isWithinOrderHours) aynısı: 10:00–01:00 gibi gece
 * yarısını geçen aralık, 00:00 kapanış (= 24:00) ve 00:00–00:00 (24 saat açık) desteklenir.
 */
export const isWithinOrderHours = (settings = {}, nowMs = Date.now()) => {
  const start = settingNumber(settings?.orderStartHour, 10) * 60 + settingNumber(settings?.orderStartMinute, 0);
  const rawEnd = settingNumber(settings?.orderEndHour, 1) * 60 + settingNumber(settings?.orderEndMinute, 0);
  const end = rawEnd === 0 && start !== 0 ? 24 * 60 : rawEnd;
  const current = istanbulMinutes(nowMs);
  if (start === 0 && end === 0) return true;
  if (start < end) return current >= start && current <= end;
  return current >= start || current <= end;
};

// ── Alarm telefonları ─────────────────────────────────────────────────────
/** GET /api/order-alarm/status cihazları → { paired, connected } (kaldırılanlar sayılmaz) */
export const countAlarmDevices = (devices, nowMs = Date.now()) => {
  let paired = 0;
  let connected = 0;
  for (const device of Array.isArray(devices) ? devices : []) {
    if (!device || device.revokedAt) continue;
    paired += 1;
    const seen = toMs(device.lastSeenAt);
    if (Number.isFinite(seen) && nowMs - seen < ALARM_ONLINE_MS) connected += 1;
  }
  return { paired, connected };
};
export const isAlarmDeviceOnline = (device, nowMs = Date.now()) => {
  const seen = toMs(device?.lastSeenAt);
  return !device?.revokedAt && Number.isFinite(seen) && nowMs - seen < ALARM_ONLINE_MS;
};
/**
 * Başlıktaki "Alarm" çipinin tonu: "" nötr | ok | warn | danger
 *  - eşli telefon yok → nötr · hepsi bağlı → ok
 *  - hiçbiri bağlı değil → sipariş saatinde danger, dışında nötr
 *  - bir kısmı bağlı → sipariş saatinde warn, dışında nötr
 */
export const alarmTone = ({ paired = 0, connected = 0, inHours = true } = {}) => {
  if (!paired) return "";
  if (connected >= paired) return "ok";
  if (!inHours) return "";
  return connected === 0 ? "danger" : "warn";
};
/** Son onaylardan (recentAcks) telefonda "Gördüm"/"Kabul Et" denmiş sipariş kimlikleri */
export const phoneAckIds = (recentAcks) =>
  new Set((Array.isArray(recentAcks) ? recentAcks : []).map((ack) => String(ack?.orderId ?? "")).filter(Boolean));

// ── Siparişler ────────────────────────────────────────────────────────────
/** GET /api/orders-analytics?active=1 → orderAnalyticsData → düz liste (yeni sipariş bildirimiyle aynı alanlar) */
export const flattenActiveOrders = (orderAnalyticsData) => {
  const out = [];
  for (const group of Array.isArray(orderAnalyticsData?.usersOrders) ? orderAnalyticsData.usersOrders : []) {
    for (const order of Array.isArray(group?.orders) ? group.orders : []) {
      const id = String(order?.orderId ?? "");
      if (!id) continue;
      out.push({
        id,
        status: order.status,
        createdAt: order.createdAt ?? null,
        customerName: group?.user?.name || "Müşteri",
        totalAmount: Number(order.totalAmount) || 0,
        products: Array.isArray(order.products) ? order.products : [],
        deliveryType: order.deliveryType || "point",
        deliveryPointName: order.deliveryPointName || "",
        deliveryZoneName: order.deliveryZone?.name || "",
        city: order.city || "",
        paymentMethodLabel: order.paymentMethodLabel || "",
      });
    }
  }
  return out;
};
/** Listedeki en yeni sipariş zamanı (ms) ya da -Infinity */
export const newestCreatedMs = (orders) => {
  let newest = -Infinity;
  for (const order of orders || []) {
    const ms = toMs(order?.createdAt);
    if (Number.isFinite(ms) && ms > newest) newest = ms;
  }
  return newest;
};
/**
 * Kontrolden sonraki sınır (sunucu saati): bu andan sonra verilip panelin hiç görmediği sipariş "kaçırılmış" sayılır.
 *  - Anlık görüntü zamanı (snapshotMs) varsa ondan SNAPSHOT_GRACE_MS önce: sorgu sürerken kaydedilen sipariş listeye
 *    girmemiş olabilir, sınır onu geçmesin (bilinen siparişler zaten kimlikle elenir).
 *  - Yoksa (eski sunucu) listedeki en yeni sipariş.
 * Sınır hiç geri gitmez ve canlı olaylarla ilerlemez: aksi hâlde kopukken kaçırılan bir sipariş, ondan sonra canlı
 * gelen bir siparişin arkasında kalır ve hiç duyurulmazdı.
 */
export const snapshotBaseline = (previousMs, { orders = [], snapshotMs = NaN } = {}) => {
  const candidate = Number.isFinite(snapshotMs) ? snapshotMs - SNAPSHOT_GRACE_MS : newestCreatedMs(orders);
  const previous = Number.isFinite(previousMs) ? previousMs : -Infinity;
  const next = Math.max(previous, Number.isFinite(candidate) ? candidate : -Infinity);
  return Number.isFinite(next) ? next : null;
};
/**
 * Cihazda saklanan sınır { ms (sunucu saati), savedAt (bu cihazın saati) } → sürdürülecek sınır ya da null.
 * Kayıt bozuksa, gelecekteyse ya da RESUME_WINDOW_MS'den eskiyse null (panel ilk açılıştaki gibi davranır).
 */
export const resumeBaseline = (stored, nowMs = Date.now()) => {
  if (!stored || typeof stored !== "object" || typeof stored.ms !== "number" || typeof stored.savedAt !== "number") return null;
  if (!Number.isFinite(stored.ms) || !Number.isFinite(stored.savedAt)) return null;
  const age = nowMs - stored.savedAt;
  return age >= 0 && age < RESUME_WINDOW_MS ? stored.ms : null;
};
/**
 * Bağlantı kopukken gelen, panelin hiç duyurmadığı siparişler: durumu Hazırlanıyor, kimliği bilinmeyen ve sınırdan
 * (baselineMs, sunucu saati; bkz. snapshotBaseline) eski olmayan. Sınırla aynı milisaniyedeki bilinmeyen sipariş de
 * yenidir (bilinenler kimlikle elenir). baselineMs null → bilinmeyen her Hazırlanıyor. Eskiden yeniye.
 */
export const pickMissedOrders = (orders, { knownIds, baselineMs = null } = {}) =>
  (orders || [])
    .filter((order) => order?.id && order.status === PREPARING && !knownIds?.has?.(order.id)
      && (baselineMs === null || toMs(order.createdAt) >= baselineMs))
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

/**
 * Çalmaya başlarken kaydedilen "ilk duyuru" zamanı (bu cihazın saati). Yeni sipariş en çok RING_WINDOW_MS çalar ve bu
 * süre siparişin verildiği andan sayılır: kaçırılıp geç duyurulan sipariş yalnızca kalan süre kadar tekrar çalar;
 * süresi çoktan dolmuşsa (ör. uykudan uyanan dizüstü) bir kez duyurulur ama tekrar çalmaz. Sunucu saati
 * (serverNowMs) ya da sipariş zamanı bilinmiyorsa şimdi (canlı sipariş).
 */
export const ringStartAt = (createdAt, { nowMs = Date.now(), serverNowMs = NaN } = {}) => {
  const created = toMs(createdAt);
  if (!Number.isFinite(created) || !Number.isFinite(serverNowMs)) return nowMs;
  return nowMs - Math.min(Math.max(serverNowMs - created, 0), RING_WINDOW_MS);
};
/**
 * Hâlâ çalması gereken siparişler. Bırakılanlar:
 *  - ilk duyurudan (firstAt, bu cihazın saati) RING_WINDOW_MS geçenler
 *  - isDone(id) true olanlar (bu cihazda onaylandı, alarm telefonunda onaylandı, Siparişler ekranında görüldü)
 *  - active (Map id → durum) verildiyse: durumu Hazırlanıyor olmayanlar; listede olmayıp anlık görüntüden
 *    (snapshotMs, sunucu saati) SNAPSHOT_GRACE_MS'den daha önce oluşturulanlar (teslim edildi / silindi)
 * Oluşturma zamanı bilinmeyen kayıt listede yoksa yine çalar (güvenli taraf); süre dolunca bırakılır.
 */
export const reconcileRinging = (ringing, { nowMs = Date.now(), isDone = () => false, active = null, snapshotMs = NaN } = {}) =>
  (ringing || []).filter((entry) => {
    if (!entry?.id || !Number.isFinite(entry.firstAt)) return false;
    if (nowMs - entry.firstAt >= RING_WINDOW_MS) return false;
    if (isDone(entry.id)) return false;
    if (active) {
      const status = active.get(entry.id);
      if (status !== undefined) return status === PREPARING;
      const created = toMs(entry.createdAt);
      if (Number.isFinite(created) && Number.isFinite(snapshotMs) && created < snapshotMs - SNAPSHOT_GRACE_MS) return false;
    }
    return true;
  });

/** Siparişler ekranının cihaz deposu ("admin-order-seen": kimlik dizisi) → Set; bozuksa boş */
export const parseSeenIds = (raw) => {
  if (!raw) return new Set();
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return new Set(value.map(String));
    if (value && typeof value === "object") return new Set(Object.keys(value));
  } catch {
    // bozuk kayıt yok sayılır
  }
  return new Set();
};

// ── Müşteri iptali ────────────────────────────────────────────────────────
/**
 * "orderCancelledByCustomer" olayı ya da zildeki iptal kaydı → uyarı kaydı
 * { orderId, code, customerName, reason, note, totalAmount, at } (geçersiz kimlik → null)
 */
export const normalizeCancel = (data) => {
  if (!data || typeof data !== "object") return null;
  const source = data.cancel && typeof data.cancel === "object" ? { ...data.cancel, orderId: data.orderId, at: data.at } : data;
  const orderId = String(source.orderId ?? "").trim();
  if (!isOrderId(orderId)) return null;
  return {
    orderId,
    code: clip(source.code, 12) || orderCode(orderId),
    customerName: clip(source.customerName, 80),
    reason: clip(source.reason, 80),
    note: clip(source.note, 300),
    totalAmount: Number(source.totalAmount) || 0,
    at: isoOrNull(source.at) || new Date().toISOString(),
  };
};
/** "Neden: Teslimat çok uzun sürecek" · not; neden yoksa "Neden belirtilmedi" */
export const cancelReasonText = (entry) => {
  const reason = entry?.reason ? `Neden: ${entry.reason}` : "Neden belirtilmedi";
  return entry?.note ? `${reason} · “${entry.note}”` : reason;
};
