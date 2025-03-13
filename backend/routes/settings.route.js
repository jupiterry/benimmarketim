import express from "express";
import { getSettings, updateSettings } from "../controllers/settings.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { refreshOrderHoursCache } from "../controllers/cart.controller.js";

const router = express.Router();

// Ayarları getir - herkes erişebilir
router.get("/", getSettings);

// Ayarları güncelle - sadece admin erişebilir
router.put("/", protectRoute, adminRoute, updateSettings);

// Test amaçlı - önbelleği temizle ve durumu kontrol et
router.get("/refresh-cache", async (req, res) => {
  try {
    await refreshOrderHoursCache();
    res.status(200).json({ 
      message: "Önbellek yenilendi", 
      cache: { 
        // Tüm önbellek değerlerini göster
        ...global.orderHoursCache,
        // İnsan tarafından okunabilir format ekle
        readableTime: `${global.orderHoursCache.startHour}:${global.orderHoursCache.startMinute} - ${global.orderHoursCache.endHour}:${global.orderHoursCache.endMinute}`,
        // Son yenilenme zamanını insan tarafından okunabilir formatta göster
        lastUpdatedReadable: new Date(global.orderHoursCache.lastUpdated).toLocaleString('tr-TR')
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Önbellek yenilenirken hata oluştu", error: error.message });
  }
});

export default router; 