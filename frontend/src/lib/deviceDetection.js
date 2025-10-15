// Device detection utility
export const detectDeviceType = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Mobile detection
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
    // Check if it's a tablet
    if (/ipad|android(?!.*mobile)/i.test(userAgent) || 
        (window.innerWidth >= 768 && window.innerWidth <= 1024)) {
      return 'tablet';
    }
    return 'mobile';
  }
  
  // Desktop detection
  if (/windows|macintosh|linux/i.test(userAgent) && !/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
    return 'desktop';
  }
  
  // Fallback based on screen size
  if (window.innerWidth >= 1024) {
    return 'desktop';
  } else if (window.innerWidth >= 768) {
    return 'tablet';
  } else {
    return 'mobile';
  }
};

// Get device icon
export const getDeviceIcon = (deviceType) => {
  switch (deviceType) {
    case 'desktop':
      return '🖥️';
    case 'mobile':
      return '📱';
    case 'tablet':
      return '📱';
    default:
      return '❓';
  }
};

// Get device name in Turkish
export const getDeviceName = (deviceType) => {
  switch (deviceType) {
    case 'desktop':
      return 'Bilgisayar';
    case 'mobile':
      return 'Telefon';
    case 'tablet':
      return 'Tablet';
    default:
      return 'Bilinmiyor';
  }
};
