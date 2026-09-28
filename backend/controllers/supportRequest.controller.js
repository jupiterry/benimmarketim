import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import { supportAcceptanceFilter } from "../services/ai/policies.js";

export const listSupportRequests = async (req, res) => {
  const statuses = req.query.status ? String(req.query.status).split(",") : ["waiting", "accepted", "in_progress"];
  const requests = await SupportRequest.find({ status: { $in: statuses } })
    .populate("user", "name email phone").populate("assignedTo", "name email")
    .populate("conversation", "lastMessage lastMessageAt mode type order").sort({ priority: -1, createdAt: 1 }).lean();
  res.json({ success: true, supportRequests: requests });
};

export const acceptSupportRequest = async (req, res) => {
  const now = new Date();
  const request = await SupportRequest.findOneAndUpdate(
    supportAcceptanceFilter(req.params.id),
    { $set: { status: "in_progress", assignedTo: req.user._id, acceptedAt: now } },
    { new: true },
  ).populate("assignedTo", "name email").populate("user", "name email phone");
  if (!request) return res.status(409).json({ success: false, message: "Bu destek talebi başka bir görevli tarafından alınmış veya artık beklemiyor." });
  const chat = await Chat.findOneAndUpdate(
    { _id: request.conversation, mode: "WAITING_FOR_AGENT", status: "active" },
    { $set: { mode: "HUMAN", assignedAgent: req.user._id } }, { new: true },
  );
  if (!chat) {
    await SupportRequest.updateOne({ _id: request._id, assignedTo: req.user._id }, { $set: { status: "waiting", assignedTo: null, acceptedAt: null } });
    return res.status(409).json({ success: false, message: "Görüşmenin durumu değişti. Listeyi yenileyin." });
  }
  const message = await Message.create({ chat: chat._id, sender: "system", senderName: "Benim Marketim", content: `Destek görevlisi ${req.user.name || "ekibimizden biri"} görüşmeye katıldı.`, type: "system" });
  await Chat.updateOne({ _id: chat._id }, { $set: { lastMessage: message.content, lastMessageAt: message.createdAt, lastMessageSender: "system" }, $inc: { userUnreadCount: 1 } });
  const io = req.app.get("io");
  io?.to(`chat_${chat._id}`).emit("newMessage", { message, chatId: String(chat._id) });
  io?.to("adminRoom").emit("SupportRequestAccepted", { supportRequestId: String(request._id), conversationId: String(chat._id), agentId: String(req.user._id), agentName: req.user.name });
  res.json({ success: true, supportRequest: request, chat });
};

export const closeSupportRequest = async (req, res) => {
  const request = await SupportRequest.findOne({ _id: req.params.id, status: { $in: ["waiting", "accepted", "in_progress"] } });
  if (!request) return res.status(404).json({ message: "Açık destek talebi bulunamadı." });
  if (request.assignedTo && String(request.assignedTo) !== String(req.user._id)) return res.status(403).json({ message: "Bu görüşme başka bir görevliye atanmış." });
  request.status = "closed"; request.closedAt = new Date();
  await request.save();
  const chat = await Chat.findByIdAndUpdate(request.conversation, { $set: { status: "closed", mode: "CLOSED" } }, { new: true });
  const message = await Message.create({ chat: request.conversation, sender: "system", senderName: "Benim Marketim", content: "Bu görüşme kapatıldı. Yeni bir konuda tekrar yazabilirsiniz.", type: "system" });
  const io = req.app.get("io");
  io?.to(`chat_${request.conversation}`).emit("newMessage", { message, chatId: String(request.conversation) });
  io?.to(`chat_${request.conversation}`).emit("chatClosed", { chatId: String(request.conversation) });
  io?.to("adminRoom").emit("SupportRequestClosed", { supportRequestId: String(request._id), conversationId: String(request.conversation) });
  res.json({ success: true, supportRequest: request, chat });
};
