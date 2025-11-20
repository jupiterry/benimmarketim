// Cart Reminder Routes
import express from 'express';
import {
  triggerCartReminders,
  updateFCMToken,
  togglePushNotifications,
  getCartReminderStats,
} from '../controllers/cartReminder.controller.js';
import { protectRoute, adminRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

// Manual trigger (admin only)
router.post('/trigger', protectRoute, adminRoute, triggerCartReminders);

// User endpoints
router.post('/fcm-token', protectRoute, updateFCMToken);
router.post('/toggle-notifications', protectRoute, togglePushNotifications);

// Statistics (admin only)
router.get('/stats', protectRoute, adminRoute, getCartReminderStats);

export default router;

