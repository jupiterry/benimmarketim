import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import SupportRequest from "../models/supportRequest.model.js";

const OPEN_MODES = ["AI", "WAITING_FOR_AGENT", "HUMAN"];

/**
 * Yönetici, yapay zekâ ile süren ya da destek bekleyen bir sohbete doğrudan yazdığında görüşmeyi
 * üstlenir: sohbet HUMAN moduna geçer (yapay zekâ artık cevap vermez), açık destek talebi yöneticiye
 * atanır, yoksa oluşturulur; böylece destek kuyruğu ve kapatma akışı aynı şekilde çalışır.
 * Başka bir görevliye atanmış görüşme devralınmaz.
 * @returns {Promise<{ ok: boolean, chat?: object, systemMessage?: object, reason?: string }>}
 */
export const takeOverChat = async ({ chat, admin, io, now = new Date() }) => {
  const adminId = String(admin._id);
  if (chat.mode === "HUMAN" && String(chat.assignedAgent || "") === adminId) return { ok: true, chat };
  if (chat.status !== "active" || !OPEN_MODES.includes(chat.mode)) return { ok: false, reason: "closed" };
  if (chat.mode === "HUMAN" && chat.assignedAgent) return { ok: false, reason: "assigned_other" };

  // Bu arada müşteri desteğe aktarıldıysa ya da başka görevli aldıysa güncelleme yapılmaz.
  const updated = await Chat.findOneAndUpdate(
    { _id: chat._id, status: "active", mode: chat.mode, assignedAgent: chat.assignedAgent || null },
    { $set: { mode: "HUMAN", assignedAgent: admin._id } },
    { new: true },
  );
  if (!updated) return { ok: false, reason: "changed" };

  const request = await SupportRequest.findOneAndUpdate(
    { conversation: chat._id },
    {
      $set: { status: "in_progress", assignedTo: admin._id, acceptedAt: now },
      $setOnInsert: { user: chat.user, reason: "Yönetici sohbete doğrudan katıldı.", aiSummary: "Yönetici, yapay zekâ ile süren görüşmeye kendisi yanıt verdi.", priority: "normal" },
    },
    { new: true, upsert: true },
  );

  const systemMessage = await Message.create({ chat: chat._id, sender: "system", senderName: "Benim Marketim", content: `Destek görevlisi ${admin.name || "ekibimizden biri"} görüşmeye katıldı.`, type: "system" });
  io?.to(`chat_${chat._id}`).emit("newMessage", { message: systemMessage, chatId: String(chat._id) });
  io?.to("adminRoom").emit("SupportRequestAccepted", { supportRequestId: String(request?._id || ""), conversationId: String(chat._id), agentId: adminId, agentName: admin.name });
  return { ok: true, chat: updated, systemMessage };
};

export const takeOverFailureMessage = (reason) => ({
  assigned_other: "Bu görüşme başka bir destek görevlisine atanmış.",
  closed: "Bu sohbet kapatılmış.",
}[reason] || "Görüşmenin durumu değişti. Sohbeti yenileyip tekrar deneyin.");
