/**
 * account.service.js
 *
 * Kullanıcı hesabının kalıcı olarak silinmesi. Hem müşteri tarafı
 * (DELETE /api/auth/delete-account, POST /api/users/delete-account) bu servisi kullanır.
 *
 * Kural: Siparişler SİLİNMEZ (muhasebe/istatistik için kalır); `userDeleted: true` ile
 * işaretlenir ve sipariş belgesinde ad/e-posta tutulmadığı için kullanıcı silinince
 * kişisel bağ kopar. Kişisel veriler (geri bildirim, sohbet, kayıtlı sepet, fotokopi
 * dosyaları, destek talepleri, referral kayıtları, kişiye özel kuponlar, oturum, avatar)
 * silinir.
 */

import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Feedback from "../models/feedback.model.js";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import SavedCart from "../models/savedCart.model.js";
import PhotocopyFile from "../models/photocopyFile.model.js";
import Referral from "../models/referral.model.js";
import Coupon from "../models/coupon.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import { redis } from "../lib/redis.js";
import cloudinary, { publicIdFromUrl } from "../lib/cloudinary.js";

const PHOTOCOPY_DIR = path.join(process.cwd(), "uploads", "photocopy");

// Fotokopi dosyası yalnızca uploads/photocopy altındaysa diskten silinir (yol dışına çıkılmaz)
const removePhotocopyFileFromDisk = async (filePath) => {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PHOTOCOPY_DIR + path.sep)) return;
  await fs.rm(resolved, { force: true }).catch(() => {});
};

const safe = async (label, task) => {
  try {
    return await task();
  } catch (error) {
    console.error(`Hesap silme adımı başarısız (${label}):`, error.message);
    return null;
  }
};

/**
 * Kullanıcıyı ve kişisel verilerini siler; siparişleri anonimleştirerek saklar.
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{ userId: string, ordersAnonymized: number }>}
 * @throws {Error} Kullanıcı bulunamazsa ("USER_NOT_FOUND")
 */
export const deleteUserAccount = async (userId) => {
  const objectId = new mongoose.Types.ObjectId(String(userId));
  const user = await User.findById(objectId).select("avatar");
  if (!user) throw Object.assign(new Error("Kullanıcı bulunamadı"), { code: "USER_NOT_FOUND", statusCode: 404 });

  // 1) Siparişler kalır; kullanıcı bağı işaretlenir (user ObjectId zorunlu olduğu için korunur)
  const ordersResult = await Order.updateMany(
    { user: objectId },
    { $set: { userDeleted: true, userDeletedAt: new Date() } }
  );

  // 2) Kişisel veriler
  await safe("feedback", () => Feedback.deleteMany({ user: objectId }));

  await safe("chat", async () => {
    const chatIds = await Chat.find({ user: objectId }).distinct("_id");
    if (chatIds.length) {
      await SupportRequest.deleteMany({ conversation: { $in: chatIds } }).catch(() => {});
      await Message.deleteMany({ chat: { $in: chatIds } });
      await Chat.deleteMany({ _id: { $in: chatIds } });
    }
  });
  await safe("supportRequest", () => SupportRequest.deleteMany({ user: objectId }));

  await safe("savedCart", () => SavedCart.deleteMany({ user: objectId }));

  await safe("photocopy", async () => {
    const files = await PhotocopyFile.find({ user: objectId }).select("filePath").lean();
    for (const file of files) await removePhotocopyFileFromDisk(file.filePath);
    await PhotocopyFile.deleteMany({ user: objectId });
  });

  // 3) Referral: kendi kodu silinir, başkasının listesinden çıkarılır
  await safe("referral", async () => {
    await Referral.deleteMany({ referrer: objectId });
    await Referral.updateMany(
      { "referredUsers.user": objectId },
      { $pull: { referredUsers: { user: objectId } } }
    );
  });

  // 4) Kuponlar: kişiye özel olanlar silinir, genel kuponlardaki kullanım kaydı çıkarılır
  await safe("coupon", async () => {
    await Coupon.deleteMany({ userId: objectId });
    await Coupon.updateMany(
      { "usedBy.user": objectId },
      { $pull: { usedBy: { user: objectId } } }
    );
  });

  // 5) Oturum ve avatar
  await safe("redis", () => redis.del(`refresh_token:${objectId.toString()}`));
  const avatarId = publicIdFromUrl(user.avatar);
  if (avatarId) await safe("avatar", () => cloudinary.uploader.destroy(avatarId));

  // 6) Kullanıcı
  await User.findByIdAndDelete(objectId);

  return { userId: objectId.toString(), ordersAnonymized: ordersResult.modifiedCount || 0 };
};
