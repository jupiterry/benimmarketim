// Cart Reminder Service - Handles abandoned cart notifications
import User from '../models/user.model.js';
import Product from '../models/product.model.js';
import { sendPushNotification } from './fcm.service.js';

/**
 * Find users with abandoned carts and send reminders
 * @param {number} hoursThreshold - Hours since last cart update (default: 24)
 * @returns {Promise<object>} - Results with sent count and errors
 */
export const checkAndSendCartReminders = async (hoursThreshold = 24) => {
  try {
    const thresholdDate = new Date();
    thresholdDate.setHours(thresholdDate.getHours() - hoursThreshold);

    // Find users with:
    // 1. Non-empty cart (cartItems.length > 0)
    // 2. Cart not updated in the last X hours
    // 3. Push notifications enabled
    // 4. Valid FCM token
    const usersWithAbandonedCarts = await User.find({
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
    })
      .populate('cartItems.product', 'name price image')
      .lean();

    console.log(`Found ${usersWithAbandonedCarts.length} users with abandoned carts`);

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (const user of usersWithAbandonedCarts) {
      try {
        // Calculate cart total
        let cartTotal = 0;
        let itemCount = 0;
        const productNames = [];

        for (const item of user.cartItems) {
          if (item.product) {
            const price = item.product.discountedPrice || item.product.price || 0;
            cartTotal += price * (item.quantity || 1);
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
        const notificationBody = `Sepetinizde ${itemCount} ürün var (${productPreview}${moreText}). Siparişinizi tamamlamayı unutmayın!`;

        // Send push notification
        const success = await sendPushNotification(
          user.fcmToken,
          {
            title: 'Sepetinizi Tamamlayın! 🛒',
            body: notificationBody,
          },
          {
            type: 'cart_reminder',
            cartTotal: cartTotal.toString(),
            itemCount: itemCount.toString(),
            userId: user._id.toString(),
          }
        );

        if (success) {
          successCount++;
          console.log(`Cart reminder sent to user ${user._id}`);
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

