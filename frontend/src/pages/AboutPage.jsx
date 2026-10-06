import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Heart, Target, Users, Award, Truck, Shield, Star, Clock } from 'lucide-react';
import LegalLayout from '../components/LegalLayout';

const features = [
  { icon: Truck, title: "Hızlı Teslimat", text: "45 dakika içinde kapınızda" },
  { icon: Shield, title: "Güvenli Alışveriş", text: "SSL şifreleme ile korumalı" },
  { icon: Star, title: "Kaliteli Ürünler", text: "Seçilmiş tedarikçilerden" },
  { icon: Clock, title: "7/24 Hizmet", text: "Her zaman yanınızdayız" },
  { icon: Heart, title: "Müşteri Odaklı", text: "Memnuniyet önceliğimiz" },
  { icon: Users, title: "Güvenilir Ekip", text: "Deneyimli ve profesyonel" },
];

const stats = [
  { value: "500+", label: "Mutlu Müşteri" },
  { value: "500+", label: "Başarılı Teslimat" },
  { value: "3,000+", label: "Ürün Çeşidi" },
  { value: "4.8/5", label: "Müşteri Puanı" },
];

const AboutPage = () => {
  return (
    <>
      <Helmet>
        <title>Hakkımızda - Benim Marketim</title>
        <meta name="description" content="Benim Marketim hakkında bilgiler, misyonumuz, vizyonumuz ve değerlerimiz." />
      </Helmet>

      <LegalLayout
        title="Hakkımızda"
        subtitle="Benim Marketim Ailesi"
        description="Taze ürünler, hızlı teslimat ve kaliteli hizmet anlayışıyla müşteri memnuniyetini ön planda tutan bir e-ticaret platformuyuz."
        icon={Heart}
        docs={false}
      >
        {/* Hikayemiz */}
        <section className="legal-section">
          <div className="legal-section-head">
            <Heart className="legal-icon" />
            <h2>Hikayemiz</h2>
          </div>
          <div className="legal-stack">
            <p className="legal-text">
              Benim Marketim, 2020 yılında müşterilerin taze ve kaliteli ürünlere kolayca ulaşabilmesi amacıyla kuruldu.
            </p>
            <p className="legal-text">
              Bugün, binlerce mutlu müşterimizle büyüyen bir aile haline geldik.
              Özellikle üniversite öğrencilerinin ve markete uzak yaşayan kişilerin, yağmurlu havalarda, gece karanlığında veya yorgun bir günün ardından dışarı çıkmak zorunda kalmadan ihtiyaçlarını karşılamalarını sağlıyoruz.
              Sadece birkaç dokunuşla, diledikleri ürünleri kapılarına kadar ulaştırıyoruz.
            </p>
            <p className="legal-text">
              Misyonumuz; herkesin, her koşulda, en taze ürünlere en hızlı şekilde ve en uygun fiyatlarla ulaşmasını sağlamak.
              Her gün, sizlere daha iyi bir alışveriş deneyimi sunmak için çalışıyoruz.
            </p>
          </div>
        </section>

        {/* Misyon, Vizyon, Değerler */}
        <div className="legal-grid legal-grid--3">
          <section className="legal-section">
            <div className="legal-section-head">
              <Target className="legal-icon" />
              <h2>Misyonumuz</h2>
            </div>
            <p className="legal-text">
              Müşterilerimize taze, kaliteli ve güvenli ürünleri,
              hızlı teslimat ile sunarak yaşam kalitelerini artırmak.
            </p>
          </section>
          <section className="legal-section">
            <div className="legal-section-head">
              <Award className="legal-icon" />
              <h2>Vizyonumuz</h2>
            </div>
            <p className="legal-text">
              Türkiye'nin en güvenilir ve tercih edilen online marketi olmak,
              teknoloji ile geleneksel değerleri birleştirmek.
            </p>
          </section>
          <section className="legal-section">
            <div className="legal-section-head">
              <Star className="legal-icon" />
              <h2>Değerlerimiz</h2>
            </div>
            <p className="legal-text">
              Müşteri memnuniyeti, kalite, güvenilirlik,
              şeffaflık ve sürekli gelişim bizim temel değerlerimizdir.
            </p>
          </section>
        </div>

        {/* Özelliklerimiz */}
        <section className="legal-section">
          <div className="legal-section-head">
            <Award className="legal-icon" />
            <h2>Özelliklerimiz</h2>
          </div>
          <div className="legal-grid legal-grid--3">
            {features.map((feature) => (
              <div key={feature.title} className="legal-card">
                <div className="legal-card-head">
                  <feature.icon aria-hidden="true" />
                  <h3 className="legal-card-title">{feature.title}</h3>
                </div>
                <p className="legal-text legal-text--sm">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* İstatistikler */}
        <section className="legal-section legal-section--note">
          <div className="legal-section-head">
            <Award className="legal-icon" />
            <h2>Rakamlarla Benim Marketim</h2>
          </div>
          <div className="legal-stats">
            {stats.map((stat) => (
              <div key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default AboutPage;
