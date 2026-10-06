import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Mail, Phone, MapPin, Clock, Send, MessageCircle } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';
import SiteMessageForm from '../components/SiteMessageForm';

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
                    <p className="legal-text">info@benimmarketim.com</p>
                    <p className="legal-text">destek@benimmarketim.com</p>
                  </div>
                </div>
                <div className="legal-card legal-card--row">
                  <Phone className="legal-icon" />
                  <div>
                    <h3 className="legal-card-title">Telefon</h3>
                    <p className="legal-text">+90 (XXX) XXX XX XX</p>
                  </div>
                </div>
                <div className="legal-card legal-card--row">
                  <MapPin className="legal-icon" />
                  <div>
                    <h3 className="legal-card-title">Adres</h3>
                    <p className="legal-text">Benim Marketim</p>
                    <p className="legal-text">Devrek, Zonguldak</p>
                  </div>
                </div>
                <div className="legal-card legal-card--row">
                  <Clock className="legal-icon" />
                  <div>
                    <h3 className="legal-card-title">Çalışma Saatleri</h3>
                    <p className="legal-text">Pazartesi - Cuma: 08:00 - 23:00</p>
                    <p className="legal-text">Cumartesi: 09:00 - 23:00</p>
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
                <a href="tel:+90XXXXXXXXX" className="legal-btn legal-btn--ghost">
                  <Phone aria-hidden="true" />
                  Ara
                </a>
                <a href="mailto:info@benimmarketim.com" className="legal-btn legal-btn--ghost">
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
