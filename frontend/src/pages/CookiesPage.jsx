import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Cookie, Settings, Shield, Eye, Database, AlertCircle } from 'lucide-react';

const CookiesPage = () => {
  return (
    <>
      <Helmet>
        <title>Çerez Politikası - Benim Marketim</title>
        <meta name="description" content="Benim Marketim çerez politikası ve çerez kullanımı hakkında bilgiler." />
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
              <div className="w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full flex items-center justify-center shadow-2xl">
                <Cookie className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
                  Çerez Politikası
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Cookie Kullanımı
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-orange-600 to-red-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-orange-600 to-red-500 rounded-full flex items-center justify-center shadow-2xl">
                <Settings className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Bu sayfa, web sitemizde çerezlerin nasıl kullanıldığını ve çerez tercihlerinizi nasıl yönetebileceğinizi açıklar.
            </motion.p>
          </motion.div>

          {/* İçerik */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-8"
          >
            {/* Çerez Nedir */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Cookie className="w-6 h-6 text-yellow-400" />
                <h2 className="text-2xl font-bold text-white">Çerez Nedir?</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-yellow-300 mb-2">Tanım</h3>
                  <p className="text-gray-300">Çerezler, web sitelerinin kullanıcı deneyimini iyileştirmek için kullandığı küçük metin dosyalarıdır.</p>
                </div>
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-orange-300 mb-2">Amaç</h3>
                  <p className="text-gray-300">Site işlevselliğini artırmak, kullanıcı tercihlerini hatırlamak ve analiz yapmak için kullanılır.</p>
                </div>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-red-300 mb-2">Güvenlik</h3>
                  <p className="text-gray-300">Çerezler zararlı kod içermez ve bilgisayarınıza zarar vermez.</p>
                </div>
              </div>
            </div>

            {/* Çerez Türleri */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Database className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Çerez Türleri</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">Zorunlu Çerezler</h3>
                  <p className="text-gray-300 text-sm">Site işlevselliği için gerekli çerezler</p>
                </div>
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-indigo-300 mb-2">Performans Çerezleri</h3>
                  <p className="text-gray-300 text-sm">Site performansını analiz etmek için</p>
                </div>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">Fonksiyonel Çerezler</h3>
                  <p className="text-gray-300 text-sm">Kullanıcı tercihlerini hatırlamak için</p>
                </div>
                <div className="p-4 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-pink-300 mb-2">Hedefleme Çerezleri</h3>
                  <p className="text-gray-300 text-sm">Kişiselleştirilmiş içerik için</p>
                </div>
              </div>
            </div>

            {/* Kullandığımız Çerezler */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Kullandığımız Çerezler</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-green-300 mb-2">Oturum Çerezleri</h3>
                  <p className="text-gray-300">Giriş durumunuzu ve sepet içeriğinizi hatırlar</p>
                </div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-emerald-300 mb-2">Tercih Çerezleri</h3>
                  <p className="text-gray-300">Dil seçimi, tema tercihi gibi ayarlarınızı saklar</p>
                </div>
                <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-teal-300 mb-2">Analitik Çerezler</h3>
                  <p className="text-gray-300">Google Analytics ile site kullanımını analiz eder</p>
                </div>
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-2">Güvenlik Çerezleri</h3>
                  <p className="text-gray-300">Güvenli bağlantı ve kimlik doğrulama için</p>
                </div>
              </div>
            </div>

            {/* Çerez Yönetimi */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold text-white">Çerez Yönetimi</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">Tarayıcı Ayarları</h3>
                  <p className="text-gray-300">Tarayıcınızın ayarlarından çerezleri yönetebilirsiniz</p>
                </div>
                <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-violet-300 mb-2">Çerez Silme</h3>
                  <p className="text-gray-300">Mevcut çerezleri tarayıcınızdan silebilirsiniz</p>
                </div>
                <div className="p-4 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-fuchsia-300 mb-2">Çerez Engelleme</h3>
                  <p className="text-gray-300">Çerezleri tamamen engelleyebilirsiniz (site işlevselliği etkilenebilir)</p>
                </div>
              </div>
            </div>

            {/* Üçüncü Taraf Çerezler */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Eye className="w-6 h-6 text-cyan-400" />
                <h2 className="text-2xl font-bold text-white">Üçüncü Taraf Çerezler</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-2">Google Analytics</h3>
                  <p className="text-gray-300">Site trafiğini ve kullanıcı davranışlarını analiz eder</p>
                </div>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">Sosyal Medya</h3>
                  <p className="text-gray-300">Facebook, Twitter gibi platformların entegrasyonu için</p>
                </div>
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-indigo-300 mb-2">Reklam Ağları</h3>
                  <p className="text-gray-300">Hedefli reklamlar için kullanılır</p>
                </div>
              </div>
            </div>

            {/* Çerez Tercihleri */}
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-yellow-400" />
                <h2 className="text-2xl font-bold text-white">Çerez Tercihleriniz</h2>
              </div>
              <p className="text-gray-300 mb-4">
                Çerez kullanımı hakkında tercihlerinizi yönetebilirsiniz:
              </p>
              <div className="space-y-2">
                <p className="text-yellow-300">🍪 Zorunlu çerezler: Site işlevselliği için gerekli</p>
                <p className="text-yellow-300">📊 Analitik çerezler: Site performansını iyileştirmek için</p>
                <p className="text-yellow-300">🎯 Hedefleme çerezleri: Kişiselleştirilmiş deneyim için</p>
                <p className="text-yellow-300">⚙️ Fonksiyonel çerezler: Tercihlerinizi hatırlamak için</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default CookiesPage;
