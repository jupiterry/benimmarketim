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
      required: true, // ✅ Adresin şehir kısmı zorunlu hale getirildi
    },
    phone: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^(\+90|0)?5\d{9}$/.test(v); // 📌 Türkiye telefon formatına uygun olmalı.
        },
        message: "Geçerli bir telefon numarası girin!"
      },
    },
    couponCode: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["Hazırlanıyor", "Yolda", "Teslim Edildi"],
      default: "Hazırlanıyor", // ✅ Sipariş durumunu ekledik
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
