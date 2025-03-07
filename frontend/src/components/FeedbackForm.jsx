import { useState } from "react";
import { motion } from "framer-motion";
import { Star, Send, AlertCircle } from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const QUESTIONS = [
  {
    id: "usability",
    text: "Sitemizi kullanıcı dostu buldunuz mu?",
    description: "Sitemizde gezinmek ve işlem yapmak kolay mıydı?"
  },
  {
    id: "expectations",
    text: "Beklentilerinizi karşıladık mı?",
    description: "Ürünler, fiyatlar ve hizmet kalitemiz nasıldı?"
  },
  {
    id: "repeat",
    text: "Tekrar sipariş verir misiniz?",
    description: "Deneyiminizden memnun kaldınız mı?"
  },
  {
    id: "overall",
    text: "Genel olarak sitemizi nasıl buldunuz?",
    description: "Genel deneyiminizi değerlendirir misiniz?"
  }
];

const FeedbackForm = ({ onComplete }) => {
  const [ratings, setRatings] = useState({
    usability: 0,
    expectations: 0,
    repeat: 0,
    overall: 0
  });
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("Genel");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // En az bir soruya cevap verilmiş mi kontrol et
    const hasAnyRating = Object.values(ratings).some(rating => rating > 0);
    if (!hasAnyRating) {
      toast.error("Lütfen en az bir soruyu değerlendirin");
      return;
    }

    setIsSubmitting(true);
    try {
      // Ortalama puanı hesapla
      const ratedQuestions = Object.values(ratings).filter(r => r > 0);
      const averageRating = ratedQuestions.reduce((a, b) => a + b, 0) / ratedQuestions.length;

      await axios.post("/feedback", {
        rating: averageRating,
        title: title || "Genel Değerlendirme",
        message: message || "Puan bazlı değerlendirme",
        category,
        ratings // Detaylı puanları da gönder
      });
      
      toast.success("Geri bildiriminiz için teşekkürler!");
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
            Geri Bildirim
          </h3>
          <p className="text-gray-400 text-sm">
            Deneyiminizi değerlendirin
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sorular */}
        <div className="space-y-6">
          {QUESTIONS.map((question) => (
            <div key={question.id} className="space-y-2">
              <div>
                <label className="text-sm text-gray-300 font-medium">{question.text}</label>
                <p className="text-xs text-gray-400">{question.description}</p>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatings(prev => ({ ...prev, [question.id]: star }))}
                    className={`p-2 rounded-lg transition-all ${
                      ratings[question.id] >= star
                        ? "text-yellow-400 bg-yellow-500/10"
                        : "text-gray-600 hover:text-gray-400"
                    }`}
                  >
                    <Star className="w-6 h-6" fill={ratings[question.id] >= star ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Kategori Seçimi */}
        <div className="space-y-2">
          <label className="text-sm text-gray-400">Kategori</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-gray-700/50 border border-gray-600/50 rounded-xl px-4 py-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="Genel">Genel</option>
            <option value="Öneri">Öneri</option>
            <option value="Şikayet">Şikayet</option>
            <option value="Hata Bildirimi">Hata Bildirimi</option>
          </select>
        </div>

        {/* Opsiyonel Alanlar */}
        <div className="space-y-4 border-t border-gray-700/50 pt-4">
          <p className="text-sm text-gray-400">İsterseniz daha detaylı geri bildirim bırakabilirsiniz</p>
          
          {/* Başlık */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Başlık (Opsiyonel)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Geri bildiriminiz için kısa bir başlık"
              className="w-full bg-gray-700/50 border border-gray-600/50 rounded-xl px-4 py-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          {/* Mesaj */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Mesajınız (Opsiyonel)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Düşüncelerinizi bizimle paylaşın..."
              rows={4}
              className="w-full bg-gray-700/50 border border-gray-600/50 rounded-xl px-4 py-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium py-3 px-4 rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
          {isSubmitting ? "Gönderiliyor..." : "Gönder ve Sipariş Oluştur"}
        </button>
      </form>
    </motion.div>
  );
};

export default FeedbackForm; 