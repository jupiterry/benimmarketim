// Cart Reminder Service - Handles abandoned cart notifications
// Bildirimler push.service (OneSignal) üzerinden gönderilir; müşteri kampanya bildirimlerini
// kapattıysa hatırlatma gitmez. Aynı sepet için yalnızca bir kez hatırlatılır.
import User from '../models/user.model.js';
import { sendPushToUsers } from './push.service.js';

const MAX_CART_AGE_DAYS = 14; // Çok eski sepetler için hatırlatma gönderilmez
const QUIET_HOURS = { start: 10, end: 22 }; // İstanbul saatiyle yalnızca 10:00–21:59 arası gönderilir

const istanbulHour = (date) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' }).format(date)) % 24;

// Hatırlatma alacak kullanıcıların sorgusu (istatistik ucu da aynı sorguyu kullanır)
export const buildCartReminderFilter = (hoursThreshold = 24, now = new Date()) => {
  const thresholdDate = new Date(now.getTime() - hoursThreshold * 60 * 60 * 1000);
  const oldestDate = new Date(now.getTime() - MAX_CART_AGE_DAYS * 24 * 60 * 60 * 1000);
  return {
    'cartItems.0': { $exists: true },
    cartLastUpdated: { $lt: thresholdDate, $gte: oldestDate },
    pushNotificationsEnabled: { $ne: false },
    'notificationPreferences.campaigns': { $ne: false },
    // Sepet son değiştikten sonra hatırlatma gönderilmediyse
    $or: [{ cartReminderSentAt: null }, { $expr: { $lt: ['$cartReminderSentAt', '$cartLastUpdated'] } }],
  };
};

/**
 * Find users with abandoned carts and send reminders
 * @param {number} hoursThreshold - Hours since last cart update (default: 24)
 * @param {{respectQuietHours?: boolean, now?: Date}} options
 * @returns {Promise<object>} - Results with sent count and errors
 */
export const checkAndSendCartReminders = async (hoursThreshold = 24, { respectQuietHours = false, now = new Date() } = {}) => {
  try {
    if (respectQuietHours) {
      const hour = istanbulHour(now);
      if (hour < QUIET_HOURS.start || hour >= QUIET_HOURS.end) {
        return { success: true, skipped: 'quiet_hours', totalUsers: 0, successCount: 0, failureCount: 0, errors: [] };
      }
    }

    const usersWithAbandonedCarts = await User.find(buildCartReminderFilter(hoursThreshold, now))
      .select('cartItems')
      .populate('cartItems.product', 'name isHidden isOutOfStock')
      .limit(500)
      .lean();

    console.log(`Found ${usersWithAbandonedCarts.length} users with abandoned carts`);

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (const user of usersWithAbandonedCarts) {
      try {
        let itemCount = 0;
        const productNames = [];

        for (const item of user.cartItems) {
          if (item.product && !item.product.isHidden && !item.product.isOutOfStock) {
            itemCount += item.quantity || 1;
            productNames.push(item.product.name);
          }
        }

        if (itemCount === 0) {
          continue; // Skip if no valid products in cart
        }

        // Create notification message
        const productPreview = productNames.slice(0, 2).join(', ');
        const moreText = productNames.length > 2 ? ` ve ${productNames.length - 2} ürün daha` : '';
        const notificationBody = `Sepetinizde ${itemCount} ürün var (${productPreview}${moreText}). Siparişinizi tamamlamayı unutmayın!`.slice(0, 170);

        const result = await sendPushToUsers(
          [user._id],
          { title: 'Sepetiniz sizi bekliyor 🛒', body: notificationBody },
          { type: 'cart_reminder', route: '/cart' },
          { category: 'campaigns', collapseId: 'cart-reminder' }
        );

        if (result.sent) {
          successCount++;
          // Aynı sepet için tekrar hatırlatma gönderilmesin
          await User.updateOne({ _id: user._id }, { $set: { cartReminderSentAt: now } });
        } else {
          failureCount++;
          errors.push(`Failed to send to user ${user._id}`);
        }
      } catch (error) {
        failureCount++;
        errors.push(`Error processing user ${user._id}: ${error.message}`);
        console.error(`Error sending cart reminder to user ${user._id}:`, error);
      }
    }

    return {
      success: true,
      totalUsers: usersWithAbandonedCarts.length,
      successCount,
      failureCount,
      errors: errors.slice(0, 10), // Limit errors to first 10
    };
  } catch (error) {
    console.error('Error in checkAndSendCartReminders:', error);
    return {
      success: false,
      error: error.message,
      totalUsers: 0,
      successCount: 0,
      failureCount: 0,
      errors: [error.message],
    };
  }
};
