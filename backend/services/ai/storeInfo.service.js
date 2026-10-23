import Settings from "../../models/settings.model.js";
import DeliveryZone from "../../models/deliveryZone.model.js";

const formatTime = (hour, minute) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

export const isWithinOrderSchedule = ({ startHour, startMinute, endHour, endMinute }, date = new Date()) => {
  const local = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const current = local.getHours() * 60 + local.getMinutes();
  const start = Number(startHour) * 60 + Number(startMinute);
  const rawEnd = Number(endHour) * 60 + Number(endMinute);
  const end = rawEnd === 0 && start !== 0 ? 1440 : rawEnd;
  if (start === 0 && end === 0) return true;
  return start < end ? current >= start && current <= end : current >= start || current <= end;
};

const numberOrNull = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

// Asistanın gördüğü bölge bilgisi: yalnızca panelde girilen değerler (ücret, eşik, minimum, süre).
// Ücret 0 ise ücretsiz; minimumOrderAmount null ise genel minimum geçerlidir.
export const publicZoneInfo = (zone, generalMinimum) => {
  const deliveryFee = Math.max(0, Number(zone.deliveryFee) || 0);
  const zoneMinimum = numberOrNull(zone.minimumOrderAmount);
  return {
    id: String(zone._id ?? zone.id),
    name: String(zone.name || "").slice(0, 60),
    type: zone.type || null,
    deliveryFee,
    isFree: deliveryFee === 0,
    freeDeliveryThreshold: numberOrNull(zone.freeDeliveryThreshold),
    minimumOrderAmount: zoneMinimum ?? generalMinimum,
    etaText: String(zone.etaText || "").slice(0, 40),
  };
};

// Açık teslimat bölgeleri (sortOrder sırasıyla). Bölge koleksiyonu henüz tohumlanmadıysa ya da
// okunamazsa, bugünkü yurt teslimat noktaları (ücretsiz, eski akış) gösterilir.
export const getDeliveryZoneInfo = async (settings, generalMinimum) => {
  let zones = [];
  try {
    zones = await DeliveryZone.find({ enabled: true }).sort({ sortOrder: 1, name: 1 }).lean();
  } catch (error) {
    console.error("AI teslimat bölgeleri okunamadı:", error.message);
    zones = [];
  }
  if (zones?.length) return zones.map((zone) => publicZoneInfo(zone, generalMinimum));
  const configuredPoints = settings.deliveryPoints?.toObject?.() || settings.deliveryPoints || {};
  return Object.entries(configuredPoints)
    .filter(([, point]) => point?.enabled)
    .map(([key, point]) => publicZoneInfo({ _id: key, name: point.name, type: "yurt", deliveryFee: 0 }, generalMinimum));
};

export const getStoreInfo = async () => {
  const settings = await Settings.getSettings();
  const hours = {
    startHour: Number(settings.orderStartHour), startMinute: Number(settings.orderStartMinute),
    endHour: Number(settings.orderEndHour), endMinute: Number(settings.orderEndMinute),
  };
  const configuredPoints = settings.deliveryPoints?.toObject?.() || settings.deliveryPoints || {};
  const minimumOrderAmount = Number(settings.minimumOrderAmount ?? 250);
  return {
    orderingOpen: isWithinOrderSchedule(hours),
    timezone: "Europe/Istanbul",
    orderStartTime: formatTime(hours.startHour, hours.startMinute),
    orderEndTime: formatTime(hours.endHour, hours.endMinute),
    minimumOrderAmount,
    deliveryPoints: Object.entries(configuredPoints).map(([key, point]) => ({ key, name: point.name, enabled: Boolean(point.enabled) })),
    // Teslimat bölgeleri panelden yönetilir; asistan ücret/eşik/minimumu yalnızca buradan aktarır.
    deliveryZones: await getDeliveryZoneInfo(settings, minimumOrderAmount),
    freeDeliveryEverywhere: Boolean(settings.delivery?.freeDeliveryEverywhere),
  };
};
