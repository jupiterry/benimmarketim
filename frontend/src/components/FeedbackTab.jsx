import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Star, CheckCircle, Clock } from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const FeedbackTab = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch {
      toast.error("Geri bildirim silinirken bir hata oluştu");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Toplam Geri Bildirim"
          value={stats?.totalFeedbacks || 0}
          icon={<MessageSquare className="w-6 h-6" />}
          color="emerald"
        />
        <StatCard
          title="Ortalama Puan"
          value={`${(stats?.averageRating || 0).toFixed(1)} / 5.0`}
          icon={<Star className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="Çözülen"
          value={stats?.statusStats?.find(s => s._id === "Çözüldü")?.count || 0}
          icon={<CheckCircle className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Bekleyen"
          value={stats?.statusStats?.find(s => s._id === "Beklemede")?.count || 0}
          icon={<Clock className="w-6 h-6" />}
          color="red"
        />
      </div>

      {/* Geri Bildirim Listesi */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700/50">
            <thead>
              <tr className="bg-gray-800/30">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Kullanıcı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Başlık
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Kategori
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Puan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Durum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {feedbacks.map((feedback) => (
                <tr key={feedback._id} className="hover:bg-gray-700/20">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-300">{feedback.user.name}</div>
                    <div className="text-sm text-gray-400">{feedback.user.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-300">{feedback.title}</div>
                    <div className="text-sm text-gray-400 line-clamp-2">{feedback.message}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-300">
                      {feedback.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-yellow-400">
                      <Star className="w-4 h-4 fill-current" />
                      <span className="ml-1">{feedback.rating}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={feedback.status}
                      onChange={(e) => updateStatus(feedback._id, e.target.value)}
                      className="bg-gray-700/50 text-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="Beklemede">Beklemede</option>
                      <option value="İncelendi">İncelendi</option>
                      <option value="Çözüldü">Çözüldü</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => deleteFeedback(feedback._id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-500",
    blue: "from-blue-500/20 to-blue-500/5 text-blue-500",
    red: "from-red-500/20 to-red-500/5 text-red-500"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br ${colors[color]} p-6 rounded-xl border border-gray-700/50`}
    >
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg bg-${color}-500/10`}>{icon}</div>
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-sm text-gray-400">{title}</div>
      </div>
    </motion.div>
  );
};

export default FeedbackTab; 