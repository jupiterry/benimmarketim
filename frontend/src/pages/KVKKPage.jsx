import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Shield, Database, Eye, Lock, UserCheck, AlertTriangle, FileText, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout';

const sections = [
  { id: "veri-sorumlusu", label: "Veri Sorumlusu" },
  { id: "toplanan-kisisel-veriler", label: "Toplanan Kişisel Veriler" },
  { id: "veri-isleme-amaclari", label: "Veri İşleme Amaçları" },
  { id: "veri-isleme-hukuki-sebepleri", label: "Veri İşleme Hukuki Sebepleri" },
  { id: "veri-guvenligi", label: "Veri Güvenliği" },
  { id: "veri-sahibinin-haklari", label: "Veri Sahibinin Hakları" },
  { id: "basvuru-yontemleri", label: "Başvuru Yöntemleri" },
];

const KVKKPage = () => {
  return (
    <>
      <Helmet>
        <title>KVKK Aydınlatma Metni - Benim Marketim</title>
        <meta name="description" content="Benim Marketim KVKK aydınlatma metni ve kişisel verilerin korunması hakkında bilgiler." />
      </Helmet>

      <LegalLayout
        title="KVKK Aydınlatma Metni"
        subtitle="Kişisel Verilerin Korunması"
        description="6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kişisel verilerinizin işlenmesi hakkında bilgilendirme."
        icon={Shield}
        toc={sections}
      >
        {/* Veri Sorumlusu */}
        <section id="veri-sorumlusu" className="legal-section">
          <div className="legal-section-head">
            <FileText className="legal-icon" />
            <h2>Veri Sorumlusu</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Şirket Unvanı</h3>
              <p className="legal-text">Benim Marketim Ticaret Limited Şirketi</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Adres</h3>
              <p className="legal-text">[Şirket Adresi]</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İletişim</h3>
              <p className="legal-text">E-posta: kvkk@benimmarketim.com</p>
              <p className="legal-text">Telefon: +90 (XXX) XXX XX XX</p>
            </div>
          </div>
        </section>

        {/* Toplanan Veriler */}
        <section id="toplanan-kisisel-veriler" className="legal-section">
          <div className="legal-section-head">
            <Database className="legal-icon" />
            <h2>Toplanan Kişisel Veriler</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Kimlik Bilgileri</h3>
              <p className="legal-text legal-text--sm">Ad, soyad, e-posta adresi, telefon numarası</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İletişim Bilgileri</h3>
              <p className="legal-text legal-text--sm">E-posta, telefon, adres bilgileri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Müşteri İşlem Bilgileri</h3>
              <p className="legal-text legal-text--sm">Sipariş geçmişi, ödeme bilgileri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Dijital İzler</h3>
              <p className="legal-text legal-text--sm">IP adresi, çerez bilgileri, site kullanım verileri</p>
            </div>
          </div>
        </section>

        {/* Veri İşleme Amaçları */}
        <section id="veri-isleme-amaclari" className="legal-section">
          <div className="legal-section-head">
            <Eye className="legal-icon" />
            <h2>Veri İşleme Amaçları</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Hizmet Sunumu</h3>
              <p className="legal-text">Sipariş işleme, teslimat, müşteri hizmetleri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Yasal Yükümlülükler</h3>
              <p className="legal-text">Muhasebe, vergi, ticaret hukuku gereklilikleri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Pazarlama</h3>
              <p className="legal-text">Kampanya duyuruları, ürün önerileri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Güvenlik</h3>
              <p className="legal-text">Dolandırıcılık önleme, hesap güvenliği</p>
            </div>
          </div>
        </section>

        {/* Veri İşleme Hukuki Sebepleri */}
        <section id="veri-isleme-hukuki-sebepleri" className="legal-section">
          <div className="legal-section-head">
            <Scale className="legal-icon" />
            <h2>Veri İşleme Hukuki Sebepleri</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Açık rıza (KVKK md. 5/2-a)</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Sözleşmenin kurulması veya ifası (KVKK md. 5/2-c)</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Yasal yükümlülük (KVKK md. 5/2-e)</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot"></div>
              <p className="legal-text">Meşru menfaat (KVKK md. 5/2-f)</p>
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
            <div className="legal-card">
              <h3 className="legal-card-title">Teknik Güvenlik</h3>
              <p className="legal-text">SSL şifreleme, güvenli sunucular, düzenli güvenlik güncellemeleri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İdari Güvenlik</h3>
              <p className="legal-text">Personel eğitimi, erişim kontrolü, gizlilik sözleşmeleri</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Fiziksel Güvenlik</h3>
              <p className="legal-text">Güvenli veri merkezleri, erişim kontrolü, yedekleme</p>
            </div>
          </div>
        </section>

        {/* Veri Sahibinin Hakları */}
        <section id="veri-sahibinin-haklari" className="legal-section">
          <div className="legal-section-head">
            <UserCheck className="legal-icon" />
            <h2>Veri Sahibinin Hakları</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Bilgi Talep Etme</h3>
              <p className="legal-text legal-text--sm">Verilerinizin işlenip işlenmediğini öğrenme</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Erişim Hakkı</h3>
              <p className="legal-text legal-text--sm">İşlenen verilerinize erişim talep etme</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Düzeltme Hakkı</h3>
              <p className="legal-text legal-text--sm">Yanlış verilerin düzeltilmesini isteme</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Silme Hakkı</h3>
              <p className="legal-text legal-text--sm">Verilerinizin silinmesini talep etme</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">İtiraz Hakkı</h3>
              <p className="legal-text legal-text--sm">Veri işleme faaliyetlerine itiraz etme</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Tazminat Hakkı</h3>
              <p className="legal-text legal-text--sm">Zarar durumunda tazminat talep etme</p>
            </div>
          </div>
        </section>

        {/* Başvuru Yöntemleri */}
        <section id="basvuru-yontemleri" className="legal-section legal-section--note">
          <div className="legal-section-head">
            <AlertTriangle className="legal-icon" />
            <h2>Başvuru Yöntemleri</h2>
          </div>
          <p className="legal-text legal-text--gap">
            KVKK kapsamındaki haklarınızı kullanmak için aşağıdaki yöntemlerle başvurabilirsiniz:
          </p>
          <div className="legal-stack legal-stack--tight">
            <p className="legal-strong">📧 E-posta: kvkk@benimmarketim.com</p>
            <p className="legal-strong">📞 Telefon: +90 (XXX) XXX XX XX</p>
            <p className="legal-strong">📍 Posta: [Şirket Adresi]</p>
            <p className="legal-strong">🌐 Web: <Link className="legal-link" to="/kvkk-basvuru">devrekbenimmarketim.com/kvkk-basvuru</Link></p>
          </div>
          <div className="legal-card legal-card--gap">
            <p className="legal-strong legal-text--sm">
              <strong>Not:</strong> Başvurularınız 30 gün içinde yanıtlanacaktır. 
              Başvuru ücreti alınmaz, ancak başvurunun reddedilmesi halinde gerekçe bildirilir.
            </p>
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default KVKKPage;
