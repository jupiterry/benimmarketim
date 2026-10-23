import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Clock, Send, MessageCircle } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';
import SiteMessageForm from '../components/SiteMessageForm';
import { useSettingsStore } from '../stores/useSettingsStore';
import { company, isPlaceholder, orderHoursText, DELIVERY_ZONES_PATH } from '../data/company';

const subjects = [
  { value: "siparis", label: "Sipariş Sorunu" },
  { value: "teslimat", label: "Teslimat Sorunu" },
  { value: "iade", label: "İade/Değişim" },
  { value: "urun", label: "Ürün Hakkında" },
  { value: "genel", label: "Genel Soru" },
  { value: "sikayet", label: "Şikayet" },
  { value: "oneri", label: "Öneri" },
];

const ContactPage = () => {
  // Çalışma saatleri mağaza ayarlarından (GET /api/settings) gelir; uygulamadaki sipariş saatleriyle aynıdır.
  const settings = useSettingsStore((state) => state.settings);
  return (
    <>
      <Helmet>
        <title>İletişim - Benim Marketim</title>
        <meta name="description" content="Benim Marketim ile iletişime geçin. Sorularınız, önerileriniz ve şikayetleriniz için bizimle iletişim kurun." />
      </Helmet>

      <LegalLayout
        title="İletişim"
        subtitle="Bizimle İletişime Geçin"
        description="Sorularınız, önerileriniz ve şikayetleriniz için bizimle iletişime geçebilirsiniz. Size en kısa sürede dönüş yapacağız."
        icon={MessageCircle}
        docs={false}
        help={false}
      >
        <div className="legal-grid legal-grid--split">
          <div className="legal-stack">
            {/* İletişim Bilgileri */}
            <section className="legal-section">
              <div className="legal-section-head">
                <Phone className="legal-icon" />
                <h2>İletişim Bilgileri</h2>
              </div>
              <div className="legal-stack">
                <div className="legal-card legal-card--row">
                  <Mail className="legal-icon" />
                  <div>
                    <h3 className="legal-card-title">E-posta</h3>
                    <p className="legal-text">{company.email}</p>
                    <p className="legal-text">{company.supportEmail}</p>
                  </div>
                </div>
                <div className="legal-card legal-card--row">
                  <Phone className="legal-icon" />
                  <div>
                    <h3 className="legal-card-title">Telefon</h3>
                    <p className="legal-text">{company.phone}</p>
                  </div>
                </div>
                <div className="legal-card legal-card--row">
                  <MapPin className="legal-icon" />
                  <div>
                    <h3 className="legal-card-title">Adres</h3>
                    <p className="legal-text">{company.brand}</p>
                    <p className="legal-text">{company.storeAddress}</p>
                    <p className="legal-text legal-text--sm">
                      Teslimat yaptığımız yerler: <Link className="legal-link" to={DELIVERY_ZONES_PATH}>Teslimat bölgeleri</Link>
                    </p>
                  </div>
                </div>
                <div className="legal-card legal-card--row">
                  <Clock className="legal-icon" />
                  <div>
                    <h3 className="legal-card-title">Sipariş ve Çalışma Saatleri</h3>
                    <p className="legal-text">Her gün: {orderHoursText(settings)}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Hızlı İletişim */}
            <section className="legal-section">
              <div className="legal-section-head">
                <Send className="legal-icon" />
                <h2>Hızlı İletişim</h2>
              </div>
              <div className="legal-grid">
                {!isPlaceholder(company.phone) && (
                  <a href={company.phoneHref} className="legal-btn legal-btn--ghost">
                    <Phone aria-hidden="true" />
                    Ara
                  </a>
                )}
                <a href={`mailto:${company.email}`} className="legal-btn legal-btn--ghost">
                  <Mail aria-hidden="true" />
                  E-posta
                </a>
              </div>
            </section>
          </div>

          {/* İletişim Formu */}
          <section className="legal-section">
            <div className="legal-section-head">
              <MessageCircle className="legal-icon" />
              <h2>Mesaj Gönder</h2>
            </div>
            <SiteMessageForm
              kind="contact"
              topics={subjects}
              messagePlaceholder="Mesajınızı buraya yazın..."
              submitLabel="Mesaj Gönder"
              successTitle="Mesajınız bize ulaştı"
              successText="Size en kısa sürede dönüş yapacağız."
            />
          </section>
        </div>
      </LegalLayout>
    </>
  );
};

export default ContactPage;
