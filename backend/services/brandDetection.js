import axios from 'axios';

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

const commonBrands = {
  'ülker': ['coco star', 'çokoprens', 'dido', 'halley'],
  'eti': ['burçak', 'negro', 'popkek', 'hoşbeş'],
  'torku': ['banada', 'çokofest'],
  'nestle': ['kitkat', 'crunch'],
  'coca cola': ['coca-cola', 'fanta', 'sprite'],
  'pepsi': ['pepsi', 'yedigün', 'fruko'],
  'sütaş': ['ayran', 'süt', 'yoğurt'],
  'pınar': ['süt', 'ayran', 'yoğurt'],
  'doritos': ['taco', 'nacho'],
  'ruffles': ['original', 'ketçap'],
  'lays': ['klasik', 'fırından'],
  'tadım': ['kuruyemiş', 'fıstık', 'kaju'],
  'çaykur': ['çay', 'rize'],
  'doğuş': ['çay', 'poşet'],
  'lipton': ['ice tea', 'çay'],
  'dimes': ['meyve suyu', 'nektar']
};

// İsimden marka tahmin etme fonksiyonu
const guessBrandFromName = (productName) => {
  const lowercaseName = productName.toLowerCase();
  
  // İsmin ilk kelimesi genelde marka olur
  const firstWord = lowercaseName.split(' ')[0];
  
  // Eğer ilk kelime markaysa direkt döndür
  if (Object.keys(commonBrands).includes(firstWord)) {
    return firstWord;
  }
  
  // Yaygın markaları kontrol et
  for (const [brand, keywords] of Object.entries(commonBrands)) {
    if (keywords.some(keyword => lowercaseName.includes(keyword))) {
      return brand;
    }
  }
  
  return null;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const detectBrand = async (productName) => {
  try {
    // Önce yerel tahmin yap
    const guessedBrand = guessBrandFromName(productName);
    if (guessedBrand) {
      return guessedBrand;
    }

    // Google araması yapmadan önce 1 saniye bekle
    await sleep(1000);

    // Google araması yap
    const searchQuery = `${productName} marka ürün`;
    const response = await axios.get(
      `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(searchQuery)}`
    );

    // İlk sonuçları analiz et
    const searchResults = response.data.items || [];
    const possibleBrands = searchResults
      .slice(0, 3)
      .map(result => {
        const title = result.title.toLowerCase();
        const snippet = result.snippet.toLowerCase();
        
        // Yaygın markaları ara
        for (const brand of Object.keys(commonBrands)) {
          if (title.includes(brand) || snippet.includes(brand)) {
            return brand;
          }
        }
        return null;
      })
      .filter(Boolean);

    // En çok tekrar eden markayı döndür
    if (possibleBrands.length > 0) {
      const brandCounts = possibleBrands.reduce((acc, brand) => {
        acc[brand] = (acc[brand] || 0) + 1;
        return acc;
      }, {});

      return Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    }

    return 'Bilinmeyen Marka';
  } catch (error) {
    console.error('Marka tespiti hatası:', error);
    // API hatası durumunda yerel tahmini kullan
    const guessedBrand = guessBrandFromName(productName);
    return guessedBrand || 'Bilinmeyen Marka';
  }
}; 