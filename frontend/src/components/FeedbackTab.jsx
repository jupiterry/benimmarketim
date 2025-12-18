import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MessageSquare, 
  Star, 
  CheckCircle, 
  Clock, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  User,
  Mail,
  Calendar,
  Filter,
  Search,
  X,
  TrendingUp,
  Eye
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const FeedbackTab = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFeedback, setExpandedFeedback] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchFeedbacks();
    fetchStats();
  }, []);

  const fetchFeedbacks = async () => {
    try {
      const response = await axios.get("/feedback");
      setFeedbacks(response.data);
    } catch {
      toast.error("Geri bildirimler yüklenirken bir hata oluştu");
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get("/feedback/stats");
      setStats(response.data);
    } catch {
      toast.error("İstatistikler yüklenirken bir hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.patch(`/feedback/${id}/status`, { status });
      toast.success("Durum güncellendi");
      fetchFeedbacks();
    } catch {
      toast.error("Durum güncellenirken bir hata oluştu");
    }
  };

  const deleteFeedback = async (id) => {
    if (!window.confirm("Bu geri bildirimi silmek istediğinizden emin misiniz?")) {
      return;
    }

    try {
      await axios.delete(`/feedback/${id}`);
      toast.success("Geri bildirim silindi");
      fetchFeedbacks();
      fetchStats();
    } catch {
      toast.error("Geri bildirim silinirken bir hata oluştu");
    }
  };

  // Filtrelenmiş geri bildirimler
  const filteredFeedbacks = feedbacks.filter(feedback => {
    const matchesStatus = !filterStatus || feedback.status === filterStatus;
    const matchesSearch = !searchTerm || 
      feedback.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.message?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Durum renkleri
  const getStatusInfo = (status) => {
    switch (status) {
      case "Beklemede":
        return { 
          color: "from-yellow-500/20 to-orange-500/20 border-yellow-500/30 text-yellow-400",
          icon: <Clock className="w-4 h-4" />
        };
      case "İncelendi":
        return { 
          color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400",
          icon: <Eye className="w-4 h-4" />
        };
      case "Çözüldü":
        return { 
          color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400",
          icon: <CheckCircle className="w-4 h-4" />
        };
      default:
        return { 
          color: "from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-400",
          icon: <Clock className="w-4 h-4" />
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[400px] space-y-4">
        <motion.div
          className="relative"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full"></div>
        </motion.div>
        <motion.p
          className="text-gray-400 text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Geri bildirimler yükleniyor...
        </motion.p>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <motion.div 
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="inline-flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
            Geri Bildirimler
          </h2>
          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
            <Star className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-gray-400 text-lg">
          Kullanıcı geri bildirimlerini yönetin ve analiz edin
        </p>
      </motion.div>

      {/* İstatistikler */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <StatCard
          title="Toplam Geri Bildirim"
          value={stats?.totalFeedbacks || 0}
          icon={<MessageSquare className="w-6 h-6 text-emerald-400" />}
          gradient="from-emerald-500/20 to-green-500/10"
          trend={stats?.totalFeedbacks > 0 ? "+12%" : null}
        />
        <StatCard
          title="Ortalama Puan"
          value={`${(stats?.averageRating || 0).toFixed(1)} / 5.0`}
          icon={<Star className="w-6 h-6 text-amber-400" />}
          gradient="from-amber-500/20 to-yellow-500/10"
        />
        <StatCard
          title="Çözülen"
          value={stats?.statusStats?.find(s => s._id === "Çözüldü")?.count || 0}
          icon={<CheckCircle className="w-6 h-6 text-blue-400" />}
          gradient="from-blue-500/20 to-cyan-500/10"
        />
        <StatCard
          title="Bekleyen"
          value={stats?.statusStats?.find(s => s._id === "Beklemede")?.count || 0}
          icon={<Clock className="w-6 h-6 text-red-400" />}
          gradient="from-red-500/20 to-pink-500/10"
        />
      </motion.div>

      {/* Filtreler */}
      <motion.div 
        className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-lg">
            <Filter className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Filtreler</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Durum
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
            >
              <option value="">Tümü</option>
              <option value="Beklemede">Beklemede</option>
              <option value="İncelendi">İncelendi</option>
              <option value="Çözüldü">Çözüldü</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Arama
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Kullanıcı, başlık veya mesaj..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setFilterStatus("");
                setSearchTerm("");
              }}
              className="w-full px-4 py-3 bg-gray-600/50 hover:bg-gray-500/50 text-gray-200 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 font-medium"
            >
              <X className="w-4 h-4" />
              Temizle
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Geri Bildirim Listesi */}
      <motion.div 
        className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <div className="px-6 py-5 border-b border-gray-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-lg">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Geri Bildirim Listesi
            </h3>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
              {filteredFeedbacks.length} geri bildirim
            </span>
          </div>
        </div>

        {filteredFeedbacks.length === 0 ? (
          <div className="text-center py-16">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, type: "spring" }}
              className="w-20 h-20 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <MessageSquare className="w-10 h-10 text-emerald-400" />
            </motion.div>
            <h4 className="text-xl font-semibold text-white mb-2">Geri Bildirim Bulunamadı</h4>
            <p className="text-gray-400">
              Henüz geri bildirim yok veya filtrelere uygun sonuç bulunamadı
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            <AnimatePresence>
              {filteredFeedbacks.map((feedback, index) => {
                const statusInfo = getStatusInfo(feedback.status);
                const isExpanded = expandedFeedback === feedback._id;
                
                return (
                  <motion.div
                    key={feedback._id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="hover:bg-gray-700/20 transition-all duration-300"
                  >
                    <div className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        {/* Sol Kısım - Kullanıcı ve İçerik */}
                        <div className="flex-1">
                          <div className="flex items-start gap-4">
                            {/* Avatar */}
                            <motion.div 
                              className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0"
                              whileHover={{ scale: 1.1, rotate: 5 }}
                            >
                              <span className="text-white text-lg font-bold">
                                {feedback.user?.name?.charAt(0).toUpperCase() || "K"}
                              </span>
                            </motion.div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h4 className="text-lg font-semibold text-white">
                                  {feedback.user?.name || "Kullanıcı"}
                                </h4>
                                <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded-lg text-xs flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {feedback.user?.email}
                                </span>
                              </div>
                              
                              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-3">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {new Date(feedback.createdAt).toLocaleDateString('tr-TR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                  })}
                                </div>
                                <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded-lg text-xs">
                                  {feedback.category}
                                </span>
                                <div className="flex items-center gap-1 text-amber-400">
                                  <Star className="w-4 h-4 fill-current" />
                                  <span className="font-medium">{feedback.rating}</span>
                                </div>
                              </div>
                              
                              {feedback.title && (
                                <h5 className="text-base font-medium text-white mb-2">
                                  {feedback.title}
                                </h5>
                              )}
                              
                              <p className={`text-gray-300 ${isExpanded ? '' : 'line-clamp-2'}`}>
                                {feedback.message}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Sağ Kısım - Durum ve Aksiyonlar */}
                        <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
                          {/* Durum Badge */}
                          <motion.div 
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r ${statusInfo.color} border`}
                            whileHover={{ scale: 1.05 }}
                          >
                            {statusInfo.icon}
                            <span className="text-sm font-medium">
                              {feedback.status}
                            </span>
                          </motion.div>
                          
                          {/* Durum Değiştir */}
                          <select
                            value={feedback.status}
                            onChange={(e) => updateStatus(feedback._id, e.target.value)}
                            className="px-4 py-2 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-pointer"
                          >
                            <option value="Beklemede">Beklemede</option>
                            <option value="İncelendi">İncelendi</option>
                            <option value="Çözüldü">Çözüldü</option>
                          </select>
                          
                          {/* Aksiyonlar */}
                          <div className="flex items-center gap-1">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setExpandedFeedback(isExpanded ? null : feedback._id)}
                              className="p-3 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-xl transition-all duration-300"
                              title={isExpanded ? "Daralt" : "Genişlet"}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => deleteFeedback(feedback._id)}
                              className="p-3 text-red-400 hover:bg-red-500/20 rounded-xl transition-all duration-300"
                              title="Sil"
                            >
                              <Trash2 className="w-5 h-5" />
                            </motion.button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Genişletilmiş İçerik */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="mt-4 pt-4 border-t border-gray-700/50"
                          >
                            <div className="bg-gray-800/50 rounded-xl p-4">
                              <h6 className="text-sm font-medium text-gray-300 mb-2">Tam Mesaj:</h6>
                              <p className="text-gray-300 whitespace-pre-wrap">{feedback.message}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// İstatistik Kartı Bileşeni
const StatCard = ({ title, value, icon, gradient, trend }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -5, scale: 1.02 }}
    transition={{ duration: 0.3 }}
    className={`bg-gradient-to-br ${gradient} backdrop-blur-xl p-6 rounded-2xl border border-gray-700/50 shadow-xl hover:shadow-2xl transition-all duration-300`}
  >
    <div className="flex items-center justify-between mb-4">
      <div className="p-3 rounded-xl bg-gray-800/50 shadow-lg">{icon}</div>
      {trend && (
        <div className="flex items-center gap-1 text-emerald-400 text-sm font-medium">
          <TrendingUp className="w-4 h-4" />
          {trend}
        </div>
      )}
    </div>
    <div>
      <motion.div 
        className="text-3xl font-bold text-white mb-2"
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {value}
      </motion.div>
      <div className="text-sm text-gray-400">{title}</div>
    </div>
  </motion.div>
);

export default FeedbackTab;