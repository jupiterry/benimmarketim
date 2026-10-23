import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { addressRateLimit } from "../middleware/rateLimit.js";
import {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "../controllers/address.controller.js";

// Mount: /api/addresses — yalnızca oturumdaki kullanıcının kendi adresleri
const router = express.Router();

router.use(protectRoute, addressRateLimit);
router.get("/", listAddresses);
router.post("/", createAddress);
router.put("/:id", updateAddress);
router.delete("/:id", deleteAddress);
router.patch("/:id/default", setDefaultAddress);

export default router;
