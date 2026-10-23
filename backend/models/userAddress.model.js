import mongoose from "mongoose";

// Müşterinin kayıtlı teslimat adresleri (ayrı koleksiyon). Devrek bölgesinde mahalle, cadde/sokak, bina no ve
// konum zorunludur (konum yüklü Devrek sınırı içinde olmalı); yurtta hiçbir alan zorunlu değildir. Kişi başı en fazla MAX_ADDRESSES_PER_USER.
// Hesap silinince adresler de silinir (services/account.service.js).
export const MAX_ADDRESSES_PER_USER = 5;

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

const userAddressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "", trim: true, maxlength: 30 },
    zoneId: { type: String, required: true, trim: true, maxlength: 80 },
    // Mahalle (Devrek bölgesinde zorunlu; yurtta boş)
    neighborhood: { type: String, default: "", trim: true, maxlength: 60 },
    // Zorunluluk bölgeye göre denetlenir (services/delivery.service.js → validateAddressForZone)
    street: { type: String, default: "", trim: true, maxlength: 120 },
    buildingNo: { type: String, default: "", trim: true, maxlength: 20 },
    buildingName: { type: String, default: "", trim: true, maxlength: 60 },
    floor: { type: String, default: "", trim: true, maxlength: 10 },
    apartment: { type: String, default: "", trim: true, maxlength: 10 },
    directions: { type: String, default: "", trim: true, maxlength: 300 },
    location: { type: locationSchema, default: null },
    isDefault: { type: Boolean, default: false },
  },
  // Bağlantı yokken hemen hata ver (hesap silme adımı beklemeden kaydını düşer)
  { timestamps: true, bufferCommands: false }
);

const UserAddress = mongoose.model("UserAddress", userAddressSchema);

export default UserAddress;
