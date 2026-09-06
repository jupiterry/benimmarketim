import Settings from "../models/settings.model.js";

/**
 * Version Check Controller
 * Mobil uygulama için sürüm kontrolü API endpoint'i
 */

/**
 * GET /api/version-check
 * Mobil uygulamanın sürüm kontrolü için endpoint
 * 
 * Query Parameters:
 * - platform: 'android' veya 'ios' (opsiyonel, varsayılan: 'android')
 * 
 * Response:
 * {
 *   "latest_version": "2.1.0",
 *   "minimum_version": "2.0.9",
 *   "url": "https://play.google.com/store/apps/details?id=..."
 * }
 */
export const checkVersion = async (req, res) => {
  try {
    const platform = req.query.platform || 'android'; // 'android' veya 'ios'
    
    const { appVersion } = await Settings.getSettings();
    
    // Yönetim panelinde kaydedilen güncel sürüm bilgileri.
    const response = {
      latest_version: appVersion.latestVersion,
      minimum_version: appVersion.minimumVersion,
      force_update: appVersion.forceUpdate,
      url: platform === 'ios' ? appVersion.iosStoreUrl : appVersion.androidStoreUrl
    };
    
    res.set("Cache-Control", "no-store");
    res.status(200).json(response);
  } catch (error) {
    console.error('Version check endpoint hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sürüm bilgisi alınırken hata oluştu',
      error: error.message
    });
  }
};
