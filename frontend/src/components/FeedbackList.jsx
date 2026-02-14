import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  User,
  Calendar,
  Search,
  X,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

// ─── Sentiment color map by avg rating ───
const getSentimentStyle = (avgRating) => {
  if (avgRating >= 4.5) return { border: "border-emerald-500/40", shadow: "shadow-[0_0_20px_rgba(16,185,129,0.12)]", hoverShadow: "hover:shadow-[0_0_30px_rgba(16,185,129,0.22)]", ring: "ring-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500", dot: "bg-emerald-400" };
  if (avgRating >= 3.5) return { border: "border-teal-500/40", shadow: "shadow-[0_0_20px_rgba(20,184,166,0.12)]", hoverShadow: "hover:shadow-[0_0_30px_rgba(20,184,166,0.22)]", ring: "ring-teal-400", text: "text-teal-400", bg: "bg-teal-500", dot: "bg-teal-400" };
  if (avgRating >= 2.5) return { border: "border-amber-500/40", shadow: "shadow-[0_0_20px_rgba(245,158,11,0.12)]", hoverShadow: "hover:shadow-[0_0_30px_rgba(245,158,11,0.22)]", ring: "ring-amber-400", text: "text-amber-400", bg: "bg-amber-500", dot: "bg-amber-400" };
  return { border: "border-rose-500/40", shadow: "shadow-[0_0_20px_rgba(244,63,94,0.12)]", hoverShadow: "hover:shadow-[0_0_30px_rgba(244,63,94,0.22)]", ring: "ring-rose-400", text: "text-rose-400", bg: "bg-rose-500", dot: "bg-rose-400" };
};

