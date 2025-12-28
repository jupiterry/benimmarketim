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
    
    // Platform URL'leri
    const androidUrl = "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app";
    const iosUrl = "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr";
    
    // Sürüm bilgileri (burayı yeni sürüm çıktıkça güncelleyin)
    const response = {
      latest_version: "3.0.1",      // En son yayınlanan sürüm
      minimum_version: "3.0.1",     // Minimum desteklenen sürüm (bundan düşükse zorunlu güncelleme)
      url: platform === 'ios' ? iosUrl : androidUrl
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
