import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        isManual: {
          type: Boolean,
          default: false,
        },
        // Ürünün sepete eklendiği yer (ölçüm için, isteğe bağlı): home_deals, home_foryou, flash...
        source: {
          type: String,
          default: undefined,
          maxlength: 40,
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    city: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          // En az 10 karakter ve sadece rakam, boşluk, +, -, (, ) karakterleri
          const cleaned = v.replace(/[\s\-\(\)\+]/g, '');
          return cleaned.length >= 10 && /^\d+$/.test(cleaned);
        },
        message: "Geçerli bir telefon numarası girin! (En az 10 rakam)",
      },
    },
    note: {
      type: String,
      default: "",
    },
    // 'address' = adrese teslimat (deliveryAddress dolu); yurt siparişleri eski değerleri taşır
    deliveryPoint: {
      type: String,
      enum: ["girlsDorm", "boysDorm", "address"],
      required: true,
    },
    deliveryPointName: {
      type: String,
      default: "",
    },
    deliveryType: {
      type: String,
      enum: ["point", "address"],
      default: "point",
    },
    // Sipariş anındaki bölge kopyası (yurt siparişlerinde de doldurulur; eski siparişlerde yok)
    deliveryZone: {
      id: { type: String, default: undefined },
      name: { type: String, default: undefined },
      type: { type: String, default: undefined },
    },
    // Yalnızca adresli siparişte
    deliveryAddress: {
      type: new mongoose.Schema(
        {
          zoneId: { type: String, default: "" },
          zoneName: { type: String, default: "" },
          // Mahalle (Devrek bölgesi; eski siparişlerde yok)
          neighborhood: { type: String, default: "" },
          street: { type: String, default: "" },
          buildingNo: { type: String, default: "" },
          buildingName: { type: String, default: "" },
          floor: { type: String, default: "" },
          apartment: { type: String, default: "" },
          directions: { type: String, default: "" },
          location: {
            type: new mongoose.Schema({ lat: Number, lng: Number }, { _id: false }),
            default: null,
          },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Devrek bölgesi: konum yüklü teslimat alanının içinde doğrulandı mı (true), alan yüklenmemişken mi
    // alındı (false). Yurt ve eski siparişlerde yok.
    areaVerified: { type: Boolean, default: undefined },
    // Teslimat ücreti (sunucuda hesaplanır ve kilitlenir; yurt siparişlerinde 0)
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Ürün tutarı − kupon (teslimat ücreti HARİÇ). Eski siparişlerde yok →
    // okurken { $ifNull: ["$productTotal", "$totalAmount"] }. totalAmount = productTotal + deliveryFee.
    productTotal: {
      type: Number,
      min: 0,
    },
    // Müşteri iptal ederken seçtiği neden (lib/feedbackOptions.js CANCEL_REASONS); eski iptallerde boş
    cancelReason: {
      code: { type: String, default: "" },
      note: { type: String, default: "", maxlength: 300 },
    },
    // İlk sipariş telefon teyidi: bölgede requireFirstOrderCallback açık ve müşterinin teslim edilmiş siparişi yoksa
    needsCallback: { type: Boolean, default: false },
    callbackConfirmedAt: { type: Date, default: null },
    callbackConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // "Teslim edilemedi" (yönetici işaretler, sipariş İptal Edildi olur). code: lib/feedbackOptions.js DELIVERY_OUTCOMES
    deliveryOutcome: {
      type: new mongoose.Schema(
        {
          code: { type: String, enum: ["adres_bulunamadi", "cevap_yok", "reddetti", "diger"], required: true },
          label: { type: String, default: "" },
          note: { type: String, default: "", maxlength: 200 },
          at: { type: Date, default: null },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Atanan kurye (settings.delivery.couriers kopyası: kimlik + ad). Kurye telefonu siparişe yazılmaz.
    courier: {
      type: new mongoose.Schema({ id: { type: String, default: "" }, name: { type: String, default: "" } }, { _id: false }),
      default: undefined,
    },
    // Ödeme yöntemi (lib/paymentMethods.js). Bu alan eklenmeden önceki siparişlerde null.
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank_transfer", null],
      default: null,
    },
    status: {
      type: String,
      enum: ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"],
      default: "Hazırlanıyor",
    },
    deliveryTracking: { type: String, default: "", maxlength: 120 },
    statusHistory: [{ status: String, changedAt: Date, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }],
    // Kupon bilgileri
    couponCode: {
      type: String,
      default: null,
    },
    couponDiscount: {
      type: Number,
      default: 0,
    },
    subtotalAmount: {
      type: Number,
      default: 0, // İndirim öncesi ara toplam
    },
    discountPercentage: {
      type: Number,
      default: 0,
    },
    // Hesabını silen kullanıcının siparişi: kayıt kalır, kullanıcı bağı anonimleşir
    userDeleted: { type: Boolean, default: false },
    userDeletedAt: { type: Date, default: null },
    // Cihaz bilgileri
    device: {
      platform: {
        type: String,
        enum: ['android', 'ios', 'web', 'unknown'],
        default: 'unknown',
      },
      model: {
        type: String,
        default: '',
      },
      appVersion: {
        type: String,
        default: '',
      },
    },
  },
  { timestamps: true }
);

// Son siparişler ve öneri istatistiği (son 30 gün) / kullanıcının sipariş geçmişi
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });
// Sipariş ekranı: aktif siparişler ve "son değişenler" yenilemesi
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ updatedAt: -1 });
// Bölge filtresi / bölgenin siparişi var mı denetimi
orderSchema.index({ "deliveryZone.id": 1, createdAt: -1 });
// Teyit bekleyen siparişler (pano sayısı)
orderSchema.index({ needsCallback: 1, status: 1 }, { partialFilterExpression: { needsCallback: true } });

const Order = mongoose.model("Order", orderSchema);

export default Order;
