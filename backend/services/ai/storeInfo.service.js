import Settings from "../../models/settings.model.js";

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

export const getStoreInfo = async () => {
  const settings = await Settings.getSettings();
  const hours = {
    startHour: Number(settings.orderStartHour), startMinute: Number(settings.orderStartMinute),
    endHour: Number(settings.orderEndHour), endMinute: Number(settings.orderEndMinute),
  };
  const configuredPoints = settings.deliveryPoints?.toObject?.() || settings.deliveryPoints || {};
  return {
    orderingOpen: isWithinOrderSchedule(hours),
    timezone: "Europe/Istanbul",
    orderStartTime: formatTime(hours.startHour, hours.startMinute),
    orderEndTime: formatTime(hours.endHour, hours.endMinute),
    minimumOrderAmount: Number(settings.minimumOrderAmount ?? 250),
    deliveryPoints: Object.entries(configuredPoints).map(([key, point]) => ({ key, name: point.name, enabled: Boolean(point.enabled) })),
  };
};
