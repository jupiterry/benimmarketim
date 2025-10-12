import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { RotateCcw, Clock, Package, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const ReturnPolicyPage = () => {
  return (
    <>
      <Helmet>
        <title>İade ve İptal Koşulları - Benim Marketim</title>
        <meta name="description" content="Benim Marketim iade ve iptal koşulları, tüketici hakları." />
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
              <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-pink-600 rounded-full flex items-center justify-center shadow-2xl">
                <RotateCcw className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-red-400 via-pink-500 to-rose-500 bg-clip-text text-transparent">
                  İade ve İptal Koşulları
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-red-500 to-pink-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Tüketici Hakları
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-pink-600 to-rose-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-pink-600 to-rose-500 rounded-full flex items-center justify-center shadow-2xl">
                <Package className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              6502 sayılı Tüketicinin Korunması Hakkında Kanun gereği iade ve iptal haklarınız.
            </motion.p>
          </motion.div>

          {/* İçerik */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-8"
          >
            {/* İptal Koşulları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <XCircle className="w-6 h-6 text-red-400" />
                <h2 className="text-2xl font-bold text-white">İptal Koşulları</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-red-300 mb-2">Sipariş İptali</h3>
                  <p className="text-gray-300">Sipariş teslim edilmeden önce iptal edilebilir</p>
                </div>
                <div className="p-4 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-pink-300 mb-2">İptal Süresi</h3>
                  <p className="text-gray-300">Sipariş verildikten sonra 2 saat içinde</p>
                </div>
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-rose-300 mb-2">İptal Yöntemi</h3>
                  <p className="text-gray-300">Müşteri hizmetleri veya online panelden</p>
                </div>
              </div>
            </div>

            {/* İade Koşulları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <RotateCcw className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold text-white">İade Koşulları</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-orange-300 mb-2">İade Süresi</h3>
                  <p className="text-gray-300 text-sm">14 gün içinde iade talebinde bulunabilirsiniz</p>
                </div>
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-amber-300 mb-2">Ürün Durumu</h3>
                  <p className="text-gray-300 text-sm">Orijinal ambalajında ve kullanılmamış olmalı</p>
                </div>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-yellow-300 mb-2">İade Yöntemi</h3>
                  <p className="text-gray-300 text-sm">Ücretsiz kargo ile iade edilebilir</p>
                </div>
                <div className="p-4 bg-lime-500/10 border border-lime-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-lime-300 mb-2">Para İadesi</h3>
                  <p className="text-gray-300 text-sm">7-10 iş günü içinde hesabınıza yatırılır</p>
                </div>
              </div>
            </div>

            {/* İade Edilemeyen Ürünler */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <h2 className="text-2xl font-bold text-white">İade Edilemeyen Ürünler</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Taze gıda ürünleri (meyve, sebze, et, süt ürünleri)</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Kişisel hijyen ürünleri</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Açılmış ve kullanılmış ürünler</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Özel sipariş üzerine hazırlanan ürünler</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-1" />
                  <p className="text-gray-300">Son kullanma tarihi geçmiş ürünler</p>
                </div>
              </div>
            </div>

            {/* İade Süreci */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">İade Süreci</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-300">İade Talebi</h3>
                    <p className="text-gray-300">Müşteri hizmetleri ile iletişime geçin</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-300">Onay</h3>
                    <p className="text-gray-300">İade talebiniz değerlendirilir ve onaylanır</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">3</div>
                  <div>
                    <h3 className="text-lg font-semibold text-purple-300">Kargo</h3>
                    <p className="text-gray-300">Ürün ücretsiz kargo ile iade edilir</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold">4</div>
                  <div>
                    <h3 className="text-lg font-semibold text-pink-300">Para İadesi</h3>
                    <p className="text-gray-300">Para iadesi hesabınıza yatırılır</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Değişim Koşulları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Değişim Koşulları</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-green-300 mb-2">Değişim Süresi</h3>
                  <p className="text-gray-300">14 gün içinde değişim talebinde bulunabilirsiniz</p>
                </div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-emerald-300 mb-2">Değişim Koşulları</h3>
                  <p className="text-gray-300">Aynı ürünün farklı beden/renk seçenekleri</p>
                </div>
                <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-teal-300 mb-2">Fiyat Farkı</h3>
                  <p className="text-gray-300">Fiyat farkı varsa ek ödeme veya iade yapılır</p>
                </div>
              </div>
            </div>

            {/* İletişim */}
            <div className="bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-500/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <h2 className="text-2xl font-bold text-white">İletişim</h2>
              </div>
              <p className="text-gray-300 mb-4">
                İade ve iptal işlemleri hakkında sorularınız için:
              </p>
              <div className="space-y-2">
                <p className="text-red-300">📧 E-posta: iade@benimmarketim.com</p>
                <p className="text-red-300">📞 Telefon: +90 (XXX) XXX XX XX</p>
                <p className="text-red-300">🕒 Çalışma Saatleri: 09:00 - 18:00</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default ReturnPolicyPage;
