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
    discountedPrice: {
      type: Number,
      default: null,
      validate: {
        validator: function(value) {
          return value === null || (value >= 0 && value <= this.price);
        },
        message: "İndirimli fiyat normal fiyattan yüksek olamaz ve 0'dan küçük olamaz"
      }
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
      default: "",
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    isOutOfStock: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
    brand: {
      type: String,
      required: false,
      default: "",
    },
  },
  { timestamps: true }
);

// Text indeksini oluştur
productSchema.index({ name: "text", description: "text", brand: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;