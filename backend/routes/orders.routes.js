import express from "express";
import Order from "../models/order.model.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/user-orders", protectRoute, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    return res.status(200).json(orders);
  } catch (error) {
    return res.status(500).json({ message: "Siparişler alınırken hata oluştu", error: error.message });
  }
});

router.put("/cancel-order", protectRoute, async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ message: "Sipariş bulunamadı" });
    if (["Teslim edildi", "İptal edildi"].includes(order.status)) return res.status(400).json({ message: "Bu sipariş artık iptal edilemez" });
    order.status = "İptal edildi";
    await order.save();
    return res.status(200).json({ success: true, order });
  } catch (error) {
    return res.status(500).json({ message: "Sipariş iptal edilemedi", error: error.message });
  }
});

export default router;
