import React from 'react';
import { Helmet } from 'react-helmet-async';
import { RotateCcw, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';

const sections = [
  { id: "iptal-kosullari", label: "İptal Koşulları" },
  { id: "iade-kosullari", label: "İade Koşulları" },
  { id: "iade-edilemeyen-urunler", label: "İade Edilemeyen Ürünler" },
  { id: "iade-sureci", label: "İade Süreci" },
  { id: "degisim-kosullari", label: "Değişim Koşulları" },
  { id: "iletisim", label: "İletişim" },
];

const ReturnPolicyPage = () => {
  return (
    <>
      <Helmet>
        <title>İade ve İptal Koşulları - Benim Marketim</title>
        <meta name="description" content="Benim Marketim iade ve iptal koşulları, tüketici hakları." />
      </Helmet>

      <LegalLayout
        title="İade ve İptal Koşulları"
        subtitle="Tüketici Hakları"
        description="6502 sayılı Tüketicinin Korunması Hakkında Kanun gereği iade ve iptal haklarınız."
        icon={RotateCcw}
        toc={sections}
      >
        {/* İptal Koşulları */}
        <section id="iptal-kosullari" className="legal-section">
          <div className="legal-section-head">
            <XCircle className="legal-icon" />
            <h2>İptal Koşulları</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Sipariş İptali</h3>
              <p className="legal-text">Sipariş teslim edilmeden önce iptal edilebilir</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İptal Süresi</h3>
              <p className="legal-text">Sipariş verildikten sonra 2 saat içinde</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İptal Yöntemi</h3>
              <p className="legal-text">Müşteri hizmetleri veya online panelden</p>
            </div>
          </div>
        </section>

        {/* İade Koşulları */}
        <section id="iade-kosullari" className="legal-section">
          <div className="legal-section-head">
            <RotateCcw className="legal-icon" />
            <h2>İade Koşulları</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">İade Süresi</h3>
              <p className="legal-text legal-text--sm">14 gün içinde iade talebinde bulunabilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Ürün Durumu</h3>
              <p className="legal-text legal-text--sm">Orijinal ambalajında ve kullanılmamış olmalı</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İade Yöntemi</h3>
              <p className="legal-text legal-text--sm">Ücretsiz kargo ile iade edilebilir</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Para İadesi</h3>
              <p className="legal-text legal-text--sm">7-10 iş günü içinde hesabınıza yatırılır</p>
            </div>
          </div>
        </section>

        {/* İade Edilemeyen Ürünler */}
        <section id="iade-edilemeyen-urunler" className="legal-section">
          <div className="legal-section-head">
            <AlertTriangle className="legal-icon" />
            <h2>İade Edilemeyen Ürünler</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Taze gıda ürünleri (meyve, sebze, et, süt ürünleri)</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Kişisel hijyen ürünleri</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Açılmış ve kullanılmış ürünler</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Özel sipariş üzerine hazırlanan ürünler</p>
            </div>
            <div className="legal-item">
              <XCircle className="legal-item-icon" />
              <p className="legal-text">Son kullanma tarihi geçmiş ürünler</p>
            </div>
          </div>
        </section>

        {/* İade Süreci */}
        <section id="iade-sureci" className="legal-section">
          <div className="legal-section-head">
            <Clock className="legal-icon" />
            <h2>İade Süreci</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card legal-card--row">
              <div className="legal-step">1</div>
              <div>
                <h3 className="legal-card-title">İade Talebi</h3>
                <p className="legal-text">Müşteri hizmetleri ile iletişime geçin</p>
              </div>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">2</div>
              <div>
                <h3 className="legal-card-title">Onay</h3>
                <p className="legal-text">İade talebiniz değerlendirilir ve onaylanır</p>
              </div>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">3</div>
              <div>
                <h3 className="legal-card-title">Kargo</h3>
                <p className="legal-text">Ürün ücretsiz kargo ile iade edilir</p>
              </div>
            </div>
            <div className="legal-card legal-card--row">
              <div className="legal-step">4</div>
              <div>
                <h3 className="legal-card-title">Para İadesi</h3>
                <p className="legal-text">Para iadesi hesabınıza yatırılır</p>
              </div>
            </div>
          </div>
        </section>

        {/* Değişim Koşulları */}
        <section id="degisim-kosullari" className="legal-section">
          <div className="legal-section-head">
            <CheckCircle className="legal-icon" />
            <h2>Değişim Koşulları</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Değişim Süresi</h3>
              <p className="legal-text">14 gün içinde değişim talebinde bulunabilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Değişim Koşulları</h3>
              <p className="legal-text">Aynı ürünün farklı beden/renk seçenekleri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Fiyat Farkı</h3>
              <p className="legal-text">Fiyat farkı varsa ek ödeme veya iade yapılır</p>
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
            İade ve iptal işlemleri hakkında sorularınız için:
          </p>
          <div className="legal-stack legal-stack--tight">
            <p className="legal-strong">📧 E-posta: iade@benimmarketim.com</p>
            <p className="legal-strong">📞 Telefon: +90 (XXX) XXX XX XX</p>
            <p className="legal-strong">🕒 Çalışma Saatleri: 09:00 - 18:00</p>
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default ReturnPolicyPage;
