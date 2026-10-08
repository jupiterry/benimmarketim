import assert from "node:assert/strict";
import test from "node:test";
import { takeOverChat, takeOverFailureMessage } from "../services/chatTakeover.service.js";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import SupportRequest from "../models/supportRequest.model.js";

const admin = { _id: "507f191e810c19729de860aa", name: "Deniz" };
const baseChat = { _id: "507f191e810c19729de860eb", user: "507f191e810c19729de860ea", status: "active", mode: "AI", assignedAgent: null };

test("admin replying to an AI chat takes it over and opens a support request", async (t) => {
  let chatUpdate; let requestUpdate; let created;
  t.mock.method(Chat, "findOneAndUpdate", async (filter, update) => { chatUpdate = { filter, update }; return { ...baseChat, mode: "HUMAN", assignedAgent: admin._id }; });
  t.mock.method(SupportRequest, "findOneAndUpdate", async (filter, update, options) => { requestUpdate = { filter, update, options }; return { _id: "r1" }; });
  t.mock.method(Message, "create", async (data) => { created = data; return { ...data, _id: "m1" }; });
  const emitted = [];
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  const result = await takeOverChat({ chat: baseChat, admin, io });
  assert.equal(result.ok, true);
  assert.equal(result.chat.mode, "HUMAN");
  assert.deepEqual(chatUpdate.filter, { _id: baseChat._id, status: "active", mode: "AI", assignedAgent: null });
  assert.equal(chatUpdate.update.$set.mode, "HUMAN");
  assert.equal(requestUpdate.update.$set.status, "in_progress");
  assert.equal(requestUpdate.update.$set.assignedTo, admin._id);
  assert.equal(requestUpdate.options.upsert, true);
  assert.match(created.content, /Deniz görüşmeye katıldı/);
  assert.ok(emitted.some((e) => e.room === `chat_${baseChat._id}` && e.event === "newMessage"));
});

test("chat already assigned to the same admin is used as is", async (t) => {
  t.mock.method(Chat, "findOneAndUpdate", async () => assert.fail("no update expected"));
  const chat = { ...baseChat, mode: "HUMAN", assignedAgent: admin._id };
  const result = await takeOverChat({ chat, admin });
  assert.equal(result.ok, true);
  assert.equal(result.systemMessage, undefined);
});

test("chat of another agent or a closed chat is not taken over", async (t) => {
  t.mock.method(Chat, "findOneAndUpdate", async () => assert.fail("no update expected"));
  assert.equal((await takeOverChat({ chat: { ...baseChat, mode: "HUMAN", assignedAgent: "507f191e810c19729de860ff" }, admin })).reason, "assigned_other");
  assert.equal((await takeOverChat({ chat: { ...baseChat, status: "closed", mode: "CLOSED" }, admin })).reason, "closed");
  assert.match(takeOverFailureMessage("assigned_other"), /başka bir destek görevlisine/);
});

test("takeover stops when the chat changed meanwhile", async (t) => {
  t.mock.method(Chat, "findOneAndUpdate", async () => null);
  t.mock.method(SupportRequest, "findOneAndUpdate", async () => assert.fail("no request expected"));
  const result = await takeOverChat({ chat: baseChat, admin });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "changed");
});
