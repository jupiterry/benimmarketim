import express from "express";
import Product from "../models/product.model.js";

const router = express.Router();

// XML Sitemap endpoint
router.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || "https://benimmarketim.com";
    
    // Tüm ürünleri al
    const products = await Product.find({ isHidden: { $ne: true } })
      .select("_id name category updatedAt")
      .lean();
    
    // Kategorileri benzersiz olarak al
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    
    // Statik sayfalar
    const staticPages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/hakkimizda", priority: "0.8", changefreq: "monthly" },
      { url: "/iletisim", priority: "0.8", changefreq: "monthly" },
      { url: "/sss", priority: "0.7", changefreq: "monthly" },
      { url: "/gizlilik", priority: "0.5", changefreq: "yearly" },
      { url: "/kvkk", priority: "0.5", changefreq: "yearly" },
      { url: "/kullanim-kosullari", priority: "0.5", changefreq: "yearly" },
    ];
    
    // XML oluştur
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
    
    // Statik sayfaları ekle
    for (const page of staticPages) {
      xml += `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    }
    
    // Kategori sayfalarını ekle
    for (const category of categories) {
      xml += `  <url>
    <loc>${baseUrl}/${encodeURIComponent(category.toLowerCase())}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
`;
    }
    
    // Ürün sayfalarını ekle (eğer ürün detay sayfanız varsa)
    // for (const product of products) {
    //   const lastmod = product.updatedAt ? new Date(product.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    //   xml += `  <url>
    //     <loc>${baseUrl}/urun/${product._id}</loc>
    //     <lastmod>${lastmod}</lastmod>
    //     <changefreq>weekly</changefreq>
    //     <priority>0.6</priority>
    //   </url>
    // `;
    // }
    
    xml += `</urlset>`;
    
    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (error) {
    console.error("Sitemap oluşturulurken hata:", error);
    res.status(500).send("Sitemap oluşturulamadı");
  }
});

// robots.txt endpoint
router.get("/robots.txt", (req, res) => {
  const baseUrl = process.env.FRONTEND_URL || "https://benimmarketim.com";
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /panel
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;
  res.header("Content-Type", "text/plain");
  res.send(robotsTxt);
});

export default router;
