// Cloudinary URL optimizasyonu için yardımcı fonksiyon
export const optimizeCloudinaryUrl = (url) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url;
};

// Özel boyutlar için yardımcı fonksiyonlar
export const getProductThumbnail = (url) => {
  return url;
};

export const getProductImage = (url) => {
  return url;
};

export const getProductGalleryImage = (url) => {
  return url;
}; 