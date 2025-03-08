// backend/controllers/userController.js
import User from "../models/user.model.js";

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password"); // Şifreyi hariç tut
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Kullanıcılar getirilirken hata oluştu" });
  }
};

export const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { name, email, phone } = req.body;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email, phone },
      { new: true, runValidators: true }
    ).select("-password");
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Kullanıcı güncellenirken hata oluştu" });
  }
};

export const addPhoneFieldToAllUsers = async (req, res) => {
  try {
    await User.updateMany({}, { $set: { phone: "" } });
    res.status(200).json({ success: true, message: "Tüm kullanıcılara telefon alanı eklendi" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Telefon alanı eklenirken hata oluştu" });
  }
};

export const deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    res.status(200).json({ success: true, message: "Kullanıcı başarıyla silindi" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Kullanıcı silinirken hata oluştu" });
  }
};