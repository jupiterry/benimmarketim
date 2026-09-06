import { Link } from "react-router-dom";
import { marketCategories } from "../data/seo";

export default function MarketCategories() {
  return (
    <section className="landing-categories landing-shell" id="market-kategorileri" aria-labelledby="market-categories-title">
      <span className="landing-eyebrow">DEVREK ONLINE MARKET</span>
      <h2 id="market-categories-title">Market kategorilerimiz.</h2>
      <p className="landing-category-intro">Gıda, içecek, kahvaltılık, temizlik ve kişisel bakım ihtiyaçlarını Benim Marketim’de keşfet. Güncel ürünleri ve fiyatları mobil uygulamamızda inceleyebilir, Devrek’te adresine teslimat için sipariş verebilirsin.</p>
      <ul className="landing-category-grid">
        {marketCategories.map((category) => (
          <li key={category.slug}>
            <Link to={category.path}>
              <img src={`/${category.image}`} alt={category.name} width="80" height="80" loading="lazy" />
              <h3>{category.name}</h3>
              <span>Kategoriyi keşfet →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
