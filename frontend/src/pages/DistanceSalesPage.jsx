import React from 'react';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, Truck, CreditCard, RotateCcw, Clock, Shield } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';

const sections = [
  { id: "satici-bilgileri", label: "Satıcı Bilgileri" },
  { id: "siparis-sureci", label: "Sipariş Süreci" },
  { id: "teslimat-kosullari", label: "Teslimat Koşulları" },
  { id: "odeme-kosullari", label: "Ödeme Koşulları" },
  { id: "iade-ve-iptal-kosullari", label: "İade ve İptal Koşulları" },
  { id: "tuketici-haklari", label: "Tüketici Hakları" },
];

const DistanceSalesPage = () => {
  return (
    <>
      <Helmet>
        <title>Mesafeli Satış Sözleşmesi - Benim Marketim</title>
        <meta name="description" content="Benim Marketim mesafeli satış sözleşmesi ve tüketici hakları." />
      </Helmet>

      <LegalLayout
        title="Mesafeli Satış Sözleşmesi"
        subtitle="Tüketici Hakları"
        description="6502 sayılı Tüketicinin Korunması Hakkında Kanun ve ilgili mevzuat hükümlerine uygun olarak düzenlenmiştir."
        icon={ShoppingCart}
        toc={sections}
      >
        {/* Satıcı Bilgileri */}
        <section id="satici-bilgileri" className="legal-section">
          <div className="legal-section-head">
            <Shield className="legal-icon" />
            <h2>Satıcı Bilgileri</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Şirket Unvanı</h3>
              <p className="legal-text">Benim Marketim Ticaret Limited Şirketi</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Vergi No</h3>
              <p className="legal-text">[Vergi Numarası]</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Adres</h3>
              <p className="legal-text">[Şirket Adresi]</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İletişim</h3>
              <p className="legal-text">info@benimmarketim.com</p>
            </div>
          </div>
        </section>

        {/* Sipariş Süreci */}
        <section id="siparis-sureci" className="legal-section">
          <div className="legal-section-head">
            <ShoppingCart className="legal-icon" />
            <h2>Sipariş Süreci</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card legal-card--row">
              <div className="legal-step">1</div>
              <div>
                <h3 className="legal-card-title">Ürün Seçimi</h3>
                <p className="legal-text">İstediğiniz ürünleri sepete ekleyin</p>
              </div>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">2</div>
              <div>
                <h3 className="legal-card-title">Ödeme</h3>
                <p className="legal-text">Güvenli ödeme yöntemleri ile ödeme yapın</p>
              </div>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">3</div>
              <div>
                <h3 className="legal-card-title">Onay</h3>
                <p className="legal-text">Siparişiniz onaylandıktan sonra işleme alınır</p>
              </div>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">4</div>
              <div>
                <h3 className="legal-card-title">Teslimat</h3>
                <p className="legal-text">Ürünleriniz belirtilen adrese teslim edilir</p>
              </div>
            </div>
          </div>
        </section>

        {/* Teslimat Koşulları */}
        <section id="teslimat-kosullari" className="legal-section">
          <div className="legal-section-head">
            <Truck className="legal-icon" />
            <h2>Teslimat Koşulları</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Teslimat Süresi</h3>
              <p className="legal-text legal-text--sm">45 dakika - 2 saat arası</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Teslimat Ücreti</h3>
              <p className="legal-text legal-text--sm">150₺ üzeri siparişlerde ücretsiz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Teslimat Saatleri</h3>
              <p className="legal-text legal-text--sm">08:00 - 22:00 arası</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Teslimat Alanı</h3>
              <p className="legal-text legal-text--sm">Belirlenen teslimat bölgeleri</p>
            </div>
          </div>
        </section>

        {/* Ödeme Koşulları */}
        <section id="odeme-kosullari" className="legal-section">
          <div className="legal-section-head">
            <CreditCard className="legal-icon" />
            <h2>Ödeme Koşulları</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Ödeme Yöntemleri</h3>
              <p className="legal-text">Kredi kartı, banka kartı, nakit ödeme</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Güvenlik</h3>
              <p className="legal-text">Tüm ödemeler SSL şifreleme ile korunur</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Fatura</h3>
              <p className="legal-text">Faturalar e-posta ile gönderilir</p>
            </div>
          </div>
        </section>

        {/* İade ve İptal */}
        <section id="iade-ve-iptal-kosullari" className="legal-section">
          <div className="legal-section-head">
            <RotateCcw className="legal-icon" />
            <h2>İade ve İptal Koşulları</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">İptal Hakkı</h3>
              <p className="legal-text">Sipariş teslim edilmeden önce iptal edilebilir</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İade Süresi</h3>
              <p className="legal-text">14 gün içinde iade talebinde bulunabilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İade Koşulları</h3>
              <p className="legal-text">Ürün orijinal ambalajında ve kullanılmamış olmalıdır</p>
            </div>
          </div>
        </section>

        {/* Tüketici Hakları */}
        <section id="tuketici-haklari" className="legal-section legal-section--note">
          <div className="legal-section-head">
            <Clock className="legal-icon" />
            <h2>Tüketici Hakları</h2>
          </div>
          <div className="legal-stack legal-stack--tight">
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">14 gün içinde cayma hakkınız bulunmaktadır</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Ürün kusurlu ise değişim veya iade hakkınız vardır</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Tüketici hakem heyetine başvurabilirsiniz</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Tüketici derneklerine şikayet edebilirsiniz</p>
            </div>
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default DistanceSalesPage;
