// Cloudinary URL optimizasyonu için yardımcı fonksiyon
export const optimizeCloudinaryUrl = (url, options = {}) => {
  if (!url || !url.includes('cloudinary.com')) return url;

  // URL'yi parçalara ayır
  const [baseUrl, ...rest] = url.split('/upload/');
  
  // Varsayılan optimizasyon parametreleri
  const defaultOptions = {
    quality: 'auto:eco', // Daha düşük kalite ama daha hızlı yükleme
    fetch_format: 'auto', // WebP desteği varsa WebP kullanır
    dpr: 'auto', // Ekran çözünürlüğüne göre otomatik ayarlama
    loading: 'lazy',
    format: 'webp', // WebP formatını zorla
    flags: 'progressive', // Progressive loading
  };

  // Kullanıcı tarafından verilen seçenekleri varsayılan seçeneklerle birleştir
  const finalOptions = { ...defaultOptions, ...options };

  // Optimizasyon parametrelerini oluştur
  const transformations = Object.entries(finalOptions)
    .filter(([_, value]) => value !== undefined) // undefined değerleri filtrele
    .map(([key, value]) => `${key}_${value}`)
    .join(',');

  // Yeni URL'yi oluştur
  return `${baseUrl}/upload/f_auto,q_auto:eco/${rest.join('/upload/')}`;
};

// Özel boyutlar için yardımcı fonksiyonlar
export const getProductThumbnail = (url) => {
  return optimizeCloudinaryUrl(url, {
    width: 200,
    height: 200,
    crop: 'fill',
    quality: 'auto:eco',
    format: 'webp',
    flags: 'progressive'
  });
};

export const getProductImage = (url) => {
  return optimizeCloudinaryUrl(url, {
    width: 800,
    quality: 'auto:eco',
    format: 'webp',
    flags: 'progressive'
  });
};

export const getProductGalleryImage = (url) => {
  return optimizeCloudinaryUrl(url, {
    width: 400,
    height: 400,
    crop: 'fill',
    quality: 'auto:eco',
    format: 'webp',
    flags: 'progressive'
  });
}; 