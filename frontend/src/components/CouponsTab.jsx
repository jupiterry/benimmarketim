import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tag, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, Calendar, Percent,
  DollarSign, Users, Copy, X, Search, Filter, Clock, Package, Zap,
  RefreshCw, Check, AlertTriangle
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";

// Stat Card Component
const StatCard = ({ icon: Icon, title, value, color, subtext }) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className={`bg-gradient-to-br ${color} rounded-2xl p-5 border border-white/10`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-400 text-sm">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {subtext && <p className="text-gray-500 text-xs mt-1">{subtext}</p>}
      </div>
      <div className={`p-3 rounded-xl bg-white/10`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </motion.div>
);

// Coupon Creation/Edit Modal
const CouponModal = ({ isOpen, onClose, coupon, onSave }) => {
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discountType: "percentage",
    discountPercentage: 10,
    discountAmount: 0,
    minimumOrderAmount: 0,
    maximumDiscount: null,
    usageLimit: null,
    userUsageLimit: 1,
    expirationDate: "",
    newUsersOnly: false,
    firstOrderOnly: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (coupon) {
      setFormData({
        code: coupon.code || "",
        description: coupon.description || "",
        discountType: coupon.discountType || "percentage",
        discountPercentage: coupon.discountPercentage || 10,
        discountAmount: coupon.discountAmount || 0,
        minimumOrderAmount: coupon.minimumOrderAmount || 0,
        maximumDiscount: coupon.maximumDiscount || null,
        usageLimit: coupon.usageLimit || null,
        userUsageLimit: coupon.userUsageLimit || 1,
        expirationDate: coupon.expirationDate ? new Date(coupon.expirationDate).toISOString().split('T')[0] : "",
        newUsersOnly: coupon.newUsersOnly || false,
        firstOrderOnly: coupon.firstOrderOnly || false
      });
    } else {
      // Default for new coupon
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 30);
      setFormData(prev => ({
        ...prev,
        code: "",
        expirationDate: tomorrow.toISOString().split('T')[0]
      }));
    }
  }, [coupon]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const payload = {
        ...formData,
        maximumDiscount: formData.maximumDiscount || null,
        usageLimit: formData.usageLimit || null
      };

      if (coupon?._id) {
        await axios.put(`/coupons/${coupon._id}`, payload);
        toast.success("Kupon güncellendi!");
      } else {
        await axios.post("/coupons", payload);
        toast.success("Kupon oluşturuldu!");
      }
      onSave();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, code }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">
            {coupon ? "Kupon Düzenle" : "Yeni Kupon Oluştur"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Kupon Kodu */}
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Kupon Kodu</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 border border-white/10 focus:border-emerald-500 font-mono uppercase"
                required
                placeholder="INDIRIM20"
              />
              <button
                type="button"
                onClick={generateRandomCode}
                className="px-4 py-3 bg-white/5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Zap className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Açıklama */}
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Açıklama</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-white/10 focus:border-emerald-500"
              placeholder="Yaz indirimi kuponu"
            />
          </div>

          {/* İndirim Tipi */}
          <div>
            <label className="text-sm text-gray-400 mb-1 block">İndirim Tipi</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, discountType: "percentage" }))}
                className={`p-3 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  formData.discountType === "percentage"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : "bg-gray-800 border-white/10 text-gray-400"
                }`}
              >
                <Percent className="w-4 h-4" />
                Yüzde
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, discountType: "fixed" }))}
                className={`p-3 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  formData.discountType === "fixed"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : "bg-gray-800 border-white/10 text-gray-400"
                }`}
              >
                <DollarSign className="w-4 h-4" />
                Sabit Tutar
              </button>
            </div>
          </div>

          {/* İndirim Değeri */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">
                {formData.discountType === "percentage" ? "İndirim Yüzdesi (%)" : "İndirim Tutarı (₺)"}
              </label>
              <input
                type="number"
                value={formData.discountType === "percentage" ? formData.discountPercentage : formData.discountAmount}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  [formData.discountType === "percentage" ? "discountPercentage" : "discountAmount"]: parseFloat(e.target.value)
                }))}
                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-white/10 focus:border-emerald-500"
                min="0"
                max={formData.discountType === "percentage" ? 100 : undefined}
                required
              />
            </div>
            {formData.discountType === "percentage" && (
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Maks. İndirim (₺)</label>
                <input
                  type="number"
                  value={formData.maximumDiscount || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, maximumDiscount: e.target.value ? parseFloat(e.target.value) : null }))}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-white/10 focus:border-emerald-500"
                  placeholder="Sınırsız"
                  min="0"
                />
              </div>
            )}
          </div>

          {/* Limitler */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Min. Sipariş (₺)</label>
              <input
                type="number"
                value={formData.minimumOrderAmount}
                onChange={(e) => setFormData(prev => ({ ...prev, minimumOrderAmount: parseFloat(e.target.value) }))}
                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-white/10 focus:border-emerald-500"
                min="0"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Toplam Kullanım Limiti</label>
              <input
                type="number"
                value={formData.usageLimit || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, usageLimit: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-white/10 focus:border-emerald-500"
                placeholder="Sınırsız"
                min="1"
              />
            </div>
          </div>

          {/* Son Kullanma Tarihi */}
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Son Kullanma Tarihi</label>
            <input
              type="date"
              value={formData.expirationDate}
              onChange={(e) => setFormData(prev => ({ ...prev, expirationDate: e.target.value }))}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-white/10 focus:border-emerald-500"
              required
            />
          </div>

          {/* Özel Koşullar */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400 mb-2 block">Özel Koşullar</label>
            <label className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={formData.firstOrderOnly}
                onChange={(e) => setFormData(prev => ({ ...prev, firstOrderOnly: e.target.checked }))}
                className="w-5 h-5 rounded accent-emerald-500"
              />
              <span className="text-white">Sadece ilk sipariş için geçerli</span>
            </label>
            <label className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={formData.newUsersOnly}
                onChange={(e) => setFormData(prev => ({ ...prev, newUsersOnly: e.target.checked }))}
                className="w-5 h-5 rounded accent-emerald-500"
              />
              <span className="text-white">Sadece yeni kullanıcılar için</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Check className="w-5 h-5" />
              )}
              {coupon ? "Güncelle" : "Oluştur"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// Main Component
const CouponsTab = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all"); // all, active, expired
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/coupons/all");
      setCoupons(response.data.coupons || []);
    } catch (error) {
      toast.error("Kuponlar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (couponId) => {
    try {
      await axios.patch(`/coupons/${couponId}/toggle`);
      fetchCoupons();
      toast.success("Kupon durumu güncellendi");
    } catch (error) {
      toast.error("Bir hata oluştu");
    }
  };

  const { confirm } = useConfirm();

  const handleDelete = async (couponId) => {
    const confirmed = await confirm({
      title: 'Kuponu Sil',
      message: 'Bu kuponu silmek istediğinize emin misiniz?',
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    if (!confirmed) return;
    
    try {
      await axios.delete(`/coupons/${couponId}`);
      fetchCoupons();
      toast.success("Kupon silindi");
    } catch (error) {
      toast.error("Silme işlemi başarısız");
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success("Kupon kodu kopyalandı!");
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = coupon.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coupon.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const now = new Date();
    const isExpired = new Date(coupon.expirationDate) < now;
    
    if (filter === "active") return matchesSearch && coupon.isActive && !isExpired;
    if (filter === "expired") return matchesSearch && isExpired;
    return matchesSearch;
  });

  const stats = {
    total: coupons.length,
    active: coupons.filter(c => c.isActive && new Date(c.expirationDate) > new Date()).length,
    expired: coupons.filter(c => new Date(c.expirationDate) < new Date()).length,
    totalUsage: coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0)
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Kupon Yönetimi</h2>
          <p className="text-gray-400 text-sm">İndirim kuponları oluştur ve yönet</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { setEditingCoupon(null); setShowModal(true); }}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold flex items-center gap-2 shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Yeni Kupon
        </motion.button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Tag} title="Toplam Kupon" value={stats.total} color="from-blue-500/10 to-indigo-500/10" />
        <StatCard icon={Check} title="Aktif" value={stats.active} color="from-emerald-500/10 to-teal-500/10" />
        <StatCard icon={Clock} title="Süresi Dolmuş" value={stats.expired} color="from-red-500/10 to-orange-500/10" />
        <StatCard icon={Users} title="Toplam Kullanım" value={stats.totalUsage} color="from-purple-500/10 to-pink-500/10" />
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Kupon kodu veya açıklama ara..."
            className="w-full pl-12 pr-4 py-3 bg-gray-800/50 border border-white/10 rounded-xl text-white focus:border-emerald-500"
          />
        </div>
        <div className="flex gap-2">
          {[
            { key: "all", label: "Tümü" },
            { key: "active", label: "Aktif" },
            { key: "expired", label: "Süresi Dolmuş" }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-3 rounded-xl transition-colors ${
                filter === f.key
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Coupons List */}
      <div className="space-y-3">
        {filteredCoupons.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Kupon bulunamadı</p>
          </div>
        ) : (
          filteredCoupons.map(coupon => {
            const isExpired = new Date(coupon.expirationDate) < new Date();
            
            return (
              <motion.div
                key={coupon._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-gradient-to-br ${
                  isExpired 
                    ? "from-gray-800/50 to-gray-900/50" 
                    : coupon.isActive 
                      ? "from-gray-800/50 to-gray-900/50" 
                      : "from-red-900/20 to-gray-900/50"
                } rounded-2xl p-5 border ${isExpired ? "border-gray-700" : "border-white/10"}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${
                      isExpired ? "bg-gray-700" : coupon.isActive ? "bg-emerald-500/20" : "bg-red-500/20"
                    }`}>
                      <Tag className={`w-6 h-6 ${
                        isExpired ? "text-gray-400" : coupon.isActive ? "text-emerald-400" : "text-red-400"
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white font-mono">{coupon.code}</span>
                        <button
                          onClick={() => handleCopyCode(coupon.code)}
                          className="text-gray-400 hover:text-white"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {isExpired && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                            Süresi Dolmuş
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm">{coupon.description || "Açıklama yok"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-emerald-400 font-bold text-lg">
                        {coupon.discountType === "percentage" 
                          ? `%${coupon.discountPercentage}` 
                          : `₺${coupon.discountAmount}`}
                      </p>
                      <p className="text-gray-500 text-xs">İndirim</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold">{coupon.usageCount || 0}</p>
                      <p className="text-gray-500 text-xs">Kullanım</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white text-sm">
                        {new Date(coupon.expirationDate).toLocaleDateString('tr-TR')}
                      </p>
                      <p className="text-gray-500 text-xs">Son Tarih</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleStatus(coupon._id)}
                        className={`p-2 rounded-lg transition-colors ${
                          coupon.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {coupon.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => { setEditingCoupon(coupon); setShowModal(true); }}
                        className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(coupon._id)}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <CouponModal
            isOpen={showModal}
            onClose={() => { setShowModal(false); setEditingCoupon(null); }}
            coupon={editingCoupon}
            onSave={fetchCoupons}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CouponsTab;
