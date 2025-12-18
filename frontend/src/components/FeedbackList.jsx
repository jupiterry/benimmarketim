import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Star, 
  ChevronDown, 
  ChevronUp, 
  Lightbulb, 
  TrendingUp, 
  ThumbsUp, 
  ThumbsDown, 
  MessageSquare, 
  BarChart2,
  User,
  Mail,
  Calendar,
  Filter,
  Search,
  X,
  Eye,
  CheckCircle,
  Clock,
  Trash2,
  RefreshCw
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const AI_SUGGESTIONS = {
  usability: {
    low: [
      "Navigasyon menüsünü daha belirgin hale getirin",
      "Mobil uyumluluk iyileştirmeleri yapın",
      "Arama fonksiyonunu geliştirin",
      "Sayfa yükleme hızını artırın"
    ],
    medium: [
      "Ürün filtreleme seçeneklerini genişletin",
      "Sepet işlemlerini basitleştirin"
    ]
  },
  expectations: {
    low: [
      "Ürün açıklamalarını daha detaylı hale getirin",
      "Fiyat-performans dengesini gözden geçirin",
      "Ürün fotoğraflarının kalitesini artırın"
    ],
    medium: [
      "Kampanya ve indirimleri daha görünür yapın",
      "Stok bilgilerini gerçek zamanlı güncelleyin"
    ]
  },
  repeat: {
    low: [
      "Müşteri sadakat programı başlatın",
      "Sipariş takip sistemini geliştirin",
      "İade sürecini kolaylaştırın"
    ],
    medium: [
      "Özel indirim kuponları sunun",
      "Düzenli müşterilere özel avantajlar sağlayın"
    ]
  }
};

