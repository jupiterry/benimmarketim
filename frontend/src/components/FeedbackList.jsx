import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, ChevronDown, ChevronUp, Lightbulb, TrendingUp, ThumbsUp, ThumbsDown, MessageSquare, BarChart2 } from "lucide-react";
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

    // Duygu analizi ve trend hesaplama için değişkenler
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    const dailyRatings = {};

    feedbackData.forEach(feedback => {
      // Kategori dağılımı
      categoryCount[feedback.category] = (categoryCount[feedback.category] || 0) + 1;

      // Ortalama puanlar
      Object.entries(feedback.ratings).forEach(([key, value]) => {
        if (value > 0) {
          ratingsSums[key] = (ratingsSums[key] || 0) + value;
          ratingsCount[key] = (ratingsCount[key] || 0) + 1;
        }
      });

      // Duygu analizi
      const avgRating = Object.values(feedback.ratings).reduce((sum, val) => sum + val, 0) / 
                       Object.values(feedback.ratings).filter(val => val > 0).length;
      
      if (avgRating >= 4) positiveCount++;
      else if (avgRating <= 2) negativeCount++;
      else neutralCount++;

      // Son 30 günlük trend analizi
      const feedbackDate = new Date(feedback.createdAt);
      if (feedbackDate >= last30Days) {
        const dateKey = feedbackDate.toISOString().split('T')[0];
        if (!dailyRatings[dateKey]) {
          dailyRatings[dateKey] = {
            count: 0,
            totalRating: 0
          };
        }
        dailyRatings[dateKey].count++;
        dailyRatings[dateKey].totalRating += avgRating;
      }
    });

    // Ortalama puanları hesapla
    const averageRatings = {};
    Object.keys(ratingsSums).forEach(key => {
      averageRatings[key] = ratingsSums[key] / ratingsCount[key];
    });

    // Son 30 günlük trendi düzenle
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
      sentimentAnalysis: {
        positive: positiveCount,
        negative: negativeCount,
        neutral: neutralCount
      },
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
        className={`w-5 h-5 ${
          index < rating
            ? "text-yellow-400 fill-current"
            : "text-gray-600"
        }`}
      />
    ));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Yeni":
        return "text-blue-400 bg-blue-400/10";
      case "İnceleniyor":
        return "text-yellow-400 bg-yellow-400/10";
      case "Çözüldü":
        return "text-emerald-400 bg-emerald-400/10";
      case "Kapatıldı":
        return "text-gray-400 bg-gray-400/10";
      default:
        return "text-gray-400 bg-gray-400/10";
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div
          className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="text-lg font-semibold text-emerald-400 mb-2">Genel İstatistikler</h3>
          <div className="space-y-2">
            <p className="text-gray-300">Toplam Geri Bildirim: {stats.totalFeedbacks}</p>
            <div className="space-y-1">
              {Object.entries(stats.averageRatings).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{
                    key === "usability" ? "Kullanıcı Dostu" :
                    key === "expectations" ? "Beklenti Karşılama" :
                    key === "repeat" ? "Tekrar Tercih" :
                    "Genel Değerlendirme"
                  }</span>
                  <div className="flex items-center gap-1">
                    {renderStars(Math.round(value))}
                    <span className="text-sm text-gray-400 ml-2">
                      ({value.toFixed(1)})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-emerald-400">Kategori Analizi</h3>
            <BarChart2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="space-y-3">
            {Object.entries(stats.categoryDistribution).map(([category, count]) => {
              const percentage = (count / stats.totalFeedbacks) * 100;
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{category}</span>
                    <span className="text-emerald-400 font-medium">{count} ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-emerald-500/50 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-emerald-400">Müşteri Duyguları</h3>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          
          {/* Duygu Analizi */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                <ThumbsUp className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-emerald-400">
                  {((stats.sentimentAnalysis.positive / stats.totalFeedbacks) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-400">Olumlu</div>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                <MessageSquare className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-yellow-400">
                  {((stats.sentimentAnalysis.neutral / stats.totalFeedbacks) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-400">Nötr</div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-3 text-center">
                <ThumbsDown className="w-5 h-5 text-red-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-red-400">
                  {((stats.sentimentAnalysis.negative / stats.totalFeedbacks) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-400">Olumsuz</div>
              </div>
            </div>

            {/* Son 30 Günlük Trend */}
            <div className="mt-4">
              <div className="text-sm text-gray-400 mb-2">Son 30 Gün Trendi</div>
              <div className="h-24 flex items-end gap-1">
                {stats.recentTrends.slice(-10).map((trend, index) => {
                  const height = (trend.averageRating / 5) * 100;
                  const color = trend.averageRating >= 4 ? 'bg-emerald-500' :
                               trend.averageRating <= 2 ? 'bg-red-500' : 'bg-yellow-500';
                  
                  return (
                    <motion.div
                      key={trend.date}
                      className="flex-1 flex flex-col items-center gap-1"
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <div className={`w-full ${color} rounded-t opacity-50`} style={{ height: '100%' }} />
                      <span className="text-xs text-gray-500 rotate-45 origin-left mt-2">
                        {new Date(trend.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Geri Bildirim Listesi */}
      <div className="space-y-4">
        {feedbacks.map((feedback) => (
          <motion.div
            key={feedback._id}
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-grow">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <span className="text-emerald-400 text-lg font-medium">
                      {feedback.user?.name?.charAt(0) || "K"}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white">
                      {feedback.title || "Genel Değerlendirme"}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span>{feedback.user?.name || "Kullanıcı"}</span>
                      <span>•</span>
                      <span>{new Date(feedback.createdAt).toLocaleDateString("tr-TR")}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`px-3 py-1 text-xs rounded-full ${getStatusColor(feedback.status)}`}>
                    {feedback.status}
                  </span>
                  <span className="px-3 py-1 text-xs rounded-full bg-gray-700 text-gray-300">
                    {feedback.category}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                  {Object.entries(feedback.ratings).map(([key, rating]) => {
                    if (rating === 0) return null;
                    return (
                      <div key={key} className="bg-gray-700/30 rounded-lg p-3">
                        <div className="text-sm text-gray-400 mb-1">
                          {key === "usability" ? "Kullanıcı Dostu" :
                           key === "expectations" ? "Beklenti Karşılama" :
                           key === "repeat" ? "Tekrar Tercih" :
                           "Genel Değerlendirme"}
                        </div>
                        <div className="flex items-center gap-1">
                          {renderStars(rating)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setExpandedFeedback(expandedFeedback === feedback._id ? null : feedback._id)}
                className="text-gray-400 hover:text-white transition-colors ml-4"
              >
                {expandedFeedback === feedback._id ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </button>
            </div>

            <AnimatePresence>
              {expandedFeedback === feedback._id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 space-y-4 overflow-hidden border-t border-gray-700/50 pt-4"
                >
                  {/* Mesaj */}
                  {feedback.message && (
                    <div className="bg-gray-700/30 rounded-lg p-4">
                      <p className="text-gray-300">{feedback.message}</p>
                    </div>
                  )}

                  {/* İyileştirme Önerileri */}
                  <div className="space-y-3">
                    {Object.entries(feedback.ratings).map(([key, rating]) => {
                      const suggestions = getAISuggestions(key, rating);
                      if (suggestions.length === 0) return null;

                      return (
                        <div key={key} className="bg-gray-700/30 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-yellow-400 mb-2">
                            <Lightbulb className="w-4 h-4" />
                            <span className="font-medium">
                              {key === "usability" ? "Kullanılabilirlik İyileştirmeleri" :
                               key === "expectations" ? "Beklenti Yönetimi" :
                               "Müşteri Sadakati"}
                            </span>
                          </div>
                          <ul className="space-y-2 ml-6 list-disc text-gray-400">
                            {suggestions.map((suggestion, index) => (
                              <li key={index}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  {/* Durum Güncelleme */}
                  <div className="flex items-center gap-4 pt-2">
                    <span className="text-sm text-gray-400">Durumu Güncelle:</span>
                    {["Yeni", "İnceleniyor", "Çözüldü", "Kapatıldı"].map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusUpdate(feedback._id, status)}
                        className={`px-3 py-1 rounded-lg text-sm transition-all ${
                          feedback.status === status
                            ? getStatusColor(status) + " font-medium"
                            : "text-gray-400 hover:bg-gray-700/30"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default FeedbackList;