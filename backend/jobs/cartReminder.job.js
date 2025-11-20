// Cart Reminder Cron Job
import cron from 'node-cron';
import { checkAndSendCartReminders } from '../services/cartReminder.service.js';

// Run every hour at minute 0 (e.g., 1:00, 2:00, 3:00, etc.)
const CART_REMINDER_SCHEDULE = '0 * * * *'; // Every hour

let cartReminderJob = null;

/**
 * Start the cart reminder cron job
 */
export const startCartReminderJob = () => {
  if (cartReminderJob) {
    console.log('Cart reminder job is already running');
    return;
  }

  console.log('Starting cart reminder cron job...');
  console.log(`Schedule: ${CART_REMINDER_SCHEDULE} (every hour)`);

  cartReminderJob = cron.schedule(CART_REMINDER_SCHEDULE, async () => {
    console.log('Running cart reminder job...');
    const startTime = Date.now();

    try {
      const result = await checkAndSendCartReminders(24); // 24 hours threshold
      const duration = Date.now() - startTime;

      console.log('Cart reminder job completed:', {
        ...result,
        duration: `${duration}ms`,
      });
    } catch (error) {
      console.error('Cart reminder job error:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Europe/Istanbul', // Adjust to your timezone
  });

  console.log('Cart reminder cron job started successfully');
};

/**
 * Stop the cart reminder cron job
 */
export const stopCartReminderJob = () => {
  if (cartReminderJob) {
    cartReminderJob.stop();
    cartReminderJob = null;
    console.log('Cart reminder cron job stopped');
  }
};

/**
 * Get the status of the cart reminder job
 */
export const getCartReminderJobStatus = () => {
  return {
    running: cartReminderJob !== null,
    schedule: CART_REMINDER_SCHEDULE,
  };
};

