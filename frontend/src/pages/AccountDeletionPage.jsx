import { useState } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { 
  AlertTriangle, 
  Trash2, 
  Shield, 
  FileText, 
  User, 
  ShoppingCart, 
  CreditCard,
  Mail,
  Phone,
  CheckCircle,
  X,
  Loader
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useUserStore } from "../stores/useUserStore";

const AccountDeletionPage = () => {
  const { user, logout } = useUserStore();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleDeleteAccount = async () => {
    if (!deletionReason.trim()) {
      toast.error("Lütfen hesap silme nedeninizi belirtin");
      return;
    }

    setIsDeleting(true);
    try {
      await axios.post('/user/delete-account', {
        reason: deletionReason
      });
      
      setShowSuccess(true);
      setTimeout(() => {
        logout();
        window.location.href = '/';
      }, 3000);
    } catch (error) {
      console.error("Hesap silme hatası:", error);
      toast.error(error.response?.data?.message || "Hesap silinirken hata oluştu");
    } finally {
      setIsDeleting(false);
    }
  };

  const deletionReasons = [
    "Artık uygulamayı kullanmıyorum",
    "Gizlilik endişeleri",
    "Uygulama performansı yetersiz",
    "Alternatif uygulama buldum",
    "Teknik sorunlar yaşıyorum",
    "Diğer"
  ];

  if (showSuccess) {
    return (
      <>
        <Helmet>
          <title>Hesap Silindi - Benim Marketim</title>
          <meta name="description" content="Hesabınız başarıyla silindi." />
        </Helmet>

        <div className="min-h-screen pt-24 pb-16 bg-gray-900 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto px-4"
          >
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8 text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Hesap Başarıyla Silindi</h1>
              <p className="text-gray-300 mb-6">
                Hesabınız ve tüm verileriniz başarıyla silindi. Anasayfaya yönlendiriliyorsunuz...
              </p>
              <div className="flex justify-center">
                <Loader className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Hesap Silme - Benim Marketim</title>
        <meta name="description" content="Hesabınızı ve tüm verilerinizi kalıcı olarak silin. Bu işlem geri alınamaz." />
      </Helmet>

      <div className="min-h-screen pt-24 pb-16 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8 md:mb-12"
          >
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-6">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-2xl">
                <Trash2 className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              <div className="text-center md:text-left">
                <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
                  Hesap Silme
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-8 md:w-12 h-1 bg-gradient-to-r from-red-500 to-red-600 rounded-full"></div>
                  <span className="text-gray-400 text-sm md:text-lg">
                    Kalıcı Silme
                  </span>
                  <div className="w-8 md:w-12 h-1 bg-gradient-to-r from-red-600 to-red-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-r from-red-600 to-red-500 rounded-full flex items-center justify-center shadow-2xl">
                <span className="text-xl md:text-2xl">⚠️</span>
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Hesabınızı ve tüm verilerinizi kalıcı olarak silmek istediğinizden emin misiniz?
            </motion.p>
          </motion.div>

          {/* Uyarı Kutusu */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-red-900/20 border border-red-500/30 rounded-2xl p-6 mb-8"
          >
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold text-red-400 mb-3">Önemli Uyarı</h3>
                <p className="text-red-200 mb-4">
                  Bu işlem <strong>geri alınamaz</strong>. Hesabınızı sildiğinizde aşağıdaki tüm veriler kalıcı olarak silinecektir:
                </p>
                <ul className="text-red-200 space-y-2">
                  <li className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>Kişisel bilgileriniz (ad, soyad, e-posta, telefon)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    <span>Sipariş geçmişiniz ve alışveriş verileriniz</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>Ödeme bilgileriniz ve adres bilgileriniz</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>Fotokopi dosyalarınız ve diğer yüklediğiniz belgeler</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <span>Hesap ayarlarınız ve tercihleriniz</span>
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>

          {/* Hesap Bilgileri */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-6 mb-8"
          >
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-400" />
              Silinecek Hesap Bilgileri
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-xl">
                <Mail className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm text-gray-400">E-posta</p>
                  <p className="text-white font-medium">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-xl">
                <User className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm text-gray-400">Ad Soyad</p>
                  <p className="text-white font-medium">{user?.firstName} {user?.lastName}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Silme Nedeni */}
          {!showConfirmation ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
            >
              <h3 className="text-2xl font-bold text-white mb-6">
                Hesap Silme Nedeni
              </h3>
              <p className="text-gray-300 mb-6">
                Lütfen hesabınızı silme nedeninizi belirtin. Bu bilgi, hizmetimizi geliştirmemize yardımcı olacaktır.
              </p>
              
              <div className="space-y-3 mb-6">
                {deletionReasons.map((reason, index) => (
                  <label key={index} className="flex items-center gap-3 p-4 bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-700/70 transition-colors">
                    <input
                      type="radio"
                      name="reason"
                      value={reason}
                      onChange={(e) => setDeletionReason(e.target.value)}
                      className="w-4 h-4 text-red-500"
                    />
                    <span className="text-white">{reason}</span>
                  </label>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => window.history.back()}
                  className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors duration-300 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  İptal
                </button>
                <button
                  onClick={() => setShowConfirmation(true)}
                  className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors duration-300 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Hesabı Sil
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">Son Onay</h3>
                <p className="text-gray-300 mb-6">
                  Hesabınızı silmek üzeresiniz. Bu işlem <strong>geri alınamaz</strong> ve tüm verileriniz kalıcı olarak silinecektir.
                </p>
              </div>

              <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-6">
                <p className="text-red-200 text-sm">
                  <strong>Seçilen neden:</strong> {deletionReason}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors duration-300"
                >
                  Geri Dön
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors duration-300 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Siliniyor...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Hesabı Kalıcı Olarak Sil
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* İletişim Bilgileri */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-8 bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-6"
          >
            <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Alternatif Seçenekler
            </h3>
            <p className="text-emerald-200 mb-4">
              Hesabınızı silmeden önce aşağıdaki seçenekleri değerlendirebilirsiniz:
            </p>
            <ul className="text-emerald-200 space-y-2">
              <li>• Hesap ayarlarınızdan e-posta bildirimlerini kapatabilirsiniz</li>
              <li>• Uygulamayı geçici olarak kaldırabilir, daha sonra tekrar yükleyebilirsiniz</li>
              <li>• Sorunlarınız için destek ekibimizle iletişime geçebilirsiniz</li>
            </ul>
            <div className="mt-4">
              <a 
                href="/contact" 
                className="text-emerald-400 hover:text-emerald-300 underline"
              >
                Destek ekibiyle iletişime geçin →
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default AccountDeletionPage;
