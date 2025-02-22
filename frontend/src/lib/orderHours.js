export const isWithinOrderHours = () => {
    const now = new Date();
    const currentHour = now.getHours();
    return currentHour >= 10 || currentHour < 3; // 10:00 - 03:00 arası
  };
  
  export const ORDER_HOURS_ERROR_MESSAGE = "Siparişler sadece sabah 10:00 ile gece 03:00 arasında verilebilir.";