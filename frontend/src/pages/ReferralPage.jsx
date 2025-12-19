import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Gift, Share2, Copy, Users, Check, Clock, RefreshCw,
  Award, Link2, Smartphone, QrCode, ChevronRight
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useUserStore } from "../stores/useUserStore";

const ReferralPage = () => {
  const { user } = useUserStore();
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user) {
      fetchReferralInfo();
    }
  }, [user]);

  const fetchReferralInfo = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/referrals/my-referrals");
      setReferralData(response.data.referral);
    } catch (error) {
      console.error("Referral bilgileri alınamadı:", error);
      // İlk kez ise oluşturulacak
      if (error.response?.status === 404) {
        try {
          const createResponse = await axios.get("/referrals/my-referrals");
          setReferralData(createResponse.data.referral);
        } catch (createError) {
          toast.error("Referral bilgileri yüklenemedi");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (referralData?.code) {
      navigator.clipboard.writeText(referralData.code);
      setCopied(true);
      toast.success("Referral kodu kopyalandı!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (referralData?.link) {
      navigator.clipboard.writeText(referralData.link);
      toast.success("Referral linki kopyalandı!");
    }
  };

  const handleShare = async () => {
    if (navigator.share && referralData) {
      try {
        await navigator.share({
          title: "Benim Marketim'e Davet",
          text: `Benim Marketim'e katıl ve ilk siparişinde %15 indirim kazan! Referral kodum: ${referralData.code}`,
          url: referralData.link
        });
      } catch (error) {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const handleRegenerate = async () => {
    try {
      const response = await axios.post("/referrals/regenerate");
      setReferralData(prev => ({
        ...prev,
        code: response.data.code,
        link: response.data.link
      }));
      toast.success("Yeni referral kodu oluşturuldu!");
    } catch (error) {
      toast.error("Kod yenilenirken hata oluştu");
    }
  };

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
      case "completed": return "Sipariş Verdi";
      default: return "Beklemede";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 pt-24 pb-16 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 pt-24 pb-16 flex items-center justify-center">
        <div className="text-center">
          <Gift className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Giriş Yapın</h2>
          <p className="text-gray-400">Referral sistemi için giriş yapmanız gerekiyor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl">
              <Gift className="w-8 h-8 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-rose-500 bg-clip-text text-transparent">
                Arkadaşını Getir
              </h1>
              <p className="text-gray-400 text-lg">İndirim Kazan</p>
            </div>
          </div>
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-3xl p-6 border border-purple-500/20 mb-8"
        >
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-purple-400" />
            Nasıl Çalışır?
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Share2, title: "Kodunu Paylaş", desc: "Arkadaşlarınla referral kodunu paylaş" },
              { icon: Users, title: "Kayıt Olsun", desc: "Arkadaşın %15 indirim ile başlasın" },
              { icon: Gift, title: "Ödül Kazan", desc: "İlk siparişinde sen %10 indirim kazan" }
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold">{item.title}</p>
                  <p className="text-gray-400 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Referral Code Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl p-8 border border-white/10 mb-8"
        >
          <div className="text-center mb-6">
            <p className="text-gray-400 mb-2">Senin Referral Kodun</p>
            <div className="inline-flex items-center gap-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-8 py-4 rounded-2xl border border-purple-500/30">
              <span className="text-4xl font-bold font-mono text-white tracking-wider">
                {referralData?.code || "Yükleniyor..."}
              </span>
              <button
                onClick={handleCopyCode}
                className={`p-3 rounded-xl transition-all ${
                  copied 
                    ? "bg-emerald-500 text-white" 
                    : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/20"
                }`}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="flex flex-wrap justify-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold flex items-center gap-2 shadow-lg"
            >
              <Share2 className="w-5 h-5" />
              Paylaş
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopyLink}
              className="px-6 py-3 bg-white/10 text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-white/20 transition-colors"
            >
              <Link2 className="w-5 h-5" />
              Link Kopyala
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRegenerate}
              className="px-6 py-3 bg-white/5 text-gray-400 rounded-xl font-semibold flex items-center gap-2 hover:bg-white/10 hover:text-white transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Yeni Kod
            </motion.button>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-3 gap-4 mb-8"
        >
          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-2xl p-5 border border-blue-500/20 text-center">
            <p className="text-3xl font-bold text-white">{referralData?.totalReferrals || 0}</p>
            <p className="text-gray-400 text-sm">Toplam Davet</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl p-5 border border-emerald-500/20 text-center">
            <p className="text-3xl font-bold text-emerald-400">{referralData?.successfulReferrals || 0}</p>
            <p className="text-gray-400 text-sm">Başarılı</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl p-5 border border-purple-500/20 text-center">
            <p className="text-3xl font-bold text-purple-400">{referralData?.totalRewardsEarned || 0}</p>
            <p className="text-gray-400 text-sm">Kazanılan Ödül</p>
          </div>
        </motion.div>

        {/* Referred Users */}
        {referralData?.referredUsers?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl p-6 border border-white/10"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              Davet Ettiklerin
            </h3>
            <div className="space-y-3">
              {referralData.referredUsers.map((ref, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold">
                      {ref.name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <p className="text-white font-medium">{ref.name || "Kullanıcı"}</p>
                      <p className="text-gray-500 text-xs">
                        {new Date(ref.signedUpAt).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(ref.status)}`}>
                    {getStatusText(ref.status)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Mobile App Promo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-3xl p-6 border border-emerald-500/20"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
              <Smartphone className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold">Mobil Uygulamada Daha Kolay!</h3>
              <p className="text-gray-400 text-sm">Arkadaşlarınla paylaşmak için mobil uygulamamızı indir.</p>
            </div>
            <ChevronRight className="w-6 h-6 text-gray-400" />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ReferralPage;
