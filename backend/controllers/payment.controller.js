import Order from "../models/order.model.js";

// Sipariş oluşturma yalnızca POST /api/cart/place-order (cart.controller.js) üzerinden yapılır.

// ─────────────────────────────────────────────
// Sipariş Detayı
// ─────────────────────────────────────────────
export const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const filter =
      req.user.role === "admin"
        ? { _id: orderId }
        : { _id: orderId, user: req.user._id };

    const order = await Order.findOne(filter)
      .populate("products.product", "name price")
      .populate("user", "name email");

    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Sipariş detayları alınırken hata:", error);
    res.status(500).json({ message: "Sipariş detayları alınırken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Admin: Siparişleri Listele (sayfalandırmalı)
// ─────────────────────────────────────────────
export const getAdminOrders = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));

    const [orders, total] = await Promise.all([
      Order.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name email")
        .populate("products.product", "name price")
        .lean(),
      Order.countDocuments(),
    ]);

    res.status(200).json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Siparişler alınırken hata:", error);
    res.status(500).json({ message: "Siparişler alınırken hata oluştu", error: error.message });
  }
};
