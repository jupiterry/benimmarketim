import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { FileText, Scale, AlertCircle, CheckCircle, XCircle, Shield } from 'lucide-react';

const TermsPage = () => {
  return (
    <>
      <Helmet>
        <title>Kullanım Şartları - Benim Marketim</title>
        <meta name="description" content="Benim Marketim kullanım şartları ve hizmet koşulları." />
      </Helmet>

      <div className="min-h-screen pt-24 pb-16 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
                  Kullanım Şartları
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Hizmet Koşulları
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full flex items-center justify-center shadow-2xl">
                <Scale className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Bu kullanım şartları, Benim Marketim hizmetlerini kullanırken uymanız gereken kuralları belirler.
            </motion.p>
          </motion.div>

          {/* İçerik */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-8"
          >
            {/* Genel Koşullar */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Genel Koşullar</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">Hizmet Kullanımı</h3>
                  <p className="text-gray-300">Bu platformu yasal amaçlarla kullanmalısınız. Yasadışı faaliyetlerde bulunamazsınız.</p>
                </div>
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-indigo-300 mb-2">Hesap Güvenliği</h3>
                  <p className="text-gray-300">Hesap bilgilerinizi güvenli tutmak sizin sorumluluğunuzdadır.</p>
                </div>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">Yaş Sınırı</h3>
                  <p className="text-gray-300">Hizmetimizi kullanmak için en az 18 yaşında olmalısınız.</p>
                </div>
              </div>
            </div>

            {/* Sipariş Koşulları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Sipariş Koşulları</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-green-300 mb-2">Sipariş Onayı</h3>
                  <p className="text-gray-300 text-sm">Siparişleriniz onaylandıktan sonra işleme alınır</p>
                </div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-emerald-300 mb-2">Ödeme</h3>
                  <p className="text-gray-300 text-sm">Ödeme sipariş onayından sonra alınır</p>
                </div>
                <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-teal-300 mb-2">Teslimat</h3>
                  <p className="text-gray-300 text-sm">Teslimat süresi 45 dakika ile 2 saat arasındadır</p>
                </div>
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-2">Fiyat Değişiklikleri</h3>
                  <p className="text-gray-300 text-sm">Fiyatlar önceden haber verilmeksizin değişebilir</p>
                </div>
              </div>
            </div>

            {/* Yasak Faaliyetler */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <XCircle className="w-6 h-6 text-red-400" />
                <h2 className="text-2xl font-bold text-white">Yasak Faaliyetler</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Sahte bilgi vermek veya kimlik hırsızlığı yapmak</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Sistemi hacklemeye çalışmak veya zarar vermek</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Spam göndermek veya zararlı içerik paylaşmak</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Telif hakkı ihlali yapmak</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Başkalarının hesaplarını kullanmak</p>
                </div>
              </div>
            </div>

            {/* Sorumluluk Sınırları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <AlertCircle className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold text-white">Sorumluluk Sınırları</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-orange-300 mb-2">Hizmet Kesintileri</h3>
                  <p className="text-gray-300">Teknik sorunlar nedeniyle yaşanabilecek kesintilerden sorumlu değiliz</p>
                </div>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-yellow-300 mb-2">Üçüncü Taraf Hizmetleri</h3>
                  <p className="text-gray-300">Üçüncü taraf hizmetlerinden kaynaklanan sorunlardan sorumlu değiliz</p>
                </div>
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-amber-300 mb-2">Kullanıcı Hataları</h3>
                  <p className="text-gray-300">Kullanıcı hatalarından kaynaklanan zararlardan sorumlu değiliz</p>
                </div>
              </div>
            </div>

            {/* Değişiklikler */}
            <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Değişiklikler</h2>
              </div>
              <p className="text-gray-300 mb-4">
                Bu kullanım şartlarını istediğimiz zaman değiştirme hakkımız saklıdır. 
                Önemli değişiklikler e-posta ile bildirilir.
              </p>
              <div className="space-y-2">
                <p className="text-blue-300">📅 Son güncelleme: 1 Ocak 2025</p>
                <p className="text-blue-300">📧 Bildirimler: info@benimmarketim.com</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default TermsPage;
