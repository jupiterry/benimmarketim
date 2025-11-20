// Cart Reminder Controller
import { checkAndSendCartReminders } from '../services/cartReminder.service.js';
import User from '../models/user.model.js';

/**
 * Manually trigger cart reminder check (for testing/admin)
 * GET /api/cart-reminders/trigger
 */
export const triggerCartReminders = async (req, res) => {
  try {
    const { hoursThreshold = 24 } = req.query;
    const threshold = parseInt(hoursThreshold);

    if (isNaN(threshold) || threshold < 1) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz saat eşiği. Minimum 1 saat olmalıdır.',
      });
    }

    console.log(`Manually triggering cart reminders with ${threshold} hours threshold...`);
    const result = await checkAndSendCartReminders(threshold);

    res.status(200).json({
      success: true,
      message: 'Sepet hatırlatmaları kontrol edildi',
      ...result,
    });
  } catch (error) {
    console.error('Error in triggerCartReminders:', error);
    res.status(500).json({
      success: false,
      message: 'Sepet hatırlatmaları tetiklenirken hata oluştu',
      error: error.message,
    });
  }
};

/**
 * Update user's FCM token
 * POST /api/cart-reminders/fcm-token
 */
export const updateFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const user = req.user;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token gerekli',
      });
    }

    user.fcmToken = fcmToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'FCM token güncellendi',
    });
  } catch (error) {
    console.error('Error updating FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'FCM token güncellenirken hata oluştu',
      error: error.message,
    });
  }
};

/**
 * Toggle push notifications for user
 * POST /api/cart-reminders/toggle-notifications
 */
export const togglePushNotifications = async (req, res) => {
  try {
    const user = req.user;
    user.pushNotificationsEnabled = !user.pushNotificationsEnabled;
    await user.save();

    res.status(200).json({
      success: true,
      message: `Push bildirimleri ${user.pushNotificationsEnabled ? 'açıldı' : 'kapatıldı'}`,
      pushNotificationsEnabled: user.pushNotificationsEnabled,
    });
  } catch (error) {
    console.error('Error toggling push notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Push bildirimleri değiştirilirken hata oluştu',
      error: error.message,
    });
  }
};

/**
 * Get cart reminder statistics (admin only)
 * GET /api/cart-reminders/stats
 */
export const getCartReminderStats = async (req, res) => {
  try {
    const hoursThreshold = parseInt(req.query.hoursThreshold) || 24;
    const thresholdDate = new Date();
    thresholdDate.setHours(thresholdDate.getHours() - hoursThreshold);

    // Count users with abandoned carts
    const abandonedCartsCount = await User.countDocuments({
      $and: [
        { cartItems: { $exists: true, $ne: [] } },
        {
          $or: [
            { cartLastUpdated: { $exists: false } },
            { cartLastUpdated: { $lt: thresholdDate } },
          ],
        },
      ],
    });

    // Count users with FCM tokens
    const usersWithFCM = await User.countDocuments({
      fcmToken: { $exists: true, $ne: null, $ne: '' },
      pushNotificationsEnabled: true,
    });

    // Count users eligible for reminders
    const eligibleUsers = await User.countDocuments({
      $and: [
        { cartItems: { $exists: true, $ne: [] } },
        {
          $or: [
            { cartLastUpdated: { $exists: false } },
            { cartLastUpdated: { $lt: thresholdDate } },
          ],
        },
        { pushNotificationsEnabled: true },
        { fcmToken: { $exists: true, $ne: null, $ne: '' } },
      ],
    });

    res.status(200).json({
      success: true,
      stats: {
        abandonedCartsCount,
        usersWithFCM,
        eligibleUsers,
        hoursThreshold,
      },
    });
  } catch (error) {
    console.error('Error getting cart reminder stats:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikler alınırken hata oluştu',
      error: error.message,
    });
  }
};

