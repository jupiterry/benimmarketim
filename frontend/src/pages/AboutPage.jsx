import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Heart, Target, Users, Award, Truck, Shield, Star, Clock } from 'lucide-react';

const AboutPage = () => {
  return (
    <>
      <Helmet>
        <title>Hakkımızda - Benim Marketim</title>
        <meta name="description" content="Benim Marketim hakkında bilgiler, misyonumuz, vizyonumuz ve değerlerimiz." />
      </Helmet>

      <div className="min-h-screen pt-24 pb-16 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-2xl">
                <Heart className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 via-teal-500 to-green-500 bg-clip-text text-transparent">
                  Hakkımızda
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Benim Marketim Ailesi
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-teal-600 to-green-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-teal-600 to-green-500 rounded-full flex items-center justify-center shadow-2xl">
                <Users className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Taze ürünler, hızlı teslimat ve kaliteli hizmet anlayışıyla müşteri memnuniyetini ön planda tutan bir e-ticaret platformuyuz.
            </motion.p>
          </motion.div>

          {/* Hikayemiz */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8 mb-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <Heart className="w-6 h-6 text-emerald-400" />
              <h2 className="text-2xl font-bold text-white">Hikayemiz</h2>
            </div>
            <div className="prose prose-lg max-w-none">
              <p className="text-gray-300 leading-relaxed mb-4">
                Benim Marketim, 2020 yılında müşterilerin taze ve kaliteli ürünlere kolay erişim sağlaması amacıyla kurulmuştur. 
                Pandemi döneminde artan online alışveriş ihtiyacını karşılamak için yola çıktık.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                Bugün, binlerce mutlu müşterimizle birlikte büyüyen bir aile olduk. 
                Her gün daha iyi hizmet verebilmek için çalışmaya devam ediyoruz.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Misyonumuz, müşterilerimize en taze ürünleri, en hızlı şekilde, 
                en uygun fiyatlarla sunmaktır.
              </p>
            </div>
          </motion.div>

          {/* Misyon, Vizyon, Değerler */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Target className="w-6 h-6 text-blue-400" />
                <h2 className="text-xl font-bold text-white">Misyonumuz</h2>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Müşterilerimize taze, kaliteli ve güvenli ürünleri, 
                hızlı teslimat ile sunarak yaşam kalitelerini artırmak.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Award className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-bold text-white">Vizyonumuz</h2>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Türkiye'nin en güvenilir ve tercih edilen online marketi olmak, 
                teknoloji ile geleneksel değerleri birleştirmek.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Star className="w-6 h-6 text-yellow-400" />
                <h2 className="text-xl font-bold text-white">Değerlerimiz</h2>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Müşteri memnuniyeti, kalite, güvenilirlik, 
                şeffaflık ve sürekli gelişim bizim temel değerlerimizdir.
              </p>
            </motion.div>
          </div>

          {/* Özelliklerimiz */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8 mb-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <Award className="w-6 h-6 text-emerald-400" />
              <h2 className="text-2xl font-bold text-white">Özelliklerimiz</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <Truck className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-emerald-300">Hızlı Teslimat</h3>
                </div>
                <p className="text-gray-300 text-sm">45 dakika içinde kapınızda</p>
              </div>

              <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-6 h-6 text-blue-400" />
                  <h3 className="text-lg font-semibold text-blue-300">Güvenli Alışveriş</h3>
                </div>
                <p className="text-gray-300 text-sm">SSL şifreleme ile korumalı</p>
              </div>

              <div className="p-6 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <Star className="w-6 h-6 text-purple-400" />
                  <h3 className="text-lg font-semibold text-purple-300">Kaliteli Ürünler</h3>
                </div>
                <p className="text-gray-300 text-sm">Seçilmiş tedarikçilerden</p>
              </div>

              <div className="p-6 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-6 h-6 text-orange-400" />
                  <h3 className="text-lg font-semibold text-orange-300">7/24 Hizmet</h3>
                </div>
                <p className="text-gray-300 text-sm">Her zaman yanınızdayız</p>
              </div>

              <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <Heart className="w-6 h-6 text-green-400" />
                  <h3 className="text-lg font-semibold text-green-300">Müşteri Odaklı</h3>
                </div>
                <p className="text-gray-300 text-sm">Memnuniyet önceliğimiz</p>
              </div>

              <div className="p-6 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-6 h-6 text-cyan-400" />
                  <h3 className="text-lg font-semibold text-cyan-300">Güvenilir Ekip</h3>
                </div>
                <p className="text-gray-300 text-sm">Deneyimli ve profesyonel</p>
              </div>
            </div>
          </motion.div>

          {/* İstatistikler */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <Award className="w-6 h-6 text-emerald-400" />
              <h2 className="text-2xl font-bold text-white">Rakamlarla Benim Marketim</h2>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-400 mb-2">10,000+</div>
                <div className="text-gray-300">Mutlu Müşteri</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-teal-400 mb-2">50,000+</div>
                <div className="text-gray-300">Başarılı Teslimat</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400 mb-2">1,000+</div>
                <div className="text-gray-300">Ürün Çeşidi</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-cyan-400 mb-2">4.8/5</div>
                <div className="text-gray-300">Müşteri Puanı</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default AboutPage;
