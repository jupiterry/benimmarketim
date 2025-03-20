import User from "../models/user.model.js";

export const updateLastActive = async (req, res, next) => {
  try {
    if (req.user && req.user._id) {
      const now = new Date();
      
      // Her istek için lastActive'i güncelle
      await User.findByIdAndUpdate(
        req.user._id,
        { 
          $set: { 
            lastActive: now,
            lastActiveTimestamp: now.getTime()
          }
        },
        { new: true }
      );

      // req.user nesnesini de güncelle
      req.user.lastActive = now;
      req.user.lastActiveTimestamp = now.getTime();
    }
    next();
  } catch (error) {
    console.error("Son aktivite güncellenirken hata:", error);
    next();
  }
}; 