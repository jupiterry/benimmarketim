import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, Gift, TrendingUp, Award, Share2, Copy, RefreshCw, 
  User, Calendar, Check, Clock, ExternalLink
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

// Top Referrer Card
const TopReferrerCard = ({ referrer, rank }) => {
  const getRankStyle = () => {
    switch (rank) {
      case 1: return "from-yellow-500/20 to-amber-500/20 border-yellow-500/30";
      case 2: return "from-gray-400/20 to-slate-400/20 border-gray-400/30";
      case 3: return "from-orange-600/20 to-amber-700/20 border-orange-600/30";
      default: return "from-gray-800/50 to-gray-900/50 border-white/10";
    }
  };

  const getRankBadge = () => {
    switch (rank) {
      case 1: return "🥇";
      case 2: return "🥈";
      case 3: return "🥉";
      default: return `#${rank}`;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={`bg-gradient-to-br ${getRankStyle()} rounded-2xl p-4 border`}
    >
      <div className="flex items-center gap-4">
        <div className="text-2xl">{getRankBadge()}</div>
        <div className="flex-1">
          <p className="text-white font-semibold">{referrer.user?.name || "Bilinmeyen"}</p>
          <p className="text-gray-400 text-sm">{referrer.user?.email}</p>
        </div>
        <div className="text-right">
          <p className="text-emerald-400 font-bold text-lg">{referrer.successfulReferrals}</p>
          <p className="text-gray-500 text-xs">Başarılı</p>
        </div>
        <div className="text-right">
          <p className="text-white font-bold">{referrer.totalReferrals}</p>
          <p className="text-gray-500 text-xs">Toplam</p>
        </div>
      </div>
    </motion.div>
  );
};

// Referral Detail Card
const ReferralDetailCard = ({ referral }) => {
  const getStatusStyle = (status) => {
    switch (status) {
      case "rewarded": return "bg-emerald-500/20 text-emerald-400";
      case "completed": return "bg-blue-500/20 text-blue-400";
      default: return "bg-yellow-500/20 text-yellow-400";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "rewarded": return "Ödüllendirildi";
      case "completed": return "Tamamlandı";
      default: return "Beklemede";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-gray-800/50 rounded-xl p-4 border border-white/5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold">
            {referral.user?.name?.charAt(0) || "?"}
          </div>
          <div>
            <p className="text-white font-medium">{referral.user?.name || "Bilinmeyen"}</p>
            <p className="text-gray-500 text-xs">{referral.user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-gray-400 text-xs">Kayıt Tarihi</p>
            <p className="text-white text-sm">
              {new Date(referral.signedUpAt).toLocaleDateString('tr-TR')}
            </p>
          </div>
          {referral.firstOrderAt && (
            <div className="text-right">
              <p className="text-gray-400 text-xs">İlk Sipariş</p>
              <p className="text-emerald-400 text-sm">
                {new Date(referral.firstOrderAt).toLocaleDateString('tr-TR')}
              </p>
            </div>
          )}
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(referral.status)}`}>
            {getStatusText(referral.status)}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

// Main Component
const ReferralsTab = () => {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReferrer, setSelectedReferrer] = useState(null);

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
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Gift className="w-7 h-7 text-emerald-400" />
            Referral Sistemi
          </h2>
          <p className="text-gray-400 text-sm mt-1">Arkadaşını getir, indirim kazan programı</p>
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

      {/* How it works */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl p-6 border border-emerald-500/20">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Share2 className="w-5 h-5 text-emerald-400" />
          Nasıl Çalışır?
        </h3>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { step: 1, title: "Kod Paylaş", desc: "Kullanıcı kendi referral kodunu paylaşır" },
            { step: 2, title: "Kayıt Ol", desc: "Arkadaşı kodla kayıt olur, %15 indirim kuponu kazanır" },
            { step: 3, title: "İlk Sipariş", desc: "Arkadaşı ilk siparişini verir" },
            { step: 4, title: "Ödül Kazan", desc: "Davet eden %10 indirim kuponu kazanır" }
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
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
          title="Toplam Referral" 
          value={stats?.totalReferrals || 0} 
          color="from-blue-500/10 to-indigo-500/10" 
        />
        <StatCard 
          icon={Check} 
          title="Başarılı Referral" 
          value={stats?.totalSuccessful || 0} 
          color="from-emerald-500/10 to-teal-500/10"
          subtext="İlk sipariş verdiler"
        />
        <StatCard 
          icon={TrendingUp} 
          title="Dönüşüm Oranı" 
          value={`%${stats?.totalReferrals ? Math.round((stats.totalSuccessful / stats.totalReferrals) * 100) : 0}`} 
          color="from-purple-500/10 to-pink-500/10" 
        />
        <StatCard 
          icon={Award} 
          title="Aktif Referrer" 
          value={referrals.filter(r => r.totalReferrals > 0).length} 
          color="from-yellow-500/10 to-orange-500/10" 
        />
      </div>

      {/* Top Referrers */}
      <div className="bg-gray-800/30 rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-400" />
          En İyi Referrer'lar
        </h3>
        
        {stats?.topReferrers?.length > 0 ? (
          <div className="space-y-3">
            {stats.topReferrers.map((referrer, index) => (
              <div key={referrer.code} onClick={() => setSelectedReferrer(
                selectedReferrer?.code === referrer.code ? null : 
                referrals.find(r => r.referralCode === referrer.code)
              )}>
                <TopReferrerCard referrer={referrer} rank={index + 1} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Henüz referral verisi yok</p>
          </div>
        )}
      </div>

      {/* Selected Referrer Details */}
      {selectedReferrer && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/30 rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">
              {selectedReferrer.referrer?.name}'in Referral'ları
            </h3>
            <button
              onClick={() => setSelectedReferrer(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-3">
            {selectedReferrer.referredUsers?.length > 0 ? (
              selectedReferrer.referredUsers.map((ref, idx) => (
                <ReferralDetailCard key={idx} referral={ref} />
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">Henüz referral yok</p>
            )}
          </div>
        </motion.div>
      )}

      {/* All Referrers Table */}
      <div className="bg-gray-800/30 rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-bold text-white mb-4">Tüm Referrer'lar</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm">
                <th className="pb-3">Kullanıcı</th>
                <th className="pb-3">Referral Kodu</th>
                <th className="pb-3">Toplam</th>
                <th className="pb-3">Başarılı</th>
                <th className="pb-3">Ödüller</th>
                <th className="pb-3">Detay</th>
              </tr>
            </thead>
            <tbody className="text-white">
              {referrals.map((referral) => (
                <tr key={referral._id} className="border-t border-white/5">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                        {referral.referrer?.name?.charAt(0) || "?"}
                      </div>
                      <div>
                        <p className="text-sm">{referral.referrer?.name}</p>
                        <p className="text-gray-500 text-xs">{referral.referrer?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <code className="bg-gray-700 px-2 py-1 rounded text-emerald-400 text-sm">
                        {referral.referralCode}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(referral.referralCode);
                          toast.success("Kod kopyalandı!");
                        }}
                        className="text-gray-400 hover:text-white"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="py-3 text-center">{referral.totalReferrals}</td>
                  <td className="py-3 text-center text-emerald-400">{referral.successfulReferrals}</td>
                  <td className="py-3 text-center">{referral.totalRewardsEarned}</td>
                  <td className="py-3">
                    <button
                      onClick={() => setSelectedReferrer(referral)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Görüntüle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {referrals.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Henüz referral verisi yok</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ReferralsTab;
