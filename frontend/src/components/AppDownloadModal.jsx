import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone, Download, Apple, ExternalLink } from "lucide-react";
import { detectDeviceType } from "../lib/deviceDetection";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app&hl=tr";

const AppDownloadModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [deviceType, setDeviceType] = useState(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // İlk giriş kontrolü - localStorage'da daha önce gösterilmiş mi?
    const hasSeenModal = localStorage.getItem("appDownloadModalShown");
    
    if (!hasSeenModal) {
      const detected = detectDeviceType();
      setDeviceType(detected);
      
      // iOS kontrolü
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
      setIsIOS(isIOSDevice);
      
      // Mobil cihazlarda otomatik göster
      if (detected === "mobile" || detected === "tablet") {
        setIsOpen(true);
      }
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("appDownloadModalShown", "true");
  };

  const handleDownload = () => {
    // Android cihazlarda Play Store'a yönlendir
    if (!isIOS) {
      window.open(PLAY_STORE_URL, "_blank");
    }
    handleClose();
  };

  const handleIOSContinue = () => {
    // iOS kullanıcıları için web'de devam et
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 rounded-3xl shadow-2xl border border-emerald-500/30 max-w-md w-full overflow-hidden">
              {/* Close Button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>

              {/* Content */}
              <div className="p-6 sm:p-8">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="flex justify-center mb-6"
                >
                  <div className="w-20 h-20 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center shadow-2xl">
                    <Smartphone className="w-10 h-10 text-white" />
                  </div>
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl sm:text-3xl font-bold text-center mb-4 bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent"
                >
                  🎉 Mobil Uygulamamız Çıktı!
                </motion.h2>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-center text-emerald-100 mb-6 leading-relaxed"
                >
                  Artık <span className="font-bold text-emerald-300">Benim Marketim</span> mobil uygulamasından 
                  sipariş verebilirsiniz! Daha hızlı, daha kolay ve daha pratik alışveriş deneyimi için 
                  uygulamayı indirin.
                </motion.p>

                {/* Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="space-y-3"
                >
                  {!isIOS ? (
                    // Android - Play Store'a yönlendir
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleDownload}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-xl transition-all duration-300"
                    >
                      <Download className="w-5 h-5" />
                      <span>Play Store'dan İndir</span>
                      <ExternalLink className="w-4 h-4" />
                    </motion.button>
                  ) : (
                    // iOS - Alternatif buton
                    <>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleIOSContinue}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-xl transition-all duration-300"
                      >
                        <Apple className="w-5 h-5" />
                        <span>iOS Kullanıcısıyım, Web'de Devam Et</span>
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleDownload}
                        className="w-full bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all duration-300"
                      >
                        <span>Yine de Play Store'u Aç</span>
                        <ExternalLink className="w-4 h-4" />
                      </motion.button>
                    </>
                  )}

                  {/* Skip Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleClose}
                    className="w-full text-emerald-200 hover:text-emerald-100 font-medium py-2 text-sm transition-colors"
                  >
                    Şimdilik Web'de Devam Et
                  </motion.button>
                </motion.div>

                {/* Features */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-6 pt-6 border-t border-emerald-500/30"
                >
                  <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div className="flex items-center gap-2 text-emerald-200">
                      <span>⚡</span>
                      <span>Daha Hızlı</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-200">
                      <span>🔔</span>
                      <span>Anlık Bildirimler</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-200">
                      <span>💳</span>
                      <span>Kolay Ödeme</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-200">
                      <span>📦</span>
                      <span>Sipariş Takibi</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl -translate-y-16 translate-x-16"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-teal-500/20 rounded-full blur-xl translate-y-12 -translate-x-12"></div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AppDownloadModal;

