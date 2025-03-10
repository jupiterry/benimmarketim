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
          return /^(\+90|0)?5\d{9}$/.test(v);
        },
        message: "Geçerli bir telefon numarası girin!",
      },
    },
    note: {
      type: String, // Not alanını ekleyin
      default: "",
    },
    status: {
      type: String,
      enum: ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"],
      default: "Hazırlanıyor",
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;