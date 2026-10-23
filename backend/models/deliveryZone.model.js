import mongoose from "mongoose";

// Teslimat bölgesi. Sahip kararıyla tam olarak üç SABİT bölge vardır (eklenemez, silinemez; yalnızca açılıp
// kapatılır ve fiyatı ayarlanır):
//   - 'girlsDorm' (Kız KYK Yurdu, yurt) ve 'boysDorm' (Erkek KYK Yurdu, yurt): legacyPoint dolu,
//     settings.deliveryPoints ile eşlenir (açık/kapalı ve ad iki yönlü senkron, ayrıntı: services/delivery.service.js)
//   - 'devrek' (Devrek, ilce): Devrek merkezinin OpenStreetMap sınırı (area) içindeki adreslere teslimat.
// Eski sürümde panelden eklenmiş 'mahalle' / 'koy' bölgeleri okunabilir kalır ama kapatılır ve listelenmez.
export const ZONE_TYPES = ["yurt", "ilce", "mahalle", "koy"];
export const LEGACY_POINTS = ["girlsDorm", "boysDorm"];
export const DEVREK_ZONE_ID = "devrek";
export const FIXED_ZONE_IDS = [...LEGACY_POINTS, DEVREK_ZONE_ID];
export const AREA_GEOMETRY_TYPES = ["Polygon", "MultiPolygon"];
export const OSM_TYPES = ["relation", "way", "node"];

const nullableAmount = { type: Number, default: null, min: 0 };

// Teslimat alanı (GeoJSON, [boylam, enlem]). Yalnızca 'devrek' bölgesinde kullanılır.
const areaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: AREA_GEOMETRY_TYPES, required: true },
    coordinates: { type: mongoose.Schema.Types.Mixed, required: true },
    source: { type: String, enum: ["osm"], default: "osm" },
    osmType: { type: String, enum: OSM_TYPES, required: true },
    osmId: { type: Number, required: true },
    adminLevel: { type: Number, default: null },
    displayName: { type: String, default: "", maxlength: 300 },
    areaKm2: { type: Number, default: null },
    fetchedAt: { type: Date, default: null },
  },
  { _id: false }
);

// Son OpenStreetMap sorgusunun adayları (çokgensiz; çokgenler kısa süreli önbellekte tutulur)
const areaCandidateSchema = new mongoose.Schema(
  {
    osmType: { type: String, enum: OSM_TYPES, required: true },
    osmId: { type: Number, required: true },
    adminLevel: { type: Number, default: null },
    kind: { type: String, default: "", maxlength: 60 },
    displayName: { type: String, default: "", maxlength: 300 },
    areaKm2: { type: Number, default: null },
  },
  { _id: false }
);

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
    // Açıksa bu bölgede teslim edilmiş siparişi olmayan müşterinin siparişi telefonla teyit edilir (Order.needsCallback)
    requireFirstOrderCallback: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    legacyPoint: { type: String, enum: [...LEGACY_POINTS, null], default: null },
    area: { type: areaSchema, default: null },
    areaCandidates: { type: [areaCandidateSchema], default: undefined },
    areaCandidatesFetchedAt: { type: Date, default: null },
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
