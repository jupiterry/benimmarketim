import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Shield, Eye, Lock, Database, UserCheck, AlertTriangle } from 'lucide-react';

const PrivacyPage = () => {
  return (
    <>
      <Helmet>
        <title>Gizlilik Politikası - Benim Marketim</title>
        <meta name="description" content="Benim Marketim gizlilik politikası ve kişisel verilerin korunması hakkında bilgiler." />
      </Helmet>

      <div className="min-h-screen pt-28 pb-16 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-2xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 via-teal-500 to-green-500 bg-clip-text text-transparent">
                  Gizlilik Politikası
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Kişisel Verilerin Korunması
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-teal-600 to-green-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-teal-600 to-green-500 rounded-full flex items-center justify-center shadow-2xl">
                <Lock className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Kişisel verilerinizin güvenliği bizim için önceliktir. Bu politika, verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar.
            </motion.p>
          </motion.div>

          {/* İçerik */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-8"
          >
            {/* Toplanan Veriler */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Database className="w-6 h-6 text-emerald-400" />
                <h2 className="text-2xl font-bold text-white">Toplanan Veriler</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-gray-700/30 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">Kimlik Bilgileri</h3>
                  <p className="text-gray-300">Ad, soyad, e-posta adresi, telefon numarası</p>
                </div>
                <div className="p-4 bg-gray-700/30 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">Adres Bilgileri</h3>
                  <p className="text-gray-300">Teslimat adresi, fatura adresi</p>
                </div>
                <div className="p-4 bg-gray-700/30 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">Ödeme Bilgileri</h3>
                  <p className="text-gray-300">Kart bilgileri (şifrelenmiş), ödeme geçmişi</p>
                </div>
                <div className="p-4 bg-gray-700/30 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">Kullanım Verileri</h3>
                  <p className="text-gray-300">Site kullanım alışkanlıkları, sipariş geçmişi</p>
                </div>
              </div>
            </div>

            {/* Veri Kullanımı */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Eye className="w-6 h-6 text-teal-400" />
                <h2 className="text-2xl font-bold text-white">Veri Kullanımı</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-emerald-300 mb-2">Sipariş İşleme</h3>
                  <p className="text-gray-300 text-sm">Siparişlerinizi işlemek ve teslimat yapmak için</p>
                </div>
                <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-teal-300 mb-2">Müşteri Hizmetleri</h3>
                  <p className="text-gray-300 text-sm">Size daha iyi hizmet verebilmek için</p>
                </div>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">Güvenlik</h3>
                  <p className="text-gray-300 text-sm">Hesabınızı ve verilerinizi korumak için</p>
                </div>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">İletişim</h3>
                  <p className="text-gray-300 text-sm">Önemli güncellemeler hakkında bilgilendirmek için</p>
                </div>
              </div>
            </div>

            {/* Veri Güvenliği */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Veri Güvenliği</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Tüm verileriniz SSL şifreleme ile korunmaktadır</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Ödeme bilgileriniz PCI DSS standartlarına uygun şekilde işlenir</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Verileriniz sadece yetkili personel tarafından erişilebilir</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Düzenli güvenlik güncellemeleri ve yedekleme yapılır</p>
                </div>
              </div>
            </div>

            {/* Haklarınız */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <UserCheck className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Haklarınız</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">Erişim Hakkı</h3>
                  <p className="text-gray-300 text-sm">Verilerinize erişim talep edebilirsiniz</p>
                </div>
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-orange-300 mb-2">Düzeltme Hakkı</h3>
                  <p className="text-gray-300 text-sm">Yanlış bilgileri düzeltebilirsiniz</p>
                </div>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-red-300 mb-2">Silme Hakkı</h3>
                  <p className="text-gray-300 text-sm">Verilerinizin silinmesini talep edebilirsiniz</p>
                </div>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">İtiraz Hakkı</h3>
                  <p className="text-gray-300 text-sm">Veri işleme faaliyetlerine itiraz edebilirsiniz</p>
                </div>
              </div>
            </div>

            {/* İletişim */}
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-emerald-400" />
                <h2 className="text-2xl font-bold text-white">İletişim</h2>
              </div>
              <p className="text-gray-300 mb-4">
                Gizlilik politikamız hakkında sorularınız için bizimle iletişime geçebilirsiniz:
              </p>
              <div className="space-y-2">
                <p className="text-emerald-300">📧 E-posta: info@benimmarketim.com</p>
                <p className="text-emerald-300">📞 Telefon: +90 (XXX) XXX XX XX</p>
                <p className="text-emerald-300">📍 Adres: [Şirket Adresi]</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default PrivacyPage;