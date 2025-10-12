import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, Truck, CreditCard, RotateCcw, Clock, Shield } from 'lucide-react';

const DistanceSalesPage = () => {
  return (
    <>
      <Helmet>
        <title>Mesafeli Satış Sözleşmesi - Benim Marketim</title>
        <meta name="description" content="Benim Marketim mesafeli satış sözleşmesi ve tüketici hakları." />
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
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-2xl">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                  Mesafeli Satış Sözleşmesi
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Tüketici Hakları
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-emerald-600 to-teal-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-emerald-600 to-teal-500 rounded-full flex items-center justify-center shadow-2xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              6502 sayılı Tüketicinin Korunması Hakkında Kanun ve ilgili mevzuat hükümlerine uygun olarak düzenlenmiştir.
            </motion.p>
          </motion.div>

          {/* İçerik */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-8"
          >
            {/* Satıcı Bilgileri */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Satıcı Bilgileri</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-green-300 mb-2">Şirket Unvanı</h3>
                  <p className="text-gray-300">Benim Marketim Ticaret Limited Şirketi</p>
                </div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-emerald-300 mb-2">Vergi No</h3>
                  <p className="text-gray-300">[Vergi Numarası]</p>
                </div>
                <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-teal-300 mb-2">Adres</h3>
                  <p className="text-gray-300">[Şirket Adresi]</p>
                </div>
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-2">İletişim</h3>
                  <p className="text-gray-300">info@benimmarketim.com</p>
                </div>
              </div>
            </div>

            {/* Sipariş Süreci */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <ShoppingCart className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Sipariş Süreci</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-300">Ürün Seçimi</h3>
                    <p className="text-gray-300">İstediğiniz ürünleri sepete ekleyin</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-300">Ödeme</h3>
                    <p className="text-gray-300">Güvenli ödeme yöntemleri ile ödeme yapın</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">3</div>
                  <div>
                    <h3 className="text-lg font-semibold text-purple-300">Onay</h3>
                    <p className="text-gray-300">Siparişiniz onaylandıktan sonra işleme alınır</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                  <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold">4</div>
                  <div>
                    <h3 className="text-lg font-semibold text-pink-300">Teslimat</h3>
                    <p className="text-gray-300">Ürünleriniz belirtilen adrese teslim edilir</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Teslimat Koşulları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Truck className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold text-white">Teslimat Koşulları</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-orange-300 mb-2">Teslimat Süresi</h3>
                  <p className="text-gray-300 text-sm">45 dakika - 2 saat arası</p>
                </div>
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-amber-300 mb-2">Teslimat Ücreti</h3>
                  <p className="text-gray-300 text-sm">150₺ üzeri siparişlerde ücretsiz</p>
                </div>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-yellow-300 mb-2">Teslimat Saatleri</h3>
                  <p className="text-gray-300 text-sm">08:00 - 22:00 arası</p>
                </div>
                <div className="p-4 bg-lime-500/10 border border-lime-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-lime-300 mb-2">Teslimat Alanı</h3>
                  <p className="text-gray-300 text-sm">Belirlenen teslimat bölgeleri</p>
                </div>
              </div>
            </div>

            {/* Ödeme Koşulları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <CreditCard className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold text-white">Ödeme Koşulları</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">Ödeme Yöntemleri</h3>
                  <p className="text-gray-300">Kredi kartı, banka kartı, nakit ödeme</p>
                </div>
                <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-violet-300 mb-2">Güvenlik</h3>
                  <p className="text-gray-300">Tüm ödemeler SSL şifreleme ile korunur</p>
                </div>
                <div className="p-4 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-fuchsia-300 mb-2">Fatura</h3>
                  <p className="text-gray-300">Faturalar e-posta ile gönderilir</p>
                </div>
              </div>
            </div>

            {/* İade ve İptal */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <RotateCcw className="w-6 h-6 text-red-400" />
                <h2 className="text-2xl font-bold text-white">İade ve İptal Koşulları</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-red-300 mb-2">İptal Hakkı</h3>
                  <p className="text-gray-300">Sipariş teslim edilmeden önce iptal edilebilir</p>
                </div>
                <div className="p-4 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-pink-300 mb-2">İade Süresi</h3>
                  <p className="text-gray-300">14 gün içinde iade talebinde bulunabilirsiniz</p>
                </div>
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-rose-300 mb-2">İade Koşulları</h3>
                  <p className="text-gray-300">Ürün orijinal ambalajında ve kullanılmamış olmalıdır</p>
                </div>
              </div>
            </div>

            {/* Tüketici Hakları */}
            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Tüketici Hakları</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">14 gün içinde cayma hakkınız bulunmaktadır</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Ürün kusurlu ise değişim veya iade hakkınız vardır</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Tüketici hakem heyetine başvurabilirsiniz</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Tüketici derneklerine şikayet edebilirsiniz</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default DistanceSalesPage;
