import dotenv from "dotenv";
import mongoose from "mongoose";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import AiKnowledge from "../models/aiKnowledge.model.js";
import AiRequestLog from "../models/aiRequestLog.model.js";
import SupportRequest from "../models/supportRequest.model.js";

dotenv.config();

if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");

await mongoose.connect(process.env.MONGO_URI);
try {
  const result = await Chat.updateMany(
    { mode: { $exists: false } },
    [{ $set: { mode: { $cond: [{ $eq: ["$status", "closed"] }, "CLOSED", "AI"] } } }],
  );
  await Promise.all([Chat.syncIndexes(), Message.syncIndexes(), AiKnowledge.syncIndexes(), AiRequestLog.syncIndexes(), SupportRequest.syncIndexes()]);
  console.log(`AI support migration completed. Updated chats: ${result.modifiedCount}`);
} finally {
  await mongoose.disconnect();
}
