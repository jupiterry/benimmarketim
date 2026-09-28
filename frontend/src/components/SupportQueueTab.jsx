import { useEffect, useState } from "react";
import { Clock, MessageCircle, RefreshCw, UserCheck, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import socketService from "../lib/socket";

const waitTime = (date) => { const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000)); return minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`; };

export default function SupportQueueTab({ onOpenChat }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { try { setLoading(true); const { data } = await axios.get("/support-requests"); setRequests(data.supportRequests || []); } catch { toast.error("Bekleyen destekler alınamadı"); } finally { setLoading(false); } };
  useEffect(() => {
    load(); const socket = socketService.connect();
    const refresh = () => load();
    ["SupportRequestCreated", "SupportRequestAccepted", "SupportRequestClosed"].forEach((event) => socket.on(event, refresh));
    return () => ["SupportRequestCreated", "SupportRequestAccepted", "SupportRequestClosed"].forEach((event) => socket.off(event, refresh));
  }, []);
  const accept = async (request) => { try { await axios.post(`/support-requests/${request._id}/accept`); toast.success("Görüşme size atandı"); await load(); onOpenChat(request.conversation?._id || request.conversation); } catch (error) { toast.error(error.response?.data?.message || "Görüşme alınamadı"); await load(); } };
  const close = async (request) => { if (!confirm("Bu destek talebi kapatılsın mı?")) return; try { await axios.post(`/support-requests/${request._id}/close`); toast.success("Destek kapatıldı"); await load(); } catch (error) { toast.error(error.response?.data?.message || "Destek kapatılamadı"); } };

  return <div className="admin-card"><div className="admin-card-body">
    <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-white">Bekleyen Destekler</h2><p className="text-sm text-gray-400">AI tarafından temsilciye aktarılan görüşmeler</p></div><button onClick={load} className="rounded-xl bg-white/10 p-3 text-gray-300"><RefreshCw size={17} className={loading ? "animate-spin" : ""}/></button></div>
    <div className="space-y-3">{requests.map((request) => { const conversationId = request.conversation?._id || request.conversation; return <article key={request._id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-white">{request.user?.name || "Müşteri"}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${request.priority === "high" || request.priority === "urgent" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{request.priority}</span>{request.assignedTo && <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-300">{request.assignedTo.name} tarafından alındı</span>}</div><p className="mt-2 text-sm text-gray-300">{request.aiSummary}</p><p className="mt-2 truncate text-xs text-gray-500">Son mesaj: {request.conversation?.lastMessage || "-"}</p><div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400"><span className="flex items-center gap-1"><Clock size={13}/>{waitTime(request.createdAt)}</span><span>{new Date(request.createdAt).toLocaleString("tr-TR")}</span></div></div>
      <div className="flex flex-wrap gap-2">{request.status === "waiting" && <button onClick={() => accept(request)} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"><UserCheck size={16}/>Görüşmeyi Al</button>}<button onClick={() => onOpenChat(conversationId)} className="flex items-center gap-2 rounded-xl bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-300"><MessageCircle size={16}/>Konuşmayı Aç</button><button onClick={() => close(request)} className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300"><XCircle size={16}/>Kapat</button></div></div>
    </article>; })}{!loading && !requests.length && <div className="py-12 text-center text-gray-500">Bekleyen destek talebi yok.</div>}</div>
  </div></div>;
}
