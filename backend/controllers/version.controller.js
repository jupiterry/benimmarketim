/**
 * Version Check Controller
 * Mobil uygulama için sürüm kontrolü API endpoint'i
 */

import Settings from "../models/settings.model.js";

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
 *   "url": "https://play.google.com/store/apps/details?id=...",
 *   "force_update": false
 * }
 */
export const checkVersion = async (req, res) => {
  try {
    const platform = req.query.platform || 'android'; // 'android' veya 'ios'
    
    // Ayarlardan versiyon bilgisini al
    const settings = await Settings.getSettings();
    const appVersion = settings.appVersion || {};
    
    // Varsayılan store URL'leri
    const defaultAndroidUrl = "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app";
    const defaultIosUrl = "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr";
    
    // Platform'a göre store URL seç
    const storeUrl = platform === 'ios' 
      ? (appVersion.iosStoreUrl || defaultIosUrl)
      : (appVersion.androidStoreUrl || defaultAndroidUrl);
    
    const response = {
      latest_version: appVersion.latestVersion || "3.0.1",
      minimum_version: appVersion.minimumVersion || "3.0.1",
      url: storeUrl,
      force_update: appVersion.forceUpdate || false
    };
    
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
