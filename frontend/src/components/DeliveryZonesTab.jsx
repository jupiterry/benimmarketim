// Teslimat bölgeleri: üç SABİT bölge — Kız KYK Yurdu, Erkek KYK Yurdu ve Genel Devrek (Devrek merkezinin haritadaki
// sınırı). Bölge eklenmez/silinmez; her kartta siparişe aç/kapat (kapanma nedeni), ücret ("Ücretsiz" / "40 TL" /
// "X TL üstü ücretsiz"), minimum sepet (boş = genel), tahmini süre, ilk sipariş teyidi ve sipariş sayıları; her kart
// kendi "Kaydet"iyle kaydedilir. Devrek kartında "Teslimat alanı" (OpenStreetMap sınırı) bölümü vardır.
// Üstte "Adrese teslimat" anahtarı (Kapalı / Pilot / Herkese açık) ve "Her yerde ücretsiz teslimat" kampanyası, altta
// Kuryeler kartı. Anahtar "Kapalı" iken mevcut uygulama bugünkü gibi çalışır.
// Uç noktalar: GET /delivery/admin/zones, PUT /delivery/admin/zones/:id, POST /delivery/admin/zones/devrek/area/fetch,
// PUT/DELETE /delivery/admin/zones/devrek/area, GET/PUT /delivery/admin/settings, GET /settings (genel minimum sepet),
// GET/PUT /delivery/admin/couriers (Kuryeler kartı), GET /users/search (pilot kullanıcı araması).
// Değişiklikler sunucuda işlem kaydına yazılır.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Gift, Landmark, MapPin, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import { EmptyState, PageHeader, Skeleton } from "./admin/ui";
import RolloutCard from "./delivery-zones/RolloutCard";
import CouriersCard from "./delivery-zones/CouriersCard";
import ZoneCard from "./delivery-zones/ZoneCard";
import DevrekAreaSection from "./delivery-zones/DevrekAreaSection";
import { DEVREK_ID, FIXED_ZONES, errorMessage, normalizeZone, num } from "./delivery-zones/shared";
import "../styles/delivery-zones.css";

const API = "/delivery/admin";
const ZONE_ICONS = { girlsDorm: Building2, boysDorm: Building2, [DEVREK_ID]: Landmark };

const normalizeSettings = (data = {}, previous = null) => ({
  addressOrdering: ["off", "pilot", "public"].includes(data.addressOrdering) ? data.addressOrdering : previous?.addressOrdering || "off",
  freeDeliveryEverywhere: data.freeDeliveryEverywhere === undefined ? Boolean(previous?.freeDeliveryEverywhere) : Boolean(data.freeDeliveryEverywhere),
  pilotUsers: Array.isArray(data.pilotUsers) ? data.pilotUsers : previous?.pilotUsers || [],
});

const CardSkeleton = ({ wide }) => (
  <div className="ui-panel dz-card dz-card--skel" data-wide={wide || undefined} aria-hidden="true">
    <Skeleton width="45%" height={18} />
    <Skeleton width="70%" />
    <Skeleton height={64} radius={10} />
    <Skeleton height={40} radius={10} />
    <Skeleton height={40} radius={10} />
  </div>
);

