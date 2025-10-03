import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, 
  Crown, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag,
  Search,
  Filter,
  Star,
  Award,
  Target,
  UserCheck,
  Edit2,
  Trash2,
  Key,
  Save,
  X,
  Copy
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const UsersTab = ({ users, loading, error, onRefresh }) => {
  const [bestCustomers, setBestCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [loadingBest, setLoadingBest] = useState(false);
  
  // Düzenleme state'leri
  const [editingUser, setEditingUser] = useState(null);
  const [editedUser, setEditedUser] = useState({});
  
  // Şifre sıfırlama state'leri
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetInfo, setResetInfo] = useState({ userId: "", userName: "", tempPassword: "" });
  const [customTempPassword, setCustomTempPassword] = useState("");

  useEffect(() => {
    fetchBestCustomers();
  }, []);

  const fetchBestCustomers = async () => {
    setLoadingBest(true);
    try {
      const response = await axios.get("/users/best-customers");
      setBestCustomers(response.data.customers || []);
    } catch (error) {
      console.error("En iyi müşteriler getirilemedi:", error);
    } finally {
      setLoadingBest(false);
    }
  };

  // Kullanıcı düzenleme fonksiyonları
  const handleEditUser = (user) => {
    setEditingUser(user._id);
    setEditedUser({
      name: user.name,
      email: user.email,
      role: user.role
    });
  };

  const handleSaveUser = async () => {
    try {
      const response = await axios.put(`/users/${editingUser}`, editedUser);
      if (response.data.success) {
        toast.success("Kullanıcı başarıyla güncellendi!");
        setEditingUser(null);
        setEditedUser({});
        if (onRefresh) onRefresh();
      }
    } catch (error) {
      console.error("Kullanıcı güncellenirken hata:", error);
      toast.error(error.response?.data?.message || "Kullanıcı güncellenirken hata oluştu");
    }
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditedUser({});
  };

  // Kullanıcı silme
  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`"${userName}" kullanıcısını silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      await axios.delete(`/users/${userId}`);
      toast.success("Kullanıcı başarıyla silindi");
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Kullanıcı silinirken hata:", error);
      toast.error(error.response?.data?.message || "Kullanıcı silinirken hata oluştu");
    }
  };

  // Şifre sıfırlama
  const handleResetPassword = (userId, userName) => {
    setResetInfo({
      userId: userId,
      userName: userName,
      tempPassword: ""
    });
    setCustomTempPassword("");
    setShowResetModal(true);
  };

  const handleConfirmReset = async () => {
    if (!customTempPassword) {
      toast.error("Lütfen geçici şifre belirleyin");
      return;
    }

    try {
      const response = await axios.post(`/users/${resetInfo.userId}/reset-password`, {
        tempPassword: customTempPassword
      });
      
      if (response.data.success) {
        setResetInfo(prev => ({
          ...prev,
          tempPassword: customTempPassword
        }));
        toast.success("Şifre başarıyla sıfırlandı");
      }
    } catch (error) {
      console.error("Şifre sıfırlanırken hata:", error);
      toast.error(error.response?.data?.message || "Şifre sıfırlanırken hata oluştu");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedUser(prev => ({ ...prev, [name]: value }));
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === "all" || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === "admin").length,
    customers: users.filter(u => u.role === "customer").length,
    active24h: users.filter(u => {
      if (!u.lastActive) return false;
      const lastActive = new Date(u.lastActive);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return lastActive > dayAgo;
    }).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 p-6 rounded-xl border border-blue-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-400 text-sm font-medium">Toplam Kullanıcı</p>
              <p className="text-white text-3xl font-bold mt-1">{stats.total}</p>
            </div>
            <Users className="w-12 h-12 text-blue-400 opacity-50" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 p-6 rounded-xl border border-purple-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-400 text-sm font-medium">Adminler</p>
              <p className="text-white text-3xl font-bold mt-1">{stats.admins}</p>
            </div>
            <Crown className="w-12 h-12 text-purple-400 opacity-50" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-green-500/10 to-green-600/10 p-6 rounded-xl border border-green-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-400 text-sm font-medium">Müşteriler</p>
              <p className="text-white text-3xl font-bold mt-1">{stats.customers}</p>
            </div>
            <ShoppingBag className="w-12 h-12 text-green-400 opacity-50" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 p-6 rounded-xl border border-emerald-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-400 text-sm font-medium">Son 24 Saat</p>
              <p className="text-white text-3xl font-bold mt-1">{stats.active24h}</p>
            </div>
            <UserCheck className="w-12 h-12 text-emerald-400 opacity-50" />
          </div>
        </motion.div>
      </div>

      {/* Best Customers Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-xl border border-yellow-500/20 p-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <Award className="w-6 h-6 text-yellow-400" />
          <h3 className="text-xl font-bold text-white">🏆 En İyi Müşteriler</h3>
        </div>

        {loadingBest ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
          </div>
        ) : bestCustomers.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Henüz sipariş veren müşteri yok</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bestCustomers.map((customer, index) => (
              <motion.div
                key={customer.userId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 relative overflow-hidden"
              >
                {/* Rank Badge */}
                {index < 3 && (
                  <div className="absolute top-2 right-2">
                    {index === 0 && <div className="text-2xl">🥇</div>}
                    {index === 1 && <div className="text-2xl">🥈</div>}
                    {index === 2 && <div className="text-2xl">🥉</div>}
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg">
                    {customer.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold truncate">{customer.name || "İsimsiz"}</h4>
                    <p className="text-gray-400 text-sm truncate">{customer.email}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-1">
                      <ShoppingBag className="w-4 h-4" />
                      Sipariş
                    </span>
                    <span className="text-white font-semibold">{customer.orderCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      Toplam
                    </span>
                    <span className="text-emerald-400 font-bold">₺{customer.totalSpent?.toFixed(2) || "0.00"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Target className="w-4 h-4" />
                      Ortalama
                    </span>
                    <span className="text-white">₺{customer.avgOrderValue?.toFixed(2) || "0.00"}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Kullanıcı ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">Tüm Roller</option>
          <option value="admin">Adminler</option>
          <option value="customer">Müşteriler</option>
        </select>
      </div>

      {/* Users List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Users className="w-5 h-5" />
          Kullanıcı Listesi ({filteredUsers.length})
        </h3>

        <div className="grid gap-3">
          {filteredUsers.map((user, index) => (
            <motion.div
              key={user._id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 hover:border-emerald-500/30 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                    user.role === "admin" 
                      ? "bg-gradient-to-br from-purple-500 to-pink-600" 
                      : "bg-gradient-to-br from-blue-500 to-cyan-600"
                  }`}>
                    {user.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1">
                    {editingUser === user._id ? (
                      // Düzenleme modu
                      <div className="space-y-2">
                        <input
                          type="text"
                          name="name"
                          value={editedUser.name || ""}
                          onChange={handleChange}
                          placeholder="İsim"
                          className="w-full px-3 py-1 bg-gray-700 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          type="email"
                          name="email"
                          value={editedUser.email || ""}
                          onChange={handleChange}
                          placeholder="Email"
                          className="w-full px-3 py-1 bg-gray-700 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <select
                          name="role"
                          value={editedUser.role || "customer"}
                          onChange={handleChange}
                          className="w-full px-3 py-1 bg-gray-700 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="customer">Müşteri</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    ) : (
                      // Normal görünüm
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-semibold">{user.name || "İsimsiz"}</h4>
                          {user.role === "admin" && (
                            <Crown className="w-4 h-4 text-yellow-400" />
                          )}
                        </div>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                        {user.lastActive && (
                          <p className="text-gray-500 text-xs mt-1">
                            Son aktif: {new Date(user.lastActive).toLocaleDateString('tr-TR')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {editingUser === user._id ? (
                    // Düzenleme butonları
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSaveUser}
                        className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                        title="Kaydet"
                      >
                        <Save className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCancelEdit}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                        title="İptal"
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                    </div>
                  ) : (
                    // Normal butonlar
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      }`}>
                        {user.role === "admin" ? "👑 Admin" : "👤 Müşteri"}
                      </span>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleEditUser(user)}
                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                        title="Düzenle"
                      >
                        <Edit2 className="w-4 h-4" />
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleResetPassword(user._id, user.name)}
                        className="p-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors"
                        title="Şifre Sıfırla"
                      >
                        <Key className="w-4 h-4" />
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDeleteUser(user._id, user.name)}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Kullanıcı bulunamadı</p>
          </div>
        )}
      </div>

      {/* Şifre Sıfırlama Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Key className="w-6 h-6 text-amber-400" />
                  Şifre Sıfırla
                </h3>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-gray-400 text-sm">
                  <span className="font-medium text-white">{resetInfo.userName}</span> kullanıcısının şifresini sıfırlayın
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Yeni Geçici Şifre</label>
                  <input
                    type="text"
                    value={customTempPassword}
                    onChange={(e) => setCustomTempPassword(e.target.value)}
                    placeholder="Geçici şifre girin"
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleConfirmReset}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:shadow-lg transition-all"
                  >
                    Şifreyi Sıfırla
                  </button>
                </div>

                {/* Şifre başarıyla sıfırlandıysa göster */}
                {resetInfo.tempPassword && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                      <span className="text-emerald-400 font-medium text-sm">Şifre başarıyla sıfırlandı!</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={resetInfo.tempPassword}
                        readOnly
                        className="flex-1 bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-white focus:outline-none"
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          navigator.clipboard.writeText(resetInfo.tempPassword);
                          toast.success("Şifre panoya kopyalandı");
                        }}
                        className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        <Copy className="w-5 h-5" />
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UsersTab;

