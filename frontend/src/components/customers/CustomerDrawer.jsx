// Müşteri profili çekmecesi: üstte kimlik ve iletişim, müşteri eylemleri, "Açık konular" şeridi, personelin iç notu
// ve işaretleri, KPI'lar, sekmeler (Siparişler / Geçmiş / Ürünler / Hesap).
// Veriler GET /users/:id/profile (zaman çizelgesi, açık konular, iç not dahil) ve GET /chat/list?userId= uçlarından gelir.
// onCustomerAction(kind, user) verilirse "Kupon tanımla" (kind: "coupon") ve "Bildirim gönder" (kind: "push") düğmeleri
// görünür; pencereyi çağıran ekran açar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, BellOff, BellRing, Copy, Gift, History, Key, Mail, MessageCircle, Package, Phone, RefreshCw, Save, ShoppingBag, Smartphone, Ticket, Trash2,
  User as UserIcon, Users,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { cloudinaryImage } from "../../lib/image";
import { useConfirm } from "../ConfirmModal";
import { Drawer, EmptyState, HANDOFF, Segmented, SkeletonCards, SkeletonRows, Tabs, formatDate, formatDateTime, money, setHandoff } from "../admin/ui";
import { relativeTime } from "../../lib/customers";
import { Avatar, DeviceIcon, TagBadges, customerTags, deviceLabel, isAdmin, orderStatusTone, phoneDigits, platformLabel, registeredAt, whatsappLink } from "./shared";
import Timeline, { OpenIssues } from "./Timeline";
import StaffNotePanel from "./StaffNote";

const TABS = [
  { value: "orders", label: "Siparişler", icon: ShoppingBag },
  { value: "history", label: "Geçmiş", icon: History },
  { value: "products", label: "Ürünler", icon: Package },
  { value: "account", label: "Hesap", icon: UserIcon },
];
const REFERRAL_STATUS = { pending: ["Bekliyor", "warn"], completed: ["İlk siparişini verdi", "info"], rewarded: ["Ödül verildi", "ok"] };
const formOf = (user) => ({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "" });
const staffOf = (profile) => ({
  note: profile?.staffNote?.text ? profile.staffNote : null,
  flags: Array.isArray(profile?.staffFlags) ? profile.staffFlags : [],
});
/** Diğer ekrana geçiş: AdminPage "admin-navigate" olayını dinler */
const navigate = (tab) => window.dispatchEvent(new CustomEvent("admin-navigate", { detail: tab }));

