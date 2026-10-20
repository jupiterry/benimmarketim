// Entegrasyonlar bölümü: Telegram botu ve OneSignal bildirim servisi — yalnızca yapılandırılmış mı
// ve çalışıyor mu gösterilir; anahtar değerleri hiçbir zaman sunucudan çekilmez ya da gösterilmez.
import { useCallback, useEffect, useState } from "react";
import { BellRing, Lock, MessageCircle, Plug, RefreshCw, Send } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { Skeleton, timeAgo, useNow } from "../admin/ui";
import { Row, SectionHead, StatusPill } from "./fields";

const useStatus = (loader) => {
  const [state, setState] = useState({ status: "loading", data: null });
  const load = useCallback(async () => {
    setState((s) => ({ status: "loading", data: s.data }));
    try {
      setState({ status: "ready", data: await loader() });
    } catch {
      setState({ status: "error", data: null });
    }
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  return [state, load];
};

const loadTelegram = async () => (await axios.get("/telegram/status")).data;
const loadPush = async () => {
  const { data } = await axios.get("/notifications/broadcasts");
  return { configured: Boolean(data?.configured) };
};

const Card = ({ icon: Icon, title, description, state, onReload, pill, children, actions }) => (
  <article className="stg-integration" data-state={state.status}>
    <header className="stg-integration-head">
      <span className="stg-integration-icon"><Icon /></span>
      <div className="stg-integration-title">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="stg-integration-status">
        {state.status === "loading" ? <Skeleton width={96} height={22} radius={999} /> : state.status === "error" ? <StatusPill tone="danger">Durum alınamadı</StatusPill> : pill}
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={onReload} aria-label={`${title} durumunu yenile`} disabled={state.status === "loading"}>
          <RefreshCw className={state.status === "loading" ? "ui-spin" : ""} />
        </button>
      </div>
    </header>
    <div className="stg-integration-body">
      {state.status === "loading" && <div className="stg-live-grid"><Skeleton height={34} /><Skeleton height={34} /><Skeleton height={34} /></div>}
      {state.status === "error" && (
        <div className="ui-banner ui-banner--danger stg-banner">
          Sunucudan durum bilgisi alınamadı.
          <button type="button" className="ui-btn ui-btn--sm" onClick={onReload}>Tekrar dene</button>
        </div>
      )}
      {state.status === "ready" && children}
    </div>
    {state.status === "ready" && actions && <footer className="stg-integration-foot">{actions}</footer>}
  </article>
);

export default function IntegrationsSection() {
  const now = useNow(30000);
  const [telegram, reloadTelegram] = useStatus(loadTelegram);
  const [push, reloadPush] = useStatus(loadPush);
  const [testing, setTesting] = useState(false);

  const sendTest = async () => {
    try {
      setTesting(true);
      const { data } = await axios.post("/telegram/test");
      toast.success(data?.message || "Test bildirimi sıraya alındı");
    } catch (error) {
      toast.error(error.response?.data?.message || "Test bildirimi gönderilemedi");
    } finally {
      setTesting(false);
    }
  };

  const t = telegram.data;
  const telegramTone = !t ? "muted" : !t.paired ? "warn" : t.online ? "ok" : "danger";
  const telegramText = !t ? "—" : !t.paired ? "Bot bağlı değil" : t.online ? "Çalışıyor" : "Çevrimdışı";
  const pending = t?.counts?.pending || 0;
  const failed = t?.counts?.failed || 0;

  return (
    <div className="stg-section">
      <section className="ui-panel">
        <SectionHead icon={Plug} title="Entegrasyonlar" description="Dış servislerin durumu. Anahtarlar sunucuda tanımlıdır; burada yalnızca bağlı olup olmadığı görünür." />
        <div className="ui-panel-body stg-stack">
          <Card
            icon={MessageCircle}
            title="Telegram bildirimleri"
            description="Yeni sipariş ve müşteri mesajlarını Telegram'a iletir."
            state={telegram}
            onReload={reloadTelegram}
            pill={<StatusPill tone={telegramTone}>{telegramText}</StatusPill>}
            actions={
              <button type="button" className="ui-btn ui-btn--sm" onClick={sendTest} disabled={testing || !t?.paired}>
                <Send />{testing ? "Gönderiliyor…" : "Test bildirimi gönder"}
              </button>
            }
          >
            {t && (
              <dl className="stg-live-grid">
                <div><dt>Abone</dt><dd>{t.subscriberCount || 0} kişi</dd></div>
                <div><dt>Son gönderim</dt><dd>{t.lastSentAt ? timeAgo(t.lastSentAt, now) : "Henüz yok"}</dd></div>
                <div><dt>Kuyruk</dt><dd>{pending ? `${pending} bekliyor` : "Boş"}{failed ? ` · ${failed} hatalı` : ""}</dd></div>
                {t.lastError && <div className="stg-live-wide"><dt>Son hata</dt><dd className="stg-live-error">{String(t.lastError)}</dd></div>}
              </dl>
            )}
            {t && !t.paired && <p className="ui-hint">Botu bağlamak için Genel bakış ekranındaki Telegram kartından eşleştirme kodunu kullanın.</p>}
          </Card>

          <Card
            icon={BellRing}
            title="Uygulama bildirimleri (OneSignal)"
            description="Müşterilere sipariş durumu ve kampanya bildirimi gönderir."
            state={push}
            onReload={reloadPush}
            pill={<StatusPill tone={push.data?.configured ? "ok" : "warn"}>{push.data?.configured ? "Yapılandırılmış" : "Yapılandırılmamış"}</StatusPill>}
            actions={
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "push" }))}>
                Bildirim gönder ekranı
              </button>
            }
          >
            <dl className="stg-live-grid">
              <div><dt>Durum</dt><dd>{push.data?.configured ? "Anahtarlar tanımlı, gönderim açık" : "Sunucuda OneSignal anahtarları eksik"}</dd></div>
              <div><dt>Anahtarlar</dt><dd><span className="ui-badge"><Lock />Sunucuda</span></dd></div>
            </dl>
            {push.data && !push.data.configured && <p className="ui-hint">Sunucu .env dosyasına ONESIGNAL_APP_ID ve ONESIGNAL_REST_API_KEY eklenip yeniden başlatılmalı.</p>}
          </Card>

          <Row title="Yapay zekâ sağlayıcı anahtarları" description="Groq, OpenRouter ve Gemini anahtarları da sunucuda tutulur. Sağlayıcı ve model seçimi Yapay zekâ bölümünde.">
            <span className="ui-badge"><Lock />Sunucuda</span>
          </Row>
        </div>
      </section>
    </div>
  );
}
