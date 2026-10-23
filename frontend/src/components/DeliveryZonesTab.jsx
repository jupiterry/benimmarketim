// Teslimat bölgeleri: yurt, mahalle ve köy bölgelerini; teslimat ücretini ("Ücretsiz" / "40 TL" / "X TL üstü ücretsiz"),
// bölgeye özel minimum sepeti ve tahmini süreyi yönetir. Üstte "Adrese teslimat" anahtarı (Kapalı / Pilot / Herkese açık)
// ve "Her yerde ücretsiz teslimat" kampanyası bulunur. Anahtar "Kapalı" iken mevcut uygulama bugünkü gibi çalışır.
// Uç noktalar: GET/POST /delivery/admin/zones, PUT/DELETE /delivery/admin/zones/:id, PATCH /delivery/admin/zones/bulk,
// GET/PUT /delivery/admin/settings, GET /settings (genel minimum sepet), GET/PUT /delivery/admin/couriers (Kuryeler kartı).
// Değişiklikler sunucuda işlem kaydına yazılır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Gift, Keyboard, MapPin, MapPinned, Plus, RefreshCw, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import { EmptyState, PageHeader, ShortcutHelp, SkeletonRows, SortHead, fold, undoable, useListShortcuts, usePref } from "./admin/ui";
import RolloutCard from "./delivery-zones/RolloutCard";
import CouriersCard from "./delivery-zones/CouriersCard";
import ZoneRow from "./delivery-zones/ZoneRow";
import ZoneDrawer from "./delivery-zones/ZoneDrawer";
import BulkBar from "./delivery-zones/BulkBar";
import { FIRST_DIR, SORTS, TYPES, TYPE_ORDER, errorMessage, matchesQuery, normalizeZone, num, sortZones, tl } from "./delivery-zones/shared";
import "../styles/delivery-zones.css";

const API = "/delivery/admin";
const STATUS_FILTERS = [
  { value: "open", label: "Açık", test: (z) => z.enabled },
  { value: "closed", label: "Kapalı", test: (z) => !z.enabled },
  { value: "paid", label: "Ücretli", test: (z) => z.deliveryFee > 0 },
];
const SHORTCUT_ITEMS = [[["x"], "Satırı seç / bırak"], [["⇧", "tık"], "Aralık seç"], [["t"], "Seçili satırı aç / kapat"], [["n"], "Yeni bölge"], [["r"], "Yenile"]];

const normalizeSettings = (data = {}, previous = null) => ({
  addressOrdering: ["off", "pilot", "public"].includes(data.addressOrdering) ? data.addressOrdering : previous?.addressOrdering || "off",
  freeDeliveryEverywhere: data.freeDeliveryEverywhere === undefined ? Boolean(previous?.freeDeliveryEverywhere) : Boolean(data.freeDeliveryEverywhere),
  pilotUsers: Array.isArray(data.pilotUsers) ? data.pilotUsers : previous?.pilotUsers || [],
});
/** Toplu güncellemenin yerel karşılığı (sunucu yanıtı beklenmeden liste güncellenir, sonra sessizce yeniden çekilir) */
const applySet = (zone, set) => ({ ...zone, ...set, ...(set.enabled ? { closedReason: zone.closedReason } : {}) });

