import express from "express";
import { getCartProducts, addToCart, clearCart, removeFromCart, updateQuantity, placeOrder, syncCart } from "../controllers/cart.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getCartProducts);
router.post("/", protectRoute, addToCart);
router.delete("/", protectRoute, clearCart);
router.delete("/:productId", protectRoute, removeFromCart);
// "/sync" yolu "/:id" ile karışmasın diye ondan önce tanımlanır
router.put("/sync", protectRoute, syncCart);
router.put("/:id", protectRoute, updateQuantity);
router.post("/place-order", protectRoute, placeOrder);

export default router;
