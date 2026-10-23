import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryZonesPage, marketCategories, publicPages, siteUrl } from "../src/data/seo.js";

// Teslimat bölgeleri derleme anında canlı API'den alınmaya çalışılır (SEO_API_URL ile değiştirilebilir,
// SEO_SKIP_ZONES=1 ile kapatılır). Alınamazsa sayfa bölge listesi olmadan üretilir; tarayıcı listeyi yine canlı yükler.
const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
const loadDeliveryZones = async () => {
  if (process.env.SEO_SKIP_ZONES === "1") return null;
  const api = (process.env.SEO_API_URL || siteUrl).replace(/\/$/, "");
  try {
    const [zones, settings] = await Promise.all([
      fetchJson(`${api}/api/delivery/zones`),
      fetchJson(`${api}/api/settings`).catch(() => null),
    ]);
    if (!Array.isArray(zones?.zones)) return null;
    const generalMinimum = Number(settings?.minimumOrderAmount);
    return { zones: zones.zones, freeDeliveryEverywhere: Boolean(zones.freeDeliveryEverywhere), generalMinimum: Number.isFinite(generalMinimum) ? generalMinimum : null };
  } catch (error) {
    console.warn(`Teslimat bölgeleri alınamadı (${error.message}); sayfa listesiz üretilecek.`);
    return null;
  }
};

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
let template = await readFile(resolve(dist, "index.html"), "utf8");
// Prerendered content must be styled on the first paint, even when the
// external stylesheet is delayed or unavailable. Use the actual compiled
// CSS so its reset, responsive rules and asset URLs stay in sync with React.
const stylesheetTags = [...template.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
if (!stylesheetTags.length) throw new Error("Build contains no stylesheet to inline");
for (const [tag] of stylesheetTags) {
  const href = tag.match(/href="([^"]+)"/)?.[1];
  if (!href || !/^\/assets\/[\w.-]+\.css$/.test(href)) {
    throw new Error(`Unexpected build stylesheet: ${href}`);
  }
  const css = await readFile(resolve(dist, `.${href}`), "utf8");
  if (/<\/style/i.test(css)) throw new Error("Unsafe closing style tag in compiled CSS");
  template = template.replace(tag, () => `<style data-initial-styles>${css}</style>`);
}
const pageHtml = ({ head, body }) => template
  .replace(/<title>[\s\S]*?<\/title>/g, "")
  .replace(/<meta\b[^>]*(?:name="(?:description|keywords|twitter:title|twitter:description)"|property="og:(?:title|description|url)")[^>]*>/g, "")
  // Fonksiyonla değiştirilir: gömülü CSS'teki "$&" gibi diziler değiştirme deseni sayılmasın.
  .replace('</head>', () => `${head}\n</head>`)
  .replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
const server = await createServer({ root, configFile: false, plugins: [react()], ssr: { noExternal: ["react-helmet-async"] }, server: { middlewareMode: true, watch: null }, appType: "custom" });
try {
  const { renderSeoPage } = await server.ssrLoadModule("/src/seo-render.jsx");
  for (const category of [null, ...marketCategories]) {
    const url = category?.path ?? "/";
    const { body, head } = renderSeoPage(url, category);
    // Each generated page owns its metadata; retain shared charset/viewport/social defaults.
    const html = template
      .replace(/<title>[\s\S]*?<\/title>/g, "")
      .replace(/<meta\b[^>]*(?:name="(?:description|keywords|twitter:title|twitter:description)"|property="og:(?:title|description|url)")[^>]*>/g, "")
      .replace('</head>', `${head}\n</head>`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    const directory = resolve(dist, category ? `.${url}` : "seo-home");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, "index.html"), html);
  }
  const { renderDeliveryZonesSeo } = await server.ssrLoadModule("/src/pages/deliveryZonesSeo.jsx");
  const zonesDirectory = resolve(dist, `.${deliveryZonesPage.path}`);
  await mkdir(zonesDirectory, { recursive: true });
  // Bilgi sayfalarının stili (legal.css) ayrı, tembel yüklenen bir CSS dosyasındadır; ilk boyamada
  // stilsiz görünmemesi için o dosya da sayfaya gömülür.
  const legalCss = [];
  for (const file of (await readdir(resolve(dist, "assets"))).filter((name) => name.endsWith(".css"))) {
    const css = await readFile(resolve(dist, "assets", file), "utf8");
    if (css.includes(".legal-hero") && !template.includes(css) && !/<\/style/i.test(css)) legalCss.push(css);
  }
  const zonesPage = renderDeliveryZonesSeo(deliveryZonesPage.path, await loadDeliveryZones());
  const legalStyles = legalCss.map((css) => `<style data-initial-styles>${css}</style>`).join("");
  await writeFile(resolve(zonesDirectory, "index.html"), pageHtml({ head: `${legalStyles}\n${zonesPage.head}`, body: zonesPage.body }));
  const urls = [...publicPages, ...marketCategories.map((category) => category.path)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${siteUrl}${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(resolve(dist, 'sitemap.xml'), sitemap);
  await writeFile(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /secret-dashboard\nDisallow: /bulk-upload\nSitemap: ${siteUrl}/sitemap.xml\n`);
  console.log(`Prerendered ${marketCategories.length + 2} public pages and generated sitemap (${urls.length} URLs).`);
} finally {
  await server.close();
}
