// Sipariş saatleri kontrolü için yardımcı fonksiyonlar

/**
 * Sipariş saatleri içinde olup olmadığını kontrol eder
 * @param {Object} settings - Ayarlar objesi (orderStartHour, orderStartMinute, orderEndHour, orderEndMinute)
 * @returns {boolean} - Sipariş saatleri içindeyse true
 */
export const isWithinOrderHours = (settings) => {
  if (!settings) return false;
  
  const { orderStartHour, orderStartMinute, orderEndHour, orderEndMinute } = settings;
  
  // Türkiye saatine göre şimdiki zamanı hesapla
  const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const currentHour = nowTr.getHours();
  const currentMinute = nowTr.getMinutes();
  
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const startTimeInMinutes = orderStartHour * 60 + orderStartMinute;
  const endTimeInMinutes = orderEndHour * 60 + orderEndMinute;
  
  // Gece yarısını geçen saat aralığını doğru şekilde kontrol et
  let isWithinHours;
  if (startTimeInMinutes < endTimeInMinutes) {
    // Normal durum: Başlangıç saati, bitiş saatinden önce (aynı gün içinde)
    isWithinHours = currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
  } else {
    // Gece yarısını geçen durum: (ör: 10:00'dan 01:00'a)
    isWithinHours = currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
  }
  
  return isWithinHours;
};

/**
 * Sipariş saatleri mesajını oluşturur
 * @param {Object} settings - Ayarlar objesi
 * @returns {string} - Kullanıcıya gösterilecek mesaj
 */
export const getOrderHoursMessage = (settings) => {
  if (!settings) return "Sipariş saatleri ayarları bulunamadı!";
  
  const { orderStartHour, orderStartMinute, orderEndHour, orderEndMinute } = settings;
  
  const formatTime = (hour, minute) => {
    return `${hour}:${minute.toString().padStart(2, '0')}`;
  };
  
  const startTime = formatTime(orderStartHour, orderStartMinute);
  const endTime = formatTime(orderEndHour, orderEndMinute);
  
  // Gece yarısını geçen durum kontrolü
  const isNextDay = orderStartHour > orderEndHour;
  
  if (isNextDay) {
    return `Sipariş saatleri: ${startTime} - ${endTime} (ertesi gün)`;
  } else {
    return `Sipariş saatleri: ${startTime} - ${endTime}`;
  }
};

/**
 * Sipariş saatleri dışında mı kontrol eder
 * @param {Object} settings - Ayarlar objesi
 * @returns {Object} - { isOutside: boolean, message: string, nextOrderTime: string }
 */
export const getOrderHoursStatus = (settings) => {
  if (!settings) {
    return {
      isOutside: true,
      message: "Sipariş saatleri ayarları bulunamadı!",
      nextOrderTime: null
    };
  }
  
  const isWithin = isWithinOrderHours(settings);
  
  if (isWithin) {
    return {
      isOutside: false,
      message: "Sipariş alınıyor!",
      nextOrderTime: null
    };
  }
  
  // Sipariş saatleri dışındaysa, bir sonraki sipariş zamanını hesapla
  const { orderStartHour, orderStartMinute } = settings;
  const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const currentHour = nowTr.getHours();
  const currentMinute = nowTr.getMinutes();
  
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const startTimeInMinutes = orderStartHour * 60 + orderStartMinute;
  
  let nextOrderTime;
  if (currentTimeInMinutes < startTimeInMinutes) {
    // Bugün henüz sipariş saati gelmemiş
    nextOrderTime = `${orderStartHour}:${orderStartMinute.toString().padStart(2, '0')}`;
  } else {
    // Bugün sipariş saati geçmiş, yarın bekleniyor
    const tomorrow = new Date(nowTr);
    tomorrow.setDate(tomorrow.getDate() + 1);
    nextOrderTime = `Yarın ${orderStartHour}:${orderStartMinute.toString().padStart(2, '0')}`;
  }
  
  return {
    isOutside: true,
    message: getOrderHoursMessage(settings),
    nextOrderTime
  };
};

/**
 * Sipariş saatleri için countdown hesaplar
 * @param {Object} settings - Ayarlar objesi
 * @returns {Object} - { hours: number, minutes: number, seconds: number, totalSeconds: number }
 */
export const getOrderHoursCountdown = (settings) => {
  if (!settings) return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  
  const { orderStartHour, orderStartMinute } = settings;
  const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  
  // Bir sonraki sipariş zamanını hesapla
  const nextOrderTime = new Date(nowTr);
  nextOrderTime.setHours(orderStartHour, orderStartMinute, 0, 0);
  
  // Eğer bugün sipariş saati geçmişse, yarına ayarla
  if (nowTr > nextOrderTime) {
    nextOrderTime.setDate(nextOrderTime.getDate() + 1);
  }
  
  const timeDiff = nextOrderTime.getTime() - nowTr.getTime();
  const totalSeconds = Math.max(0, Math.floor(timeDiff / 1000));
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return { hours, minutes, seconds, totalSeconds };
};
