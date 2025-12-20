import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, Gift, TrendingUp, Award, Share2, Copy, RefreshCw, 
  User, Calendar, Check, Clock, AlertTriangle, Link2
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";

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

// Referral User Card - Zincir sistemine uygun
const ReferralChainCard = ({ referral }) => {
  const isCodeActive = referral.isActive && referral.successfulReferrals < (referral.maxReferrals || 1);
  
  const getStatusBadge = () => {
    if (!referral.isActive) {
      return { text: "Kod Kullanıldı", color: "bg-gray-500/20 text-gray-400" };
    }
    if (referral.successfulReferrals >= (referral.maxReferrals || 1)) {
      return { text: "Limit Doldu", color: "bg-yellow-500/20 text-yellow-400" };
    }
    return { text: "Aktif", color: "bg-emerald-500/20 text-emerald-400" };
  };

  const getInvitedStatus = (status) => {
    switch (status) {
      case "rewarded": return { text: "✅ Ödül Verildi", color: "text-emerald-400" };
      case "completed": return { text: "📦 Sipariş Verdi", color: "text-blue-400" };
      default: return { text: "⏳ Bekliyor", color: "text-yellow-400" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800/50 rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
            {referral.referrer?.name?.charAt(0) || "?"}
          </div>
          <div>
            <p className="text-white font-semibold">{referral.referrer?.name || "Bilinmeyen"}</p>
            <p className="text-gray-500 text-xs">{referral.referrer?.email}</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
          {statusBadge.text}
        </span>
      </div>

      {/* Referral Code */}
      <div className="flex items-center gap-3 bg-gray-700/50 rounded-xl p-3 mb-4">
        <Link2 className="w-5 h-5 text-purple-400" />
        <code className="text-purple-300 font-mono flex-1">{referral.referralCode}</code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(referral.referralCode);
            toast.success("Kod kopyalandı!");
          }}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-gray-700/30 rounded-lg">
          <p className="text-lg font-bold text-white">{referral.totalReferrals || 0}</p>
          <p className="text-gray-500 text-xs">Davet</p>
        </div>
        <div className="text-center p-2 bg-gray-700/30 rounded-lg">
          <p className="text-lg font-bold text-emerald-400">{referral.successfulReferrals || 0}</p>
          <p className="text-gray-500 text-xs">Başarılı</p>
        </div>
        <div className="text-center p-2 bg-gray-700/30 rounded-lg">
          <p className="text-lg font-bold text-purple-400">{referral.maxReferrals || 1}</p>
          <p className="text-gray-500 text-xs">Limit</p>
        </div>
      </div>

      {/* Invited Users */}
      {referral.referredUsers?.length > 0 && (
        <div className="border-t border-white/5 pt-4">
          <p className="text-gray-400 text-xs mb-3">Davet Edilen:</p>
          <div className="space-y-2">
            {referral.referredUsers.map((ref, idx) => {
              const invitedStatus = getInvitedStatus(ref.status);
              return (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-xs text-white">
                      {ref.user?.name?.charAt(0) || "?"}
                    </div>
                    <span className="text-gray-300">{ref.user?.name || "Kullanıcı"}</span>
                  </div>
                  <span className={`text-xs ${invitedStatus.color}`}>
                    {invitedStatus.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Main Component
const ReferralsTab = () => {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, active, used

  useEffect(() => {
    fetchReferralStats();
  }, []);

  const fetchReferralStats = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/referrals/stats");
      setStats(response.data.stats);
      setReferrals(response.data.referrals || []);
    } catch (error) {
      console.error("Referral istatistikleri yüklenirken hata:", error);
      toast.error("Referral verileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const getFilteredReferrals = () => {
    switch (filter) {
      case "active":
        return referrals.filter(r => r.isActive && r.successfulReferrals < (r.maxReferrals || 1));
      case "used":
        return referrals.filter(r => !r.isActive || r.successfulReferrals >= (r.maxReferrals || 1));
      default:
        return referrals;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const filteredReferrals = getFilteredReferrals();
  const activeCount = referrals.filter(r => r.isActive && r.successfulReferrals < (r.maxReferrals || 1)).length;
  const usedCount = referrals.filter(r => !r.isActive || r.successfulReferrals >= (r.maxReferrals || 1)).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Gift className="w-7 h-7 text-emerald-400" />
            Referral Sistemi
          </h2>
          <p className="text-gray-400 text-sm mt-1">Zincir büyüme modeli - Her kullanıcı 1 kişi davet edebilir</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={fetchReferralStats}
          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-5 h-5" />
          Yenile
        </motion.button>
      </div>

      {/* Chain System Explanation */}
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-6 border border-purple-500/20">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Share2 className="w-5 h-5 text-purple-400" />
          Zincir Büyüme Sistemi
        </h3>
        
        {/* Warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <p className="text-amber-400 font-semibold text-sm">Tek Seferlik Davet Hakkı</p>
              <p className="text-gray-400 text-xs mt-1">
                Her kullanıcı <span className="text-white">sadece 1 kişiyi</span> başarılı şekilde davet edebilir.
                Başarılı davet sonrası kod devre dışı olur. Davet edilen kişi kendi kodunu kullanabilir.
              </p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          {[
            { step: 1, title: "Kod Paylaş", desc: "Kullanıcı kendi kodunu paylaşır" },
            { step: 2, title: "Kayıt Ol", desc: "Arkadaşı %5 hoş geldin kuponu kazanır" },
            { step: 3, title: "İlk Sipariş", desc: "Arkadaşı ilk siparişini verir" },
            { step: 4, title: "Zincir", desc: "Davet eden %5 kupon alır, kodu kapanır" }
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {item.step}
              </div>
              <div>
                <p className="text-white font-medium">{item.title}</p>
                <p className="text-gray-400 text-xs">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          icon={Users} 
          title="Toplam Kullanıcı" 
          value={referrals.length} 
          color="from-blue-500/10 to-indigo-500/10" 
        />
        <StatCard 
          icon={Check} 
          title="Başarılı Zincir" 
          value={stats?.totalSuccessful || 0} 
          color="from-emerald-500/10 to-teal-500/10"
          subtext="Tamamlanan davetler"
        />
        <StatCard 
          icon={TrendingUp} 
          title="Dönüşüm Oranı" 
          value={`%${stats?.totalReferrals ? Math.round((stats.totalSuccessful / stats.totalReferrals) * 100) : 0}`} 
          color="from-purple-500/10 to-pink-500/10" 
        />
        <StatCard 
          icon={Gift} 
          title="Verilen Kupon" 
          value={(stats?.totalSuccessful || 0) * 2} 
          color="from-yellow-500/10 to-orange-500/10"
          subtext="Hoş geldin + Teşekkür"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === "all" 
              ? "bg-white/10 text-white" 
              : "text-gray-400 hover:text-white"
          }`}
        >
          Tümü ({referrals.length})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === "active" 
              ? "bg-emerald-500/20 text-emerald-400" 
              : "text-gray-400 hover:text-white"
          }`}
        >
          Aktif ({activeCount})
        </button>
        <button
          onClick={() => setFilter("used")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === "used" 
              ? "bg-gray-500/20 text-gray-300" 
              : "text-gray-400 hover:text-white"
          }`}
        >
          Kullanılmış ({usedCount})
        </button>
      </div>

      {/* Referral Cards Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReferrals.map((referral) => (
          <ReferralChainCard key={referral._id} referral={referral} />
        ))}
      </div>

      {filteredReferrals.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Gift className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Bu filtrede sonuç yok</p>
          <p className="text-sm mt-2">Farklı bir filtre deneyin</p>
        </div>
      )}
    </motion.div>
  );
};

export default ReferralsTab;