const DeliveryZonesTab = ({ users: usersProp }) => {
  const { confirm } = useConfirm();
  // ── Veri ──
  const [zones, setZones] = useState(null);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState("");
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [generalMinimum, setGeneralMinimum] = useState(null);
  const [fallbackUsers, setFallbackUsers] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  // ── Görünüm ──
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = usePref("dz-sort", { key: "sortOrder", dir: "asc" });
  const [selected, setSelected] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [drawer, setDrawer] = useState(null); // { zone: null (yeni) | zone }
  const [busy, setBusy] = useState(""); // "mode" | "campaign"
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pilotBusyId, setPilotBusyId] = useState("");
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const lastIndexRef = useRef(null);
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

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

  // Müşteri listesi AdminPage'den gelir; gelmezse pilot aramasında ilk odakta bir kez çekilir
  const users = usersProp ?? fallbackUsers;
  const needUsers = useCallback(async () => {
    if (usersProp !== undefined || fallbackUsers || usersLoading) return;
    setUsersLoading(true);
    try {
      const { data } = await axios.get("/users");
      setFallbackUsers(data?.users || []);
    } catch (error) {
      toast.error(errorMessage(error, "Müşteri listesi yüklenemedi"));
    } finally {
      setUsersLoading(false);
    }
  }, [usersProp, fallbackUsers, usersLoading]);

  // ── Türetilmiş liste ──
  const all = useMemo(() => zones || [], [zones]);
  const q = fold(query.trim());
  const statusTest = STATUS_FILTERS.find((f) => f.value === statusFilter)?.test;
  const typeCounts = useMemo(() => {
    const base = all.filter((z) => matchesQuery(z, q) && (!statusTest || statusTest(z)));
    const counts = { all: base.length };
    for (const t of TYPE_ORDER) counts[t] = base.filter((z) => z.type === t).length;
    return counts;
  }, [all, q, statusTest]);
  const statusCounts = useMemo(() => {
    const base = all.filter((z) => matchesQuery(z, q) && (typeFilter === "all" || z.type === typeFilter));
    return Object.fromEntries(STATUS_FILTERS.map((f) => [f.value, base.filter(f.test).length]));
  }, [all, q, typeFilter]);
  const rows = useMemo(() => sortZones(
    all.filter((z) => matchesQuery(z, q) && (typeFilter === "all" || z.type === typeFilter) && (!statusTest || statusTest(z))),
    sort.key, sort.dir,
  ), [all, q, typeFilter, statusTest, sort.key, sort.dir]);
  const totals = useMemo(() => ({
    open: all.filter((z) => z.enabled).length,
    paid: all.filter((z) => z.deliveryFee > 0).length,
    orders: all.reduce((s, z) => s + z.ordersThisMonth, 0),
  }), [all]);
  const hasFilter = Boolean(q) || typeFilter !== "all" || statusFilter !== "all";
  const nextSort = useMemo(() => (all.length ? Math.max(...all.map((z) => z.sortOrder)) + 10 : 10), [all]);
  const campaign = Boolean(settings?.freeDeliveryEverywhere);

  // Silinen/yeniden yüklenen bölgeler seçimden düşer
  useEffect(() => {
    if (!zones) return;
    setSelected((prev) => {
      const ids = new Set(zones.map((z) => z._id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [zones]);
  useEffect(() => { setCursor((c) => (c >= rows.length ? rows.length - 1 : c)); }, [rows.length]);
  useEffect(() => {
    if (cursor < 0) return;
    listRef.current?.querySelector("[data-cursor]")?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const clearFilters = () => { setQuery(""); setTypeFilter("all"); setStatusFilter("all"); };
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] || "asc" }));

  // ── Seçim ──
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const toggleSelect = useCallback((id, index, shift) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const on = !prev.has(id);
      if (shift && lastIndexRef.current !== null) {
        const [a, b] = [Math.min(lastIndexRef.current, index), Math.max(lastIndexRef.current, index)];
        for (const z of rowsRef.current.slice(a, b + 1)) { if (on) next.add(z._id); else next.delete(z._id); }
      } else if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    lastIndexRef.current = index;
  }, []);
  const allVisibleSelected = rows.length > 0 && rows.every((z) => selected.has(z._id));
  const someVisibleSelected = rows.some((z) => selected.has(z._id));
  const headCheckRef = useRef(null);
  useEffect(() => { if (headCheckRef.current) headCheckRef.current.indeterminate = someVisibleSelected && !allVisibleSelected; });
  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allVisibleSelected) rows.forEach((z) => next.delete(z._id));
    else rows.forEach((z) => next.add(z._id));
    return next;
  });
  const clearSelection = () => { setSelected(new Set()); lastIndexRef.current = null; };

  // ── Bölge işlemleri ──
  const patchZones = (ids, set) => axios.patch(`${API}/zones/bulk`, { ids, set });
  const updateLocal = (ids, set) => {
    const idSet = new Set(ids);
    setZones((prev) => (prev || []).map((z) => (idSet.has(z._id) ? applySet(z, set) : z)));
  };

  const toggleEnabled = useCallback(async (zone) => {
    const enabled = !zone.enabled;
    if (zone.type === "yurt" && !enabled) {
      const ok = await confirm({
        title: `${zone.name} kapatılsın mı?`,
        message: "Bu yurt mevcut mobil uygulamada da hemen siparişe kapanır (Mağaza ayarlarındaki yurt anahtarıyla aynıdır).",
        confirmText: "Yurdu kapat",
        type: "warning",
      });
      if (!ok) return;
    }
    updateLocal([zone._id], { enabled });
    try {
      await patchZones([zone._id], { enabled });
      undoable({
        message: `${zone.name} siparişe ${enabled ? "açıldı" : "kapatıldı"}`,
        commit: () => {},
        undo: async () => {
          updateLocal([zone._id], { enabled: zone.enabled });
          try {
            await patchZones([zone._id], { enabled: zone.enabled });
            toast.success(`${zone.name} yeniden ${zone.enabled ? "açık" : "kapalı"}`);
          } catch (error) {
            updateLocal([zone._id], { enabled });
            toast.error(errorMessage(error, "Geri alınamadı"));
          }
        },
      });
    } catch (error) {
      updateLocal([zone._id], { enabled: zone.enabled });
      toast.error(errorMessage(error, `${zone.name} güncellenemedi`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm]);

  const deleteZone = useCallback((zone) => {
    if (zone.type === "yurt") { toast.error("Yurt bölgeleri silinemez; kapatabilirsiniz."); return; }
    if (zone.ordersTotal > 0) { toast.error("Siparişi olan bölge silinemez; kapatabilirsiniz."); return; }
    setDrawer(null);
    const restore = () => setZones((prev) => ((prev || []).some((z) => z._id === zone._id) ? prev : [...(prev || []), zone]));
    setZones((prev) => (prev || []).filter((z) => z._id !== zone._id));
    undoable({
      message: `${zone.name} silindi`,
      commit: async () => {
        try {
          await axios.delete(`${API}/zones/${encodeURIComponent(zone._id)}`);
        } catch (error) {
          restore();
          toast.error(error?.response?.status === 409
            ? errorMessage(error, `${zone.name} silinemedi: bu bölgeye verilmiş sipariş var. Bölgeyi kapatabilirsiniz.`)
            : errorMessage(error, `${zone.name} silinemedi`), { duration: 6000 });
        }
      },
      undo: restore,
    });
  }, []);

  const saveZone = useCallback(async (payload, zone) => {
    try {
      const { data } = zone
        ? await axios.put(`${API}/zones/${encodeURIComponent(zone._id)}`, payload)
        : await axios.post(`${API}/zones`, payload);
      const saved = data?.zone || (data?._id ? data : null);
      if (saved) {
        const next = normalizeZone({ ...(zone || {}), ...saved });
        setZones((prev) => {
          const list = prev || [];
          return list.some((z) => z._id === next._id) ? list.map((z) => (z._id === next._id ? { ...z, ...next } : z)) : [...list, next];
        });
      }
      toast.success(zone ? `${payload.name} kaydedildi` : `${payload.name} eklendi${payload.enabled ? "" : " (kapalı)"}`);
      setDrawer(null);
      loadZones({ silent: true });
      return { ok: true };
    } catch (error) {
      return { error: errorMessage(error, "Kaydedilemedi. Bağlantıyı kontrol edip tekrar deneyin.") };
    }
  }, [loadZones]);

  const bulkAction = async (kind, value) => {
    const ids = [...selected];
    if (!ids.length) return false;
    const chosen = all.filter((z) => selected.has(z._id));
    const n = ids.length;
    let set;
    let message;
    if (kind === "free" || (kind === "fee" && value === 0)) { set = { deliveryFee: 0 }; message = (c) => `${num(c)} bölge ücretsiz yapıldı`; }
    else if (kind === "fee") { set = { deliveryFee: value }; message = (c) => `${num(c)} bölgenin teslimat ücreti ${tl(value)} yapıldı`; }
    else if (kind === "threshold") {
      set = { freeDeliveryThreshold: value };
      const freeCount = chosen.filter((z) => z.deliveryFee === 0).length;
      message = (c) => (value === null ? `${num(c)} bölgenin ücretsiz eşiği kaldırıldı` : `${num(c)} bölgede ${tl(value)} üstü ücretsiz`)
        + (value !== null && freeCount ? ` (${num(freeCount)} bölge zaten ücretsiz)` : "");
    } else if (kind === "minimum") {
      set = { minimumOrderAmount: value };
      message = (c) => (value === null ? `${num(c)} bölge genel minimum sepete döndü` : value === 0 ? `${num(c)} bölgede minimum sepet kaldırıldı` : `${num(c)} bölgede minimum sepet ${tl(value)}`);
    } else if (kind === "open") { set = { enabled: true }; message = (c) => `${num(c)} bölge siparişe açıldı`; }
    else if (kind === "callbackOn") { set = { requireFirstOrderCallback: true }; message = (c) => `${num(c)} bölgede ilk sipariş telefonla teyit edilecek`; }
    else if (kind === "callbackOff") { set = { requireFirstOrderCallback: false }; message = (c) => `${num(c)} bölgede ilk sipariş teyidi kapatıldı`; }
    else if (kind === "close") {
      const yurts = chosen.filter((z) => z.type === "yurt" && z.enabled);
      const ok = await confirm({
        title: `${num(n)} bölge kapatılsın mı?`,
        message: yurts.length
          ? `Seçimde ${yurts.map((z) => z.name).join(", ")} var: mevcut mobil uygulamada da siparişe kapanır. Kapanma nedeni yazmak için bölgeyi tek tek düzenleyin.`
          : "Bu bölgelere sipariş alınmaz ve müşteri listesinde görünmezler. Kapanma nedeni yazmak için bölgeyi tek tek düzenleyin.",
        confirmText: "Kapat",
        type: "warning",
      });
      if (!ok) return false;
      set = { enabled: false };
      message = (c) => `${num(c)} bölge siparişe kapatıldı`;
    } else return false;

    setBulkBusy(true);
    try {
      const { data } = await patchZones(ids, set);
      updateLocal(ids, set);
      toast.success(message(Number.isFinite(Number(data?.updated)) ? Number(data.updated) : n));
      loadZones({ silent: true });
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Toplu işlem uygulanamadı"));
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

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
        message: `Güncel uygulamayı kullanan tüm müşteriler ${num(totals.open)} açık bölgeye adres girerek sipariş verebilecek. Yurt siparişleri bugünkü gibi sürer.`,
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

  // ── Klavye ──
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    searchEscape: () => { if (query) setQuery(""); else searchRef.current?.blur(); },
    move: (d) => setCursor((c) => Math.max(0, Math.min(rows.length - 1, c + d))),
    open: () => { const z = rows[cursor]; if (z) setDrawer({ zone: z }); },
    escape: () => { if (selected.size) clearSelection(); else setCursor(-1); },
    extra: {
      x: () => { const z = rows[cursor]; if (z) toggleSelect(z._id, cursor, false); },
      t: () => { const z = rows[cursor]; if (z) toggleEnabled(z); },
      n: () => setDrawer({ zone: null }),
      r: refreshAll,
    },
  }, { enabled: !drawer });

  const openZone = useCallback((zone) => setDrawer({ zone }), []);
  const initialZones = zonesLoading && !zones;

  return (
    <div className="ui-page dz" data-selecting={selected.size > 0 || undefined}>
      <PageHeader
        title="Teslimat bölgeleri"
        meta={zones ? `${num(totals.open)} açık` : undefined}
        description="Teslimat yapılan yurt, mahalle ve köyleri; teslimat ücretini, ücretsiz teslimat eşiğini ve minimum sepeti buradan yönetin."
        actions={(
          <>
            <button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll} disabled={zonesLoading && settingsLoading} title="Yenile (r)">
              <RefreshCw className={zonesLoading || settingsLoading ? "ui-spin" : undefined} />Yenile
            </button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm dz-help-btn" onClick={() => setHelpOpen(true)} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)"><Keyboard /></button>
            <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => setDrawer({ zone: null })} title="Yeni bölge (n)"><Plus />Bölge ekle</button>
          </>
        )}
      />

      {campaign && (
        <div className="ui-banner dz-campaign-banner" role="status">
          <Gift />
          <span className="ui-grow">
            <strong>Her yerde ücretsiz teslimat açık.</strong> Tüm bölgelerde teslimat ücreti alınmıyor; listedeki üstü çizili ücretler kampanya bitince geçerli olur.
            {settings?.addressOrdering === "off" && " Adrese teslimat kapalı olduğu için şu an müşteriye bir etkisi yok."}
          </span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={toggleCampaign} disabled={Boolean(busy)}>Kampanyayı bitir</button>
        </div>
      )}

      <RolloutCard settings={settings} loading={settingsLoading} error={settingsError} busy={busy} users={users} usersLoading={usersLoading}
        openZones={totals.open} pilotBusyId={pilotBusyId} onRetry={loadSettings} onChangeMode={changeMode} onToggleCampaign={toggleCampaign}
        onAddPilot={addPilot} onRemovePilot={removePilot} onNeedUsers={needUsers} />
      {settingsError && settings && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle /><span className="ui-grow">Ayarlar yenilenemedi: {settingsError}. Gösterilen değerler son başarılı yüklemeden.</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={loadSettings}><RefreshCw />Tekrar dene</button>
        </div>
      )}

      <CouriersCard />

      <section className="ui-panel dz-list" aria-label="Bölgeler">
        {all.length > 0 && (
          <div className="dz-toolbar">
            <label className="ui-search dz-search">
              <Search />
              <input ref={searchRef} type="search" className="ui-field" placeholder="Bölge ara" aria-label="Bölge ara" value={query}
                onChange={(e) => setQuery(e.target.value)} data-esc-clear="1" />
            </label>
            <div className="dz-chips-wrap">
              <div className="ui-chips" role="group" aria-label="Bölge türü">
                <button type="button" aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")}>Tümü<span className="ui-count">{typeCounts.all}</span></button>
                {TYPE_ORDER.map((t) => (
                  <button key={t} type="button" aria-pressed={typeFilter === t} onClick={() => setTypeFilter((v) => (v === t ? "all" : t))}>
                    {TYPES[t].label}<span className="ui-count">{typeCounts[t]}</span>
                  </button>
                ))}
              </div>
              <span className="dz-chips-sep" aria-hidden="true" />
              <div className="ui-chips" role="group" aria-label="Durum">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.value} type="button" aria-pressed={statusFilter === f.value} onClick={() => setStatusFilter((v) => (v === f.value ? "all" : f.value))}>
                    {f.label}<span className="ui-count">{statusCounts[f.value]}</span>
                  </button>
                ))}
              </div>
            </div>
            <select className="ui-field ui-field--auto dz-sort" aria-label="Sıralama" value={SORTS.some((s) => s.value === sort.key) ? sort.key : "sortOrder"}
              onChange={(e) => { const s = SORTS.find((x) => x.value === e.target.value); setSort({ key: s.value, dir: s.dir }); }}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}

        {all.length > 0 && (
          <div className="dz-result" aria-live="polite">
            <span className="ui-text-sm">
              <strong className="ui-num">{num(rows.length)}</strong> bölge{hasFilter ? <span className="ui-muted ui-num"> ({num(all.length)} içinde)</span> : ""}
              <span className="ui-muted"> · {num(totals.open)} açık · {num(totals.paid)} ücretli · bu ay <span className="ui-num">{num(totals.orders)}</span> sipariş</span>
            </span>
            <span className="ui-grow" />
            {hasFilter && <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={clearFilters}><X />Filtreleri temizle</button>}
          </div>
        )}

        {zonesError && zones && (
          <div className="ui-banner ui-banner--danger dz-list-banner" role="alert">
            <AlertTriangle /><span className="ui-grow">Bölgeler yenilenemedi: {zonesError}</span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => loadZones()}><RefreshCw />Tekrar dene</button>
          </div>
        )}

        {initialZones ? (
          <div className="dz-skel"><SkeletonRows rows={7} /></div>
        ) : !zones ? (
          <EmptyState icon={AlertTriangle} title="Bölgeler yüklenemedi" description={`${zonesError || "Bilinmeyen hata"}. Bağlantıyı kontrol edip tekrar deneyin.`}
            action={<button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => loadZones()}><RefreshCw />Tekrar dene</button>} />
        ) : all.length === 0 ? (
          <EmptyState icon={MapPinned} title="Henüz bölge yok — ilk mahalleyi ekleyin"
            description="Mahalle ve köyleri ekleyip ücretlerini belirleyin. Bölgeler kapalı eklenir; hazır olunca açarsınız."
            action={<button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => setDrawer({ zone: null })}><Plus />Bölge ekle</button>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Search} title="Bu filtrelere uyan bölge yok" description="Aramayı ya da filtreleri değiştirin."
            action={<button type="button" className="ui-btn ui-btn--sm" onClick={clearFilters}><X />Filtreleri temizle</button>} />
        ) : (
          <div className="dz-table" role="table" aria-label="Teslimat bölgeleri" aria-rowcount={rows.length + 1} data-campaign={campaign || undefined}>
            <div className="dz-row dz-head" role="row">
              <span className="dz-cell dz-cell--check" role="columnheader">
                <label className="dz-check">
                  <input ref={headCheckRef} type="checkbox" className="ui-checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                    aria-label="Görünen bölgelerin hepsini seç" />
                </label>
              </span>
              <span className="dz-cell dz-cell--name" role="columnheader"><SortHead label="Bölge" sortKey="name" sort={sort.key} dir={sort.dir} onSort={onSort} /></span>
              <span className="dz-cell dz-cell--status" role="columnheader">Durum</span>
              <span className="dz-cell dz-cell--fee" role="columnheader"><SortHead label="Ücret" sortKey="fee" sort={sort.key} dir={sort.dir} onSort={onSort} /></span>
              <span className="dz-cell dz-cell--threshold" role="columnheader">Ücretsiz eşiği</span>
              <span className="dz-cell dz-cell--minimum" role="columnheader"><SortHead label="Minimum" sortKey="minimum" sort={sort.key} dir={sort.dir} onSort={onSort} /></span>
              <span className="dz-cell dz-cell--eta" role="columnheader">Süre</span>
              <span className="dz-cell dz-cell--orders" role="columnheader"><SortHead label="Bu ay" sortKey="orders" sort={sort.key} dir={sort.dir} onSort={onSort} /></span>
              <span className="dz-cell dz-cell--actions" role="columnheader"><span className="dz-sr">İşlemler</span></span>
            </div>
            <div className="dz-body" role="rowgroup" ref={listRef}>
              {rows.map((zone, index) => (
                <ZoneRow key={zone._id} zone={zone} index={index} selected={selected.has(zone._id)} cursor={index === cursor}
                  campaign={campaign} generalMinimum={generalMinimum} onToggleSelect={toggleSelect} onOpen={openZone}
                  onToggleEnabled={toggleEnabled} onDelete={deleteZone} />
              ))}
            </div>
          </div>
        )}

        {selected.size > 0 && (
          <BulkBar count={selected.size} busy={bulkBusy} onAction={bulkAction} onClear={clearSelection} generalMinimum={generalMinimum} />
        )}

        {zones && rows.length > 0 && (
          <div className="dz-foot">
            <span className="ui-hint dz-foot-note"><MapPin aria-hidden="true" />Kapalı bölgeler müşteriye gösterilmez. Değişiklikler işlem kayıtlarına yazılır.</span>
            <span className="ui-hint dz-kbd"><kbd className="ui-kbd">/</kbd> ara · <kbd className="ui-kbd">j</kbd><kbd className="ui-kbd">k</kbd> gez · <kbd className="ui-kbd">x</kbd> seç · <kbd className="ui-kbd">t</kbd> aç/kapat · <kbd className="ui-kbd">?</kbd> yardım</span>
          </div>
        )}
      </section>

      {drawer && (
        <ZoneDrawer key={drawer.zone?._id || "new"} zone={drawer.zone} zones={all} nextSort={nextSort} generalMinimum={generalMinimum} campaign={campaign}
          onClose={() => setDrawer(null)} onSave={saveZone} onDelete={deleteZone} />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={SHORTCUT_ITEMS} />
    </div>
  );
};

export default DeliveryZonesTab;
