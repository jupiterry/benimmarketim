import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Cookie, Settings, Shield, Eye, Database, AlertCircle } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';

const sections = [
  { id: "cerez-nedir", label: "Çerez Nedir?" },
  { id: "cerez-turleri", label: "Çerez Türleri" },
  { id: "kullandigimiz-cerezler", label: "Kullandığımız Çerezler" },
  { id: "cerez-yonetimi", label: "Çerez Yönetimi" },
  { id: "ucuncu-taraf-cerezler", label: "Üçüncü Taraf Çerezler" },
  { id: "cerez-tercihleriniz", label: "Çerez Tercihleriniz" },
];

const CookiesPage = () => {
  return (
    <>
      <Helmet>
        <title>Çerez Politikası - Benim Marketim</title>
        <meta name="description" content="Benim Marketim çerez politikası ve çerez kullanımı hakkında bilgiler." />
      </Helmet>

      <LegalLayout
        title="Çerez Politikası"
        subtitle="Cookie Kullanımı"
        description="Bu sayfa, web sitemizde çerezlerin nasıl kullanıldığını ve çerez tercihlerinizi nasıl yönetebileceğinizi açıklar."
        icon={Cookie}
        toc={sections}
      >
        {/* Çerez Nedir */}
        <section id="cerez-nedir" className="legal-section">
          <div className="legal-section-head">
            <Cookie className="legal-icon" />
            <h2>Çerez Nedir?</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Tanım</h3>
              <p className="legal-text">Çerezler, web sitelerinin kullanıcı deneyimini iyileştirmek için kullandığı küçük metin dosyalarıdır.</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Amaç</h3>
              <p className="legal-text">Site işlevselliğini artırmak, kullanıcı tercihlerini hatırlamak ve analiz yapmak için kullanılır.</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Güvenlik</h3>
              <p className="legal-text">Çerezler zararlı kod içermez ve bilgisayarınıza zarar vermez.</p>
            </div>
          </div>
        </section>

        {/* Çerez Türleri */}
        <section id="cerez-turleri" className="legal-section">
          <div className="legal-section-head">
            <Database className="legal-icon" />
            <h2>Çerez Türleri</h2>
          </div>
          <div className="legal-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Zorunlu Çerezler</h3>
              <p className="legal-text legal-text--sm">Site işlevselliği için gerekli çerezler</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Performans Çerezleri</h3>
              <p className="legal-text legal-text--sm">Site performansını analiz etmek için</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Fonksiyonel Çerezler</h3>
              <p className="legal-text legal-text--sm">Kullanıcı tercihlerini hatırlamak için</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Hedefleme Çerezleri</h3>
              <p className="legal-text legal-text--sm">Kişiselleştirilmiş içerik için</p>
            </div>
          </div>
        </section>

        {/* Kullandığımız Çerezler */}
        <section id="kullandigimiz-cerezler" className="legal-section">
          <div className="legal-section-head">
            <Shield className="legal-icon" />
            <h2>Kullandığımız Çerezler</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Oturum Çerezleri</h3>
              <p className="legal-text">Giriş durumunuzu ve sepet içeriğinizi hatırlar</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Tercih Çerezleri</h3>
              <p className="legal-text">Dil seçimi, tema tercihi gibi ayarlarınızı saklar</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Analitik Çerezler</h3>
              <p className="legal-text">Google Analytics ile site kullanımını analiz eder</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Güvenlik Çerezleri</h3>
              <p className="legal-text">Güvenli bağlantı ve kimlik doğrulama için</p>
            </div>
          </div>
        </section>

        {/* Çerez Yönetimi */}
        <section id="cerez-yonetimi" className="legal-section">
          <div className="legal-section-head">
            <Settings className="legal-icon" />
            <h2>Çerez Yönetimi</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Tarayıcı Ayarları</h3>
              <p className="legal-text">Tarayıcınızın ayarlarından çerezleri yönetebilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Çerez Silme</h3>
              <p className="legal-text">Mevcut çerezleri tarayıcınızdan silebilirsiniz</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Çerez Engelleme</h3>
              <p className="legal-text">Çerezleri tamamen engelleyebilirsiniz (site işlevselliği etkilenebilir)</p>
            </div>
          </div>
        </section>

        {/* Üçüncü Taraf Çerezler */}
        <section id="ucuncu-taraf-cerezler" className="legal-section">
          <div className="legal-section-head">
            <Eye className="legal-icon" />
            <h2>Üçüncü Taraf Çerezler</h2>
          </div>
          <div className="legal-stack">
            <div className="legal-card">
              <h3 className="legal-card-title">Google Analytics</h3>
              <p className="legal-text">Site trafiğini ve kullanıcı davranışlarını analiz eder</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Sosyal Medya</h3>
              <p className="legal-text">Facebook, Twitter gibi platformların entegrasyonu için</p>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Reklam Ağları</h3>
              <p className="legal-text">Hedefli reklamlar için kullanılır</p>
            </div>
          </div>
        </section>

        {/* Çerez Tercihleri */}
        <section id="cerez-tercihleriniz" className="legal-section legal-section--note">
          <div className="legal-section-head">
            <AlertCircle className="legal-icon" />
            <h2>Çerez Tercihleriniz</h2>
          </div>
          <p className="legal-text legal-text--gap">
            Çerez kullanımı hakkında tercihlerinizi yönetebilirsiniz:
          </p>
          <div className="legal-stack legal-stack--tight">
            <p className="legal-strong">🍪 Zorunlu çerezler: Site işlevselliği için gerekli</p>
            <p className="legal-strong">📊 Analitik çerezler: Site performansını iyileştirmek için</p>
            <p className="legal-strong">🎯 Hedefleme çerezleri: Kişiselleştirilmiş deneyim için</p>
            <p className="legal-strong">⚙️ Fonksiyonel çerezler: Tercihlerinizi hatırlamak için</p>
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default CookiesPage;