const Stat = ({ label, value, sub }) => (
  <div className="ui-stat cus-stat">
    <span className="ui-stat-label">{label}</span>
    <span className="ui-stat-value ui-num">{value}</span>
    {sub && <span className="cus-stat-sub">{sub}</span>}
  </div>
);
const Section = ({ title, aside, children }) => (
  <section className="cus-section">
    <div className="cus-section-head">
      <h3>{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

// ── Siparişler sekmesi ───────────────────────────────────────────────
const OrdersTab = ({ profile, now }) => {
  const { stats, recentOrders, coupons } = profile;
  if (!stats.orderCount) {
    return <EmptyState icon={ShoppingBag} title="Henüz sipariş yok" description="Bu müşteri hiç sipariş vermedi." compact />;
  }
  return (
    <>
      <dl className="ui-kv cus-kv">
        <div><dt>İlk sipariş</dt><dd>{formatDate(stats.firstOrderAt, { year: "numeric" })}</dd></div>
        <div><dt>Son sipariş</dt><dd>{relativeTime(stats.lastOrderAt, now)}</dd></div>
        <div><dt>Teslim edildi</dt><dd className="ui-num">{stats.deliveredCount} / {stats.orderCount}</dd></div>
        <div><dt>İptal</dt><dd className="ui-num">{stats.cancelledCount}</dd></div>
      </dl>
      <Section title={`Son ${recentOrders.length} sipariş`} aside={<span className="ui-hint">İptaller harcamaya dahil değil</span>}>
        <ul className="cus-orders">
          {recentOrders.map((order) => (
            <li key={order._id} className="cus-order">
              <span className={`ui-dot ui-dot--${orderStatusTone(order.status)}`} />
              <span className="cus-order-main">
                <span className="cus-order-title"><span className="ui-mono">#{order._id.slice(-6).toUpperCase()}</span>
                  {order.couponCode && <span className="ui-badge ui-badge--brand"><Ticket />{order.couponCode}</span>}
                  {order.platform && <span className="cus-when-sub">{platformLabel(order.platform)}</span>}
                </span>
                <span className="cus-when-sub">{formatDateTime(order.createdAt)} · {order.itemCount} ürün{order.deliveryPointName ? ` · ${order.deliveryPointName}` : ""}</span>
              </span>
              <span className={`ui-badge ui-badge--${orderStatusTone(order.status)}`}>{order.status}</span>
              <span className="cus-order-amount ui-num">{money(order.totalAmount)}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Kupon kullanımı" aside={<span className="ui-hint ui-num">{coupons.usedCount} siparişte · {money(stats.couponDiscount)} indirim</span>}>
        {coupons.codes.length === 0 ? (
          <p className="ui-muted ui-text-sm">Hiç kupon kullanmadı.</p>
        ) : (
          <ul className="cus-coupons">
            {coupons.codes.map((c) => (
              <li key={c.code}>
                <span className="ui-badge ui-badge--brand"><Ticket />{c.code}</span>
                <span className="ui-text-sm ui-num">{c.count} kez · {money(c.discount)}</span>
                <span className="cus-when-sub">son {relativeTime(c.lastUsedAt, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
};

// ── Ürünler sekmesi ──────────────────────────────────────────────────
const ProductsTab = ({ profile, now }) => {
  const { topProducts } = profile;
  if (!topProducts.length) {
    return <EmptyState icon={Package} title="Ürün geçmişi yok" description="Teslim edilen ya da süren siparişi olmadığı için en çok aldığı ürünler hesaplanamadı." compact />;
  }
  const max = Math.max(1, ...topProducts.map((p) => p.quantity));
  return (
    <Section title="En çok aldığı 5 ürün" aside={<span className="ui-hint">Adet toplamına göre</span>}>
      <ol className="cus-products">
        {topProducts.map((p, i) => (
          <li key={p.productId || p.name} className="cus-product">
            <span className="ui-rank">{i + 1}</span>
            <span className="ui-thumb cus-thumb">{p.image ? <img src={cloudinaryImage(p.image, 120)} alt="" loading="lazy" /> : <Package aria-hidden="true" />}</span>
            <span className="cus-product-text">
              <span className="ui-list-title ui-truncate">{p.name}</span>
              <span className="cus-when-sub ui-num">{p.quantity} adet · {p.orders} sipariş · son {relativeTime(p.lastAt, now)}</span>
              <span className="cus-bar" aria-hidden="true"><i style={{ width: `${(p.quantity / max) * 100}%` }} /></span>
            </span>
            <span className="cus-order-amount ui-num">{money(p.total)}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
};

// ── Hesap sekmesi ────────────────────────────────────────────────────
const AccountTab = ({ user, profile, now, form, setForm, dirty, saving, onSave, onRole, roleBusy, pwRef, onDelete }) => {
  const [password, setPassword] = useState("");
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const { notifications, activity, device, referral, user: p } = profile;
  const inviteStatus = (status) => REFERRAL_STATUS[status] || REFERRAL_STATUS.pending;

  const resetPassword = async () => {
    if (!password.trim()) { toast.error("Yeni şifre girin"); return; }
    setPwBusy(true);
    try {
      await axios.post(`/users/${user._id}/reset-password`, { tempPassword: password });
      setPwDone(true);
      toast.success("Şifre sıfırlandı");
    } catch (e) {
      toast.error(e.response?.data?.message || "Şifre sıfırlanamadı");
    } finally {
      setPwBusy(false);
    }
  };
  const copyPassword = async () => {
    try { await navigator.clipboard.writeText(password); toast.success("Kopyalandı"); } catch { toast.error("Kopyalanamadı"); }
  };

  return (
    <>
      <Section title="Bilgiler" aside={dirty && <span className="ui-badge ui-badge--warn">Kaydedilmedi</span>}>
        <form className="cus-form" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
          <label className="cus-field"><span className="ui-label">Ad Soyad</span><input className="ui-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" /></label>
          <label className="cus-field"><span className="ui-label">E-posta</span><input className="ui-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" /></label>
          <label className="cus-field"><span className="ui-label">Telefon</span><input className="ui-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="off" /></label>
          <div className="cus-form-actions">
            <button type="button" className="ui-btn ui-btn--sm" disabled={!dirty || saving} onClick={() => setForm(formOf(user))}>Vazgeç</button>
            <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm" disabled={!dirty || saving}><Save />{saving ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
        </form>
      </Section>

      <Section title="Rol" aside={<span className="ui-hint">Yönetici panele girebilir</span>}>
        <div className="cus-role">
          <Segmented ariaLabel="Rol" value={user.role === "admin" ? "admin" : "customer"} onChange={onRole}
            options={[{ value: "customer", label: "Müşteri", icon: UserIcon }, { value: "admin", label: "Yönetici", icon: Users }]} />
          {roleBusy && <span className="ui-spin" aria-label="Kaydediliyor" />}
        </div>
      </Section>

      <Section title="Bildirim tercihleri" aside={<span className="ui-hint">Müşteri uygulamadan yönetir</span>}>
        <ul className="cus-prefs">
          <li>
            {notifications.pushEnabled ? <Bell /> : <BellOff />}
            <span className="cus-pref-text"><strong>Anlık bildirimler</strong><span className="cus-when-sub">{notifications.hasToken ? "Cihaz kayıtlı" : "Kayıtlı cihaz yok; bildirim ulaşmaz"}</span></span>
            <span className={`ui-badge ui-badge--${notifications.pushEnabled ? "ok" : "danger"}`}>{notifications.pushEnabled ? "Açık" : "Kapalı"}</span>
          </li>
          {[["orders", "Sipariş durumu"], ["messages", "Mesajlar"], ["campaigns", "Kampanyalar"]].map(([key, label]) => {
            const on = notifications.pushEnabled && notifications.preferences[key];
            return (
              <li key={key}>
                <span className={`ui-dot ui-dot--${on ? "ok" : "danger"}`} />
                <span className="cus-pref-text"><strong>{label}</strong></span>
                <span className={`ui-badge ui-badge--${on ? "ok" : "danger"}`}>{on ? "Açık" : "Kapalı"}</span>
              </li>
            );
          })}
        </ul>
        {notifications.cartReminderSentAt && <p className="ui-hint">Son sepet hatırlatması: {formatDateTime(notifications.cartReminderSentAt)}</p>}
      </Section>

      <Section title="Etkinlik ve cihaz">
        <dl className="ui-kv cus-kv">
          <div><dt>Son görülme</dt><dd>{activity.lastSeenAt ? `${relativeTime(activity.lastSeenAt, now)} · ${{ app: "uygulama", web: "web", login: "giriş" }[activity.lastSeenSource] || ""}` : "Hiç görülmedi"}</dd></div>
          <div><dt>Son giriş</dt><dd>{activity.lastLoginAt ? formatDateTime(activity.lastLoginAt) : <span className="ui-muted">Henüz giriş yapmadı</span>}</dd></div>
          <div><dt>Cihaz</dt><dd className="cus-device-type"><DeviceIcon type={device.deviceType} />{deviceLabel(device.deviceType)}{device.lastDeviceType !== "unknown" && device.lastDeviceType !== device.deviceType ? ` (önce ${deviceLabel(device.lastDeviceType).toLocaleLowerCase("tr-TR")})` : ""}</dd></div>
          <div><dt>Uygulama</dt><dd>{device.platform ? `${platformLabel(device.platform)}${device.model ? ` · ${device.model}` : ""}${device.appVersion ? ` · v${device.appVersion}` : ""}` : <span className="ui-muted">Uygulama kaydı yok</span>}</dd></div>
          <div><dt>Uygulama ziyareti</dt><dd className="ui-num">{activity.app.visitCount}{activity.app.lastSeenAt ? ` · son ${relativeTime(activity.app.lastSeenAt, now)}` : ""}</dd></div>
          <div><dt>Sepet</dt><dd>{p.cartItemCount ? `${p.cartItemCount} ürün · ${relativeTime(p.cartLastUpdated, now)}` : <span className="ui-muted">Boş</span>}</dd></div>
          <div><dt>Kayıt</dt><dd>{formatDateTime(p.createdAt)}</dd></div>
          <div><dt>Geri bildirim</dt><dd>{p.hasFeedback ? "Bıraktı" : <span className="ui-muted">Yok</span>}</dd></div>
        </dl>
      </Section>

      <Section title="Davet">
        {!referral.invitedBy && !referral.own ? (
          <p className="ui-muted ui-text-sm">Davet kaydı yok.</p>
        ) : (
          <div className="ui-stack ui-stack--sm">
            {referral.invitedBy && (
              <div className="cus-invite">
                <Gift />
                <span className="cus-pref-text">
                  <strong>{referral.invitedBy.name || "Bir müşteri"} davet etti</strong>
                  <span className="cus-when-sub">{referral.invitedBy.code ? `${referral.invitedBy.code} · ` : ""}{formatDate(referral.invitedBy.signedUpAt, { year: "numeric" })}</span>
                </span>
                <span className={`ui-badge ui-badge--${inviteStatus(referral.invitedBy.status)[1]}`}>{inviteStatus(referral.invitedBy.status)[0]}</span>
              </div>
            )}
            {referral.own && (
              <div className="cus-invite">
                <Users />
                <span className="cus-pref-text">
                  <strong>Davet kodu <span className="ui-mono">{referral.own.code || "—"}</span></strong>
                  <span className="cus-when-sub">{referral.own.successfulReferrals} başarılı / {referral.own.totalReferrals} davet{referral.own.isActive ? "" : " · kod kapalı"}</span>
                </span>
              </div>
            )}
            {referral.own?.invited.map((inv, i) => (
              <div key={inv.userId || i} className="cus-invite cus-invite--sub">
                <span className="cus-pref-text">
                  <strong>{inv.name || "Silinmiş hesap"}</strong>
                  <span className="cus-when-sub">{formatDate(inv.signedUpAt, { year: "numeric" })}</span>
                </span>
                <span className={`ui-badge ui-badge--${inviteStatus(inv.status)[1]}`}>{inviteStatus(inv.status)[0]}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Şifre sıfırla" aside={<span className="ui-hint">Geçici şifreyi müşteriye iletin</span>}>
        <div className="cus-pw">
          <input ref={pwRef} className="ui-field" type="text" value={password} onChange={(e) => { setPassword(e.target.value); setPwDone(false); }} placeholder="Yeni geçici şifre" aria-label="Yeni geçici şifre" autoComplete="off" />
          {pwDone ? (
            <button type="button" className="ui-btn ui-btn--sm" onClick={copyPassword}><Copy />Kopyala</button>
          ) : (
            <button type="button" className="ui-btn ui-btn--sm" disabled={pwBusy} onClick={resetPassword}><Key />{pwBusy ? "İşleniyor…" : "Sıfırla"}</button>
          )}
        </div>
        {pwDone && <p className="ui-hint">Şifre güncellendi. Müşteri bu şifreyle giriş yapıp kendi şifresini değiştirebilir.</p>}
      </Section>

      <Section title="Tehlikeli bölge">
        <div className="cus-danger">
          <span className="cus-pref-text"><strong>Hesabı sil</strong><span className="cus-when-sub">Kullanıcı kaydı silinir; 5 saniye içinde geri alınabilir.</span></span>
          <button type="button" className="ui-btn ui-btn--danger ui-btn--sm" onClick={onDelete}><Trash2 />Sil</button>
        </div>
      </Section>
    </>
  );
};

// ── Çekmece ──────────────────────────────────────────────────────────
const CustomerDrawer = ({ user, now, initialTab = "orders", focusPassword = false, onClose, onOpenChat, onSaved, onRoleChanged, onDelete, onCustomerAction }) => {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState(initialTab);
  const [profile, setProfile] = useState(null);
  const [profileVersion, setProfileVersion] = useState(0); // her yüklemede zaman çizelgesi baştan kurulur
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chats, setChats] = useState([]);
  const [staff, setStaff] = useState({ note: null, flags: [] });
  const [noteDirty, setNoteDirty] = useState(false);
  const [form, setForm] = useState(() => formOf(user));
  const [saving, setSaving] = useState(false);
  const [roleBusy, setRoleBusy] = useState(false);
  const pwRef = useRef(null);
  const formDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(formOf(user)), [form, user]);
  const dirty = formDirty || noteDirty;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/users/${user._id}/profile`);
      setProfile(res.data.profile);
      setStaff(staffOf(res.data.profile));
      setProfileVersion((version) => version + 1);
    } catch (e) {
      setError(e.response?.data?.message || "Profil yüklenemedi");
    } finally {
      setLoading(false);
    }
    try {
      const res = await axios.get("/chat/list", { params: { status: "all", userId: user._id } });
      setChats(res.data.chats || []);
    } catch {
      setChats([]);
    }
  }, [user._id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setTab(initialTab); }, [initialTab, user._id]);
  // Form yalnızca kayıtlı bilgiler değişince sıfırlanır (satır yenilemesi, ör. işaret kaydı, yazılan bilgiyi silmesin)
  useEffect(() => { setForm(formOf({ name: user.name, email: user.email, phone: user.phone })); }, [user.name, user.email, user.phone]);
  useEffect(() => {
    if (focusPassword && tab === "account" && !loading) pwRef.current?.focus();
  }, [focusPassword, tab, loading]);

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error("Ad ve e-posta boş olamaz"); return; }
    setSaving(true);
    try {
      const res = await axios.put(`/users/${user._id}`, { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() });
      toast.success("Müşteri güncellendi");
      onSaved?.(res.data.user || { ...user, ...form });
    } catch (e) {
      toast.error(e.response?.data?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (role) => {
    if (role === user.role) return;
    const ok = await confirm({
      title: role === "admin" ? "Yönetici yap" : "Yönetici yetkisini kaldır",
      message: role === "admin"
        ? `"${user.name}" yönetici paneline tam erişim kazanacak. Devam edilsin mi?`
        : `"${user.name}" artık yönetici paneline giremeyecek. Devam edilsin mi?`,
      confirmText: role === "admin" ? "Yönetici yap" : "Yetkiyi kaldır",
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!ok) return;
    setRoleBusy(true);
    try {
      await axios.patch(`/users/${user._id}/role`, { role });
      toast.success(role === "admin" ? "Yönetici yapıldı" : "Yönetici yetkisi kaldırıldı");
      onRoleChanged?.(user, role);
    } catch (e) {
      toast.error(e.response?.data?.message || "Rol değiştirilemedi");
    } finally {
      setRoleBusy(false);
    }
  };

  const unsavedText = noteDirty && formDirty
    ? "İç notta ve bilgilerde kaydedilmemiş değişiklikler var."
    : noteDirty ? "İç notta kaydedilmemiş değişiklik var." : "Bilgilerde kaydedilmemiş değişiklikler var.";
  const dirtyClose = useCallback(() => confirm({
    title: "Kaydedilmemiş değişiklik",
    message: `${unsavedText} Kapatılsın mı?`,
    confirmText: "Kapat",
    cancelText: "Geri dön",
    type: "warning",
  }), [confirm, unsavedText]);

  // Başka ekrana geçerken kaydedilmemiş not / bilgi sessizce kaybolmasın
  const confirmLeave = async () => {
    if (!dirty) return true;
    return confirm({
      title: "Kaydedilmemiş değişiklik",
      message: `${unsavedText} Yine de geçilsin mi?`,
      confirmText: "Geç",
      cancelText: "Geri dön",
      type: "warning",
    });
  };
  const openChat = async (chatId) => {
    if (!chatId || !(await confirmLeave())) return;
    if (onOpenChat) { onOpenChat(chatId); return; }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "chat");
    url.searchParams.set("chatId", chatId);
    window.history.replaceState({}, "", url);
    navigate("chat");
  };
  /** Zaman çizelgesi / açık konu satırından ilgili kaydı açar: sipariş, sohbet ya da geri bildirimler */
  const openRef = async (ref) => {
    if (!ref?.id) return;
    if (ref.kind === "chat") { await openChat(ref.id); return; }
    if (ref.kind !== "order" && ref.kind !== "feedback") return;
    if (!(await confirmLeave())) return;
    if (ref.kind === "order") {
      setHandoff(HANDOFF.order, ref.id);
      navigate("orders");
    } else {
      navigate("feedback");
    }
  };

  // İç not / işaret kaydı: çekmece hemen güncellenir, liste satırı (işaret rozetleri) yeniden okunur
  const onStaffChange = useCallback(({ staffNote, staffFlags }) => {
    setStaff({ note: staffNote?.text ? staffNote : null, flags: Array.isArray(staffFlags) ? staffFlags : [] });
    onSaved?.({ _id: user._id, staffNote: staffNote?.text ? staffNote : null, staffFlags: Array.isArray(staffFlags) ? staffFlags : [] });
  }, [onSaved, user._id]);

  const latestChat = chats[0];
  const joined = registeredAt(user);
  const tags = customerTags(user, now);
  const wa = whatsappLink(user.phone);
  const stats = profile?.stats;

  return (
    <Drawer
      title={user.name || "İsimsiz"}
      subtitle={`${isAdmin(user) ? "Yönetici" : "Müşteri"}${joined ? ` · ${formatDate(joined, { year: "numeric" })} tarihinde kayıt oldu` : ""}`}
      width={560}
      onClose={onClose}
      dirty={dirty}
      onDirtyClose={dirtyClose}
      className="cus-drawer"
      tabs={<Tabs tabs={TABS.map((t) => ({ ...t, count: t.value === "orders" && stats ? stats.orderCount : undefined }))} value={tab} onChange={setTab} ariaLabel="Profil bölümleri" />}
      footer={(
        <>
          <button type="button" className="ui-btn ui-btn--primary" disabled={!latestChat} title={latestChat ? "Son destek konuşmasını aç" : "Bu müşterinin destek konuşması yok"} onClick={() => latestChat && openChat(latestChat._id)}>
            <MessageCircle />Sohbeti aç{chats.length > 1 ? ` (${chats.length})` : ""}
          </button>
          <button type="button" className="ui-btn ui-btn--danger" onClick={() => onDelete?.(user)}><Trash2 />Sil</button>
        </>
      )}
    >
      <div className="cus-profile-head">
        <Avatar name={user.name} src={user.avatar} size="lg" />
        <div className="cus-profile-id">
          <div className="cus-profile-tags"><TagBadges tags={tags} max={3} />{tags.length === 0 && <span className="ui-muted ui-text-xs">Etiket yok</span>}</div>
          <div className="cus-contact">
            <a href={`mailto:${user.email}`}><Mail />{user.email}</a>
            {user.phone && <a href={`tel:${phoneDigits(user.phone)}`}><Phone />{user.phone}</a>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Smartphone />WhatsApp</a>}
          </div>
        </div>
      </div>

      {onCustomerAction && (
        <div className="cus-profile-actions" role="group" aria-label="Müşteri eylemleri">
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onCustomerAction("coupon", user)}><Gift />Kupon tanımla</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onCustomerAction("push", user)}><BellRing />Bildirim gönder</button>
        </div>
      )}

      {loading ? (
        <>
          <SkeletonCards count={4} height={64} />
          <SkeletonRows rows={5} />
        </>
      ) : error ? (
        <div className="ui-banner ui-banner--danger">
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}><RefreshCw />Tekrar dene</button>
        </div>
      ) : (
        <>
          <OpenIssues issues={profile.openIssues} now={now} onOpen={openRef} />
          <StaffNotePanel
            userId={user._id}
            note={staff.note}
            flags={staff.flags}
            deliveryFailures={profile.deliveryFailures}
            onChange={onStaffChange}
            onDirtyChange={setNoteDirty}
          />
          <div className="cus-profile-kpis">
            <Stat label="Sipariş" value={stats.orderCount} sub={stats.cancelledCount ? `${stats.cancelledCount} iptal` : "iptal yok"} />
            <Stat label="Toplam harcama" value={money(stats.totalSpent)} sub={stats.couponDiscount ? `${money(stats.couponDiscount)} kupon` : null} />
            <Stat label="Ortalama sepet" value={money(stats.avgBasket)} />
            <Stat label="Son sipariş" value={stats.lastOrderAt ? relativeTime(stats.lastOrderAt, now) : "—"} sub={stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "Sipariş yok"} />
          </div>
          {tab === "orders" && <OrdersTab profile={profile} now={now} />}
          {/* Geçmiş sekme değişince kapanmaz: yüklenen eski sayfalar ve süzgeç korunur */}
          <div className="cus-tab-panel" hidden={tab !== "history"}>
            <Timeline
              key={profileVersion}
              userId={user._id}
              initialEvents={profile.timeline}
              initialHasMore={profile.timelineHasMore}
              initialNextBefore={profile.timelineNextBefore}
              now={now}
              onOpen={openRef}
            />
          </div>
          {tab === "products" && <ProductsTab profile={profile} now={now} />}
          {tab === "account" && (
            <AccountTab user={user} profile={profile} now={now} form={form} setForm={setForm} dirty={formDirty} saving={saving} onSave={save}
              onRole={changeRole} roleBusy={roleBusy} pwRef={pwRef} onDelete={() => onDelete?.(user)} />
          )}
        </>
      )}
    </Drawer>
  );
};

export default CustomerDrawer;
