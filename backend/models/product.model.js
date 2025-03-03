import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      text: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      min: 0,
      required: true,
    },
    image: {
      type: String,
      required: [true, "Image is required"],
    },
    category: {
      type: String,
      required: true,
    },
    subcategory: {
      type: String,
      default: "", // Alt kategori için yeni alan
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false, // Varsayılan olarak görünür
    },
    isOutOfStock: {
      type: Boolean,
      default: false, // Varsayılan olarak false
    },
    order: {
      type: Number,
      default: 0,
    },
    brand: { // Yeni eklenen brand alanı
      type: String,
      required: false, // Zorunlu değil, isteğe bağlı
      default: "", // Varsayılan olarak boş string
    },
  },
  { timestamps: true }
);

// Text indeksini oluştur
productSchema.index({ name: "text", description: "text", brand: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;