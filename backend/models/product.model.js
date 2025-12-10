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
      index: true,
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
      index: true,
    },
    isHidden: {
      type: Boolean,
      default: false,
      index: true,
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

// Text indeksini oluştur
productSchema.index({ name: "text", description: "text", brand: "text" });

// Composite index'ler (sık kullanılan sorgular için)
// Kategoriye göre görünür ürünler
productSchema.index({ category: 1, isHidden: 1 });
// Öne çıkan ve görünür ürünler
productSchema.index({ isFeatured: 1, isHidden: 1 });
// İndirimli ve görünür ürünler
productSchema.index({ isDiscounted: 1, isHidden: 1 });

const Product = mongoose.model("Product", productSchema);

export default Product;