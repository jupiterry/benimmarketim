// backend/middleware/auth.middleware.js
import jwt from "jsonwebtoken";
import User from "../models/user.model.js"; // Kullanıcı modeliniz

export const protectRoute = async (req, res, next) => {
  try {
    // Hem cookie hem de Authorization header'ı kontrol et
    const accessToken = req.cookies.accessToken || req.headers.authorization?.split(' ')[1];

    if (!accessToken) {
      return res.status(401).json({ 
        success: false, 
        message: "No access token provided" 
      });
    }

    try {
      const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded.userId).select("-password");

      if (!user) {
        return res.status(401).json({ success: false, message: "Kullanıcı Bulunamadı" });
      }

      req.user = user;

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Unauthorized - Access token expired" });
      }
      throw error;
    }
  } catch (error) {
    console.log("Error in protectRoute middleware", error.message);
    return res.status(401).json({ success: false, message: "Unauthorized - Invalid access token" });
  }
};

export const adminRoute = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({ success: false, message: "Access denied - Şüpheli işlem algılandı - Admin only" });
  }
};

export const checkAuth = async (req, res) => {
  try {
    const user = req.user; // protectRoute middleware'den al
    res.json({ success: true, user }); // Kullanıcının tüm bilgilerini (role dahil) döndür
  } catch (error) {
    res.status(500).json({ success: false, message: "Sunucu hatası", error: error.message });
  }
};