import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    isDiscounted: {
      type: Boolean,
      default: false,
    },
    discountedPrice: {
      type: Number,
      default: null,
    },
    category: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      default: '',
    },
    thumbnail: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: "",
    },
    isOutOfStock: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
    // Şu an ürüne uygulanmış flash sale (flashSale.service yazar ve kampanya bitince temizler).
    // İstemciye ham hâliyle değil, weeklyPrice.service üzerinden yalnızca geçerliyken gider.
    flashSale: {
      type: new mongoose.Schema(
        {
          sale: { type: mongoose.Schema.Types.ObjectId, ref: "FlashSale" },
          discountPercentage: Number,
          price: Number,
          startDate: Date,
          endDate: Date,
        },
        { _id: false }
      ),
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Text indeksini oluştur
productSchema.index({ name: "text", description: "text" });
// Kategori sayfası: eşitlik + vitrin sırası (getProducts aynı collation ile sorgular)
productSchema.index({ category: 1, order: 1 }, { collation: { locale: "en", strength: 2 } });
// Öne çıkanlar / fırsatlar sorguları
productSchema.index({ isHidden: 1, isDiscounted: 1 });
// Son güncelleme (Last-Modified / ürün listesi önbellek anahtarı)
productSchema.index({ updatedAt: -1 });

const Product = mongoose.model("Product", productSchema);

export default Product;