import mongoose from "mongoose";

// Otomatik bildirim ayarları (tek belge, key: "default").
// Varsayılanların ve doğrulamanın tek kaynağı services/notificationAutomation.service.js'dir:
// okunan belge her zaman normalizeAutomationSettings ile varsayılanlarla birleştirilir.
// Tüm otomasyonlar varsayılan olarak KAPALIDIR; müşteriye giden bir şey olduğu için mağaza sahibi açar.

const couponSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    value: { type: Number, default: 10, min: 0 },
    validDays: { type: Number, default: 7, min: 1 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const messageFields = {
  enabled: { type: Boolean, default: false },
  title: { type: String, default: "", maxlength: 60 },
  body: { type: String, default: "", maxlength: 180 },
};

const automationSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    // İstanbul saatiyle gönderime izin verilen aralık ("HH:MM")
    window: {
      start: { type: String, default: "10:00" },
      end: { type: String, default: "21:30" },
    },
    // Bir müşteriye iki otomatik bildirim arasında en az bu kadar saat
    minHoursBetween: { type: Number, default: 24, min: 1 },
    secondOrder: new mongoose.Schema(
      {
        ...messageFields,
        afterDays: { type: Number, default: 3 },
        maxDays: { type: Number, default: 14 },
        coupon: { type: couponSchema, default: () => ({}) },
      },
      { _id: false },
    ),
    winBack: new mongoose.Schema(
      {
        ...messageFields,
        afterDays: { type: Number, default: 21 },
        maxDays: { type: Number, default: 180 },
        cooldownDays: { type: Number, default: 30 },
        maxSends: { type: Number, default: 2 },
        coupon: { type: couponSchema, default: () => ({}) },
      },
      { _id: false },
    ),
    couponExpiry: new mongoose.Schema(
      {
        ...messageFields,
        hoursBefore: { type: Number, default: 24 },
      },
      { _id: false },
    ),
    closedCart: new mongoose.Schema(
      {
        ...messageFields,
        delayMinutes: { type: Number, default: 5 },
        windowMinutes: { type: Number, default: 120 },
      },
      { _id: false },
    ),
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, minimize: false },
);

const AutomationSettings = mongoose.model("AutomationSettings", automationSettingsSchema);

export default AutomationSettings;