const DeliveryZonesTab = () => {
  const { confirm } = useConfirm();
  // ── Veri ──
  const [zones, setZones] = useState(null);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState("");
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [generalMinimum, setGeneralMinimum] = useState(null);
  const [busy, setBusy] = useState(""); // "mode" | "campaign"
  const [pilotBusyId, setPilotBusyId] = useState("");

  const loadZones = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setZonesLoading(true);
    try {
      const { data } = await axios.get(`${API}/zones`);
      setZones((Array.isArray(data?.zones) ? data.zones : []).map(normalizeZone));
      setZonesError("");
    } catch (error) {
      setZonesError(errorMessage(error, "Bölgeler yüklenemedi"));
    } finally {
      setZonesLoading(false);
    }
  }, []);
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const { data } = await axios.get(`${API}/settings`);
      setSettings((prev) => normalizeSettings(data, prev));
      setSettingsError("");
    } catch (error) {
      setSettingsError(errorMessage(error, "Ayarlar yüklenemedi"));
    } finally {
      setSettingsLoading(false);
    }
  }, []);
  const loadGeneral = useCallback(async () => {
    try {
      const { data } = await axios.get("/settings");
      const value = Number(data?.minimumOrderAmount);
      setGeneralMinimum(Number.isFinite(value) ? value : null);
    } catch {
      setGeneralMinimum(null); // genel minimum bilinmiyorsa "Genel" yazılır
    }
  }, []);
  const refreshAll = useCallback(() => { loadZones(); loadSettings(); loadGeneral(); }, [loadZones, loadSettings, loadGeneral]);
  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ── Türetilmiş ──
  const byId = useMemo(() => new Map((zones || []).map((z) => [z._id, z])), [zones]);
  const cards = useMemo(() => FIXED_ZONES.map((meta) => ({ ...meta, zone: byId.get(meta.id) || null })), [byId]);
  const totals = useMemo(() => {
    const list = cards.map((c) => c.zone).filter(Boolean);
    return {
      open: list.filter((z) => z.enabled).length,
      paid: list.filter((z) => z.deliveryFee > 0).length,
      orders: list.reduce((s, z) => s + z.ordersThisMonth, 0),
    };
  }, [cards]);
  const campaign = Boolean(settings?.freeDeliveryEverywhere);
  const devrek = byId.get(DEVREK_ID);

  // ── Bölge kaydetme (kart başına) ──
  const patchZone = useCallback((id, patch) => {
    setZones((prev) => (prev || []).map((z) => (z._id === id ? normalizeZone({ ...z, ...patch }) : z)));
  }, []);

  const saveZone = useCallback(async (zone, payload, title) => {
    try {
      const { data } = await axios.put(`${API}/zones/${encodeURIComponent(zone._id)}`, payload);
      const saved = data?.zone;
      patchZone(zone._id, saved ? { ...saved, area: zone.area, areaCandidates: zone.areaCandidates } : payload);
      toast.success(`${title} kaydedildi`);
      loadZones({ silent: true });
      return { ok: true };
    } catch (error) {
      return { error: errorMessage(error, "Kaydedilemedi. Bağlantıyı kontrol edip tekrar deneyin.") };
    }
  }, [loadZones, patchZone]);

  const onAreaChange = useCallback((patch) => patchZone(DEVREK_ID, patch), [patchZone]);

  // ── Adrese teslimat ayarları ──
  const putSettings = async (patch) => {
    const { data } = await axios.put(`${API}/settings`, patch);
    setSettings((prev) => {
      const base = { ...prev, ...("pilotUserIds" in patch ? {} : patch) };
      return data && typeof data === "object" && "addressOrdering" in data ? normalizeSettings(data, base) : normalizeSettings(base, prev);
    });
  };

  const changeMode = async (mode) => {
    const current = settings?.addressOrdering;
    if (mode === "public") {
      const ok = await confirm({
        title: "Adrese teslimat herkese açılsın mı?",
        message: `Güncel uygulamayı kullanan tüm müşteriler ${num(totals.open)} açık bölgeye sipariş verebilecek${devrek?.enabled ? "; Devrek'te adres ve haritada konum girerek" : ""}. Yurt siparişleri bugünkü gibi sürer.`,
        confirmText: "Herkese aç",
        type: "warning",
      });
      if (!ok) return;
    } else if (current === "public") {
      const ok = await confirm({
        title: mode === "off" ? "Adrese teslimat kapatılsın mı?" : "Yalnızca pilot kullanıcılara dönülsün mü?",
        message: mode === "off"
          ? "Müşteriler yeniden yalnızca yurtlara sipariş verebilir. Verilmiş siparişler etkilenmez."
          : `Adrese teslimat yalnızca ${num(settings.pilotUsers.length)} pilot kullanıcıya açık kalır; diğer müşteriler yalnızca yurtlara sipariş verebilir.`,
        confirmText: mode === "off" ? "Kapat" : "Pilota dön",
        type: "warning",
      });
      if (!ok) return;
    }
    setBusy("mode");
    try {
      await putSettings({ addressOrdering: mode });
      toast.success(mode === "off" ? "Adrese teslimat kapatıldı; uygulama bugünkü gibi çalışıyor"
        : mode === "pilot" ? `Pilot açıldı: ${num(settings.pilotUsers.length)} kullanıcı adrese sipariş verebilir`
          : "Adrese teslimat herkese açıldı");
    } catch (error) {
      toast.error(errorMessage(error, "Adrese teslimat ayarı kaydedilemedi"));
    } finally {
      setBusy("");
    }
  };

  const toggleCampaign = async () => {
    const on = !campaign;
    const ok = await confirm(on ? {
      title: "Her yerde ücretsiz teslimat açılsın mı?",
      message: `Kapatana kadar tüm bölgelerde teslimat ücreti alınmaz${totals.paid ? ` (ücretli ${num(totals.paid)} bölge dahil)` : ""}. Bölge ücretleri silinmez.`,
      confirmText: "Kampanyayı aç",
      type: "warning",
    } : {
      title: "Ücretsiz teslimat kampanyası bitirilsin mi?",
      message: "Bölgelerin kendi teslimat ücretleri ve eşikleri yeniden uygulanır.",
      confirmText: "Kampanyayı bitir",
      type: "warning",
    });
    if (!ok) return;
    setBusy("campaign");
    try {
      await putSettings({ freeDeliveryEverywhere: on });
      toast.success(on ? "Her yerde ücretsiz teslimat açıldı" : "Kampanya bitti; bölge ücretleri geçerli");
    } catch (error) {
      toast.error(errorMessage(error, "Kampanya ayarı kaydedilemedi"));
    } finally {
      setBusy("");
    }
  };

  const setPilots = async (nextUsers, { busyId, success, failure }) => {
    const previous = settings.pilotUsers;
    setPilotBusyId(busyId);
    setSettings((s) => ({ ...s, pilotUsers: nextUsers }));
    try {
      await putSettings({ pilotUserIds: nextUsers.map((u) => String(u._id)) });
      toast.success(success);
    } catch (error) {
      setSettings((s) => ({ ...s, pilotUsers: previous }));
      toast.error(errorMessage(error, failure));
    } finally {
      setPilotBusyId("");
    }
  };
  const addPilot = (user) => {
    if (settings.pilotUsers.some((u) => String(u._id) === String(user._id))) return;
    const slim = { _id: user._id, name: user.name, email: user.email, phone: user.phone };
    setPilots([...settings.pilotUsers, slim], { busyId: String(user._id), success: `${user.name || "Kullanıcı"} pilota eklendi`, failure: "Pilot listesi kaydedilemedi" });
  };
  const removePilot = (user) => {
    setPilots(settings.pilotUsers.filter((u) => String(u._id) !== String(user._id)),
      { busyId: String(user._id), success: `${user.name || "Kullanıcı"} pilottan çıkarıldı`, failure: "Pilot listesi kaydedilemedi" });
  };

  const initialZones = zonesLoading && !zones;

  return (
    <div className="ui-page dz">
      <PageHeader
        title="Teslimat bölgeleri"
        meta={zones ? `${num(totals.open)}/3 açık · bu ay ${num(totals.orders)} sipariş` : undefined}
        description="Üç sabit teslimat bölgesi: Kız KYK Yurdu, Erkek KYK Yurdu ve Genel Devrek (Devrek merkezinin haritadaki sınırı). Bölgeleri açıp kapatın; ücretini, minimum sepeti ve süreyi ayarlayın."
        actions={(
          <button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll} disabled={zonesLoading && settingsLoading} title="Yenile">
            <RefreshCw className={zonesLoading || settingsLoading ? "ui-spin" : undefined} />Yenile
          </button>
        )}
      />

      {campaign && (
        <div className="ui-banner dz-campaign-banner" role="status">
          <Gift />
          <span className="ui-grow">
            <strong>Her yerde ücretsiz teslimat açık.</strong> Tüm bölgelerde teslimat ücreti alınmıyor; kartlardaki ücretler kampanya bitince geçerli olur.
            {settings?.addressOrdering === "off" && " Adrese teslimat kapalı olduğu için şu an müşteriye bir etkisi yok."}
          </span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={toggleCampaign} disabled={Boolean(busy)}>Kampanyayı bitir</button>
        </div>
      )}

      {/* Pilot kullanıcı araması PilotPicker içinde sunucuda yapılır (GET /users/search); müşteri listesi indirilmez */}
      <RolloutCard settings={settings} loading={settingsLoading} error={settingsError} busy={busy}
        openZones={totals.open} pilotBusyId={pilotBusyId} onRetry={loadSettings} onChangeMode={changeMode} onToggleCampaign={toggleCampaign}
        onAddPilot={addPilot} onRemovePilot={removePilot} />
      {settingsError && settings && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle /><span className="ui-grow">Ayarlar yenilenemedi: {settingsError}. Gösterilen değerler son başarılı yüklemeden.</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={loadSettings}><RefreshCw />Tekrar dene</button>
        </div>
      )}

      {zonesError && zones && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle /><span className="ui-grow">Bölgeler yenilenemedi: {zonesError}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => loadZones()}><RefreshCw />Tekrar dene</button>
        </div>
      )}

      <div className="dz-cards" aria-label="Teslimat bölgeleri" aria-busy={initialZones || undefined}>
        {initialZones ? (
          <><CardSkeleton /><CardSkeleton /><CardSkeleton wide /></>
        ) : !zones ? (
          <div className="ui-panel dz-cards-empty">
            <EmptyState icon={AlertTriangle} title="Bölgeler yüklenemedi" description={`${zonesError || "Bilinmeyen hata"}. Bağlantıyı kontrol edip tekrar deneyin.`}
              action={<button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => loadZones()}><RefreshCw />Tekrar dene</button>} />
          </div>
        ) : cards.map(({ id, title, note, zone }) => (zone ? (
          <ZoneCard key={id} zone={zone} title={title} note={note} icon={ZONE_ICONS[id]} generalMinimum={generalMinimum} campaign={campaign}
            onSave={saveZone} wide={id === DEVREK_ID}>
            {id === DEVREK_ID ? <DevrekAreaSection zone={zone} onAreaChange={onAreaChange} /> : null}
          </ZoneCard>
        ) : (
          <div key={id} className="ui-panel dz-card dz-card--missing" data-wide={id === DEVREK_ID || undefined}>
            <EmptyState compact icon={MapPin} title={`${title} bulunamadı`} description="Sunucu bu bölgeyi henüz oluşturmadı. Sayfayı yenileyin."
              action={<button type="button" className="ui-btn ui-btn--sm" onClick={() => loadZones()}><RefreshCw />Yenile</button>} />
          </div>
        )))}
      </div>

      <CouriersCard />

      <p className="ui-hint dz-foot-note dz-page-note"><MapPin aria-hidden="true" />Kapalı bölgeler müşteriye gösterilmez. Bölgeler sabittir; eklenemez ya da silinemez. Değişiklikler işlem kayıtlarına yazılır.</p>
    </div>
  );
};

export default DeliveryZonesTab;
