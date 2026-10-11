import mongoose from "mongoose";
import { clearAdminFeed, listAdminFeed } from "../services/adminFeed.service.js";

/** GET /api/admin-notifications → zil listesi (tüm cihazlarda aynı) */
export const getAdminFeed = async (req, res) => {
  try {
    const items = await listAdminFeed(mongoose.connection.db, req.user._id);
    res.json({ success: true, items });
  } catch (error) {
    console.error("Yönetici bildirimleri okunamadı:", error.message);
    res.status(500).json({ success: false, message: "Bildirimler alınamadı." });
  }
};

/** POST /api/admin-notifications/clear → bu yönetici hesabı için listeyi temizler (diğer cihazlara da bildirilir) */
export const clearAdminFeedHandler = async (req, res) => {
  try {
    const clearedAt = await clearAdminFeed(mongoose.connection.db, req.user._id);
    req.app.get("io")?.to("adminRoom").emit("adminFeedCleared", { userId: String(req.user._id), clearedAt });
    res.json({ success: true, clearedAt });
  } catch (error) {
    console.error("Yönetici bildirimleri temizlenemedi:", error.message);
    res.status(500).json({ success: false, message: "Bildirimler temizlenemedi." });
  }
};
