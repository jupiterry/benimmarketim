import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCw, Send, Users } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";

const TITLE_LIMIT = 60;
const BODY_LIMIT = 180;
const TARGETS = [
  { id: "home", label: "Ana sayfa" },
  { id: "cart", label: "Sepet" },
  { id: "orders", label: "Siparişlerim" },
  { id: "referral", label: "Davet sayfası" },
];
const formatDate = (value) => new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function PushBroadcastTab() {
  const { confirm } = useConfirm();
  const [overview, setOverview] = useState({ configured: true, audiences: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", target: "home" });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/notifications/broadcasts");
      setOverview({ configured: data.configured !== false, audiences: data.audiences || [], history: data.history || [] });
    } catch {
      toast.error("Bildirim bilgileri alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const audience = useMemo(() => overview.audiences.find((item) => item.id === form.audience), [overview.audiences, form.audience]);
  const audienceLabel = (id) => overview.audiences.find((item) => item.id === id)?.label || id;
  const title = form.title.trim();
  const body = form.body.trim();
  const canSend = overview.configured && !sending && title && body && (audience?.reachable || 0) > 0;

  const send = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    const confirmed = await confirm({
      title: "Bildirimi gönder",
      message: `"${title}" bildirimi ${audience.reachable} müşterinin telefonuna gönderilecek. Gönderilen bildirim geri alınamaz.`,
      confirmText: `${audience.reachable} kişiye gönder`,
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!confirmed) return;
    try {
      setSending(true);
      const { data } = await axios.post("/notifications/broadcasts", { ...form, title, body });
      toast.success(data.message || "Bildirim gönderildi");
      setForm((current) => ({ ...current, title: "", body: "" }));
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Bildirim gönderilemedi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ui-page">
      <header className="app-pagehead">
        <div>
          <h1>Bildirim gönder</h1>
          <p>Müşterilerinizin telefonuna kampanya ve duyuru bildirimi gönderin.</p>
        </div>
        <button onClick={load} className="ui-btn" aria-label="Yenile">
          <RefreshCw className={loading ? "ui-spin" : ""} />
          Yenile
        </button>
      </header>

      {!overview.configured && (
        <div className="ui-banner ui-banner--warn" role="status">
          Bildirim servisi yapılandırılmamış. Sunucu ayarlarına OneSignal anahtarları eklenene kadar gönderim yapılamaz.
        </div>
      )}

      <div className="push-layout">
        <form className="ui-panel" onSubmit={send}>
          <div className="ui-panel-head">
            <h2>Yeni bildirim</h2>
          </div>
          <div className="ui-panel-body ui-stack">
            <div>
              <div className="ui-between">
                <label className="ui-label" htmlFor="push-title">Başlık</label>
                <span className="ui-text-xs ui-muted ui-num">{form.title.length}/{TITLE_LIMIT}</span>
              </div>
              <input id="push-title" className="ui-field" maxLength={TITLE_LIMIT} value={form.title} placeholder="Haftanın fırsatları başladı"
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
            </div>
            <div>
              <div className="ui-between">
                <label className="ui-label" htmlFor="push-body">Mesaj</label>
                <span className="ui-text-xs ui-muted ui-num">{form.body.length}/{BODY_LIMIT}</span>
              </div>
              <textarea id="push-body" className="ui-field" rows={3} maxLength={BODY_LIMIT} value={form.body} placeholder="Seçili ürünlerde bu haftaya özel fiyatlar sizi bekliyor."
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} required />
            </div>
            <div>
              <span className="ui-label">Kime gönderilsin?</span>
              <div className="push-options">
                {overview.audiences.map((item) => (
                  <button type="button" key={item.id} className="ui-option" aria-pressed={form.audience === item.id}
                    onClick={() => setForm((current) => ({ ...current, audience: item.id }))}>
                    <Users />
                    <span className="ui-grow">{item.label}</span>
                    <span className="ui-num ui-muted">{item.reachable}</span>
                  </button>
                ))}
                {!loading && !overview.audiences.length && <p className="ui-hint">Hedef kitle bilgisi alınamadı.</p>}
              </div>
              {audience && (
                <p className="ui-hint">
                  Bu gruptaki {audience.total} müşteriden {audience.reachable} tanesi kampanya bildirimlerine izin veriyor.
                  Uygulamayı yüklememiş veya bildirim izni vermemiş müşterilere ulaşmaz.
                </p>
              )}
            </div>
            <div>
              <span className="ui-label">Dokununca açılacak ekran</span>
              <div className="ui-segmented">
                {TARGETS.map((target) => (
                  <button type="button" key={target.id} aria-pressed={form.target === target.id}
                    onClick={() => setForm((current) => ({ ...current, target: target.id }))}>
                    {target.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ui-between">
              <span className="ui-hint" style={{ marginTop: 0 }}>Aynı bildirim 10 dakika içinde ikinci kez gönderilemez.</span>
              <button type="submit" className="ui-btn ui-btn--primary" disabled={!canSend}>
                <Send />
                {sending ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </div>
        </form>

        <div className="ui-stack">
          <section className="ui-panel" aria-label="Önizleme">
            <div className="ui-panel-head">
              <h2>Önizleme</h2>
            </div>
            <div className="ui-panel-body">
              <div className="push-preview">
                <span className="push-preview-icon"><BellRing size={16} /></span>
                <div className="ui-grow">
                  <div className="ui-between">
                    <span className="push-preview-app">Benim Marketim</span>
                    <span className="ui-text-xs ui-muted">şimdi</span>
                  </div>
                  <strong className="ui-wrap-anywhere">{title || "Bildirim başlığı"}</strong>
                  <p className="ui-wrap-anywhere">{body || "Mesajınız burada görünecek."}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="ui-panel" aria-label="Gönderim geçmişi">
            <div className="ui-panel-head">
              <h2>Son gönderimler</h2>
            </div>
            {overview.history.length ? overview.history.map((item) => (
              <article key={item._id} className="ui-list-row">
                <div className="ui-grow">
                  <div className="ui-cluster">
                    <h3 className="ui-list-title ui-wrap-anywhere">{item.title}</h3>
                    <span className={`ui-badge ${item.sent ? "ui-badge--ok" : "ui-badge--danger"}`}>{item.sent ? "Gönderildi" : "Başarısız"}</span>
                  </div>
                  <p className="ui-text-sm ui-wrap-anywhere">{item.body}</p>
                  <p className="ui-hint">{audienceLabel(item.audience)} · {item.targetedCount || 0} kişi · {formatDate(item.createdAt)}{item.sentBy?.name ? ` · ${item.sentBy.name}` : ""}</p>
                </div>
              </article>
            )) : <div className="ui-empty">{loading ? "Yükleniyor…" : "Henüz toplu bildirim gönderilmedi."}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
