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

  return <div className="ui-card">
    <div className="ui-card-header ui-between"><div><h2 className="ui-title">Bekleyen Destekler</h2><p className="ui-subtitle">AI tarafından temsilciye aktarılan görüşmeler</p></div><button onClick={load} className="ui-icon-btn" aria-label="Yenile" title="Yenile"><RefreshCw className={loading ? "ui-spin" : ""}/></button></div>
    <div>{requests.map((request) => { const conversationId = request.conversation?._id || request.conversation; return <article key={request._id} className="ui-list-row support-row">
      <div className="ui-grow"><div className="ui-cluster"><h3 className="ui-list-title">{request.user?.name || "Müşteri"}</h3><span className={`ui-badge ${request.priority === "high" || request.priority === "urgent" ? "ui-badge--danger" : "ui-badge--warn"}`}>{request.priority}</span>{request.assignedTo && <span className="ui-badge ui-badge--info">{request.assignedTo.name} tarafından alındı</span>}</div><p className="ui-text-sm" style={{ marginTop: 6 }}>{request.aiSummary}</p><p className="ui-hint ui-truncate" style={{ marginTop: 6 }}>Son mesaj: {request.conversation?.lastMessage || "-"}</p><div className="ui-cluster ui-hint" style={{ marginTop: 8 }}><span className="ui-cluster" style={{ gap: 4 }}><Clock size={13}/>{waitTime(request.createdAt)}</span><span>{new Date(request.createdAt).toLocaleString("tr-TR")}</span></div></div>
      <div className="ui-cluster">{request.status === "waiting" && <button onClick={() => accept(request)} className="ui-btn ui-btn--sm ui-btn--primary"><UserCheck/>Görüşmeyi Al</button>}<button onClick={() => onOpenChat(conversationId)} className="ui-btn ui-btn--sm"><MessageCircle/>Konuşmayı Aç</button><button onClick={() => close(request)} className="ui-btn ui-btn--sm ui-btn--danger"><XCircle/>Kapat</button></div>
    </article>; })}{!loading && !requests.length && <div className="ui-empty">Bekleyen destek talebi yok.</div>}</div>
  </div>;
}
