import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { 
  AlertTriangle, 
  Trash2, 
  Shield, 
  FileText, 
  User, 
  ShoppingCart, 
  Mail,
  Phone,
  CheckCircle,
  X,
  Loader,
  Info,
  Clock,
  Database,
  Settings,
  Eye,
  EyeOff,
  LogIn
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useUserStore } from "../stores/useUserStore";
import { Link } from "react-router-dom";

const AccountDeletionPage = () => {
  const { user, logout } = useUserStore();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deletionType, setDeletionType] = useState("full"); // "full" veya "partial"
  const [selectedDataTypes, setSelectedDataTypes] = useState([]);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Üye olmayan kullanıcılar için giriş modal'ını göster
  useEffect(() => {
    if (!user) {
      setShowLoginModal(true);
    }
  }, [user]);

  const handleDeleteAccount = async () => {
    if (!user) {
      toast.error("Hesap silme işlemi için giriş yapmanız gerekiyor");
      setShowLoginModal(true);
      return;
    }

    if (!deletionReason.trim()) {
      toast.error("Lütfen hesap silme nedeninizi belirtin");
      return;
    }

    if (deletionType === "partial" && selectedDataTypes.length === 0) {
      toast.error("Lütfen silmek istediğiniz veri türlerini seçin");
      return;
    }

    setIsDeleting(true);
    try {
      await axios.post('/user/delete-account', {
        reason: deletionReason,
        deletionType: deletionType,
        selectedDataTypes: deletionType === "partial" ? selectedDataTypes : null
      });
      
      setShowSuccess(true);
      setTimeout(() => {
        if (deletionType === "full") {
          logout();
          window.location.href = '/';
        } else {
          // Kısmi silme durumunda sadece anasayfaya yönlendir
          window.location.href = '/';
        }
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

  const dataTypes = [
    { id: "personal", name: "Kişisel Bilgiler", description: "Ad, soyad, e-posta, telefon numarası" },
    { id: "orders", name: "Sipariş Geçmişi", description: "Tüm siparişler ve alışveriş verileri" },
    { id: "addresses", name: "Adres Bilgileri", description: "Teslimat adresleri" },
    { id: "files", name: "Yüklenen Dosyalar", description: "Fotokopi dosyaları ve belgeler" },
    { id: "preferences", name: "Tercihler", description: "Hesap ayarları ve kullanıcı tercihleri" },
    { id: "feedback", name: "Geri Bildirimler", description: "Gönderilen geri bildirimler" }
  ];

  const handleDataTypeToggle = (dataTypeId) => {
    setSelectedDataTypes(prev => 
      prev.includes(dataTypeId) 
        ? prev.filter(id => id !== dataTypeId)
        : [...prev, dataTypeId]
    );
  };

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
              <h1 className="text-2xl font-bold text-white mb-4">
                {deletionType === "full" ? "Hesap Başarıyla Silindi" : "Veriler Başarıyla Silindi"}
              </h1>
              <p className="text-gray-300 mb-6">
                {deletionType === "full" 
                  ? "Hesabınız ve tüm verileriniz başarıyla silindi. Anasayfaya yönlendiriliyorsunuz..."
                  : "Seçilen verileriniz başarıyla silindi. Anasayfaya yönlendiriliyorsunuz..."
                }
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
        <title>Hesap ve Veri Silme - Benim Marketim</title>
        <meta name="description" content="Benim Marketim uygulamasında hesabınızı ve verilerinizi silin. Google Play Store veri silme politikası uyumlu." />
        <meta name="robots" content="index, follow" />
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
                  Hesap ve Veri Silme
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-8 md:w-12 h-1 bg-gradient-to-r from-red-500 to-red-600 rounded-full"></div>
                  <span className="text-gray-400 text-sm md:text-lg">
                    Benim Marketim
                  </span>
                  <div className="w-8 md:w-12 h-1 bg-gradient-to-r from-red-600 to-red-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-r from-red-600 to-red-500 rounded-full flex items-center justify-center shadow-2xl">
                <span className="text-xl md:text-2xl">⚠️</span>
              </div>
            </div>
            
            <motion.div 
              className="text-gray-300 text-lg max-w-3xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <p className="mb-4">
                <strong className="text-white">Benim Marketim</strong> uygulamasında hesabınızı ve verilerinizi silmek için aşağıdaki adımları takip edin.
              </p>
              <p className="text-sm text-gray-400">
                Bu sayfa Google Play Store veri silme politikası gereksinimlerini karşılamak için hazırlanmıştır.
              </p>
            </motion.div>
          </motion.div>

          {/* Kullanıcı Adımları */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-6 mb-8"
          >
            <div className="flex items-start gap-4">
              <Info className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold text-blue-400 mb-3">Hesap Silme Adımları</h3>
                <p className="text-blue-200 mb-4">
                  <strong>Benim Marketim</strong> uygulamasında hesabınızı silmek için aşağıdaki adımları takip edin:
                </p>
                <ol className="text-blue-200 space-y-2 list-decimal list-inside">
                  <li>Bu sayfada hesap silme nedeninizi seçin</li>
                  <li>Tam hesap silme veya kısmi veri silme seçeneğini belirleyin</li>
                  <li>Kısmi silme seçtiyseniz, silmek istediğiniz veri türlerini işaretleyin</li>
                  <li>Son onay ekranında işlemi onaylayın</li>
                  <li>Hesabınız ve seçtiğiniz veriler kalıcı olarak silinecektir</li>
                </ol>
              </div>
            </div>
          </motion.div>

          {/* Veri Türleri ve Saklama Süreleri */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-6 mb-8"
          >
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              Veri Türleri ve Saklama Süreleri
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dataTypes.map((dataType) => (
                <div key={dataType.id} className="p-4 bg-gray-700/50 rounded-xl border border-gray-600/50">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-white">{dataType.name}</h4>
                    <Clock className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-300 mb-2">{dataType.description}</p>
                  <p className="text-xs text-gray-400">
                    <strong>Saklama Süresi:</strong> Hesap silinene kadar
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
              <p className="text-yellow-200 text-sm">
                <strong>Not:</strong> Yasal yükümlülükler gereği, bazı veriler (örneğin fatura bilgileri) 
                muhasebe kayıtları için belirli süreler boyunca saklanabilir. Bu veriler kişisel olarak 
                tanımlanamaz hale getirilir.
              </p>
            </div>
          </motion.div>

          {/* Uyarı Kutusu */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
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
                    <Shield className="w-4 h-4" />
                    <span>Adres bilgileriniz</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>Fotokopi dosyalarınız ve diğer yüklediğiniz belgeler</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    <span>Hesap ayarlarınız ve tercihleriniz</span>
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>

          {/* Hesap Bilgileri - Sadece giriş yapmış kullanıcılar için */}
          {user && (
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
          )}

          {/* Silme Türü Seçimi - Sadece giriş yapmış kullanıcılar için */}
          {user && !showConfirmation ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
            >
              <h3 className="text-2xl font-bold text-white mb-6">
                Silme Türü Seçimi
              </h3>
              <p className="text-gray-300 mb-6">
                Hesabınızı tamamen silmek veya sadece belirli verilerinizi silmek arasında seçim yapabilirsiniz.
              </p>
              
              {/* Silme Türü Seçenekleri */}
              <div className="space-y-4 mb-8">
                <label className="flex items-start gap-4 p-4 bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-700/70 transition-colors border-2 border-transparent hover:border-red-500/30">
                  <input
                    type="radio"
                    name="deletionType"
                    value="full"
                    checked={deletionType === "full"}
                    onChange={(e) => setDeletionType(e.target.value)}
                    className="w-4 h-4 text-red-500 mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Trash2 className="w-5 h-5 text-red-400" />
                      <span className="text-white font-semibold">Tam Hesap Silme</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Hesabınızı ve tüm verilerinizi kalıcı olarak siler. Bu işlem geri alınamaz.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-4 p-4 bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-700/70 transition-colors border-2 border-transparent hover:border-orange-500/30">
                  <input
                    type="radio"
                    name="deletionType"
                    value="partial"
                    checked={deletionType === "partial"}
                    onChange={(e) => setDeletionType(e.target.value)}
                    className="w-4 h-4 text-orange-500 mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="w-5 h-5 text-orange-400" />
                      <span className="text-white font-semibold">Kısmi Veri Silme</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Sadece seçtiğiniz veri türlerini siler. Hesabınız aktif kalır.
                    </p>
                  </div>
                </label>
              </div>

              {/* Kısmi Veri Silme Seçenekleri */}
              {deletionType === "partial" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-6"
                >
                  <h4 className="text-lg font-semibold text-white mb-4">
                    Silmek İstediğiniz Veri Türlerini Seçin
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dataTypes.map((dataType) => (
                      <label key={dataType.id} className="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors border border-gray-600/30">
                        <input
                          type="checkbox"
                          checked={selectedDataTypes.includes(dataType.id)}
                          onChange={() => handleDataTypeToggle(dataType.id)}
                          className="w-4 h-4 text-orange-500 mt-1"
                        />
                        <div className="flex-1">
                          <span className="text-white text-sm font-medium">{dataType.name}</span>
                          <p className="text-gray-400 text-xs">{dataType.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Silme Nedeni */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-white mb-4">
                  Silme Nedeni
                </h4>
                <p className="text-gray-300 mb-4 text-sm">
                  Lütfen silme nedeninizi belirtin. Bu bilgi, hizmetimizi geliştirmemize yardımcı olacaktır.
                </p>
                <div className="space-y-2">
                  {deletionReasons.map((reason, index) => (
                    <label key={index} className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
                      <input
                        type="radio"
                        name="reason"
                        value={reason}
                        onChange={(e) => setDeletionReason(e.target.value)}
                        className="w-4 h-4 text-red-500"
                      />
                      <span className="text-white text-sm">{reason}</span>
                    </label>
                  ))}
                </div>
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
                  {deletionType === "full" ? "Hesabı Sil" : "Verileri Sil"}
                </button>
              </div>
            </motion.div>
          ) : user && (
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
                <p className="text-red-200 text-sm mb-2">
                  <strong>Silme türü:</strong> {deletionType === "full" ? "Tam Hesap Silme" : "Kısmi Veri Silme"}
                </p>
                <p className="text-red-200 text-sm mb-2">
                  <strong>Seçilen neden:</strong> {deletionReason}
                </p>
                {deletionType === "partial" && selectedDataTypes.length > 0 && (
                  <div className="mt-2">
                    <p className="text-red-200 text-sm mb-1">
                      <strong>Silinecek veri türleri:</strong>
                    </p>
                    <ul className="text-red-200 text-xs list-disc list-inside">
                      {selectedDataTypes.map(dataTypeId => {
                        const dataType = dataTypes.find(dt => dt.id === dataTypeId);
                        return <li key={dataTypeId}>{dataType?.name}</li>;
                      })}
                    </ul>
                  </div>
                )}
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
                      {deletionType === "full" ? "Hesap Siliniyor..." : "Veriler Siliniyor..."}
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      {deletionType === "full" ? "Hesabı Kalıcı Olarak Sil" : "Seçilen Verileri Sil"}
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

      {/* Giriş Modal'ı */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700/50 max-w-md w-full p-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <LogIn className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Giriş Yapın</h3>
                <p className="text-gray-400">Hesap silme işlemi için giriş yapmanız gerekiyor</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                Hesap silme işlemini gerçekleştirmek için önce giriş yapmanız gerekmektedir. 
                Bu sayfa Google Play Store veri silme politikası gereksinimlerini karşılamak için 
                herkese açık olarak sunulmaktadır.
              </p>
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-3">
                <p className="text-blue-200 text-sm">
                  <strong>Not:</strong> Bu sayfayı inceleyebilir, ancak hesap silme işlemi için 
                  giriş yapmanız gerekmektedir.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowLoginModal(false)}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors duration-300"
              >
                Sayfayı İncele
              </button>
              <Link
                to="/login"
                className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors duration-300 flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Giriş Yap
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
};

export default AccountDeletionPage;
