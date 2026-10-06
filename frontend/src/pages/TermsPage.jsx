import React from 'react';
import { Helmet } from 'react-helmet-async';
import { FileText, AlertCircle, CheckCircle, XCircle, Shield } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';

const sections = [
  { id: "genel-kosullar", label: "Genel Koşullar" },
  { id: "siparis-kosullari", label: "Sipariş Koşulları" },
  { id: "yasak-faaliyetler", label: "Yasak Faaliyetler" },
  { id: "sorumluluk-sinirlari", label: "Sorumluluk Sınırları" },
  { id: "degisiklikler", label: "Değişiklikler" },
];

const TermsPage = () => {
  return (
    <>
      <Helmet>
        <title>Kullanım Şartları - Benim Marketim</title>
        <meta name="description" content="Benim Marketim kullanım şartları ve hizmet koşulları." />
      </Helmet>

      <LegalLayout
        title="Kullanım Şartları"
        subtitle="Hizmet Koşulları"
        description="Bu kullanım şartları, Benim Marketim hizmetlerini kullanırken uymanız gereken kuralları belirler."
        icon={FileText}
        toc={sections}
      >
        {/* Genel Koşullar */}
        <section id="genel-kosullar" className="legal-section">
          <div className="legal-section-head">
            <Shield className="legal-icon" />
            <h2>Genel Koşullar</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Hizmet Kullanımı</h3>
              <p className="legal-text">Bu platformu yasal amaçlarla kullanmalısınız. Yasadışı faaliyetlerde bulunamazsınız.</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Hesap Güvenliği</h3>
              <p className="legal-text">Hesap bilgilerinizi güvenli tutmak sizin sorumluluğunuzdadır.</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Yaş Sınırı</h3>
              <p className="legal-text">Hizmetimizi kullanmak için en az 18 yaşında olmalısınız.</p>
            </div>
          </div>
        </section>

        {/* Sipariş Koşulları */}
        <section id="siparis-kosullari" className="legal-section">
          <div className="legal-section-head">
            <CheckCircle className="legal-icon" />
            <h2>Sipariş Koşulları</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Sipariş Onayı</h3>
              <p className="legal-text legal-text--sm">Siparişleriniz onaylandıktan sonra işleme alınır</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Ödeme</h3>
              <p className="legal-text legal-text--sm">Ödeme sipariş onayından sonra alınır</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Teslimat</h3>
              <p className="legal-text legal-text--sm">Teslimat süresi 45 dakika ile 2 saat arasındadır</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Fiyat Değişiklikleri</h3>
              <p className="legal-text legal-text--sm">Fiyatlar önceden haber verilmeksizin değişebilir</p>
            </div>
          </div>
        </section>

        {/* Yasak Faaliyetler */}
        <section id="yasak-faaliyetler" className="legal-section">
          <div className="legal-section-head">
            <XCircle className="legal-icon" />
            <h2>Yasak Faaliyetler</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Sahte bilgi vermek veya kimlik hırsızlığı yapmak</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Sistemi hacklemeye çalışmak veya zarar vermek</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Spam göndermek veya zararlı içerik paylaşmak</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Telif hakkı ihlali yapmak</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Başkalarının hesaplarını kullanmak</p>
            </div>
          </div>
        </section>

        {/* Sorumluluk Sınırları */}
        <section id="sorumluluk-sinirlari" className="legal-section">
          <div className="legal-section-head">
            <AlertCircle className="legal-icon" />
            <h2>Sorumluluk Sınırları</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Hizmet Kesintileri</h3>
              <p className="legal-text">Teknik sorunlar nedeniyle yaşanabilecek kesintilerden sorumlu değiliz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Üçüncü Taraf Hizmetleri</h3>
              <p className="legal-text">Üçüncü taraf hizmetlerinden kaynaklanan sorunlardan sorumlu değiliz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Kullanıcı Hataları</h3>
              <p className="legal-text">Kullanıcı hatalarından kaynaklanan zararlardan sorumlu değiliz</p>
            </div>
          </div>
        </section>

        {/* Değişiklikler */}
        <section id="degisiklikler" className="legal-section legal-section--note">
          <div className="legal-section-head">
            <FileText className="legal-icon" />
            <h2>Değişiklikler</h2>
          </div>
          <p className="legal-text legal-text--gap">
            Bu kullanım şartlarını istediğimiz zaman değiştirme hakkımız saklıdır. 
            Önemli değişiklikler e-posta ile bildirilir.
          </p>
          <div className="legal-stack legal-stack--tight">
            <p className="legal-strong">📅 Son güncelleme: 1 Ocak 2025</p>
            <p className="legal-strong">📧 Bildirimler: info@benimmarketim.com</p>
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default TermsPage;
