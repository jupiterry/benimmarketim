import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import MarketCategories from "../components/MarketCategories";
import { siteUrl } from "../data/seo";
import "../styles/landing.css";

export default function CategoryLandingPage({ category }) {
  const title = `Devrek ${category.name} | Benim Marketim`;
  const description = `${category.description} Benim Marketim ile Devrek, Zonguldak’ta mobil uygulamadan market siparişi ver.`;
  return (
    <main className="landing">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${siteUrl}${category.path}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${siteUrl}${category.path}`} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
      </Helmet>
      <section className="landing-hero">
        <div className="landing-shell landing-category-detail">
          <Link to="/">Benim Marketim / Market kategorileri</Link>
          <h1>Devrek’te<br /><span>{category.name}</span></h1>
          <p className="landing-intro">{category.description}</p>
          <p className="landing-intro">Hizmet bölgemiz yalnızca Devrek, Zonguldak. Siparişler Benim Marketim mobil uygulamasından verilir. Ürünlerin güncel fiyat ve stok bilgileri uygulamada yer alır.</p>
          <div className="landing-stores">
            <a className="landing-store" href="https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr" target="_blank" rel="noopener noreferrer">App Store’dan indir ↗</a>
            <a className="landing-store" href="https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app" target="_blank" rel="noopener noreferrer">Google Play’den indir ↗</a>
          </div>
          <p className="landing-intro">Adresimiz: Ağalar Mahallesi, 760. Sokak, TOKİ Konutları, No: 19 Devrek / Zonguldak.</p>
          <Link to="/#konum-ve-hizmet-bolgesi">Adres ve hizmet bölgesini incele →</Link>
        </div>
      </section>
      <MarketCategories />
    </main>
  );
}
