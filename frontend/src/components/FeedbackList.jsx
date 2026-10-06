import { useState, useEffect } from "react";
import { 
  Star, 
  ChevronDown, 
  ChevronUp, 
  MessageSquare, 
  Mail,
  Calendar,
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

// Mobil uygulamadaki sipariş sonrası anketin hazır seçenekleri (backend FEEDBACK_TAGS ile aynı)
const FEEDBACK_TAG_LABELS = {
  hizli: "Hızlı geldi", taze: "Ürünler tazeydi", kurye: "Kurye nazikti", fiyat: "Fiyatlar uygundu", kolay: "Uygulama kolaydı",
  gec: "Geç geldi", eksik: "Eksik ürün vardı", yanlis: "Yanlış ürün geldi", bozuk: "Ürün bozuk/ezikti", pahali: "Fiyatlar yüksekti", uygulama: "Uygulamada sorun yaşadım",
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
        className="ui-star"
        data-on={index < rating ? "true" : undefined}
      />
    ));
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case "Yeni":
        return { color: "ui-badge--info", icon: <Clock /> };
      case "İnceleniyor":
        return { color: "ui-badge--warn", icon: <Eye /> };
      case "Çözüldü":
        return { color: "ui-badge--ok", icon: <CheckCircle /> };
      case "Kapatıldı":
        return { color: "", icon: <X /> };
      default:
        return { color: "", icon: <Clock /> };
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
      <div className="ui-loading">
        <div className="ui-loader"></div>
        <p>Geri bildirimler yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="ui-page">
      {/* Başlık */}
      <header className="app-pagehead">
        <div>
          <h1>Geri Bildirimler</h1>
          <p>Müşterilerinizin sesini dinleyin, deneyimlerini iyileştirin.</p>
        </div>
      </header>

      {/* İstatistikler */}
      <div className="ui-grid-3" style={{ gap: 16 }}>
        {/* Genel İstatistikler */}
        <section className="ui-card">
          <div className="ui-card-header">
            <h3 className="ui-title">Genel İstatistikler</h3>
          </div>
          <div className="ui-card-body ui-stack ui-stack--sm">
            <div className="ui-between">
              <span className="ui-muted">Toplam Geri Bildirim</span>
              <span className="ui-stat-value">{stats.totalFeedbacks}</span>
            </div>
            {Object.entries(stats.averageRatings).slice(0, 3).map(([key, value]) => (
              <div key={key} className="ui-between ui-text-sm">
                <span className="ui-muted">
                  {key === "usability" ? "Kullanıcı Dostu" :
                   key === "expectations" ? "Beklenti Karşılama" :
                   key === "repeat" ? "Tekrar Tercih" : "Genel"}
                </span>
                <div className="ui-stars">
                  {renderStars(Math.round(value))}
                  <span className="ui-muted ui-num">({value.toFixed(1)})</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Kategori Analizi */}
        <section className="ui-card">
          <div className="ui-card-header">
            <h3 className="ui-title">Kategori Analizi</h3>
          </div>
          <div className="ui-card-body ui-stack ui-stack--sm">
            {Object.entries(stats.categoryDistribution).map(([category, count]) => {
              const percentage = stats.totalFeedbacks > 0 ? (count / stats.totalFeedbacks) * 100 : 0;
              return (
                <div key={category}>
                  <div className="ui-between ui-text-sm" style={{ marginBottom: 4 }}>
                    <span>{category}</span>
                    <span className="ui-strong ui-num">{count} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="ui-progress">
                    <div style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(stats.categoryDistribution).length === 0 && (
              <p className="ui-loading">Henüz kategori verisi yok</p>
            )}
          </div>
        </section>

        {/* Müşteri Duyguları */}
        <section className="ui-card">
          <div className="ui-card-header">
            <h3 className="ui-title">Müşteri Duyguları</h3>
          </div>
          <div className="ui-card-body">
            <div className="ui-grid-3" style={{ gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div className="ui-stat" style={{ boxShadow: "none", padding: "10px 12px" }}>
                <span className="ui-stat-label"><span className="ui-dot ui-dot--ok" />Olumlu</span>
                <span className="ui-stat-value" style={{ fontSize: 20 }}>
                  {stats.totalFeedbacks > 0 ? ((stats.sentimentAnalysis.positive / stats.totalFeedbacks) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="ui-stat" style={{ boxShadow: "none", padding: "10px 12px" }}>
                <span className="ui-stat-label"><span className="ui-dot ui-dot--warn" />Nötr</span>
                <span className="ui-stat-value" style={{ fontSize: 20 }}>
                  {stats.totalFeedbacks > 0 ? ((stats.sentimentAnalysis.neutral / stats.totalFeedbacks) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="ui-stat" style={{ boxShadow: "none", padding: "10px 12px" }}>
                <span className="ui-stat-label"><span className="ui-dot ui-dot--danger" />Olumsuz</span>
                <span className="ui-stat-value" style={{ fontSize: 20 }}>
                  {stats.totalFeedbacks > 0 ? ((stats.sentimentAnalysis.negative / stats.totalFeedbacks) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>

            {/* Trend Chart */}
            <div style={{ marginTop: 14 }}>
              <div className="ui-overline" style={{ marginBottom: 6 }}>Son 10 Gün Trendi (ortalama puan)</div>
              <div className="ui-bars" style={{ height: 72 }}>
                {Array.isArray(stats.recentTrends) && stats.recentTrends.slice(-10).map((trend) => {
                  const height = (trend.averageRating / 5) * 100;
                  const color = trend.averageRating >= 4 ? 'ok' :
                               trend.averageRating <= 2 ? 'danger' : 'warn';
                  
                  return (
                    <div key={trend.date} className="ui-bar-col" tabIndex={0}>
                      <div className="ui-bar-track">
                        <div className="ui-bar" data-tone={color} style={{ height: `${height}%` }} />
                        <div className="ui-bar-tip">
                          <strong>{trend.averageRating.toFixed(1)} / 5</strong>
                          <span>{new Date(trend.date).toLocaleDateString('tr-TR')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!stats.recentTrends || stats.recentTrends.length === 0) && (
                  <div className="ui-loading" style={{ flex: 1, padding: 0 }}>
                    Henüz trend verisi yok
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Filtreler */}
      <div className="ui-card ui-card-body ui-cluster" style={{ alignItems: "flex-end" }}>
        <div className="ui-grow" style={{ flexBasis: 260 }}>
          <label className="ui-label" htmlFor="feedback-search">Arama</label>
          <div className="ui-search">
            <Search />
            <input
              id="feedback-search"
              type="text"
              placeholder="Kullanıcı, başlık veya mesaj ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ui-field"
            />
          </div>
        </div>

        <div>
          <label className="ui-label" htmlFor="feedback-status">Durum</label>
          <select
            id="feedback-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="ui-field ui-field--auto"
          >
            <option value="">Tümü</option>
            <option value="Yeni">Yeni</option>
            <option value="İnceleniyor">İnceleniyor</option>
            <option value="Çözüldü">Çözüldü</option>
            <option value="Kapatıldı">Kapatıldı</option>
          </select>
        </div>
        
        <button
          onClick={() => { setFilterStatus(""); setSearchTerm(""); }}
          className="ui-btn ui-btn--ghost"
          style={{ minHeight: 38 }}
        >
          <X />
          Temizle
        </button>
        <button
          onClick={fetchFeedbacks}
          className="ui-btn"
          style={{ minHeight: 38 }}
        >
          <RefreshCw />
          Yenile
        </button>
      </div>

      {/* Geri Bildirim Listesi */}
      <div className="ui-stack ui-stack--sm">
        <h3 className="ui-between">
          <span className="ui-overline">Geri Bildirim Listesi</span>
          <span className="ui-text-xs ui-muted ui-num">{filteredFeedbacks.length} sonuç</span>
        </h3>

        {filteredFeedbacks.length === 0 ? (
          <div className="ui-card ui-empty">
            <MessageSquare />
            <h4 className="ui-title">Geri Bildirim Bulunamadı</h4>
            <p>Henüz geri bildirim yok veya filtrelere uygun sonuç bulunamadı</p>
          </div>
        ) : (
          filteredFeedbacks.map((feedback) => {
            const statusInfo = getStatusInfo(feedback.status);
            const isExpanded = expandedFeedback === feedback._id;
            const avgRating = Object.values(feedback.ratings).reduce((a, b) => a + b, 0) / Object.values(feedback.ratings).filter(r => r > 0).length;

            return (
              <article key={feedback._id} className="ui-card ui-card-body">
                <div className="ui-between" style={{ alignItems: "flex-start" }}>
                  {/* Avatar ve Kullanıcı Bilgisi */}
                  <div className="products-product ui-grow" style={{ alignItems: "flex-start", flexBasis: 340 }}>
                    <div className="ui-avatar">
                      {feedback.user?.name?.charAt(0).toUpperCase() || "K"}
                    </div>
                    
                    <div className="ui-grow">
                      <div className="ui-cluster" style={{ gap: "2px 10px" }}>
                        <h4 className="ui-list-title">
                          {feedback.user?.name || "Kullanıcı"}
                        </h4>
                        <span className="orders-meta">
                          <Mail />
                          <span>{feedback.user?.email}</span>
                        </span>
                      </div>
                      
                      <div className="ui-cluster" style={{ gap: 6, marginTop: 6 }}>
                        <span className="orders-meta">
                          <Calendar />
                          <span>{new Date(feedback.createdAt).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}</span>
                        </span>
                        <span className="ui-badge">
                          {feedback.category}
                        </span>
                        <span className="ui-badge ui-badge--warn">
                          <Star />
                          {avgRating.toFixed(1)}/5
                        </span>
                      </div>

                      {(feedback.milestone || feedback.tags?.length > 0) && (
                        <div className="ui-cluster" style={{ marginTop: 8 }}>
                          {feedback.milestone && <span className="ui-badge ui-badge--brand">{feedback.milestone}. sipariş anketi</span>}
                          {(feedback.tags || []).map((tag) => <span key={tag} className="ui-badge">{FEEDBACK_TAG_LABELS[tag] || tag}</span>)}
                        </div>
                      )}
                      {feedback.title && (
                        <h5 className="ui-strong" style={{ marginTop: 8 }}>{feedback.title}</h5>
                      )}

                      {/* Rating Grid */}
                      <div className="ui-cluster" style={{ gap: "6px 16px", marginTop: 8 }}>
                        {Object.entries(feedback.ratings).map(([key, rating]) => {
                          if (rating === 0) return null;
                          return (
                            <div key={key}>
                              <div className="ui-text-xs ui-muted">
                                {key === "usability" ? "Kullanıcı Dostu" :
                                 key === "expectations" ? "Beklenti" :
                                 key === "repeat" ? "Tekrar Tercih" : "Genel"}
                              </div>
                              <div className="ui-stars">
                                {renderStars(rating)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Sağ Taraf - Durum ve Aksiyonlar */}
                  <div className="ui-cluster">
                    <span className={`ui-badge ${statusInfo.color}`}>
                      {statusInfo.icon}
                      {feedback.status}
                    </span>

                    <select
                      value={feedback.status}
                      onChange={(e) => handleStatusUpdate(feedback._id, e.target.value)}
                      aria-label="Durumu değiştir"
                      className="ui-field ui-field--sm ui-field--auto"
                    >
                      <option value="Yeni">Yeni</option>
                      <option value="İnceleniyor">İnceleniyor</option>
                      <option value="Çözüldü">Çözüldü</option>
                      <option value="Kapatıldı">Kapatıldı</option>
                    </select>

                    <div className="products-actions">
                      <button
                        onClick={() => setExpandedFeedback(isExpanded ? null : feedback._id)}
                        aria-expanded={isExpanded}
                        className="ui-icon-btn"
                        title={isExpanded ? "Mesajı gizle" : "Mesajı göster"}
                        aria-label={isExpanded ? "Mesajı gizle" : "Mesajı göster"}
                      >
                        {isExpanded ? <ChevronUp /> : <ChevronDown />}
                      </button>
                      <button
                        onClick={() => handleDelete(feedback._id)}
                        className="ui-icon-btn ui-icon-btn--danger"
                        title="Sil"
                        aria-label="Sil"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Genişletilmiş İçerik */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--ui-line)" }}>
                    {/* Mesaj */}
                    {feedback.message && (
                      <div>
                        <h6 className="ui-overline" style={{ marginBottom: 4 }}>Mesaj</h6>
                        <p className="ui-wrap-anywhere" style={{ whiteSpace: "pre-wrap" }}>{feedback.message}</p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FeedbackList;
