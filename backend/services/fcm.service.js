// Firebase Cloud Messaging service for push notifications
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
let firebaseInitialized = false;

export const initializeFirebase = () => {
  if (firebaseInitialized) {
    return;
  }

  try {
    // Check if Firebase Admin is already initialized
    if (admin.apps.length === 0) {
      // Initialize with service account or environment variables
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      
      if (serviceAccount) {
        // If service account is provided as JSON string in env
        const serviceAccountJson = JSON.parse(serviceAccount);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountJson),
        });
      } else if (process.env.FIREBASE_PROJECT_ID) {
        // Initialize with individual environment variables
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
      } else {
        // Firebase credentials yoksa sessizce devam et (opsiyonel özellik)
        // Sadece ilk başlatmada bir kez log'la
        if (!firebaseInitialized) {
          console.log('Firebase Admin SDK: Credentials bulunamadı, push notification özelliği devre dışı.');
        }
        return;
      }
    }
    
    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
  }
};

/**
 * Send push notification to a single device
 * @param {string} fcmToken - FCM token of the device
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 * @returns {Promise<boolean>} - Success status
 */
export const sendPushNotification = async (fcmToken, notification, data = {}) => {
  if (!firebaseInitialized) {
    initializeFirebase();
  }

  if (!fcmToken) {
    // FCM token yoksa sessizce false döndür (opsiyonel özellik)
    return false;
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title || 'Benim Marketim',
        body: notification.body || '',
        ...notification,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('Successfully sent push notification:', response);
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    
    // Handle invalid token errors
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      console.warn('Invalid or unregistered FCM token:', fcmToken);
      // You might want to remove this token from the database
      return false;
    }
    
    return false;
  }
};

/**
 * Send push notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 * @returns {Promise<object>} - Results with success and failure counts
 */
export const sendBulkPushNotifications = async (fcmTokens, notification, data = {}) => {
  if (!firebaseInitialized) {
    initializeFirebase();
  }

  if (!fcmTokens || fcmTokens.length === 0) {
    return { success: 0, failure: 0 };
  }

  try {
    const messages = fcmTokens
      .filter(token => token) // Filter out null/undefined tokens
      .map(token => ({
        token,
        notification: {
          title: notification.title || 'Benim Marketim',
          body: notification.body || '',
          ...notification,
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }));

    if (messages.length === 0) {
      return { success: 0, failure: 0 };
    }

    const response = await admin.messaging().sendEach(messages);
    
    const results = {
      success: response.successCount,
      failure: response.failureCount,
    };

    // Log failed tokens
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.warn(`Failed to send to token ${fcmTokens[idx]}:`, resp.error);
        }
      });
    }

    return results;
  } catch (error) {
    console.error('Error sending bulk push notifications:', error);
    return { success: 0, failure: fcmTokens.length };
  }
};

// Initialize Firebase on module load (opsiyonel - credentials yoksa sessizce devam eder)
try {
  initializeFirebase();
} catch (error) {
  // Firebase initialization hatası ana uygulamayı etkilemesin
  // Sadece push notification özelliği çalışmayacak
}

