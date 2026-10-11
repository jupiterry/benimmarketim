import { useState, useEffect, useMemo } from "react";
import {
  Users, Crown, Search, Pencil, Trash2, Key, X, Copy, Monitor, Smartphone, Tablet, Eye,
  Download, RefreshCw, Phone, Mail, UserPlus, CalendarDays, MessageCircle, Sparkles,
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useConfirm } from "./ConfirmModal";
import {
  REGISTRATION_RANGES,
  avatarTone,
  formatClock,
  formatDate,
  formatDateTime,
  initials,
  isNewMember,
  lastSeenAt,
  matchesSearch,
  rangeStart,
  registeredAt,
  registrationSeries,
  relativeTime,
  toCsv,
} from "../lib/customers";
import "../styles/customers.css";

// Device helpers
const getDeviceIcon = (type) => {
  const icons = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };
  const Icon = icons[type] || Monitor;
  return <Icon className="w-4 h-4" />;
};

const getDeviceName = (type) => ({ desktop: 'Bilgisayar', mobile: 'Telefon', tablet: 'Tablet' }[type] || 'Bilinmiyor');

// ── Mobil uygulama takibi ────────────────────────────────────────────
// Veriler backend/services/appActivity.service.js tarafından doldurulur.
const APP_PERIODS = [
  { id: 'today', label: 'Bugün' },
  { id: 'week', label: '7 gün' },
  { id: 'month', label: '30 gün' },
];
// Sunucu uygulamanın kapandığını göremez; son istekten bu kadar sonra "uygulamada" sayılmaz.
const APP_ONLINE_MS = 2 * 60 * 1000;
const toMs = (value) => (value ? new Date(value).getTime() : 0);
const appPeriodStart = (period) => {
  if (period === 'today') return new Date().setHours(0, 0, 0, 0);
  return Date.now() - (period === 'week' ? 7 : 30) * 86400000;
};
// 0: dönemde açmadı · 1: açtı · 2: sepet / sipariş ekranına girdi · 3: sipariş verdi
const getAppStage = (user, since) => {
  const activity = user.appActivity;
  if (!activity || toMs(activity.lastSeenAt) < since) return 0;
  if (toMs(activity.orderAt) >= since) return 3;
  if (toMs(activity.checkoutAt) >= since) return 2;
  return 1;
};
const isInAppNow = (user) => Date.now() - toMs(user.appActivity?.lastSeenAt) < APP_ONLINE_MS;
const APP_STAGE_BADGES = {
  1: { label: 'Açtı, baktı', tone: 'info' },
  2: { label: 'Siparişe geldi, vermedi', tone: 'warn' },
  3: { label: 'Sipariş verdi', tone: 'ok' },
};
const APP_FILTERS = {
  now: (user) => isInAppNow(user),
  opened: (user, since) => getAppStage(user, since) >= 1,
  checkout: (user, since) => getAppStage(user, since) >= 2,
  ordered: (user, since) => getAppStage(user, since) === 3,
  noOrder: (user, since) => [1, 2].includes(getAppStage(user, since)),
  notOpened: (user, since) => getAppStage(user, since) === 0,
};

const SORTS = [
  { id: 'seen', label: 'Son görülme' },
  { id: 'newest', label: 'Kayıt: en yeni' },
  { id: 'oldest', label: 'Kayıt: en eski' },
  { id: 'name', label: 'İsim (A–Z)' },
];
const PAGE_SIZE = 40;

const orderStatusTone = (status) =>
  status === 'Teslim Edildi' || status === 'delivered' ? 'ok' :
  status === 'İptal Edildi' || status === 'cancelled' ? 'danger' :
  status === 'Yolda' ? 'info' : 'warn';

