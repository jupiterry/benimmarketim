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
    deliveryPoint: {
      type: String,
      enum: ["girlsDorm", "boysDorm"],
      required: true,
    },
    deliveryPointName: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"],
      default: "Hazırlanıyor",
    },
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

const Order = mongoose.model("Order", orderSchema);

export default Order;