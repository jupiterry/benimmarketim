import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Mail, Phone, PlayCircle, RefreshCw, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";

const KINDS = [
  { id: "", label: "Tümü" },
  { id: "kvkk", label: "KVKK başvuruları" },
  { id: "contact", label: "İletişim mesajları" },
];
const TOPICS = {
  siparis: "Sipariş sorunu", teslimat: "Teslimat sorunu", iade: "İade/Değişim", urun: "Ürün hakkında", genel: "Genel soru", sikayet: "Şikayet", oneri: "Öneri",
  bilgi: "Bilgi talebi", erisim: "Verilere erişim", duzeltme: "Düzeltme", silme: "Silme", itiraz: "İtiraz", diger: "Diğer",
};
const STATUS = {
  new: { label: "Yeni", tone: "ui-badge--warn" },
  in_progress: { label: "İşlemde", tone: "ui-badge--info" },
  done: { label: "Tamamlandı", tone: "ui-badge--ok" },
};
const KVKK_DEADLINE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const daysLeft = (createdAt) => KVKK_DEADLINE_DAYS - Math.floor((Date.now() - new Date(createdAt).getTime()) / DAY_MS);

export default function SiteMessagesTab() {
  const [kind, setKind] = useState("");
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState({ kvkk: 0, contact: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/site-messages", { params: kind ? { kind } : {} });
      setMessages(data.messages || []);
      setOpen({ kvkk: data.open?.kvkk || 0, contact: data.open?.contact || 0 });
    } catch {
      toast.error("Başvurular alınamadı");
    } finally {
      setLoading(false);
    }
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (item, status) => {
    try {
      await axios.patch(`/site-messages/${item._id}`, { status });
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Durum güncellenemedi");
    }
  };

  return (
    <div className="ui-page">
      <header className="app-pagehead">
        <div>
          <h1>Başvurular ve mesajlar</h1>
          <p>Sitedeki KVKK başvuru formundan ve iletişim formundan gelen kayıtlar.</p>
        </div>
        <button onClick={load} className="ui-btn" aria-label="Yenile">
          <RefreshCw className={loading ? "ui-spin" : ""} />
          Yenile
        </button>
      </header>

      <div className="ui-stats">
        <div className="ui-stat">
          <span className="ui-stat-label">Açık KVKK başvurusu</span>
          <span className="ui-stat-value">{open.kvkk}</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Açık iletişim mesajı</span>
          <span className="ui-stat-value">{open.contact}</span>
        </div>
      </div>

      <div className="ui-segmented" style={{ alignSelf: "flex-start" }}>
        {KINDS.map((item) => (
          <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="ui-panel">
        {messages.map((item) => {
          const status = STATUS[item.status] || STATUS.new;
          const remaining = daysLeft(item.createdAt);
          return (
            <article key={item._id} className="ui-list-row">
              <div className="ui-grow">
                <div className="ui-cluster">
                  <h3 className="ui-list-title">{item.name}</h3>
                  <span className={`ui-badge ${item.kind === "kvkk" ? "ui-badge--brand" : ""}`}>{item.kind === "kvkk" ? "KVKK" : "İletişim"}</span>
                  <span className={`ui-badge ${status.tone}`}>{status.label}</span>
                  {item.kind === "kvkk" && item.status !== "done" && (
                    <span className={`ui-badge ${remaining <= 7 ? "ui-badge--danger" : ""}`}>
                      <Clock size={12} />
                      {remaining > 0 ? `Yanıt için ${remaining} gün kaldı` : "Yasal süre doldu"}
                    </span>
                  )}
                </div>
                <p className="ui-text-sm ui-strong" style={{ marginTop: 6 }}>{TOPICS[item.topic] || item.topic}</p>
                <p className="ui-text-sm ui-wrap-anywhere" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{item.message}</p>
                <div className="ui-cluster ui-hint" style={{ marginTop: 8 }}>
                  <a className="ui-link ui-cluster" style={{ gap: 4 }} href={`mailto:${item.email}`}><Mail size={13} />{item.email}</a>
                  {item.phone && <a className="ui-link ui-cluster" style={{ gap: 4 }} href={`tel:${item.phone}`}><Phone size={13} />{item.phone}</a>}
                  <span>#{String(item._id).slice(-6).toUpperCase()}</span>
                  <span>{new Date(item.createdAt).toLocaleString("tr-TR")}</span>
                  {item.handledBy?.name && <span>Son işlem: {item.handledBy.name}</span>}
                </div>
              </div>
              <div className="ui-cluster">
                {item.status === "new" && (
                  <button onClick={() => setStatus(item, "in_progress")} className="ui-btn ui-btn--sm"><PlayCircle />İşleme al</button>
                )}
                {item.status !== "done" ? (
                  <button onClick={() => setStatus(item, "done")} className="ui-btn ui-btn--sm ui-btn--primary"><CheckCircle2 />Tamamlandı</button>
                ) : (
                  <button onClick={() => setStatus(item, "in_progress")} className="ui-btn ui-btn--sm"><RotateCcw />Yeniden aç</button>
                )}
              </div>
            </article>
          );
        })}
        {!messages.length && <div className="ui-empty">{loading ? "Yükleniyor…" : "Henüz kayıt yok."}</div>}
      </div>
    </div>
  );
}
