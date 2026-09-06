import Settings from "../models/settings.model.js";
import { refreshOrderHoursCache } from "./cart.controller.js";

// Tüm ayarları getir
export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.status(200).json(settings);
  } catch (error) {
    console.error("Ayarlar getirilirken hata oluştu:", error);
    res.status(500).json({ message: "Ayarlar getirilirken hata oluştu", error: error.message });
  }
};

// Ayarları güncelle
export const updateSettings = async (req, res) => {
  try {
    const { orderStartHour, orderStartMinute, orderEndHour, orderEndMinute, minimumOrderAmount, deliveryPoints, appVersion } = req.body;
    
    const settings = await Settings.getSettings();

    if (appVersion !== undefined) {
      if (!appVersion || typeof appVersion !== "object" || Array.isArray(appVersion)) {
        return res.status(400).json({ message: "Geçersiz uygulama versiyon ayarları" });
      }
      for (const field of ["latestVersion", "minimumVersion", "forceUpdate", "androidStoreUrl", "iosStoreUrl"]) {
        if (appVersion[field] !== undefined) settings.appVersion[field] = appVersion[field];
      }
    }
    
    // Sadece gönderilen alanları güncelle
    if (orderStartHour !== undefined) settings.orderStartHour = orderStartHour;
    if (orderStartMinute !== undefined) settings.orderStartMinute = orderStartMinute;
    if (orderEndHour !== undefined) settings.orderEndHour = orderEndHour;
    if (orderEndMinute !== undefined) settings.orderEndMinute = orderEndMinute;
    if (minimumOrderAmount !== undefined) settings.minimumOrderAmount = minimumOrderAmount;
    if (deliveryPoints !== undefined) settings.deliveryPoints = deliveryPoints;
    
    await settings.save();
    
    // Sipariş saatleri değiştiyse önbelleği hemen temizle
    await refreshOrderHoursCache();
    
    res.status(200).json({ message: "Ayarlar başarıyla güncellendi", settings });
  } catch (error) {
    console.error("Ayarlar güncellenirken hata oluştu:", error);
    res.status(500).json({ message: "Ayarlar güncellenirken hata oluştu", error: error.message });
  }
};
