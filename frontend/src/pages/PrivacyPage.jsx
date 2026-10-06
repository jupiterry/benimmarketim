import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Shield, Eye, Lock, Database, UserCheck, AlertTriangle } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';

const sections = [
  { id: "toplanan-veriler", label: "Toplanan Veriler" },
  { id: "veri-kullanimi", label: "Veri Kullanımı" },
  { id: "veri-guvenligi", label: "Veri Güvenliği" },
  { id: "haklariniz", label: "Haklarınız" },
  { id: "iletisim", label: "İletişim" },
];

const PrivacyPage = () => {
  return (
    <>
      <Helmet>
        <title>Gizlilik Politikası - Benim Marketim</title>
        <meta name="description" content="Benim Marketim gizlilik politikası ve kişisel verilerin korunması hakkında bilgiler." />
      </Helmet>

      <LegalLayout
        title="Gizlilik Politikası"
        subtitle="Kişisel Verilerin Korunması"
        description="Kişisel verilerinizin güvenliği bizim için önceliktir. Bu politika, verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar."
        icon={Shield}
        toc={sections}
      >
        {/* Toplanan Veriler */}
        <section id="toplanan-veriler" className="legal-section">
          <div className="legal-section-head">
            <Database className="legal-icon" />
            <h2>Toplanan Veriler</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Kimlik Bilgileri</h3>
              <p className="legal-text">Ad, soyad, e-posta adresi, telefon numarası</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Adres Bilgileri</h3>
              <p className="legal-text">Teslimat adresi, fatura adresi</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Ödeme Bilgileri</h3>
              <p className="legal-text">Kart bilgileri (şifrelenmiş), ödeme geçmişi</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Kullanım Verileri</h3>
              <p className="legal-text">Site kullanım alışkanlıkları, sipariş geçmişi</p>
            </div>
          </div>
        </section>

        {/* Veri Kullanımı */}
        <section id="veri-kullanimi" className="legal-section">
          <div className="legal-section-head">
            <Eye className="legal-icon" />
            <h2>Veri Kullanımı</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Sipariş İşleme</h3>
              <p className="legal-text legal-text--sm">Siparişlerinizi işlemek ve teslimat yapmak için</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Müşteri Hizmetleri</h3>
              <p className="legal-text legal-text--sm">Size daha iyi hizmet verebilmek için</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Güvenlik</h3>
              <p className="legal-text legal-text--sm">Hesabınızı ve verilerinizi korumak için</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İletişim</h3>
              <p className="legal-text legal-text--sm">Önemli güncellemeler hakkında bilgilendirmek için</p>
            </div>
          </div>
        </section>

        {/* Veri Güvenliği */}
        <section id="veri-guvenligi" className="legal-section">
          <div className="legal-section-head">
            <Lock className="legal-icon" />
            <h2>Veri Güvenliği</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Tüm verileriniz SSL şifreleme ile korunmaktadır</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Ödeme bilgileriniz PCI DSS standartlarına uygun şekilde işlenir</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Verileriniz sadece yetkili personel tarafından erişilebilir</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Düzenli güvenlik güncellemeleri ve yedekleme yapılır</p>
            </div>
          </div>
        </section>

        {/* Haklarınız */}
        <section id="haklariniz" className="legal-section">
          <div className="legal-section-head">
            <UserCheck className="legal-icon" />
            <h2>Haklarınız</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Erişim Hakkı</h3>
              <p className="legal-text legal-text--sm">Verilerinize erişim talep edebilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Düzeltme Hakkı</h3>
              <p className="legal-text legal-text--sm">Yanlış bilgileri düzeltebilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Silme Hakkı</h3>
              <p className="legal-text legal-text--sm">Verilerinizin silinmesini talep edebilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İtiraz Hakkı</h3>
              <p className="legal-text legal-text--sm">Veri işleme faaliyetlerine itiraz edebilirsiniz</p>
            </div>
          </div>
        </section>

        {/* İletişim */}
        <section id="iletisim" className="legal-section legal-section--note">
          <div className="legal-section-head">
            <AlertTriangle className="legal-icon" />
            <h2>İletişim</h2>
          </div>
          <p className="legal-text legal-text--gap">
            Gizlilik politikamız hakkında sorularınız için bizimle iletişime geçebilirsiniz:
          </p>
          <div className="legal-stack legal-stack--tight">
            <p className="legal-strong">📧 E-posta: info@benimmarketim.com</p>
            <p className="legal-strong">📞 Telefon: +90 (XXX) XXX XX XX</p>
            <p className="legal-strong">📍 Adres: [Şirket Adresi]</p>
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default PrivacyPage;
