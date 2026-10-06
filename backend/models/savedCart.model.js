import mongoose from "mongoose";

// Favori sepetler: müşterinin adını koyup kaydettiği ve sonra tek dokunuşla yeniden kullandığı ürün listeleri.
// Fiyat saklanmaz; liste her gösterildiğinde güncel fiyat ve stok katalogdan okunur.
const savedCartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  items: [{
    _id: false,
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1, max: 20 },
  }],
}, { timestamps: true });

export default mongoose.model("SavedCart", savedCartSchema);
