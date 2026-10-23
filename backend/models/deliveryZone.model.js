import mongoose from "mongoose";

// Teslimat bölgesi (yurt / mahalle / köy). _id değişmez bir kısa addır (slug): 'girlsDorm', 'boysDorm',
// 'mah-cumhuriyet', 'koy-yazicik'. Yurt bölgeleri (legacyPoint dolu) settings.deliveryPoints ile eşlenir:
// açık/kapalı ve ad iki yönlü senkron tutulur (ayrıntı: services/delivery.service.js).
export const ZONE_TYPES = ["yurt", "mahalle", "koy"];
export const LEGACY_POINTS = ["girlsDorm", "boysDorm"];

const nullableAmount = { type: Number, default: null, min: 0 };

const deliveryZoneSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, enum: ZONE_TYPES, required: true },
    enabled: { type: Boolean, default: false },
    closedReason: { type: String, default: "", trim: true, maxlength: 120 },
    // TL; 0 = ücretsiz teslimat
    deliveryFee: { type: Number, default: 0, min: 0 },
    // Ürün tutarı (kupon öncesi) bu değere ulaşırsa teslimat ücretsiz; null = eşik yok
    freeDeliveryThreshold: nullableAmount,
    // null = genel settings.minimumOrderAmount
    minimumOrderAmount: nullableAmount,
    etaText: { type: String, default: "", trim: true, maxlength: 40 },
    sortOrder: { type: Number, default: 0 },
    legacyPoint: { type: String, enum: [...LEGACY_POINTS, null], default: null },
  },
  {
    timestamps: true,
    // Bağlantı yokken komutlar 10 sn beklemek yerine hemen hata verir; okuyan servisler
    // (AI bilgi, bölge listesi) bu durumda yedek davranışa düşer.
    bufferCommands: false,
  }
);

deliveryZoneSchema.index({ enabled: 1, sortOrder: 1 });

const DeliveryZone = mongoose.model("DeliveryZone", deliveryZoneSchema);

export default DeliveryZone;
