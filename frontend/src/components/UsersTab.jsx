import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, Crown, TrendingUp, DollarSign, ShoppingBag, Search, Filter, Star, Award, Target,
  UserCheck, Edit2, Trash2, Key, Save, X, Copy, Monitor, Smartphone, Tablet, Eye, Mail,
  Calendar, Clock, ChevronDown, ChevronUp, Download, CheckSquare, Square, MoreVertical,
  RefreshCw, ArrowUpDown, Phone, MapPin, Package, Activity
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

const getDeviceColor = (type) => ({
  desktop: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
  mobile: 'text-green-400 bg-green-500/20 border-green-500/30',
  tablet: 'text-purple-400 bg-purple-500/20 border-purple-500/30'
}[type] || 'text-gray-400 bg-gray-500/20 border-gray-500/30');

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, trend, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`relative overflow-hidden backdrop-blur-xl bg-gradient-to-br ${color} p-5 rounded-2xl border border-white/10 group hover:scale-[1.02] transition-all duration-300`}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm">
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            <TrendingUp className={`w-3 h-3 ${trend < 0 ? 'rotate-180' : ''}`} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-white/70 text-xs font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  </motion.div>
);

// User Detail Modal
const UserDetailModal = ({ user, onClose, orders }) => {
  if (!user) return null;
  
  // Kullanıcı istatistiklerini hesapla
  const userStats = useMemo(() => {
    if (!orders || orders.length === 0) {
      return { totalSpent: 0, orderCount: 0, avgOrderValue: 0, favoriteProducts: [], deliveredCount: 0 };
    }
    
    const totalSpent = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white ${user.role === 'admin' ? 'bg-gradient-to-br from-purple-500 to-pink-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
              {user.name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{user.name || 'İsimsiz'}</h2>
                {user.role === 'admin' && <Crown className="w-5 h-5 text-yellow-400" />}
              </div>
              <p className="text-gray-400 text-sm">{user.email}</p>
              {user.phone && <p className="text-gray-500 text-xs flex items-center gap-1 mt-1"><Phone className="w-3 h-3" />{user.phone}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* User Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl p-4 border border-emerald-500/30">
            <DollarSign className="w-5 h-5 text-emerald-400 mb-2" />
            <p className="text-gray-400 text-xs">Toplam Harcama</p>
            <p className="text-white font-bold text-xl">₺{userStats.totalSpent.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl p-4 border border-blue-500/30">
            <ShoppingBag className="w-5 h-5 text-blue-400 mb-2" />
            <p className="text-gray-400 text-xs">Toplam Sipariş</p>
            <p className="text-white font-bold text-xl">{userStats.orderCount}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl p-4 border border-purple-500/30">
            <TrendingUp className="w-5 h-5 text-purple-400 mb-2" />
            <p className="text-gray-400 text-xs">Ortalama Sepet</p>
            <p className="text-white font-bold text-xl">₺{userStats.avgOrderValue.toFixed(0)}</p>
          </div>
          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-xl p-4 border border-yellow-500/30">
            <Award className="w-5 h-5 text-yellow-400 mb-2" />
            <p className="text-gray-400 text-xs">Başarı Oranı</p>
            <p className="text-white font-bold text-xl">{userStats.orderCount > 0 ? Math.round((userStats.deliveredCount / userStats.orderCount) * 100) : 0}%</p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-gray-500 text-xs mb-1">Rol</p>
            <p className="text-white font-medium">{user.role === 'admin' ? 'Admin' : 'Müşteri'}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-gray-500 text-xs mb-1">Kayıt Tarihi</p>
            <p className="text-white font-medium text-sm">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-gray-500 text-xs mb-1">Cihaz</p>
            <div className="flex items-center gap-1">
              {getDeviceIcon(user.deviceType)}
              <p className="text-white font-medium text-sm">{getDeviceName(user.deviceType)}</p>
            </div>
          </div>
        </div>
        
        {/* Login Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-xl p-4 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <p className="text-emerald-400 text-sm font-medium">Son Giriş</p>
            </div>
            {user.lastLoginAt ? (
              <>
                <p className="text-white font-bold text-lg">{new Date(user.lastLoginAt).toLocaleDateString('tr-TR')}</p>
                <p className="text-gray-400 text-sm">{new Date(user.lastLoginAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
              </>
            ) : (
              <p className="text-gray-500">Henüz giriş yapmadı</p>
            )}
          </div>
          <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-xl p-4 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <p className="text-blue-400 text-sm font-medium">Son Aktivite</p>
            </div>
            {user.lastActive ? (
              <>
                <p className="text-white font-bold text-lg">{new Date(user.lastActive).toLocaleDateString('tr-TR')}</p>
                <p className="text-gray-400 text-sm">{new Date(user.lastActive).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
              </>
            ) : (
              <p className="text-gray-500">-</p>
            )}
          </div>
        </div>

        {/* Favorite Products */}
        {userStats.favoriteProducts.length > 0 && (
          <div className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 rounded-xl p-4 border border-yellow-500/20 mb-6">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" /> Favori Ürünler
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {userStats.favoriteProducts.map((product, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                    i === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                    i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                    i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' : 'bg-gray-700'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{product.name}</p>
                    <p className="text-gray-400 text-xs">{product.count} adet • ₺{product.totalSpent.toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orders Section */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <h3 className="text-white font-semibold mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2"><Package className="w-4 h-4 text-emerald-400" /> Sipariş Geçmişi</span>
            <span className="text-gray-500 text-sm">{orders?.length || 0} sipariş</span>
          </h3>
          {orders && orders.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {orders.map((order, i) => (
                <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg p-3 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      order.status === 'Teslim Edildi' || order.status === 'delivered' ? 'bg-emerald-400' :
                      order.status === 'İptal Edildi' || order.status === 'cancelled' ? 'bg-red-400' :
                      order.status === 'Yolda' ? 'bg-blue-400' : 'bg-yellow-400'
                    }`} />
                    <div>
                      <p className="text-white text-sm font-medium">#{order._id?.slice(-6) || order.orderId?.slice(-6)}</p>
                      <p className="text-gray-500 text-xs">{new Date(order.createdAt).toLocaleDateString('tr-TR')} • {order.products?.length || 0} ürün</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-bold">₺{(order.totalAmount || 0).toFixed(2)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      order.status === 'Teslim Edildi' || order.status === 'delivered' ? 'bg-green-500/20 text-green-400' : 
                      order.status === 'İptal Edildi' || order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' : 
                      order.status === 'Yolda' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {order.status || 'Beklemede'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Henüz sipariş yok</p>
          )}
        </div>
      </motion.div>
    </motion.div>
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 max-w-md w-full border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2"><Edit2 className="w-5 h-5 text-blue-400" /> Kullanıcı Düzenle</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">İsim</label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Telefon</label>
            <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Rol</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
              <option value="customer">Müşteri</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors">İptal</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50">
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </motion.div>
    </motion.div>
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 max-w-md w-full border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2"><Key className="w-5 h-5 text-amber-400" /> Şifre Sıfırla</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-gray-400 mb-4"><span className="text-white font-medium">{user?.name}</span> için yeni şifre belirleyin</p>
        <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Yeni geçici şifre" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white mb-4 focus:outline-none focus:border-amber-500" />
        {done && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2">
              <input type="text" value={password} readOnly className="flex-1 bg-transparent text-white" />
              <button onClick={() => { navigator.clipboard.writeText(password); toast.success('Kopyalandı'); }} className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Copy className="w-4 h-4" /></button>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl">Kapat</button>
          {!done && <button onClick={handleReset} disabled={loading} className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl disabled:opacity-50">{loading ? 'İşleniyor...' : 'Sıfırla'}</button>}
        </div>
      </motion.div>
    </motion.div>
  );
};

// User Row Component
const UserRow = ({ user, selected, onSelect, onView, onEdit, onResetPw, onDelete }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className={`group relative bg-gradient-to-r from-white/[0.03] to-transparent hover:from-white/[0.08] rounded-2xl p-4 border transition-all duration-300 ${selected ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'}`}
  >
    <div className="flex items-center gap-4">
      {/* Checkbox */}
      <button onClick={() => onSelect(user._id)} className="p-1">
        {selected ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5 text-gray-600 group-hover:text-gray-400" />}
      </button>

      {/* Avatar */}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-lg ${user.role === 'admin' ? 'bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/20' : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20'}`}>
        {user.name?.charAt(0).toUpperCase() || '?'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-white font-semibold truncate">{user.name || 'İsimsiz'}</h4>
          {user.role === 'admin' && <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
        </div>
        <p className="text-gray-400 text-sm truncate">{user.email}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {user.lastLoginAt && (
            <span className="text-emerald-400 text-xs flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" />
              {new Date(user.lastLoginAt).toLocaleDateString('tr-TR')} {new Date(user.lastLoginAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {!user.lastLoginAt && user.lastActive && (
            <span className="text-gray-500 text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" />{new Date(user.lastActive).toLocaleDateString('tr-TR')}
            </span>
          )}
          {user.deviceType && <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${getDeviceColor(user.deviceType)}`}>{getDeviceIcon(user.deviceType)}</span>}
        </div>
      </div>

      {/* Role Badge */}
      <span className={`hidden sm:inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
        {user.role === 'admin' ? '👑 Admin' : '👤 Müşteri'}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onView(user)} className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors" title="Görüntüle"><Eye className="w-4 h-4" /></button>
        <button onClick={() => onEdit(user)} className="p-2 hover:bg-blue-500/20 rounded-xl text-gray-400 hover:text-blue-400 transition-colors" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
        <button onClick={() => onResetPw(user)} className="p-2 hover:bg-amber-500/20 rounded-xl text-gray-400 hover:text-amber-400 transition-colors" title="Şifre Sıfırla"><Key className="w-4 h-4" /></button>
        <button onClick={() => onDelete(user)} className="p-2 hover:bg-red-500/20 rounded-xl text-gray-400 hover:text-red-400 transition-colors" title="Sil"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  </motion.div>
);

// Main Component
const UsersTab = ({ users, loading, error, onRefresh }) => {
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
  const [loadingBest, setLoadingBest] = useState(false);

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
    try {
      const res = await axios.get(`/orders-analytics/user-orders?userId=${user._id}`);
      setUserOrders(res.data.orders || []);
    } catch { setUserOrders([]); }
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

  const filteredUsers = useMemo(() => {
    let result = users.filter(u => {
      const matchSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = filterRole === 'all' || u.role === filterRole;
      return matchSearch && matchRole;
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
  }, [users, searchTerm, filterRole, sortBy, sortDir]);

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    customers: users.filter(u => u.role === 'customer').length,
    active24h: users.filter(u => u.lastActive && new Date(u.lastActive) > new Date(Date.now() - 86400000)).length
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-400 text-lg">{error}</p></div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Toplam Kullanıcı" value={stats.total} color="from-blue-500/20 to-indigo-600/20" delay={0} />
        <StatCard icon={Crown} label="Adminler" value={stats.admins} color="from-purple-500/20 to-pink-600/20" delay={0.1} />
        <StatCard icon={ShoppingBag} label="Müşteriler" value={stats.customers} color="from-emerald-500/20 to-teal-600/20" delay={0.2} />
        <StatCard icon={Activity} label="Son 24 Saat Aktif" value={stats.active24h} trend={12} color="from-amber-500/20 to-orange-600/20" delay={0.3} />
      </div>

      {/* Best Customers */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-yellow-500/10 via-orange-500/5 to-transparent rounded-2xl border border-yellow-500/20 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-yellow-500/20"><Award className="w-5 h-5 text-yellow-400" /></div>
          <h3 className="text-lg font-bold text-white">🏆 En İyi Müşteriler</h3>
        </div>
        {loadingBest ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" /></div>
        ) : bestCustomers.length === 0 ? (
          <p className="text-gray-500 text-center py-6">Henüz veri yok</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {bestCustomers.slice(0, 5).map((c, i) => (
              <div key={c.userId} className="bg-white/5 rounded-xl p-4 border border-white/5 relative">
                {i < 5 && <div className="absolute top-2 right-2 text-2xl">{['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]}</div>}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">{c.name?.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0"><p className="text-white font-medium truncate">{c.name}</p><p className="text-gray-500 text-xs truncate">{c.email}</p></div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{c.orderCount} sipariş</span>
                  <span className="text-emerald-400 font-bold">₺{c.totalSpent?.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Ara..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500" />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500">
            <option value="all">Tümü</option>
            <option value="admin">Admin</option>
            <option value="customer">Müşteri</option>
          </select>
        </div>
        <div className="flex gap-2">
          {selectedUsers.length > 0 && (
            <>
              <button onClick={handleBulkDelete} className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 text-sm font-medium flex items-center gap-2"><Trash2 className="w-4 h-4" />{selectedUsers.length} Sil</button>
              <button onClick={clearSelection} className="px-4 py-2.5 bg-white/5 text-gray-400 rounded-xl hover:bg-white/10 text-sm"><X className="w-4 h-4" /></button>
            </>
          )}
          <button onClick={exportCSV} className="px-4 py-2.5 bg-white/5 text-gray-400 rounded-xl hover:bg-white/10 text-sm font-medium flex items-center gap-2"><Download className="w-4 h-4" />CSV</button>
          <button onClick={onRefresh} className="px-4 py-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/30 text-sm font-medium flex items-center gap-2"><RefreshCw className="w-4 h-4" />Yenile</button>
        </div>
      </div>

      {/* User List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={selectAll} className="text-gray-500 hover:text-white text-sm flex items-center gap-2"><CheckSquare className="w-4 h-4" />Tümünü Seç</button>
          <button onClick={() => { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} className="text-gray-500 hover:text-white text-sm flex items-center gap-1"><ArrowUpDown className="w-4 h-4" />{sortDir === 'asc' ? 'Artan' : 'Azalan'}</button>
        </div>
        <div className="space-y-2">
          {filteredUsers.map(user => (
            <UserRow key={user._id} user={user} selected={selectedUsers.includes(user._id)} onSelect={toggleSelect} onView={handleViewUser} onEdit={setEditUser} onResetPw={setPwUser} onDelete={handleDeleteUser} />
          ))}
        </div>
        {filteredUsers.length === 0 && <div className="text-center py-12"><Users className="w-16 h-16 text-gray-700 mx-auto mb-4" /><p className="text-gray-500">Kullanıcı bulunamadı</p></div>}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {viewUser && <UserDetailModal user={viewUser} orders={userOrders} onClose={() => setViewUser(null)} />}
        {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSaveUser} />}
        {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default UsersTab;
