import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marketCategories, publicPages, siteUrl } from "../src/data/seo.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
const template = await readFile(resolve(dist, "index.html"), "utf8");
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
  const urls = [...publicPages, ...marketCategories.map((category) => category.path)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${siteUrl}${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(resolve(dist, 'sitemap.xml'), sitemap);
  await writeFile(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /secret-dashboard\nDisallow: /bulk-upload\nSitemap: ${siteUrl}/sitemap.xml\n`);
  console.log(`Prerendered ${marketCategories.length + 1} public pages and generated sitemap (${urls.length} URLs).`);
} finally {
  await server.close();
}
