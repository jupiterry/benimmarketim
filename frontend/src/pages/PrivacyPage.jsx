import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';

const PrivacyPage = () => {
  return (
    <>
      <Helmet>
        <title>Gizlilik Politikası - Benim Marketim</title>
        <meta name="description" content="Benim Marketim gizlilik politikası ve kişisel veri koruma bilgileri." />
      </Helmet>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-gray-50 py-8"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">
              Gizlilik Politikası
            </h1>
            
            <div className="prose prose-lg max-w-none">
              <p className="text-gray-600 mb-6">
                <strong>Son Güncelleme:</strong> {new Date().toLocaleDateString('tr-TR')}
              </p>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  1. Giriş
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Benim Marketim olarak, kişisel verilerinizin korunması bizim için önemlidir. 
                  Bu gizlilik politikası, web sitemizi kullanırken kişisel bilgilerinizin nasıl 
                  toplandığını, kullanıldığını ve korunduğunu açıklamaktadır.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  2. Toplanan Bilgiler
                </h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Aşağıdaki kişisel bilgileri toplayabiliriz:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Ad, soyad ve iletişim bilgileri</li>
                  <li>E-posta adresi</li>
                  <li>Telefon numarası</li>
                  <li>Adres bilgileri</li>
                  <li>Ödeme bilgileri (güvenli şekilde işlenir)</li>
                  <li>IP adresi ve tarayıcı bilgileri</li>
                  <li>Çerezler (cookies) aracılığıyla toplanan veriler</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  3. Bilgilerin Kullanımı
                </h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Topladığımız bilgileri aşağıdaki amaçlarla kullanırız:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Siparişlerinizi işlemek ve teslim etmek</li>
                  <li>Müşteri hizmetleri sağlamak</li>
                  <li>Hesap güvenliğini sağlamak</li>
                  <li>Yasal yükümlülüklerimizi yerine getirmek</li>
                  <li>Hizmet kalitemizi artırmak</li>
                  <li>Pazarlama faaliyetleri (izin verilmesi halinde)</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  4. Bilgi Paylaşımı
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Kişisel bilgilerinizi üçüncü taraflarla paylaşmayız, ancak aşağıdaki 
                  durumlar istisnadır:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2 mt-4">
                  <li>Yasal zorunluluklar</li>
                  <li>Mahkeme kararları</li>
                  <li>Güvenlik tehditleri</li>
                  <li>Hizmet sağlayıcılarımız (sadece gerekli bilgiler)</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  5. Veri Güvenliği
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Kişisel verilerinizi korumak için uygun teknik ve idari önlemler alırız. 
                  SSL şifreleme, güvenli sunucular ve düzenli güvenlik güncellemeleri 
                  kullanarak verilerinizi koruruz.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  6. Çerezler (Cookies)
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Web sitemizde kullanıcı deneyimini iyileştirmek için çerezler kullanırız. 
                  Çerezler, tarayıcınızda saklanan küçük metin dosyalarıdır. Çerezleri 
                  tarayıcı ayarlarınızdan yönetebilirsiniz.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  7. Kullanıcı Hakları
                </h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  KVKK kapsamında aşağıdaki haklara sahipsiniz:
                </p>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
                  <li>İşlenen kişisel verileriniz hakkında bilgi talep etme</li>
                  <li>Kişisel verilerinizin işlenme amacını öğrenme</li>
                  <li>Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme</li>
                  <li>Eksik veya yanlış işlenmiş olması halinde bunların düzeltilmesini isteme</li>
                  <li>Belirtilen şartlar çerçevesinde kişisel verilerin silinmesini isteme</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  8. İletişim
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Gizlilik politikamız hakkında sorularınız için bizimle iletişime geçebilirsiniz:
                </p>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700">
                    <strong>E-posta:</strong> info@benimmarketim.com<br />
                    <strong>Telefon:</strong> +90 (XXX) XXX XX XX<br />
                    <strong>Adres:</strong> [Şirket Adresi]
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  9. Politika Değişiklikleri
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Bu gizlilik politikasını zaman zaman güncelleyebiliriz. Önemli değişiklikler 
                  olduğunda size bildirimde bulunacağız. Politikanın güncel halini bu sayfada 
                  takip edebilirsiniz.
                </p>
              </section>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Bu gizlilik politikası, Türkiye Cumhuriyeti mevzuatına uygun olarak 
                  hazırlanmıştır ve KVKK (Kişisel Verilerin Korunması Kanunu) kapsamında 
                  değerlendirilmelidir.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default PrivacyPage;