const FeedbackList = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFeedback, setExpandedFeedback] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({
    averageRatings: {},
    totalFeedbacks: 0,
    categoryDistribution: {},
    sentimentAnalysis: {
      positive: 0,
      negative: 0,
      neutral: 0
    },
    recentTrends: []
  });

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/feedback");
      setFeedbacks(response.data);
      calculateStats(response.data);
    } catch (error) {
      console.error("Geri bildirimler yüklenirken hata:", error);
      toast.error("Geri bildirimler yüklenirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (feedbackData) => {
    const totalFeedbacks = feedbackData.length;
    const ratingsSums = {};
    const ratingsCount = {};
    const categoryCount = {};
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    const dailyRatings = {};

    feedbackData.forEach(feedback => {
      categoryCount[feedback.category] = (categoryCount[feedback.category] || 0) + 1;

      Object.entries(feedback.ratings).forEach(([key, value]) => {
        if (value > 0) {
          ratingsSums[key] = (ratingsSums[key] || 0) + value;
          ratingsCount[key] = (ratingsCount[key] || 0) + 1;
        }
      });

      const avgRating = Object.values(feedback.ratings).reduce((sum, val) => sum + val, 0) / 
                       Object.values(feedback.ratings).filter(val => val > 0).length;
      
      if (avgRating >= 4) positiveCount++;
      else if (avgRating <= 2) negativeCount++;
      else neutralCount++;

      const feedbackDate = new Date(feedback.createdAt);
      if (feedbackDate >= last30Days) {
        const dateKey = feedbackDate.toISOString().split('T')[0];
        if (!dailyRatings[dateKey]) {
          dailyRatings[dateKey] = { count: 0, totalRating: 0 };
        }
        dailyRatings[dateKey].count++;
        dailyRatings[dateKey].totalRating += avgRating;
      }
    });

    const averageRatings = {};
    Object.keys(ratingsSums).forEach(key => {
      averageRatings[key] = ratingsSums[key] / ratingsCount[key];
    });

    const recentTrends = Object.entries(dailyRatings)
      .map(([date, data]) => ({
        date,
        averageRating: data.totalRating / data.count,
        count: data.count
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    setStats({
      averageRatings,
      totalFeedbacks,
      categoryDistribution: categoryCount,
      sentimentAnalysis: { positive: positiveCount, negative: negativeCount, neutral: neutralCount },
      recentTrends
    });
  };

  const getAISuggestions = (questionId, rating) => {
    if (rating >= 4) return [];
    const suggestions = AI_SUGGESTIONS[questionId];
    return rating <= 2 ? suggestions?.low || [] : suggestions?.medium || [];
  };

  const renderStars = (rating) => {
    return [...Array(5)].map((_, index) => (
      <Star
        key={index}
        className={`w-4 h-4 ${
          index < rating
            ? "text-amber-400 fill-current"
            : "text-gray-600"
        }`}
      />
    ));
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case "Yeni":
        return { color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400", icon: <Clock className="w-4 h-4" /> };
      case "İnceleniyor":
        return { color: "from-yellow-500/20 to-orange-500/20 border-yellow-500/30 text-yellow-400", icon: <Eye className="w-4 h-4" /> };
      case "Çözüldü":
        return { color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400", icon: <CheckCircle className="w-4 h-4" /> };
      case "Kapatıldı":
        return { color: "from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-400", icon: <X className="w-4 h-4" /> };
      default:
        return { color: "from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-400", icon: <Clock className="w-4 h-4" /> };
    }
  };

  const handleStatusUpdate = async (feedbackId, newStatus) => {
    try {
      await axios.patch(`/feedback/${feedbackId}/status`, { status: newStatus });
      const updatedFeedbacks = feedbacks.map(f => 
        f._id === feedbackId ? { ...f, status: newStatus } : f
      );
      setFeedbacks(updatedFeedbacks);
      toast.success("Durum güncellendi");
    } catch (error) {
      console.error("Durum güncellenirken hata:", error);
      toast.error("Durum güncellenirken hata oluştu");
    }
  };

  const handleDelete = async (feedbackId) => {
    if (!window.confirm("Bu geri bildirimi silmek istediğinizden emin misiniz?")) return;
    
    try {
      await axios.delete(`/feedback/${feedbackId}`);
      setFeedbacks(feedbacks.filter(f => f._id !== feedbackId));
      toast.success("Geri bildirim silindi");
    } catch (error) {
      console.error("Silme hatası:", error);
      toast.error("Geri bildirim silinirken hata oluştu");
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

  if (loading) {
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
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Başlık */}
      <motion.div 
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="inline-flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 bg-clip-text text-transparent">
            Geri Bildirimler
          </h2>
          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
            <Star className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-gray-400 text-lg">Müşteri geri bildirimlerini yönetin ve analiz edin</p>
      </motion.div>

      {/* İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Genel İstatistikler */}
        <motion.div
          className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-lg">
              <BarChart2 className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Genel İstatistikler</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-xl">
              <span className="text-gray-300">Toplam Geri Bildirim</span>
              <span className="text-2xl font-bold text-emerald-400">{stats.totalFeedbacks}</span>
            </div>
            {Object.entries(stats.averageRatings).slice(0, 3).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  {key === "usability" ? "Kullanıcı Dostu" :
                   key === "expectations" ? "Beklenti Karşılama" :
                   key === "repeat" ? "Tekrar Tercih" : "Genel"}
                </span>
                <div className="flex items-center gap-2">
                  {renderStars(Math.round(value))}
                  <span className="text-sm text-gray-400">({value.toFixed(1)})</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Kategori Analizi */}
        <motion.div
          className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-lg">
              <BarChart2 className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Kategori Analizi</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(stats.categoryDistribution).map(([category, count]) => {
              const percentage = stats.totalFeedbacks > 0 ? (count / stats.totalFeedbacks) * 100 : 0;
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{category}</span>
                    <span className="text-emerald-400 font-medium">{count} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(stats.categoryDistribution).length === 0 && (
              <p className="text-gray-500 text-center py-4">Henüz kategori verisi yok</p>
            )}
          </div>
        </motion.div>

        {/* Müşteri Duyguları */}
        <motion.div
          className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Müşteri Duyguları</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <motion.div 
              className="bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-500/20"
              whileHover={{ scale: 1.05 }}
            >
              <ThumbsUp className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-emerald-400">
                {stats.totalFeedbacks > 0 ? ((stats.sentimentAnalysis.positive / stats.totalFeedbacks) * 100).toFixed(0) : 0}%
              </div>
              <div className="text-xs text-gray-400">Olumlu</div>
            </motion.div>
            <motion.div 
              className="bg-yellow-500/10 rounded-xl p-3 text-center border border-yellow-500/20"
              whileHover={{ scale: 1.05 }}
            >
              <MessageSquare className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-yellow-400">
                {stats.totalFeedbacks > 0 ? ((stats.sentimentAnalysis.neutral / stats.totalFeedbacks) * 100).toFixed(0) : 0}%
              </div>
              <div className="text-xs text-gray-400">Nötr</div>
            </motion.div>
            <motion.div 
              className="bg-red-500/10 rounded-xl p-3 text-center border border-red-500/20"
              whileHover={{ scale: 1.05 }}
            >
              <ThumbsDown className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-red-400">
                {stats.totalFeedbacks > 0 ? ((stats.sentimentAnalysis.negative / stats.totalFeedbacks) * 100).toFixed(0) : 0}%
              </div>
              <div className="text-xs text-gray-400">Olumsuz</div>
            </motion.div>
          </div>

          {/* Trend Chart */}
          <div className="mt-4">
            <div className="text-sm text-gray-400 mb-2">Son 10 Gün Trendi</div>
            <div className="h-16 flex items-end gap-1">
              {Array.isArray(stats.recentTrends) && stats.recentTrends.slice(-10).map((trend, index) => {
                const height = (trend.averageRating / 5) * 100;
                const color = trend.averageRating >= 4 ? 'bg-emerald-500' :
                             trend.averageRating <= 2 ? 'bg-red-500' : 'bg-yellow-500';
                
                return (
                  <motion.div
                    key={trend.date}
                    className="flex-1 flex flex-col items-center"
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                  >
                    <div className={`w-full ${color} rounded-t opacity-70 hover:opacity-100 transition-opacity cursor-pointer`} style={{ height: '100%' }} title={`${new Date(trend.date).toLocaleDateString('tr-TR')}: ${trend.averageRating.toFixed(1)}`} />
                  </motion.div>
                );
              })}
              {(!stats.recentTrends || stats.recentTrends.length === 0) && (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
                  Henüz trend verisi yok
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filtreler */}
      <motion.div 
        className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-lg">
            <Filter className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Filtreler</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Durum</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
            >
              <option value="">Tümü</option>
              <option value="Yeni">Yeni</option>
              <option value="İnceleniyor">İnceleniyor</option>
              <option value="Çözüldü">Çözüldü</option>
              <option value="Kapatıldı">Kapatıldı</option>
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">Arama</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Kullanıcı, başlık veya mesaj ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-end gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setFilterStatus(""); setSearchTerm(""); }}
              className="flex-1 px-4 py-3 bg-gray-600/50 hover:bg-gray-500/50 text-gray-200 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 font-medium"
            >
              <X className="w-4 h-4" />
              Temizle
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={fetchFeedbacks}
              className="px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl transition-all duration-300"
            >
              <RefreshCw className="w-5 h-5" />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Geri Bildirim Listesi */}
      <motion.div 
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            Geri Bildirim Listesi
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
              {filteredFeedbacks.length} sonuç
            </span>
          </h3>
        </div>

        {filteredFeedbacks.length === 0 ? (
          <motion.div 
            className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="w-20 h-20 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-emerald-400" />
            </div>
            <h4 className="text-xl font-semibold text-white mb-2">Geri Bildirim Bulunamadı</h4>
            <p className="text-gray-400">Henüz geri bildirim yok veya filtrelere uygun sonuç bulunamadı</p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filteredFeedbacks.map((feedback, index) => {
              const statusInfo = getStatusInfo(feedback.status);
              const isExpanded = expandedFeedback === feedback._id;
              const avgRating = Object.values(feedback.ratings).reduce((a, b) => a + b, 0) / Object.values(feedback.ratings).filter(r => r > 0).length;

              return (
                <motion.div
                  key={feedback._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-xl overflow-hidden hover:border-emerald-500/30 transition-all duration-300"
                >
                  <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      {/* Avatar ve Kullanıcı Bilgisi */}
                      <div className="flex items-start gap-4 flex-1">
                        <motion.div 
                          className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0"
                          whileHover={{ scale: 1.1, rotate: 5 }}
                        >
                          <span className="text-white text-lg font-bold">
                            {feedback.user?.name?.charAt(0).toUpperCase() || "K"}
                          </span>
                        </motion.div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
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
                            <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 rounded-lg">
                              <Star className="w-4 h-4 text-amber-400 fill-current" />
                              <span className="text-amber-400 font-medium">{avgRating.toFixed(1)}/5</span>
                            </div>
                          </div>

                          {feedback.title && (
                            <h5 className="text-base font-medium text-white mb-2">{feedback.title}</h5>
                          )}

                          {/* Rating Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                            {Object.entries(feedback.ratings).map(([key, rating]) => {
                              if (rating === 0) return null;
                              return (
                                <div key={key} className="bg-gray-700/30 rounded-lg p-2">
                                  <div className="text-xs text-gray-400 mb-1">
                                    {key === "usability" ? "Kullanıcı Dostu" :
                                     key === "expectations" ? "Beklenti" :
                                     key === "repeat" ? "Tekrar Tercih" : "Genel"}
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                    {renderStars(rating)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Sağ Taraf - Durum ve Aksiyonlar */}
                      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
                        <motion.div 
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r ${statusInfo.color} border`}
                          whileHover={{ scale: 1.05 }}
                        >
                          {statusInfo.icon}
                          <span className="text-sm font-medium">{feedback.status}</span>
                        </motion.div>

                        <select
                          value={feedback.status}
                          onChange={(e) => handleStatusUpdate(feedback._id, e.target.value)}
                          className="px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-pointer"
                        >
                          <option value="Yeni">Yeni</option>
                          <option value="İnceleniyor">İnceleniyor</option>
                          <option value="Çözüldü">Çözüldü</option>
                          <option value="Kapatıldı">Kapatıldı</option>
                        </select>

                        <div className="flex items-center gap-1">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setExpandedFeedback(isExpanded ? null : feedback._id)}
                            className="p-3 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-xl transition-all duration-300"
                          >
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(feedback._id)}
                            className="p-3 text-red-400 hover:bg-red-500/20 rounded-xl transition-all duration-300"
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
                          className="mt-6 pt-6 border-t border-gray-700/50 space-y-4"
                        >
                          {/* Mesaj */}
                          {feedback.message && (
                            <div className="bg-gray-700/30 rounded-xl p-4">
                              <h6 className="text-sm font-medium text-gray-300 mb-2">Mesaj</h6>
                              <p className="text-gray-300 whitespace-pre-wrap">{feedback.message}</p>
                            </div>
                          )}


                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
};

export default FeedbackList;