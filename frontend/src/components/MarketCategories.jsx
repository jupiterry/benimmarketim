import { Link } from "react-router-dom";
import { marketCategories } from "../data/seo";

export default function MarketCategories({ clickable = true }) {
  return (
    <section className="landing-categories" id="market-kategorileri" aria-labelledby="market-categories-title">
      <div className="landing-shell">
      <div className="landing-section-heading">
        <div>
          <span className="landing-eyebrow">DEVREK ONLINE MARKET</span>
          <h2 id="market-categories-title">Market kategorilerimiz.</h2>
        </div>
        <p className="landing-category-intro">Gıda, içecek, kahvaltılık, temizlik ve kişisel bakım ihtiyaçlarını Benim Marketim’de keşfet. Güncel ürünleri ve fiyatları mobil uygulamamızda inceleyebilir, Devrek’te adresine teslimat için sipariş verebilirsin.</p>
      </div>
      <ul className="landing-category-grid">
        {marketCategories.map((category) => (
          <li key={category.slug}>
            {clickable ? (
              <Link to={category.path} className="landing-category-card">
                <i><img src={`/${category.image}`} alt={category.name} width="80" height="80" loading="lazy" /></i>
                <h3>{category.name}</h3>
                <span>Kategoriyi keşfet →</span>
              </Link>
            ) : (
              <div className="landing-category-card" aria-label={category.name}>
                <i><img src={`/${category.image}`} alt="" width="80" height="80" loading="lazy" /></i>
                <h3>{category.name}</h3>
              </div>
            )}
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}
