import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Shield, Database, Eye, Lock, UserCheck, AlertTriangle, FileText, Scale } from 'lucide-react';

const KVKKPage = () => {
  return (
    <>
      <Helmet>
        <title>KVKK Aydınlatma Metni - Benim Marketim</title>
        <meta name="description" content="Benim Marketim KVKK aydınlatma metni ve kişisel verilerin korunması hakkında bilgiler." />
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
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-indigo-500 to-blue-500 bg-clip-text text-transparent">
                  KVKK Aydınlatma Metni
                </h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-12 h-1 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full"></div>
                  <span className="text-gray-400 text-lg">
                    Kişisel Verilerin Korunması
                  </span>
                  <div className="w-12 h-1 bg-gradient-to-r from-indigo-600 to-blue-500 rounded-full"></div>
                </div>
              </div>
              <div className="w-16 h-16 bg-gradient-to-r from-indigo-600 to-blue-500 rounded-full flex items-center justify-center shadow-2xl">
                <Scale className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kişisel verilerinizin işlenmesi hakkında bilgilendirme.
            </motion.p>
          </motion.div>

          {/* İçerik */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-8"
          >
            {/* Veri Sorumlusu */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <FileText className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold text-white">Veri Sorumlusu</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">Şirket Unvanı</h3>
                  <p className="text-gray-300">Benim Marketim Ticaret Limited Şirketi</p>
                </div>
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-indigo-300 mb-2">Adres</h3>
                  <p className="text-gray-300">[Şirket Adresi]</p>
                </div>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">İletişim</h3>
                  <p className="text-gray-300">E-posta: kvkk@benimmarketim.com</p>
                  <p className="text-gray-300">Telefon: +90 (XXX) XXX XX XX</p>
                </div>
              </div>
            </div>

            {/* Toplanan Veriler */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Database className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Toplanan Kişisel Veriler</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">Kimlik Bilgileri</h3>
                  <p className="text-gray-300 text-sm">Ad, soyad, e-posta adresi, telefon numarası</p>
                </div>
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-indigo-300 mb-2">İletişim Bilgileri</h3>
                  <p className="text-gray-300 text-sm">E-posta, telefon, adres bilgileri</p>
                </div>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">Müşteri İşlem Bilgileri</h3>
                  <p className="text-gray-300 text-sm">Sipariş geçmişi, ödeme bilgileri</p>
                </div>
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-2">Dijital İzler</h3>
                  <p className="text-gray-300 text-sm">IP adresi, çerez bilgileri, site kullanım verileri</p>
                </div>
              </div>
            </div>

            {/* Veri İşleme Amaçları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Eye className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Veri İşleme Amaçları</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-green-300 mb-2">Hizmet Sunumu</h3>
                  <p className="text-gray-300">Sipariş işleme, teslimat, müşteri hizmetleri</p>
                </div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-emerald-300 mb-2">Yasal Yükümlülükler</h3>
                  <p className="text-gray-300">Muhasebe, vergi, ticaret hukuku gereklilikleri</p>
                </div>
                <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-teal-300 mb-2">Pazarlama</h3>
                  <p className="text-gray-300">Kampanya duyuruları, ürün önerileri</p>
                </div>
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-2">Güvenlik</h3>
                  <p className="text-gray-300">Dolandırıcılık önleme, hesap güvenliği</p>
                </div>
              </div>
            </div>

            {/* Veri İşleme Hukuki Sebepleri */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Scale className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold text-white">Veri İşleme Hukuki Sebepleri</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Açık rıza (KVKK md. 5/2-a)</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Sözleşmenin kurulması veya ifası (KVKK md. 5/2-c)</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Yasal yükümlülük (KVKK md. 5/2-e)</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-400 rounded-full mt-2"></div>
                  <p className="text-gray-300">Meşru menfaat (KVKK md. 5/2-f)</p>
                </div>
              </div>
            </div>

            {/* Veri Güvenliği */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-6 h-6 text-red-400" />
                <h2 className="text-2xl font-bold text-white">Veri Güvenliği</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-red-300 mb-2">Teknik Güvenlik</h3>
                  <p className="text-gray-300">SSL şifreleme, güvenli sunucular, düzenli güvenlik güncellemeleri</p>
                </div>
                <div className="p-4 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-pink-300 mb-2">İdari Güvenlik</h3>
                  <p className="text-gray-300">Personel eğitimi, erişim kontrolü, gizlilik sözleşmeleri</p>
                </div>
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-rose-300 mb-2">Fiziksel Güvenlik</h3>
                  <p className="text-gray-300">Güvenli veri merkezleri, erişim kontrolü, yedekleme</p>
                </div>
              </div>
            </div>

            {/* Veri Sahibinin Hakları */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <UserCheck className="w-6 h-6 text-cyan-400" />
                <h2 className="text-2xl font-bold text-white">Veri Sahibinin Hakları</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-2">Bilgi Talep Etme</h3>
                  <p className="text-gray-300 text-sm">Verilerinizin işlenip işlenmediğini öğrenme</p>
                </div>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">Erişim Hakkı</h3>
                  <p className="text-gray-300 text-sm">İşlenen verilerinize erişim talep etme</p>
                </div>
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-indigo-300 mb-2">Düzeltme Hakkı</h3>
                  <p className="text-gray-300 text-sm">Yanlış verilerin düzeltilmesini isteme</p>
                </div>
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-purple-300 mb-2">Silme Hakkı</h3>
                  <p className="text-gray-300 text-sm">Verilerinizin silinmesini talep etme</p>
                </div>
                <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-violet-300 mb-2">İtiraz Hakkı</h3>
                  <p className="text-gray-300 text-sm">Veri işleme faaliyetlerine itiraz etme</p>
                </div>
                <div className="p-4 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl">
                  <h3 className="text-lg font-semibold text-fuchsia-300 mb-2">Tazminat Hakkı</h3>
                  <p className="text-gray-300 text-sm">Zarar durumunda tazminat talep etme</p>
                </div>
              </div>
            </div>

            {/* Başvuru Yöntemleri */}
            <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold text-white">Başvuru Yöntemleri</h2>
              </div>
              <p className="text-gray-300 mb-4">
                KVKK kapsamındaki haklarınızı kullanmak için aşağıdaki yöntemlerle başvurabilirsiniz:
              </p>
              <div className="space-y-2">
                <p className="text-purple-300">📧 E-posta: kvkk@benimmarketim.com</p>
                <p className="text-purple-300">📞 Telefon: +90 (XXX) XXX XX XX</p>
                <p className="text-purple-300">📍 Posta: [Şirket Adresi]</p>
                <p className="text-purple-300">🌐 Web: www.benimmarketim.com/kvkk-basvuru</p>
              </div>
              <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <p className="text-sm text-purple-300">
                  <strong>Not:</strong> Başvurularınız 30 gün içinde yanıtlanacaktır. 
                  Başvuru ücreti alınmaz, ancak başvurunun reddedilmesi halinde gerekçe bildirilir.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default KVKKPage;
