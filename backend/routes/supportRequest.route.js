import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { acceptSupportRequest, closeSupportRequest, listSupportRequests } from "../controllers/supportRequest.controller.js";

const router = express.Router();
router.use(protectRoute, adminRoute);
router.get("/", listSupportRequests);
router.post("/:id/accept", acceptSupportRequest);
router.post("/:id/close", closeSupportRequest);
export default router;
