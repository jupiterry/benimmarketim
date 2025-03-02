import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, text: true,
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
    isHidden: { // Gizleme alanı
      type: Boolean,
      default: false, // Varsayılan olarak görünür
    },
    isOutOfStock: { // Gizleme alanı
      type: Boolean,
      default: false, // Varsayılan olarak false
    },
    order: { 
    type: Number,
    default: 0 
    },
  },
  { timestamps: true }
);

// Text indeksini oluştur
productSchema.index({ name: "text", description: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;