import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Send, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import socketService from "../lib/socket";

const quickActions = ["📦 Siparişim Nerede?", "🛒 Ürün Sor", "🎟 Kampanyalar", "🖨 Fotokopi", "👨‍💼 Canlı Destek"];

export default function CustomerAiChatWidget() {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const start = async () => {
    if (chat) return;
    try {
      const { data } = await axios.post("/chat/create", { type: "general" });
      setChat(data.chat);
      const response = await axios.get(`/chat/${data.chat._id}`);
      setMessages(response.data.messages || []);
      const socket = socketService.connect();
      socket.emit("joinChat", data.chat._id);
    } catch { toast.error("Canlı destek açılamadı"); }
  };
  useEffect(() => { if (open) start(); }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  useEffect(() => {
    if (!chat) return;
    const socket = socketService.connect();
    const onMessage = ({ chatId, message }) => { if (chatId === chat._id && message.sender !== "user") setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message]); };
    const onClosed = ({ chatId }) => { if (chatId === chat._id) setChat((current) => current ? { ...current, status: "closed", mode: "CLOSED" } : current); };
    socket.on("newMessage", onMessage); socket.on("chatClosed", onClosed);
    return () => { socket.off("newMessage", onMessage); socket.off("chatClosed", onClosed); socket.emit("leaveChat", chat._id); };
  }, [chat?._id]);

  const send = async (value = text) => {
    const content = value.trim(); if (!content || !chat || sending || chat.status === "closed") return;
    const temporaryId = `temp-${Date.now()}`;
    setText(""); setSending(true);
    setMessages((current) => [...current, { _id: temporaryId, chat: chat._id, sender: "user", content, type: "text", createdAt: new Date().toISOString() }]);
    try {
      const { data } = await axios.post(`/chat/${chat._id}/send`, { content, type: "text" });
      setMessages((current) => current.map((item) => item._id === temporaryId ? data.message : item));
      if (data.aiMessage) setMessages((current) => current.some((item) => item._id === data.aiMessage._id) ? current : [...current, data.aiMessage]);
    } catch (error) { setMessages((current) => current.filter((item) => item._id !== temporaryId)); toast.error(error.response?.data?.message || "Mesaj gönderilemedi"); }
    finally { setSending(false); }
  };

  return <>
    <button onClick={() => setOpen(true)} aria-label="Yapay zekâ destek asistanını aç" className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-2xl shadow-emerald-900/40 transition hover:scale-105"><MessageCircle/></button>
    {open && <div className="fixed bottom-4 right-4 z-50 flex h-[min(680px,calc(100vh-32px))] w-[min(410px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-emerald-200/50 bg-white shadow-2xl">
      <header className="flex items-center justify-between bg-gradient-to-r from-emerald-700 to-teal-700 p-4 text-white"><div className="flex items-center gap-3"><div className="rounded-xl bg-white/15 p-2"><Sparkles size={20}/></div><div><h2 className="font-bold">Benim Marketim Asistanı</h2><p className="text-xs text-emerald-100">AI destekli · gerektiğinde ekibe aktarır</p></div></div><button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/10"><X size={19}/></button></header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-emerald-50/40 p-4">{messages.map((message) => <div key={message._id} className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${message.sender === "user" ? "rounded-br-sm bg-emerald-600 text-white" : message.type === "system" ? "border border-amber-200 bg-amber-50 text-amber-900" : "rounded-bl-sm border border-gray-100 bg-white text-gray-800"}`}>{message.sender === "ai" && <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600"><Bot size={11}/>Benim Marketim AI</div>}<p className="whitespace-pre-wrap">{message.content}</p></div></div>)}{sending && <div className="text-xs text-emerald-700">Asistan yanıt hazırlıyor…</div>}<div ref={bottomRef}/></div>
      {chat?.status !== "closed" && <><div className="flex gap-2 overflow-x-auto border-t bg-white px-3 py-2">{quickActions.map((action) => <button key={action} onClick={() => send(action)} className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">{action}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); send(); }} className="flex gap-2 border-t bg-white p-3"><input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Mesajınızı yazın..." className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"/><button disabled={!text.trim() || sending} className="rounded-xl bg-emerald-600 p-3 text-white disabled:opacity-40"><Send size={18}/></button></form></>}
    </div>}
  </>;
}
