import express from "express";
import { getCartProducts, addToCart, clearCart, removeFromCart, updateQuantity, placeOrder } from "../controllers/cart.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getCartProducts);
router.post("/", protectRoute, addToCart);
router.delete("/", protectRoute, clearCart);
router.delete("/:productId", protectRoute, removeFromCart);
router.put("/:id", protectRoute, updateQuantity);
router.post("/place-order", protectRoute, placeOrder);

export default router;
