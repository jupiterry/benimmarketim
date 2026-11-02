import mongoose from "mongoose";

const weeklyProductSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    weeklyPrice: {
      type: Number,
      required: true,
    },
    discountPercentage: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null, // Opsiyonel - manuel yönetim için null bırakılabilir
    },
    order: {
      type: Number,
      default: 0,
    },
    // Planlı fırsat: isActive:false + scheduled:true + ileri bir startDate ile saklanır. Müşteri uç noktaları
    // yalnızca isActive:true kayıtları okuduğu için başlayana kadar görünmez ve fiyata yansımaz.
    // Başlangıç anı gelince weeklyPrice.service dakikalık işi yayına alır (isActive:true, scheduled:false).
    scheduled: {
      type: Boolean,
      default: false,
    },
    // Fırsat fiyatı belirlendiğindeki ürün liste fiyatı. Liste fiyatı sonradan değişirse panel uyarı
    // gösterir. Eski kayıtlarda yoktur (null).
    listPriceAtStart: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Aynı ürünün birden fazla aktif kaydını engelle
weeklyProductSchema.index({ product: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const WeeklyProduct = mongoose.model("WeeklyProduct", weeklyProductSchema);

export default WeeklyProduct;
