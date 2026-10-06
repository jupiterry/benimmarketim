import { useState, useEffect, useMemo } from "react";
import {
  Users, Crown, Search, Edit2, Trash2, Key, X, Copy, Monitor, Smartphone, Tablet, Eye,
  Clock, Download, RefreshCw, ArrowUpDown, Phone
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useConfirm } from "./ConfirmModal";

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
  { id: 'week', label: 'Son 7 gün' },
  { id: 'month', label: 'Son 30 gün' },
];
const APP_ONLINE_MS = 5 * 60 * 1000;
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
const formatDateTime = (value) => `${new Date(value).toLocaleDateString('tr-TR')} ${new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

const AppStatus = ({ user, since }) => {
  const lastSeen = user.appActivity?.lastSeenAt;
  if (!lastSeen) return null;
  const badge = APP_STAGE_BADGES[getAppStage(user, since)];
  return (
    <span className="app-track-cell">
      {badge && <span className={`ui-badge ui-badge--${badge.tone}`}>{badge.label}</span>}
      <span className="ui-text-sm ui-muted ui-num">
        {isInAppNow(user) ? <><span className="ui-dot ui-dot--ok" /> Şu an uygulamada</> : `Uygulama: ${formatDateTime(lastSeen)}`}
      </span>
    </span>
  );
};

// Stat Card Component
const StatCard = ({ label, value, tone }) => (
  <div className="ui-stat">
    <span className="ui-stat-label">
      {tone && <span className={`ui-dot ui-dot--${tone}`} />}
      {label}
    </span>
    <span className="ui-stat-value">{value}</span>
  </div>
);

const orderStatusTone = (status) =>
  status === 'Teslim Edildi' || status === 'delivered' ? 'ok' :
  status === 'İptal Edildi' || status === 'cancelled' ? 'danger' :
  status === 'Yolda' ? 'info' : 'warn';

// User Detail Modal
const UserDetailModal = ({ user, onClose, orders, chats, onOpenChat }) => {
  if (!user) return null;
  
  // Kullanıcı istatistiklerini hesapla
  const userStats = useMemo(() => {
    if (!orders || orders.length === 0) {
      return { totalSpent: 0, orderCount: 0, avgOrderValue: 0, favoriteProducts: [], deliveredCount: 0 };
    }
    
    const totalSpent = orders.filter(o => o.status !== 'İptal Edildi').reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
    const deliveredCount = orders.filter(o => o.status === 'Teslim Edildi' || o.status === 'delivered').length;
    
    // Favori ürünleri hesapla
    const productCounts = {};
    orders.forEach(order => {
      order.products?.forEach(product => {
        const name = product.name;
        if (!productCounts[name]) {
          productCounts[name] = { name, count: 0, totalSpent: 0 };
        }
        productCounts[name].count += product.quantity;
        productCounts[name].totalSpent += (product.price || 0) * product.quantity;
      });
    });
    
    const favoriteProducts = Object.values(productCounts).sort((a, b) => b.count - a.count).slice(0, 5);
    
    return { totalSpent, orderCount, avgOrderValue, favoriteProducts, deliveredCount };
  }, [orders]);
  
  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div
        className="ui-modal ui-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Müşteri detayı"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="order-card-head">
            <div className="ui-avatar">
              {user.name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="order-card-id">
              <h2 className="ui-title ui-cluster" style={{ gap: 6 }}>
                {user.name || 'İsimsiz'}
                {user.role === 'admin' && <span className="ui-badge ui-badge--brand"><Crown /> Admin</span>}
              </h2>
              <p className="ui-subtitle ui-wrap-anywhere">{user.email}</p>
              {user.phone && <p className="orders-meta" style={{ marginTop: 2 }}><Phone /><span>{user.phone}</span></p>}
            </div>
          </div>
          <button onClick={onClose} className="ui-icon-btn" aria-label="Kapat">
            <X />
          </button>
        </div>

        <div className="ui-modal-body ui-stack">
          {/* User Stats Summary */}
          <div className="ui-grid-4">
            <div className="ui-stat">
              <span className="ui-stat-label">Toplam Harcama</span>
              <span className="ui-stat-value">₺{userStats.totalSpent.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="ui-stat">
              <span className="ui-stat-label">Toplam Sipariş</span>
              <span className="ui-stat-value">{userStats.orderCount}</span>
            </div>
            <div className="ui-stat">
              <span className="ui-stat-label">Ortalama Sepet</span>
              <span className="ui-stat-value">₺{userStats.avgOrderValue.toFixed(0)}</span>
            </div>
            <div className="ui-stat">
              <span className="ui-stat-label">Başarı Oranı</span>
              <span className="ui-stat-value">{userStats.orderCount > 0 ? Math.round((userStats.deliveredCount / userStats.orderCount) * 100) : 0}%</span>
            </div>
          </div>

          {/* Info Grid */}
          <dl className="ui-kv">
            <div>
              <dt>Rol</dt>
              <dd>{user.role === 'admin' ? 'Admin' : 'Müşteri'}</dd>
            </div>
            <div>
              <dt>Kayıt Tarihi</dt>
              <dd>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'}</dd>
            </div>
            <div>
              <dt>Cihaz</dt>
              <dd className="ui-cluster" style={{ gap: 6 }}>
                {getDeviceIcon(user.deviceType)}
                {getDeviceName(user.deviceType)}
              </dd>
            </div>
            {/* Login Info Cards */}
            <div>
              <dt>Son Giriş</dt>
              {user.lastLoginAt ? (
                <dd>
                  {new Date(user.lastLoginAt).toLocaleDateString('tr-TR')}
                  <span className="ui-muted"> {new Date(user.lastLoginAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                </dd>
              ) : (
                <dd className="ui-muted">Henüz giriş yapmadı</dd>
              )}
            </div>
            <div>
              <dt>Son Aktivite</dt>
              {user.lastActive ? (
                <dd>
                  {new Date(user.lastActive).toLocaleDateString('tr-TR')}
                  <span className="ui-muted"> {new Date(user.lastActive).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                </dd>
              ) : (
                <dd className="ui-muted">-</dd>
              )}
            </div>
            {/* Mobil uygulama takibi */}
            <div>
              <dt>Uygulamada son görülme</dt>
              {user.appActivity?.lastSeenAt ? (
                <dd>{isInAppNow(user) ? 'Şu an uygulamada' : formatDateTime(user.appActivity.lastSeenAt)}</dd>
              ) : (
                <dd className="ui-muted">Kayıt yok</dd>
              )}
            </div>
            <div>
              <dt>Uygulama ziyareti</dt>
              <dd className="ui-num">{user.appActivity?.visitCount || 0}</dd>
            </div>
            <div>
              <dt>Sepet / sipariş ekranı</dt>
              {user.appActivity?.checkoutAt ? <dd>{formatDateTime(user.appActivity.checkoutAt)}</dd> : <dd className="ui-muted">-</dd>}
            </div>
            <div>
              <dt>Uygulamadan son sipariş</dt>
              {user.appActivity?.orderAt ? <dd>{formatDateTime(user.appActivity.orderAt)}</dd> : <dd className="ui-muted">-</dd>}
            </div>
          </dl>

          {/* Favorite Products */}
          {userStats.favoriteProducts.length > 0 && (
            <div>
              <h3 className="ui-overline" style={{ marginBottom: 8 }}>Favori Ürünler</h3>
              <div className="ui-grid-2" style={{ gap: 8 }}>
                {userStats.favoriteProducts.map((product, i) => (
                  <div key={i} className="ui-row">
                    <span className="ui-rank">{i + 1}</span>
                    <div className="ui-grow">
                      <p className="ui-list-title ui-truncate">{product.name}</p>
                      <p className="ui-list-sub">{product.count} adet • ₺{product.totalSpent.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orders Section */}
          <div className="order-detail-box">
            <h3 className="ui-overline">Müşteri özeti</h3>
            <p className="ui-text-sm">İptal: {orders?.filter(o => o.status === 'İptal Edildi').length || 0} sipariş · Destek: {chats?.length || 0} konuşma</p>
            <p className="ui-hint" style={{ marginTop: 0 }}>Toplam harcama iptal edilen siparişleri içermez. Ayrı iade kaydı tutulmuyor.</p>
            {chats?.map(chat => <button key={chat._id} onClick={() => onOpenChat?.(chat._id)} className="ui-option">{chat.lastMessage || 'Destek konuşması'} · {new Date(chat.lastMessageAt).toLocaleDateString('tr-TR')}</button>)}
          </div>
          <div>
            <h3 className="ui-between" style={{ marginBottom: 8 }}>
              <span className="ui-overline">Sipariş Geçmişi</span>
              <span className="ui-text-xs ui-muted">{orders?.length || 0} sipariş</span>
            </h3>
            {orders && orders.length > 0 ? (
              <div className="orders-product-list">
                {orders.map((order, i) => (
                  <div key={i} className="ui-row">
                    <span className={`ui-dot ui-dot--${orderStatusTone(order.status)}`} />
                    <div className="ui-grow">
                      <p className="ui-list-title ui-num">#{order._id?.slice(-6) || order.orderId?.slice(-6)}</p>
                      <p className="ui-list-sub">{new Date(order.createdAt).toLocaleDateString('tr-TR')} • {order.products?.length || 0} ürün</p>
                    </div>
                    <span className={`ui-badge ui-badge--${orderStatusTone(order.status)}`}>
                      {order.status || 'Beklemede'}
                    </span>
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
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Kullanıcı Düzenle" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header">
          <h3 className="ui-title">Kullanıcı Düzenle</h3>
          <button onClick={onClose} className="ui-icon-btn" aria-label="Kapat"><X /></button>
        </div>
        <div className="ui-modal-body ui-stack">
          <div>
            <label className="ui-label" htmlFor="user-edit-name">İsim</label>
            <input id="user-edit-name" type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="ui-field" />
          </div>
          <div>
            <label className="ui-label" htmlFor="user-edit-email">Email</label>
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
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Şifre Sıfırla" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header">
          <h3 className="ui-title">Şifre Sıfırla</h3>
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

// User Row Component
const UserRow = ({ user, appSince, selected, onSelect, onView, onEdit, onResetPw, onDelete }) => (
  <div className="ui-list-row users-cols" data-selected={selected}>
    <div className="products-product">
      {/* Checkbox */}
      <input type="checkbox" checked={selected} onChange={() => onSelect(user._id)} aria-label={`${user.name || 'İsimsiz'} kullanıcısını seç`} className="ui-checkbox" />

      {/* Avatar */}
      <div className="ui-avatar">
        {user.name?.charAt(0).toUpperCase() || '?'}
      </div>

      {/* Info */}
      <div className="ui-grow">
        <h4 className="ui-list-title ui-truncate">{user.name || 'İsimsiz'}</h4>
        <p className="ui-list-sub ui-truncate">{user.email}</p>
      </div>
    </div>

    {/* Role Badge */}
    <div>
      <span className="ui-cell-label">Rol</span>
      <span className={`ui-badge ${user.role === 'admin' ? 'ui-badge--brand' : ''}`}>
        {user.role === 'admin' && <Crown />}
        {user.role === 'admin' ? 'Admin' : 'Müşteri'}
      </span>
    </div>

    <div>
      <span className="ui-cell-label">Son giriş</span>
      <div className="ui-cluster ui-text-sm ui-muted ui-num" style={{ gap: 6 }}>
        {user.lastLoginAt && (
          <span className="orders-meta">
            <Clock />
            <span>{new Date(user.lastLoginAt).toLocaleDateString('tr-TR')} {new Date(user.lastLoginAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
        )}
        {!user.lastLoginAt && user.lastActive && (
          <span className="orders-meta">
            <Clock /><span>{new Date(user.lastActive).toLocaleDateString('tr-TR')}</span>
          </span>
        )}
        {!user.lastLoginAt && !user.lastActive && <span>-</span>}
      </div>
    </div>

    <div>
      <span className="ui-cell-label">Cihaz / Uygulama</span>
      <div className="app-track-cell">
        {user.deviceType ? <span className="ui-badge" title={getDeviceName(user.deviceType)}>{getDeviceIcon(user.deviceType)} {getDeviceName(user.deviceType)}</span> : <span className="ui-muted">-</span>}
        <AppStatus user={user} since={appSince} />
      </div>
    </div>

    {/* Actions */}
    <div className="products-actions">
      <button onClick={() => onView(user)} className="ui-icon-btn" title="Görüntüle" aria-label="Görüntüle"><Eye /></button>
      <button onClick={() => onEdit(user)} className="ui-icon-btn" title="Düzenle" aria-label="Düzenle"><Edit2 /></button>
      <button onClick={() => onResetPw(user)} className="ui-icon-btn" title="Şifre Sıfırla" aria-label="Şifre Sıfırla"><Key /></button>
      <button onClick={() => onDelete(user)} className="ui-icon-btn ui-icon-btn--danger" title="Sil" aria-label="Sil"><Trash2 /></button>
    </div>
  </div>
);

// Main Component
const UsersTab = ({ users, loading, error, onRefresh, onOpenChat }) => {
  const [bestCustomers, setBestCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [sortBy, setSortBy] = useState("lastActive");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [viewUser, setViewUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [pwUser, setPwUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [userChats, setUserChats] = useState([]);
  const [loadingBest, setLoadingBest] = useState(false);
  const [appPeriod, setAppPeriod] = useState("today");
  const [appFilter, setAppFilter] = useState(null);

  useEffect(() => {
    fetchBestCustomers();
  }, []);

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
      toast.success("Kullanıcı güncellendi!");
      onRefresh?.();
    }
  };

  const { confirm } = useConfirm();

  const handleDeleteUser = async (user) => {
    const confirmed = await confirm({
      title: 'Kullanıcıyı Sil',
      message: `"${user.name}" adlı kullanıcıyı silmek istediğinize emin misiniz?`,
      confirmText: 'Evet, Sil',
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
      title: 'Toplu Silme',
      message: `${selectedUsers.length} kullanıcıyı silmek istediğinize emin misiniz?`,
      confirmText: 'Evet, Hepsini Sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    if (!confirmed) return;
    for (const id of selectedUsers) {
      try { await axios.delete(`/users/${id}`); } catch {}
    }
    toast.success("Kullanıcılar silindi");
    setSelectedUsers([]);
    onRefresh?.();
  };

  const exportCSV = () => {
    const headers = ['İsim', 'Email', 'Rol', 'Kayıt Tarihi', 'Son Aktif'];
    const rows = filteredUsers.map(u => [u.name, u.email, u.role, u.createdAt ? new Date(u.createdAt).toLocaleDateString('tr-TR') : '', u.lastActive ? new Date(u.lastActive).toLocaleDateString('tr-TR') : '']);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'kullanicilar.csv';
    link.click();
    toast.success('CSV indirildi');
  };

  const toggleSelect = (id) => setSelectedUsers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const selectAll = () => setSelectedUsers(filteredUsers.map(u => u._id));
  const clearSelection = () => setSelectedUsers([]);

  // Liste yenilendiğinde dönem başlangıcı da yeniden hesaplanır
  const appSince = useMemo(() => appPeriodStart(appPeriod), [appPeriod, users]);
  // Uygulama takibinde yalnızca müşteriler sayılır (yönetici hesapları izlenmez)
  const appTiles = useMemo(() => {
    const customers = users.filter(u => u.role !== 'admin');
    const count = (id) => customers.filter(u => APP_FILTERS[id](u, appSince)).length;
    return [
      { id: 'now', label: 'Şu an uygulamada', value: count('now'), tone: 'ok' },
      { id: 'opened', label: 'Uygulamayı açtı', value: count('opened') },
      { id: 'checkout', label: 'Sepet / sipariş ekranına girdi', value: count('checkout') },
      { id: 'ordered', label: 'Sipariş verdi', value: count('ordered') },
      { id: 'noOrder', label: 'Açtı, sipariş vermedi', value: count('noOrder'), tone: 'warn' },
      { id: 'notOpened', label: 'Hiç açmadı', value: count('notOpened') },
    ];
  }, [users, appSince]);

  const filteredUsers = useMemo(() => {
    let result = users.filter(u => {
      const matchSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = filterRole === 'all' || u.role === filterRole;
      const matchApp = !appFilter || (u.role !== 'admin' && APP_FILTERS[appFilter](u, appSince));
      return matchSearch && matchRole && matchApp;
    });
    result.sort((a, b) => {
      let aVal = a[sortBy], bVal = b[sortBy];
      if (sortBy === 'lastActive' || sortBy === 'createdAt') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });
    return result;
  }, [users, searchTerm, filterRole, sortBy, sortDir, appFilter, appSince]);

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    customers: users.filter(u => u.role === 'customer').length,
    active24h: users.filter(u => u.lastActive && new Date(u.lastActive) > new Date(Date.now() - 86400000)).length
  };

  if (loading) return <div className="ui-loading"><div className="ui-loader" /></div>;
  if (error) return <div className="ui-card ui-empty"><p className="ui-badge ui-badge--danger">{error}</p></div>;

  return (
    <div className="ui-page">
      {/* Stats */}
      <div className="ui-stats">
        <StatCard label="Toplam Kullanıcı" value={stats.total} />
        <StatCard label="Adminler" value={stats.admins} />
        <StatCard label="Müşteriler" value={stats.customers} />
        <StatCard label="Son 24 Saat Aktif" value={stats.active24h} tone="ok" />
      </div>

      {/* Mobil uygulama takibi */}
      <section className="ui-card">
        <div className="ui-card-header">
          <div>
            <h3 className="ui-title">Uygulama takibi</h3>
            <p className="ui-subtitle">Mobil uygulamayı açan müşteriler ve siparişe kadar geldikleri adım. Bir kutuya tıklayınca aşağıdaki liste süzülür.</p>
          </div>
          <select value={appPeriod} onChange={e => setAppPeriod(e.target.value)} aria-label="Uygulama takibi dönemi" className="ui-field ui-field--auto">
            {APP_PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
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

      {/* Best Customers */}
      <section className="ui-card">
        <div className="ui-card-header">
          <h3 className="ui-title">En İyi Müşteriler</h3>
        </div>
        {loadingBest ? (
          <div className="ui-loading"><div className="ui-loader" /></div>
        ) : bestCustomers.length === 0 ? (
          <p className="ui-loading">Henüz veri yok</p>
        ) : (
          <div className="ui-card-body users-best">
            {bestCustomers.slice(0, 5).map((c, i) => (
              <div key={c.userId} className="ui-row">
                {i < 5 && <span className="ui-rank">{i + 1}</span>}
                <div className="ui-grow">
                  <p className="ui-list-title ui-truncate">{c.name}</p>
                  <p className="ui-list-sub ui-truncate">{c.email}</p>
                  <p className="ui-list-sub"><span className="ui-strong ui-num">₺{c.totalSpent?.toFixed(0)}</span> · {c.orderCount} sipariş</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* User List */}
      <section className="ui-card" style={{ overflow: "hidden" }}>
        {/* Toolbar */}
        <div className="ui-card-body ui-cluster" style={{ borderBottom: "1px solid var(--ui-line)" }}>
          <div className="ui-search ui-grow" style={{ flexBasis: 220 }}>
            <Search />
            <input type="text" placeholder="Ara..." aria-label="Kullanıcı ara" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="ui-field" />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} aria-label="Rol filtresi" className="ui-field ui-field--auto">
            <option value="all">Tümü</option>
            <option value="admin">Admin</option>
            <option value="customer">Müşteri</option>
          </select>
          <button onClick={() => { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} className="ui-btn" style={{ minHeight: 38 }}><ArrowUpDown />{sortDir === 'asc' ? 'Artan' : 'Azalan'}</button>
          <button onClick={exportCSV} className="ui-btn" style={{ minHeight: 38 }}><Download />CSV</button>
          <button onClick={onRefresh} className="ui-btn" style={{ minHeight: 38 }}><RefreshCw />Yenile</button>
        </div>

        {appFilter && (
          <div className="ui-card-body ui-cluster app-track-active">
            <span className="ui-badge ui-badge--brand">{appTiles.find(t => t.id === appFilter)?.label}</span>
            <span className="ui-text-sm ui-muted">{filteredUsers.length} müşteri{appFilter !== 'now' ? ` · ${APP_PERIODS.find(p => p.id === appPeriod)?.label}` : ''}</span>
            <span className="ui-grow" />
            <button onClick={() => setAppFilter(null)} className="ui-btn ui-btn--ghost ui-btn--sm"><X />Süzgeci kaldır</button>
          </div>
        )}

        {selectedUsers.length > 0 && (
          <div className="ui-bulkbar" style={{ position: "static", border: 0, borderRadius: 0, borderBottom: "1px solid #b9d6c6" }}>
            <span className="ui-bulkbar-count">{selectedUsers.length} kullanıcı seçildi</span>
            <span className="ui-grow" />
            <button onClick={handleBulkDelete} className="ui-btn ui-btn--sm ui-btn--danger"><Trash2 />{selectedUsers.length} Sil</button>
            <button onClick={clearSelection} className="ui-icon-btn" title="Seçimi temizle" aria-label="Seçimi temizle"><X /></button>
          </div>
        )}

        <div className="ui-list-head users-cols">
          <div className="ui-cluster"><button onClick={selectAll} className="ui-btn ui-btn--ghost ui-btn--sm" style={{ marginLeft: -8 }}>Tümünü Seç</button></div>
          <div>Rol</div>
          <div>Son giriş</div>
          <div>Cihaz / Uygulama</div>
          <div className="ui-right">İşlemler</div>
        </div>
        <div>
          {filteredUsers.map(user => (
            <UserRow key={user._id} user={user} appSince={appSince} selected={selectedUsers.includes(user._id)} onSelect={toggleSelect} onView={handleViewUser} onEdit={setEditUser} onResetPw={setPwUser} onDelete={handleDeleteUser} />
          ))}
        </div>
        {filteredUsers.length === 0 && <div className="ui-empty"><Users /><p>Kullanıcı bulunamadı</p></div>}
      </section>

      {/* Modals */}
      {viewUser && <UserDetailModal user={viewUser} orders={userOrders} chats={userChats} onOpenChat={onOpenChat} onClose={() => setViewUser(null)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSaveUser} />}
      {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} />}
    </div>
  );
};

export default UsersTab;
