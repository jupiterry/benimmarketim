import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { loginRateLimiter } from "../middleware/loginRateLimit.js";
import {
  ackOrderHandler,
  alarmStatusHandler,
  changeOrderStatusHandler,
  getPendingHandler,
  logoutDeviceHandler,
  pairDeviceHandler,
  requireAlarmDevice,
  revokeDeviceHandler,
  todayOrdersHandler,
} from "../controllers/orderAlarm.controller.js";

// Sipariş alarmı Android uygulaması (siparis-alarm-android/). Telefon uçları cihaz anahtarıyla,
// yönetim uçları yönetici oturumuyla korunur.
const router = express.Router();

router.post("/pair", loginRateLimiter, pairDeviceHandler);
router.get("/pending", requireAlarmDevice, getPendingHandler);
router.post("/orders/:orderId/ack", requireAlarmDevice, ackOrderHandler);
router.get("/orders/today", requireAlarmDevice, todayOrdersHandler);
router.put("/orders/:orderId/status", requireAlarmDevice, changeOrderStatusHandler);
router.post("/logout", requireAlarmDevice, logoutDeviceHandler);

router.get("/status", protectRoute, adminRoute, alarmStatusHandler);
router.delete("/devices/:deviceId", protectRoute, adminRoute, auditAdminAction("Sipariş alarmı telefonu kaldırıldı", (req) => String(req.params.deviceId)), revokeDeviceHandler);

export default router;
