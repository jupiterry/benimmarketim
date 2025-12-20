/**
 * Version Check Middleware
 * 
 * Eski sürüm uygulamalara (header'da versiyon olmayan) güncelleme uyarısı gönderir.
 * 200 OK dönerek eski uygulamaların crash olmasını engeller.
 * 
 * Strateji: Eski app'ler generic error yerine "Güncelleme Gerekli" içeriği görür.
 */

// Minimum desteklenen uygulama versiyonu
const MIN_SUPPORTED_VERSION = '2.1.0';

// Versiyon karşılaştırma (semver basit)
const compareVersions = (current, minimum) => {
  if (!current) return -1; // Versiyon yoksa eski kabul et
  
  const currentParts = current.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    const curr = currentParts[i] || 0;
    const min = minimumParts[i] || 0;
    if (curr > min) return 1;
    if (curr < min) return -1;
  }
  return 0;
};

// Güncelleme mesajı oluşturucu
const createUpdateResponse = (endpoint) => {
  const baseUpdateMessage = {
    _updateRequired: true,
    title: "🔄 Güncelleme Gerekli",
    message: "Daha iyi bir deneyim için lütfen uygulamanızı güncelleyin!",
    updateUrl: {
      ios: "https://apps.apple.com/tr/app/benim-marketim/id6755792336",
      android: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app"
    }
  };

  // Endpoint'e göre özelleştirilmiş fake response'lar
  const fakeResponses = {
    // Ürünler için
    '/products': {
      success: true,
      products: [{
        _id: "update_required",
        name: "🔄 Güncelleme Gerekli",
        description: "Uygulamanızı güncelleyin ve alışverişe devam edin!",
        price: 0,
        image: "/update-banner.png",
        category: "system",
        isOutOfStock: false,
        isFeatured: true,
        ...baseUpdateMessage
      }]
    },
    
    // Kategoriler için
    '/categories': {
      success: true,
      categories: [{
        _id: "update_required",
        name: "Güncelleme Gerekli",
        image: "/update-banner.png",
        ...baseUpdateMessage
      }]
    },
    
    // Banner'lar için (en etkili!)
    '/banners': {
      success: true,
      banners: [{
        _id: "update_banner",
        title: "🔄 Uygulamanızı Güncelleyin!",
        subtitle: "Yeni özellikler sizi bekliyor",
        image: "/update-banner.png",
        linkUrl: "https://apps.apple.com/tr/app/benim-marketim/id6755792336",
        isActive: true,
        order: 0,
        ...baseUpdateMessage
      }]
    },
    
    // Siparişler için
    '/orders': {
      success: true,
      orders: [],
      message: "Siparişleri görmek için lütfen uygulamanızı güncelleyin.",
      ...baseUpdateMessage
    },
    
    // Sepet için
    '/cart': {
      success: true,
      cart: [],
      message: "Alışverişe devam etmek için uygulamanızı güncelleyin.",
      ...baseUpdateMessage
    },
    
    // Profil için
    '/auth/profile': {
      success: true,
      ...baseUpdateMessage,
      // Kullanıcı login olmuş gibi görünsün ama güncelleme uyarısı gelsin
      name: "Güncelleme Gerekli",
      email: "",
      role: "customer"
    },

    // Settings için
    '/settings': {
      success: true,
      ...baseUpdateMessage,
      minimumOrderAmount: 0,
      deliveryFee: 0,
      orderStartHour: 0,
      orderEndHour: 24,
      deliveryPoints: {
        girlsDorm: { enabled: false },
        boysDorm: { enabled: false }
      }
    },

    // Default - genel mesaj
    'default': {
      success: true,
      data: [],
      ...baseUpdateMessage
    }
  };

  // En uygun response'u bul
  for (const [path, response] of Object.entries(fakeResponses)) {
    if (path !== 'default' && endpoint.includes(path)) {
      return response;
    }
  }
  
  return fakeResponses['default'];
};

/**
 * Version Check Middleware
 * 
 * Kullanım: app.use('/api', versionCheckMiddleware);
 * 
 * Yeni app'ler header gönderir: x-app-version: 2.1.0
 * Eski app'ler göndermez → güncelleme mesajı alır
 */
const versionCheckMiddleware = (req, res, next) => {
  // Web sitesinden gelen istekleri atla (User-Agent kontrolü)
  const userAgent = req.headers['user-agent'] || '';
  const isWebRequest = userAgent.includes('Mozilla') || 
                       userAgent.includes('Chrome') || 
                       userAgent.includes('Safari') ||
                       userAgent.includes('Firefox');
  
  // Web isteklerini geç
  if (isWebRequest && !req.headers['x-app-version']) {
    return next();
  }

  // Versiyon header'ını al
  const appVersion = req.headers['x-app-version'];
  const platform = req.headers['x-app-platform'] || 'unknown';
  
  // Versiyon yoksa veya desteklenmeyen versiyonsa
  if (compareVersions(appVersion, MIN_SUPPORTED_VERSION) < 0) {
    console.log(`⚠️ Eski versiyon tespit edildi: ${appVersion || 'YOK'} (Platform: ${platform})`);
    console.log(`   Endpoint: ${req.method} ${req.originalUrl}`);
    
    // Login/Signup gibi kritik endpoint'leri geç (yoksa kullanıcı hiç giremez)
    const criticalEndpoints = [
      '/auth/login',
      '/auth/signup',
      '/auth/refresh-token',
      '/auth/logout'
    ];
    
    if (criticalEndpoints.some(ep => req.originalUrl.includes(ep))) {
      console.log(`   → Kritik endpoint, geçiriliyor...`);
      return next();
    }
    
    // Fake güncelleme response'u döndür
    const fakeResponse = createUpdateResponse(req.originalUrl);
    console.log(`   → Güncelleme mesajı gönderiliyor`);
    
    return res.status(200).json(fakeResponse);
  }
  
  // Desteklenen versiyon, devam et
  next();
};

/**
 * Versiyonu kontrol eden endpoint
 * GET /api/version/check
 * 
 * Flutter'da kullanım:
 * Response'da updateRequired: true ise güncelleme dialog'u göster
 */
const checkVersionEndpoint = (req, res) => {
  const appVersion = req.headers['x-app-version'];
  const platform = req.headers['x-app-platform'] || 'unknown';
  
  const isOutdated = compareVersions(appVersion, MIN_SUPPORTED_VERSION) < 0;
  
  res.json({
    success: true,
    currentVersion: appVersion || 'unknown',
    minimumVersion: MIN_SUPPORTED_VERSION,
    platform,
    updateRequired: isOutdated,
    updateUrl: {
      ios: "https://apps.apple.com/tr/app/benim-marketim/id6755792336",
      android: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app"
    },
    message: isOutdated 
      ? "Uygulamanızı güncelleyin! Yeni özellikler ve güvenlik güncellemeleri mevcut."
      : "Uygulamanız güncel."
  });
};

export { 
  versionCheckMiddleware, 
  checkVersionEndpoint, 
  MIN_SUPPORTED_VERSION,
  compareVersions 
};
