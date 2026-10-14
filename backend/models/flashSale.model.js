import mongoose from "mongoose";

const flashSaleSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      default: "",
    },
    discountPercentage: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // İndirim şu an ürüne uygulanmış mı? (zamanlanmış görev başlatır/bitirir)
    applied: {
      type: Boolean,
      default: false,
    },
    appliedPrice: {
      type: Number,
      default: null,
    },
    // Kampanya bitince geri yüklenecek, ürünün önceki indirim durumu
    previousIsDiscounted: {
      type: Boolean,
      default: false,
    },
    previousDiscountedPrice: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// İndeksleme
flashSaleSchema.index({ product: 1, startDate: 1, endDate: 1 });
flashSaleSchema.index({ isActive: 1, applied: 1, startDate: 1, endDate: 1 });

const FlashSale = mongoose.model("FlashSale", flashSaleSchema);

export default FlashSale;

