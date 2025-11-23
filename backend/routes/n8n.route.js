import express from "express";
import { receiveWebhook, testConnection } from "../controllers/n8n.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * n8n webhook endpoint'i
 * Bu endpoint n8n'den gelen webhook'ları alır
 * 
 * Kullanım:
 * POST /api/n8n/webhook
 * 
 * Body örneği:
 * {
 *   "event": "update_order_status",
 *   "data": {
 *     "orderId": "123",
 *     "status": "delivered"
 *   }
 * }
 */
router.post("/webhook", receiveWebhook);

/**
 * Test endpoint - n8n bağlantısını test etmek için
 * GET /api/n8n/test
 */
router.get("/test", testConnection);

export default router;

