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
  },
  {
    timestamps: true,
  }
);

// Aynı ürünün birden fazla aktif kaydını engelle
weeklyProductSchema.index({ product: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const WeeklyProduct = mongoose.model("WeeklyProduct", weeklyProductSchema);

export default WeeklyProduct;