const statusColors = {
  "Yeni": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "İnceleniyor": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Çözüldü": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Kapatıldı": "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const FeedbackList = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState({});
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({
    averageRatings: {},
    totalFeedbacks: 0,
    categoryDistribution: {},
    sentimentAnalysis: { positive: 0, negative: 0, neutral: 0 },
    recentTrends: [],
    globalAvg: 0,
  });

  useEffect(() => { fetchFeedbacks(); }, []);

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
    let positiveCount = 0, negativeCount = 0, neutralCount = 0;
    let globalTotal = 0, globalCount = 0;

    feedbackData.forEach((feedback) => {
      categoryCount[feedback.category] = (categoryCount[feedback.category] || 0) + 1;

      Object.entries(feedback.ratings).forEach(([key, value]) => {
        if (value > 0) {
          ratingsSums[key] = (ratingsSums[key] || 0) + value;
          ratingsCount[key] = (ratingsCount[key] || 0) + 1;
        }
      });

      const rated = Object.values(feedback.ratings).filter((v) => v > 0);
      if (rated.length === 0) return;
      const avgRating = rated.reduce((s, v) => s + v, 0) / rated.length;
      globalTotal += avgRating;
      globalCount++;

      if (avgRating >= 4) positiveCount++;
      else if (avgRating <= 2) negativeCount++;
      else neutralCount++;
    });

    const averageRatings = {};
    Object.keys(ratingsSums).forEach((key) => {
      averageRatings[key] = ratingsSums[key] / ratingsCount[key];
    });

    setStats({
      averageRatings,
      totalFeedbacks,
      categoryDistribution: categoryCount,
      sentimentAnalysis: { positive: positiveCount, negative: negativeCount, neutral: neutralCount },
      recentTrends: [],
      globalAvg: globalCount > 0 ? globalTotal / globalCount : 0,
    });
  };

  const handleStatusUpdate = async (feedbackId, newStatus) => {
    try {
      await axios.patch(`/feedback/${feedbackId}/status`, { status: newStatus });
      setFeedbacks((prev) => prev.map((f) => (f._id === feedbackId ? { ...f, status: newStatus } : f)));
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
      setFeedbacks((prev) => prev.filter((f) => f._id !== feedbackId));
      toast.success("Geri bildirim silindi");
    } catch (error) {
      console.error("Silme hatası:", error);
      toast.error("Geri bildirim silinirken hata oluştu");
    }
  };

  const toggleExpand = (id) => setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));

  const filteredFeedbacks = feedbacks.filter((feedback) => {
    const matchesStatus = !filterStatus || feedback.status === filterStatus;
    const matchesSearch =
      !searchTerm ||
      feedback.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.message?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getAvgRating = (fb) => {
    const rated = Object.values(fb.ratings).filter((v) => v > 0);
    return rated.length > 0 ? rated.reduce((s, v) => s + v, 0) / rated.length : 0;
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[400px] space-y-4">
        <motion.div
          className="relative"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full" />
        </motion.div>
        <p className="text-gray-500 text-sm">Geri bildirimler yükleniyor…</p>
      </div>
    );
  }

  // ─── Sentiment percentages ───
  const total = stats.totalFeedbacks || 1;
  const posPct = ((stats.sentimentAnalysis.positive / total) * 100).toFixed(0);
  const neuPct = ((stats.sentimentAnalysis.neutral / total) * 100).toFixed(0);
  const negPct = ((stats.sentimentAnalysis.negative / total) * 100).toFixed(0);

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* ═══════════════════════════════════════════════
          §1  PULSE DECK — Stats Header
      ═══════════════════════════════════════════════ */}
      <motion.div
        className="relative bg-gray-900/60 backdrop-blur-2xl rounded-2xl border border-white/[0.06] overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* decorative top gradient */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

        <div className="p-6 md:p-8">
          {/* Title */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <MessageSquare className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Müşteri Duygu Paneli</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 items-center">
            {/* ── Total Count — Neon Ring ── */}
            <div className="flex flex-col items-center">
              <div className="relative w-28 h-28 mb-3">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(6,182,212,0.08)" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="url(#neonGrad)" strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min(100, stats.totalFeedbacks * 2.64)} ${264}`}
                    className="drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]"
                  />
                  <defs>
                    <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-black text-white drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                    {stats.totalFeedbacks}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.15em]">Toplam Geri Bildirim</span>
            </div>

            {/* ── Average Score — Big Star ── */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <Star className="w-14 h-14 text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]" fill="currentColor" />
                  {/* partial fill overlay — clip based on score */}
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: `${(stats.globalAvg / 5) * 100}%` }}
                  >
                    <Star className="w-14 h-14 text-amber-300 drop-shadow-[0_0_16px_rgba(245,158,11,0.6)]" fill="currentColor" />
                  </div>
                </div>
                <span className="text-4xl font-black text-white drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                  {stats.globalAvg.toFixed(1)}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.15em]">Ortalama Puan</span>
            </div>

            {/* ── Sentiment Mini-Chart — Horizontal Bar ── */}
            <div className="flex flex-col items-center w-full">
              <div className="w-full max-w-xs mb-4">
                <div className="flex w-full h-3 rounded-full overflow-hidden bg-white/[0.04]">
                  <motion.div
                    className="bg-gradient-to-r from-emerald-400 to-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${posPct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    title={`Olumlu: ${posPct}%`}
                  />
                  <motion.div
                    className="bg-gradient-to-r from-amber-400 to-amber-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${neuPct}%` }}
                    transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                    title={`Nötr: ${neuPct}%`}
                  />
                  <motion.div
                    className="bg-gradient-to-r from-rose-400 to-rose-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${negPct}%` }}
                    transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    title={`Olumsuz: ${negPct}%`}
                  />
                </div>
                {/* legend */}
                <div className="flex justify-between mt-2.5 text-[10px] font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <ThumbsUp className="w-3 h-3" /> {posPct}% Olumlu
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    {neuPct}% Nötr
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <ThumbsDown className="w-3 h-3" /> {negPct}%
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.15em]">Duygu Dağılımı</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════
          §2  FILTER BAR — Compact Glass
      ═══════════════════════════════════════════════ */}
      <motion.div
        className="flex flex-wrap items-center gap-3 bg-gray-900/40 backdrop-blur-xl rounded-xl p-3 border border-white/[0.04]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-cyan-400 w-4 h-4 transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="İsim, başlık veya mesaj ara…"
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all"
          />
        </div>
        {/* Status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/30 transition-all"
        >
          <option value="">Tüm Durumlar</option>
          <option value="Yeni">Yeni</option>
          <option value="İnceleniyor">İnceleniyor</option>
          <option value="Çözüldü">Çözüldü</option>
          <option value="Kapatıldı">Kapatıldı</option>
        </select>
        {/* Result count */}
        <span className="text-[11px] text-gray-500 font-semibold tabular-nums">{filteredFeedbacks.length} sonuç</span>
        {/* Clear */}
        {(searchTerm || filterStatus) && (
          <button
            onClick={() => { setSearchTerm(""); setFilterStatus(""); }}
            className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {/* Refresh */}
        <button
          onClick={fetchFeedbacks}
          className="p-2 rounded-lg text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </motion.div>

      {/* ═══════════════════════════════════════════════
          §3  MASONRY GRID — Sentiment Wall
      ═══════════════════════════════════════════════ */}
      {filteredFeedbacks.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center py-20 bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-white/[0.04]"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
            <MessageSquare className="w-7 h-7 text-gray-600" />
          </div>
          <h4 className="text-base font-semibold text-gray-300 mb-1">Geri Bildirim Bulunamadı</h4>
          <p className="text-sm text-gray-600">Filtrelere uygun sonuç yok</p>
        </motion.div>
      ) : (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-5 space-y-5">
          <AnimatePresence>
            {filteredFeedbacks.map((feedback, index) => {
              const avgRating = getAvgRating(feedback);
              const style = getSentimentStyle(avgRating);
              const isExpanded = expandedCards[feedback._id];
              const hasLongMessage = feedback.message && feedback.message.length > 120;

              return (
                <motion.div
                  key={feedback._id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  className={`break-inside-avoid bg-gray-900/60 backdrop-blur-xl rounded-2xl border ${style.border} ${style.shadow} ${style.hoverShadow} transition-all duration-300 overflow-hidden group relative`}
                >
                  {/* ── Hover trash icon ── */}
                  <button
                    onClick={() => handleDelete(feedback._id)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-950/60 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 z-10 border border-white/[0.04]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="p-5">
                    {/* ── Avatar + Name ── */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center ring-2 ${style.ring} ring-offset-2 ring-offset-gray-900 flex-shrink-0`}>
                        <span className={`text-sm font-bold ${style.text}`}>
                          {feedback.user?.name?.charAt(0).toUpperCase() || "K"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-white truncate">{feedback.user?.name || "Kullanıcı"}</h4>
                        <p className="text-[11px] text-gray-600 truncate">{feedback.user?.email}</p>
                      </div>
                      {/* Star rating pill */}
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06]`}>
                        <Star className={`w-3.5 h-3.5 ${style.text}`} fill="currentColor" />
                        <span className={`text-xs font-bold ${style.text}`}>{avgRating.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* ── Title ── */}
                    {feedback.title && feedback.title !== "Genel Değerlendirme" && (
                      <h5 className="text-sm font-semibold text-white mb-2">{feedback.title}</h5>
                    )}

                    {/* ── Message ── */}
                    {feedback.message && feedback.message !== "Puan bazlı değerlendirme" && (
                      <div className="mb-3">
                        <p className={`text-sm text-gray-400 leading-relaxed whitespace-pre-wrap ${!isExpanded && hasLongMessage ? "line-clamp-3" : ""}`}>
                          {feedback.message}
                        </p>
                        {hasLongMessage && (
                          <button
                            onClick={() => toggleExpand(feedback._id)}
                            className={`mt-1.5 text-xs font-semibold ${style.text} hover:underline flex items-center gap-1`}
                          >
                            {isExpanded ? (
                              <><ChevronUp className="w-3 h-3" /> Daha Az</>
                            ) : (
                              <><ChevronDown className="w-3 h-3" /> Devamını Oku</>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* ── Rating bars (compact) ── */}
                    <div className="space-y-1.5 mb-4">
                      {Object.entries(feedback.ratings).map(([key, rating]) => {
                        if (rating === 0) return null;
                        const label = key === "usability" ? "Kullanılabilirlik" : key === "expectations" ? "Beklenti" : key === "repeat" ? "Tekrar Tercih" : "Genel";
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-600 w-20 truncate">{label}</span>
                            <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${style.bg}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${(rating / 5) * 100}%` }}
                                transition={{ duration: 0.6, delay: 0.2 }}
                                style={{ opacity: 0.7 }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500 font-semibold w-4 text-right">{rating}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Footer: category, status, date ── */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Category chip */}
                      <span className="px-2 py-0.5 text-[10px] font-semibold text-gray-400 bg-white/[0.03] border border-white/[0.06] rounded-md">
                        {feedback.category}
                      </span>
                      {/* Status */}
                      <select
                        value={feedback.status}
                        onChange={(e) => handleStatusUpdate(feedback._id, e.target.value)}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md border cursor-pointer focus:outline-none transition-all ${statusColors[feedback.status] || statusColors["Kapatıldı"]} bg-transparent`}
                      >
                        <option value="Yeni">Yeni</option>
                        <option value="İnceleniyor">İnceleniyor</option>
                        <option value="Çözüldü">Çözüldü</option>
                        <option value="Kapatıldı">Kapatıldı</option>
                      </select>
                      {/* Spacer */}
                      <div className="flex-1" />
                      {/* Date */}
                      <span className="flex items-center gap-1 text-[10px] text-gray-600">
                        <Calendar className="w-3 h-3" />
                        {new Date(feedback.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

export default FeedbackList;