const money = (value) => `₺${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;

const Avatar = ({ name, size }) => (
  <span className={`cu-avatar${size === 'lg' ? ' cu-avatar--lg' : ''}`} data-tone={avatarTone(name)} aria-hidden="true">
    {initials(name)}
  </span>
);

// Kayıt bilgisi: tarih + saat + ne kadar önce
const Registered = ({ user, compact }) => {
  const at = registeredAt(user);
  if (!at) return <span className="ui-muted">-</span>;
  return (
    <span className="cu-when" title={formatDateTime(at)}>
      <span className="cu-when-main">
        {formatDate(at)}
        {isNewMember(user) && <span className="cu-new">Yeni</span>}
      </span>
      {!compact && <span className="cu-when-sub">{formatClock(at)} · {relativeTime(at)}</span>}
    </span>
  );
};

const LastSeen = ({ user }) => {
  const at = lastSeenAt(user);
  if (!at) return <span className="ui-muted">Hiç görülmedi</span>;
  const online = isInAppNow(user) || Date.now() - at.getTime() < 5 * 60000;
  return (
    <span className="cu-when" title={formatDateTime(at)}>
      <span className="cu-when-main">
        {online && <span className="ui-dot ui-dot--ok" />}
        {online ? 'Şu an aktif' : relativeTime(at)}
      </span>
      <span className="cu-when-sub">{formatDateTime(at)}</span>
    </span>
  );
};

const AppStatus = ({ user, since }) => {
  const badge = APP_STAGE_BADGES[getAppStage(user, since)];
  return (
    <span className="cu-device">
      {user.deviceType && user.deviceType !== 'unknown' && (
        <span className="cu-device-type" title={getDeviceName(user.deviceType)}>
          {getDeviceIcon(user.deviceType)} {getDeviceName(user.deviceType)}
        </span>
      )}
      {badge && <span className={`ui-badge ui-badge--${badge.tone}`}>{badge.label}</span>}
      {!badge && user.appActivity?.lastSeenAt && <span className="cu-when-sub">Uygulama: {relativeTime(user.appActivity.lastSeenAt)}</span>}
    </span>
  );
};

// ── Kayıt grafiği ve son kayıt olanlar ───────────────────────────────
const RegistrationsCard = ({ users, onView }) => {
  const [days, setDays] = useState(14);
  const series = useMemo(() => registrationSeries(users, days), [users, days]);
  const total = series.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(1, ...series.map((day) => day.count));
  const latest = useMemo(
    () => [...users].filter((user) => registeredAt(user)).sort((a, b) => registeredAt(b) - registeredAt(a)).slice(0, 6),
    [users],
  );
  const labelEvery = days > 14 ? 5 : 2;

  return (
    <section className="ui-card cu-reg">
      <div className="ui-card-header">
        <div>
          <h3 className="ui-title">Yeni kayıtlar</h3>
          <p className="ui-subtitle">
            Son {days} günde <strong className="ui-num">{total}</strong> kişi kayıt oldu
          </p>
        </div>
        <div className="ui-segmented" role="group" aria-label="Grafik dönemi">
          {[14, 30].map((value) => (
            <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>
              {value} gün
            </button>
          ))}
        </div>
      </div>
      <div className="ui-card-body cu-reg-body">
        <div className="cu-chart" role="img" aria-label={`Son ${days} günün günlük kayıt sayıları`}>
          {series.map((day, index) => {
            const date = new Date(day.start);
            const isToday = index === series.length - 1;
            return (
              <div key={day.start} className="cu-chart-col" title={`${formatDate(date)}: ${day.count} kayıt`}>
                <span className="cu-chart-value">{day.count || ''}</span>
                <span className="cu-chart-track">
                  <i style={{ height: `${(day.count / max) * 100}%` }} data-today={isToday} />
                </span>
                <span className="cu-chart-label">
                  {isToday ? 'Bugün' : (series.length - 1 - index) % labelEvery === 0 ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : ''}
                </span>
              </div>
            );
          })}
        </div>
        <div className="cu-latest">
          <p className="cu-latest-title">Son kayıt olanlar</p>
          {latest.length === 0 && <p className="ui-muted ui-text-sm">Henüz kayıt yok</p>}
          {latest.map((user) => (
            <button key={user._id} type="button" className="cu-latest-row" onClick={() => onView(user)}>
              <Avatar name={user.name} />
              <span className="ui-grow cu-latest-text">
                <span className="cu-latest-name">{user.name || 'İsimsiz'}</span>
                <span className="cu-when-sub">{user.phone || user.email}</span>
              </span>
              <span className="cu-latest-time" title={formatDateTime(registeredAt(user))}>{relativeTime(registeredAt(user))}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

// ── Müşteri detayı ────────────────────────────────────────────────────
const UserDetailModal = ({ user, onClose, orders, chats, onOpenChat, onEdit }) => {
  const userStats = useMemo(() => {
    if (!orders || orders.length === 0) {
      return { totalSpent: 0, orderCount: 0, avgOrderValue: 0, favoriteProducts: [], deliveredCount: 0 };
    }
    const valid = orders.filter(o => o.status !== 'İptal Edildi');
    const totalSpent = valid.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const orderCount = orders.length;
    const avgOrderValue = valid.length > 0 ? totalSpent / valid.length : 0;
    const deliveredCount = orders.filter(o => o.status === 'Teslim Edildi' || o.status === 'delivered').length;
    const productCounts = {};
    orders.forEach(order => {
      order.products?.forEach(product => {
        const name = product.name;
        if (!productCounts[name]) productCounts[name] = { name, count: 0, totalSpent: 0 };
        productCounts[name].count += product.quantity;
        productCounts[name].totalSpent += (product.price || 0) * product.quantity;
      });
    });
    const favoriteProducts = Object.values(productCounts).sort((a, b) => b.count - a.count).slice(0, 5);
    return { totalSpent, orderCount, avgOrderValue, favoriteProducts, deliveredCount };
  }, [orders]);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const joined = registeredAt(user);
  const memberDays = joined ? Math.max(0, Math.floor((Date.now() - joined.getTime()) / 86400000)) : null;
  const phoneDigits = String(user.phone || '').replace(/\D/g, '');
  const whatsapp = phoneDigits ? `https://wa.me/${phoneDigits.startsWith('0') ? `9${phoneDigits}` : phoneDigits}` : null;
  const firstOrder = orders?.length ? orders.reduce((first, order) => (new Date(order.createdAt) < new Date(first.createdAt) ? order : first)) : null;

  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal ui-modal--wide cu-detail" role="dialog" aria-modal="true" aria-label="Müşteri detayı" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header cu-detail-head">
          <div className="cu-detail-id">
            <Avatar name={user.name} size="lg" />
            <div className="ui-grow" style={{ minWidth: 0 }}>
              <h2 className="ui-title cu-detail-name">
                {user.name || 'İsimsiz'}
                {user.role === 'admin' && <span className="ui-badge ui-badge--brand"><Crown /> Admin</span>}
                {isNewMember(user) && <span className="cu-new">Yeni üye</span>}
              </h2>
              <div className="cu-contact">
                <a href={`mailto:${user.email}`}><Mail />{user.email}</a>
                {user.phone && <a href={`tel:${phoneDigits}`}><Phone />{user.phone}</a>}
                {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
              </div>
            </div>
          </div>
          <div className="cu-detail-actions">
            <button onClick={() => onEdit(user)} className="ui-btn ui-btn--sm"><Pencil />Düzenle</button>
            <button onClick={onClose} className="ui-icon-btn" aria-label="Kapat"><X /></button>
          </div>
        </div>

        <div className="ui-modal-body ui-stack">
          <div className="cu-joined">
            <CalendarDays />
            <div>
              <p className="cu-joined-main">{joined ? `${formatDateTime(joined)} tarihinde kayıt oldu` : 'Kayıt tarihi bilinmiyor'}</p>
              {joined && (
                <p className="cu-when-sub">
                  {relativeTime(joined)} · {memberDays === 0 ? 'bugün üye oldu' : `${memberDays} gündür üye`}
                  {firstOrder && ` · ilk sipariş ${formatDate(firstOrder.createdAt)}`}
                </p>
              )}
            </div>
          </div>

          <div className="ui-grid-4 cu-detail-stats">
            <div className="ui-stat"><span className="ui-stat-label">Toplam harcama</span><span className="ui-stat-value">{money(userStats.totalSpent)}</span></div>
            <div className="ui-stat"><span className="ui-stat-label">Sipariş</span><span className="ui-stat-value">{userStats.orderCount}</span></div>
            <div className="ui-stat"><span className="ui-stat-label">Ortalama sepet</span><span className="ui-stat-value">{money(userStats.avgOrderValue)}</span></div>
            <div className="ui-stat"><span className="ui-stat-label">Teslim oranı</span><span className="ui-stat-value">{userStats.orderCount > 0 ? Math.round((userStats.deliveredCount / userStats.orderCount) * 100) : 0}%</span></div>
          </div>

          <dl className="ui-kv">
            <div><dt>Son görülme</dt><dd>{lastSeenAt(user) ? `${relativeTime(lastSeenAt(user))} · ${formatDateTime(lastSeenAt(user))}` : '-'}</dd></div>
            <div><dt>Son giriş</dt><dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : <span className="ui-muted">Henüz giriş yapmadı</span>}</dd></div>
            <div><dt>Cihaz</dt><dd className="ui-cluster" style={{ gap: 6 }}>{getDeviceIcon(user.deviceType)}{getDeviceName(user.deviceType)}</dd></div>
            <div><dt>Uygulamada son görülme</dt><dd>{user.appActivity?.lastSeenAt ? (isInAppNow(user) ? 'Şu an uygulamada' : formatDateTime(user.appActivity.lastSeenAt)) : <span className="ui-muted">Kayıt yok</span>}</dd></div>
            <div><dt>Uygulama ziyareti</dt><dd className="ui-num">{user.appActivity?.visitCount || 0}</dd></div>
            <div><dt>Sepet / sipariş ekranı</dt><dd>{user.appActivity?.checkoutAt ? formatDateTime(user.appActivity.checkoutAt) : <span className="ui-muted">-</span>}</dd></div>
            <div><dt>Uygulamadan son sipariş</dt><dd>{user.appActivity?.orderAt ? formatDateTime(user.appActivity.orderAt) : <span className="ui-muted">-</span>}</dd></div>
            <div><dt>İptal / destek</dt><dd>{orders?.filter(o => o.status === 'İptal Edildi').length || 0} iptal · {chats?.length || 0} konuşma</dd></div>
          </dl>

          {chats?.length > 0 && (
            <div>
              <h3 className="ui-overline" style={{ marginBottom: 8 }}>Destek konuşmaları</h3>
              <div className="ui-stack ui-stack--sm">
                {chats.map(chat => (
                  <button key={chat._id} onClick={() => onOpenChat?.(chat._id)} className="ui-option">
                    {chat.lastMessage || 'Destek konuşması'} · {new Date(chat.lastMessageAt).toLocaleDateString('tr-TR')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {userStats.favoriteProducts.length > 0 && (
            <div>
              <h3 className="ui-overline" style={{ marginBottom: 8 }}>En çok aldıkları</h3>
              <div className="ui-grid-2" style={{ gap: 8 }}>
                {userStats.favoriteProducts.map((product, i) => (
                  <div key={product.name} className="ui-row">
                    <span className="ui-rank">{i + 1}</span>
                    <div className="ui-grow">
                      <p className="ui-list-title ui-truncate">{product.name}</p>
                      <p className="ui-list-sub">{product.count} adet · {money(product.totalSpent)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="ui-between" style={{ marginBottom: 8 }}>
              <span className="ui-overline">Sipariş geçmişi</span>
              <span className="ui-text-xs ui-muted">{orders?.length || 0} sipariş · iptaller harcamaya dahil değil</span>
            </h3>
            {orders && orders.length > 0 ? (
              <div className="orders-product-list">
                {orders.map((order, i) => (
                  <div key={order._id || i} className="ui-row">
                    <span className={`ui-dot ui-dot--${orderStatusTone(order.status)}`} />
                    <div className="ui-grow">
                      <p className="ui-list-title ui-num">#{(order._id || order.orderId || '').slice(-6).toUpperCase()}</p>
                      <p className="ui-list-sub">{formatDateTime(order.createdAt)} · {order.products?.length || 0} ürün</p>
                    </div>
                    <span className={`ui-badge ui-badge--${orderStatusTone(order.status)}`}>{order.status || 'Beklemede'}</span>
                    <span className="orders-amount">₺{(order.totalAmount || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ui-loading">Henüz sipariş yok</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Edit User Modal
const EditUserModal = ({ user, onClose, onSave }) => {
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', role: user?.role || 'customer', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(user._id, form);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Müşteriyi düzenle" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header">
          <h3 className="ui-title">Müşteriyi düzenle</h3>
          <button onClick={onClose} className="ui-icon-btn" aria-label="Kapat"><X /></button>
        </div>
        <div className="ui-modal-body ui-stack">
          <div>
            <label className="ui-label" htmlFor="user-edit-name">İsim</label>
            <input id="user-edit-name" type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="ui-field" />
          </div>
          <div>
            <label className="ui-label" htmlFor="user-edit-email">E-posta</label>
            <input id="user-edit-email" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="ui-field" />
          </div>
          <div>
            <label className="ui-label" htmlFor="user-edit-phone">Telefon</label>
            <input id="user-edit-phone" type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="ui-field" />
          </div>
          <div>
            <label className="ui-label" htmlFor="user-edit-role">Rol</label>
            <select id="user-edit-role" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="ui-field">
              <option value="customer">Müşteri</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="ui-modal-footer">
          <button onClick={onClose} className="ui-btn ui-grow">İptal</button>
          <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn--primary ui-grow">
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Password Reset Modal
const PasswordModal = ({ user, onClose }) => {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!password) { toast.error('Şifre girin'); return; }
    setLoading(true);
    try {
      await axios.post(`/users/${user._id}/reset-password`, { tempPassword: password });
      setDone(true);
      toast.success('Şifre sıfırlandı');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Şifre sıfırla" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header">
          <h3 className="ui-title">Şifre sıfırla</h3>
          <button onClick={onClose} className="ui-icon-btn" aria-label="Kapat"><X /></button>
        </div>
        <div className="ui-modal-body ui-stack">
          <p className="ui-muted"><span className="ui-strong">{user?.name}</span> için yeni şifre belirleyin</p>
          <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Yeni geçici şifre" aria-label="Yeni geçici şifre" className="ui-field" />
          {done && (
            <div className="ui-row" data-selected="true">
              <input type="text" value={password} readOnly aria-label="Belirlenen şifre" className="ui-grow ui-strong" style={{ background: "transparent" }} />
              <button onClick={() => { navigator.clipboard.writeText(password); toast.success('Kopyalandı'); }} className="ui-icon-btn" title="Kopyala" aria-label="Kopyala"><Copy /></button>
            </div>
          )}
        </div>
        <div className="ui-modal-footer">
          <button onClick={onClose} className="ui-btn ui-grow">Kapat</button>
          {!done && <button onClick={handleReset} disabled={loading} className="ui-btn ui-btn--primary ui-grow">{loading ? 'İşleniyor...' : 'Sıfırla'}</button>}
        </div>
      </div>
    </div>
  );
};

// Liste satırı
const UserRow = ({ user, appSince, selected, onSelect, onView, onEdit, onResetPw, onDelete }) => (
  <div className="cu-row" data-selected={selected}>
    <div className="cu-person">
      <input type="checkbox" checked={selected} onChange={() => onSelect(user._id)} aria-label={`${user.name || 'İsimsiz'} seç`} className="ui-checkbox" />
      <button type="button" className="cu-person-btn" onClick={() => onView(user)}>
        <Avatar name={user.name} />
        <span className="cu-person-text">
          <span className="cu-person-name">
            {user.name || 'İsimsiz'}
            {user.role === 'admin' && <span className="ui-badge ui-badge--brand"><Crown />Admin</span>}
          </span>
          <span className="cu-person-sub">{user.phone ? `${user.phone} · ${user.email}` : user.email}</span>
        </span>
      </button>
    </div>
    <div className="cu-cell">
      <span className="cu-cell-label">Kayıt</span>
      <Registered user={user} />
    </div>
    <div className="cu-cell">
      <span className="cu-cell-label">Son görülme</span>
      <LastSeen user={user} />
    </div>
    <div className="cu-cell">
      <span className="cu-cell-label">Cihaz / uygulama</span>
      <AppStatus user={user} since={appSince} />
    </div>
    <div className="cu-actions">
      <button onClick={() => onView(user)} className="ui-icon-btn ui-icon-btn--sm" title="Detay" aria-label="Detay"><Eye /></button>
      <button onClick={() => onEdit(user)} className="ui-icon-btn ui-icon-btn--sm" title="Düzenle" aria-label="Düzenle"><Pencil /></button>
      <button onClick={() => onResetPw(user)} className="ui-icon-btn ui-icon-btn--sm" title="Şifre sıfırla" aria-label="Şifre sıfırla"><Key /></button>
      <button onClick={() => onDelete(user)} className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" title="Sil" aria-label="Sil"><Trash2 /></button>
    </div>
  </div>
);

// Main Component
const UsersTab = ({ users, loading, error, onRefresh, onOpenChat }) => {
  const [bestCustomers, setBestCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("customer");
  const [registered, setRegistered] = useState("all");
  const [sortBy, setSortBy] = useState("seen");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [viewUser, setViewUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [pwUser, setPwUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [userChats, setUserChats] = useState([]);
  const [loadingBest, setLoadingBest] = useState(false);
  const [appPeriod, setAppPeriod] = useState("today");
  const [appFilter, setAppFilter] = useState(null);
  // "Şu an uygulamada" ve "x dk önce" zamana bağlıdır; yeni veri gelmese de 20 saniyede bir yeniden hesaplanır
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock(value => value + 1), 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchBestCustomers();
  }, []);

  // Süzgeç değişince liste başa döner
  useEffect(() => setVisible(PAGE_SIZE), [searchTerm, filterRole, registered, sortBy, appFilter]);

  const fetchBestCustomers = async () => {
    setLoadingBest(true);
    try {
      const res = await axios.get("/users/best-customers");
      setBestCustomers(res.data.customers || []);
    } catch (e) { console.error(e); }
    finally { setLoadingBest(false); }
  };

  const handleViewUser = async (user) => {
    setViewUser(user);
    setUserOrders([]);
    setUserChats([]);
    try {
      const res = await axios.get(`/orders-analytics/user-orders?userId=${user._id}`);
      setUserOrders(res.data.orders || []);
    } catch { setUserOrders([]); }
    try { const res = await axios.get(`/chat/list?status=all&userId=${user._id}`); setUserChats(res.data.chats || []); } catch { setUserChats([]); }
  };

  const handleSaveUser = async (userId, data) => {
    const res = await axios.put(`/users/${userId}`, data);
    if (res.data.success) {
      toast.success("Müşteri güncellendi");
      onRefresh?.();
    }
  };

  const { confirm } = useConfirm();

  const handleDeleteUser = async (user) => {
    const confirmed = await confirm({
      title: 'Müşteriyi sil',
      message: `"${user.name}" adlı kullanıcıyı silmek istediğinize emin misiniz?`,
      confirmText: 'Evet, sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    if (!confirmed) return;
    try {
      await axios.delete(`/users/${user._id}`);
      toast.success("Kullanıcı silindi");
      onRefresh?.();
    } catch (e) { toast.error(e.response?.data?.message || "Hata"); }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm({
      title: 'Toplu silme',
      message: `${selectedUsers.length} kullanıcıyı silmek istediğinize emin misiniz?`,
      confirmText: 'Evet, hepsini sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    if (!confirmed) return;
    let failed = 0;
    for (const id of selectedUsers) {
      try { await axios.delete(`/users/${id}`); } catch { failed += 1; }
    }
    if (failed) toast.error(`${failed} kullanıcı silinemedi`);
    else toast.success("Kullanıcılar silindi");
    setSelectedUsers([]);
    onRefresh?.();
  };

  const toggleSelect = (id) => setSelectedUsers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const clearSelection = () => setSelectedUsers([]);

  // Liste yenilendiğinde dönem başlangıcı da yeniden hesaplanır
  const appSince = useMemo(() => appPeriodStart(appPeriod), [appPeriod, users]);
  const customers = useMemo(() => users.filter(u => u.role !== 'admin'), [users]);

  // Uygulama takibinde yalnızca müşteriler sayılır (yönetici hesapları izlenmez)
  const appTiles = useMemo(() => {
    const count = (id) => customers.filter(u => APP_FILTERS[id](u, appSince)).length;
    return [
      { id: 'now', label: 'Şu an uygulamada', value: count('now'), tone: 'ok' },
      { id: 'opened', label: 'Uygulamayı açtı', value: count('opened') },
      { id: 'checkout', label: 'Sepet / sipariş ekranı', value: count('checkout') },
      { id: 'ordered', label: 'Sipariş verdi', value: count('ordered') },
      { id: 'noOrder', label: 'Açtı, sipariş vermedi', value: count('noOrder'), tone: 'warn' },
      { id: 'notOpened', label: 'Hiç açmadı', value: count('notOpened') },
    ];
  }, [customers, appSince, clock]);

  const stats = useMemo(() => {
    const regCount = (range) => customers.filter(u => (registeredAt(u)?.getTime() || 0) >= rangeStart(range)).length;
    return {
      customers: customers.length,
      admins: users.length - customers.length,
      today: regCount('today'),
      week: regCount('week'),
      month: regCount('month'),
      active24h: customers.filter(u => (lastSeenAt(u)?.getTime() || 0) > Date.now() - 86400000).length,
    };
  }, [users, customers, clock]);

  const filteredUsers = useMemo(() => {
    const since = rangeStart(registered);
    const result = users.filter(u => {
      if (filterRole !== 'all' && u.role !== filterRole) return false;
      if (registered !== 'all' && (registeredAt(u)?.getTime() || 0) < since) return false;
      if (appFilter && (u.role === 'admin' || !APP_FILTERS[appFilter](u, appSince))) return false;
      return matchesSearch(u, searchTerm);
    });
    const time = (date) => date?.getTime() || 0;
    const sorters = {
      seen: (a, b) => time(lastSeenAt(b)) - time(lastSeenAt(a)),
      newest: (a, b) => time(registeredAt(b)) - time(registeredAt(a)),
      oldest: (a, b) => time(registeredAt(a)) - time(registeredAt(b)),
      name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'),
    };
    return result.sort(sorters[sortBy] || sorters.seen);
  }, [users, searchTerm, filterRole, registered, sortBy, appFilter, appSince, clock]);

  const shown = filteredUsers.slice(0, visible);
  const allShownSelected = shown.length > 0 && shown.every(u => selectedUsers.includes(u._id));
  const toggleAllShown = () => setSelectedUsers(allShownSelected ? [] : shown.map(u => u._id));

  const exportCSV = () => {
    const rows = [
      ['İsim', 'E-posta', 'Telefon', 'Rol', 'Kayıt tarihi', 'Son görülme', 'Uygulama ziyareti'],
      ...filteredUsers.map(u => [
        u.name, u.email, u.phone || '', u.role === 'admin' ? 'Admin' : 'Müşteri',
        formatDateTime(registeredAt(u)), formatDateTime(lastSeenAt(u)), u.appActivity?.visitCount || 0,
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `musteriler-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${filteredUsers.length} kişi CSV olarak indirildi`);
  };

  if (loading) return <div className="ui-loading"><div className="ui-loader" /></div>;
  if (error) return <div className="ui-card ui-empty"><p className="ui-badge ui-badge--danger">{error}</p></div>;

  const kpis = [
    { label: 'Müşteri', value: stats.customers, sub: `${stats.admins} yönetici hariç`, icon: Users },
    { label: 'Bugün kayıt', value: stats.today, sub: 'Bugün üye olanlar', icon: UserPlus, tone: stats.today ? 'ok' : null, onClick: () => { setRegistered('today'); setSortBy('newest'); setFilterRole('customer'); } },
    { label: 'Son 7 gün', value: stats.week, sub: 'Yeni kayıt', icon: CalendarDays, onClick: () => { setRegistered('week'); setSortBy('newest'); setFilterRole('customer'); } },
    { label: 'Son 30 gün', value: stats.month, sub: 'Yeni kayıt', icon: Sparkles, onClick: () => { setRegistered('month'); setSortBy('newest'); setFilterRole('customer'); } },
    { label: 'Son 24 saat aktif', value: stats.active24h, sub: 'Web veya uygulama', icon: Eye, tone: 'info' },
  ];

  return (
    <div className="ui-page cu">
      <div className="cu-kpis">
        {kpis.map(({ label, value, sub, icon: Icon, tone, onClick }) => {
          const Tag = onClick ? 'button' : 'div';
          return (
            <Tag key={label} {...(onClick ? { type: 'button', onClick, title: 'Listede göster' } : {})} className={`cu-kpi${onClick ? ' cu-kpi--link' : ''}`}>
              <span className="cu-kpi-icon" data-tone={tone || undefined}><Icon /></span>
              <span className="cu-kpi-text">
                <span className="cu-kpi-label">{label}</span>
                <span className="cu-kpi-value ui-num">{value}</span>
                <span className="cu-kpi-sub">{sub}</span>
              </span>
            </Tag>
          );
        })}
      </div>

      <div className="cu-top">
        <RegistrationsCard users={customers} onView={handleViewUser} />

        <section className="ui-card cu-best">
          <div className="ui-card-header">
            <div>
              <h3 className="ui-title">En iyi müşteriler</h3>
              <p className="ui-subtitle">Toplam harcamaya göre</p>
            </div>
          </div>
          {loadingBest ? (
            <div className="ui-loading"><div className="ui-loader" /></div>
          ) : bestCustomers.length === 0 ? (
            <p className="ui-loading">Henüz veri yok</p>
          ) : (
            <ol className="cu-best-list">
              {bestCustomers.slice(0, 6).map((c, i) => (
                <li key={c.userId}>
                  <span className="ui-rank">{i + 1}</span>
                  <span className="ui-grow cu-latest-text">
                    <span className="cu-latest-name">{c.name}</span>
                    <span className="cu-when-sub">{c.orderCount} sipariş</span>
                  </span>
                  <span className="cu-best-amount ui-num">{money(c.totalSpent)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="ui-card">
        <div className="ui-card-header">
          <div>
            <h3 className="ui-title">Uygulama takibi</h3>
            <p className="ui-subtitle">Mobil uygulamayı açan müşteriler ve siparişe kadar geldikleri adım. Kutuya tıklayınca liste süzülür.</p>
          </div>
          <div className="ui-segmented" role="group" aria-label="Uygulama takibi dönemi">
            {APP_PERIODS.map(p => (
              <button key={p.id} type="button" aria-pressed={appPeriod === p.id} onClick={() => setAppPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="ui-card-body app-track">
          {appTiles.map(tile => (
            <button key={tile.id} type="button" className="ui-stat app-track-tile" aria-pressed={appFilter === tile.id} onClick={() => setAppFilter(appFilter === tile.id ? null : tile.id)}>
              <span className="ui-stat-label">
                {tile.tone && <span className={`ui-dot ui-dot--${tile.tone}`} />}
                {tile.label}
              </span>
              <span className="ui-stat-value">{tile.value}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ui-card cu-list-card">
        <div className="cu-toolbar">
          <label className="ui-search cu-search">
            <Search />
            <input type="search" placeholder="İsim, e-posta veya telefon ara" aria-label="Müşteri ara" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="ui-field" />
          </label>
          <div className="ui-segmented" role="group" aria-label="Rol">
            {[['customer', 'Müşteriler'], ['admin', 'Yöneticiler'], ['all', 'Tümü']].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filterRole === id} onClick={() => setFilterRole(id)}>{label}</button>
            ))}
          </div>
          <select value={registered} onChange={e => setRegistered(e.target.value)} aria-label="Kayıt tarihi" className="ui-field ui-field--auto">
            {REGISTRATION_RANGES.map(r => <option key={r.id} value={r.id}>{r.id === 'all' ? 'Kayıt: tüm zamanlar' : `Kayıt: ${r.label.toLocaleLowerCase('tr-TR')}`}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sıralama" className="ui-field ui-field--auto">
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className="ui-grow" />
          <button onClick={exportCSV} className="ui-btn ui-btn--sm"><Download />CSV</button>
          <button onClick={onRefresh} className="ui-btn ui-btn--sm"><RefreshCw />Yenile</button>
        </div>

        {(appFilter || registered !== 'all' || searchTerm) && (
          <div className="cu-active">
            <span className="ui-text-sm"><strong className="ui-num">{filteredUsers.length}</strong> kişi</span>
            {registered !== 'all' && <span className="ui-badge ui-badge--brand">Kayıt: {REGISTRATION_RANGES.find(r => r.id === registered)?.label}</span>}
            {appFilter && <span className="ui-badge ui-badge--brand">{appTiles.find(t => t.id === appFilter)?.label}{appFilter !== 'now' ? ` · ${APP_PERIODS.find(p => p.id === appPeriod)?.label}` : ''}</span>}
            <span className="ui-grow" />
            <button onClick={() => { setAppFilter(null); setRegistered('all'); setSearchTerm(''); }} className="ui-btn ui-btn--ghost ui-btn--sm"><X />Süzgeçleri kaldır</button>
          </div>
        )}

        {selectedUsers.length > 0 && (
          <div className="ui-bulkbar" style={{ position: "static", border: 0, borderRadius: 0, borderBottom: "1px solid #b9d6c6" }}>
            <span className="ui-bulkbar-count">{selectedUsers.length} kullanıcı seçildi</span>
            <span className="ui-grow" />
            <button onClick={handleBulkDelete} className="ui-btn ui-btn--sm ui-btn--danger"><Trash2 />{selectedUsers.length} sil</button>
            <button onClick={clearSelection} className="ui-icon-btn" title="Seçimi temizle" aria-label="Seçimi temizle"><X /></button>
          </div>
        )}

        <div className="cu-head">
          <label className="cu-person cu-head-check">
            <input type="checkbox" className="ui-checkbox" checked={allShownSelected} onChange={toggleAllShown} aria-label="Görünenlerin hepsini seç" />
            <span>Müşteri</span>
          </label>
          <span>Kayıt</span>
          <span>Son görülme</span>
          <span>Cihaz / uygulama</span>
          <span className="ui-right">İşlemler</span>
        </div>
        <div className="cu-rows">
          {shown.map(user => (
            <UserRow key={user._id} user={user} appSince={appSince} selected={selectedUsers.includes(user._id)} onSelect={toggleSelect} onView={handleViewUser} onEdit={setEditUser} onResetPw={setPwUser} onDelete={handleDeleteUser} />
          ))}
        </div>
        {filteredUsers.length === 0 && <div className="ui-empty"><Users /><p>Bu süzgeçlere uyan kişi yok</p></div>}
        {filteredUsers.length > shown.length && (
          <div className="cu-more">
            <span className="ui-text-sm ui-muted">{shown.length} / {filteredUsers.length} gösteriliyor</span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setVisible(v => v + PAGE_SIZE)}>Daha fazla göster</button>
          </div>
        )}
      </section>

      {viewUser && <UserDetailModal user={viewUser} orders={userOrders} chats={userChats} onOpenChat={onOpenChat} onEdit={(u) => { setViewUser(null); setEditUser(u); }} onClose={() => setViewUser(null)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSaveUser} />}
      {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} />}
    </div>
  );
};

export default UsersTab;
