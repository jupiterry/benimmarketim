import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { marketCategories, homeTitle, siteUrl } from "../src/data/seo.js";
const dist = new URL('../dist/', import.meta.url);
for (const category of [null, ...marketCategories]) {
  const file = category ? `${category.path.slice(1)}/index.html` : 'seo-home/index.html';
  const html = await readFile(new URL(file, dist), 'utf8');
  const inlineStyles = html.match(/<style data-initial-styles>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(inlineStyles?.includes('.landing{'), `${file}: initial content missing landing styles`);
  assert.ok(html.indexOf('<style data-initial-styles>') < html.indexOf('</head>'), `${file}: styles must precede first paint`);
  assert.ok(!/<link\b[^>]*rel="stylesheet"/.test(html), `${file}: first paint must not depend on a CSS request`);
  if (!category) assert.ok(html.includes('<svg width="28" height="28"'), 'Store icons need intrinsic dimensions');
  assert.equal((html.match(/<title[^>]*>/g) ?? []).length, 1, `${file}: duplicate title`);
  assert.equal((html.match(/name="description"/g) ?? []).length, 1, `${file}: duplicate description`);
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, `${file}: duplicate canonical`);
  assert.ok(html.includes(`href="${siteUrl}${category?.path ?? '/'}"`), `${file}: canonical`);
  assert.ok(html.includes(category ? `Devrek ${category.name.replaceAll('&', '&amp;')}` : homeTitle), `${file}: title`);
  assert.ok(html.includes('<h1'), `${file}: no initial content`);
  assert.ok(!html.includes('noindex'), `${file}: blocked`);
  for (const item of marketCategories) {
    if (category) assert.ok(html.includes(`href="${item.path}"`), `${file}: missing category link`);
    else assert.ok(!html.includes(`href="${item.path}"`), `${file}: homepage category should not be clickable`);
  }
}
const sitemap = await readFile(new URL('sitemap.xml', dist), 'utf8');
assert.ok(!sitemap.includes('/hakkimizda'));
for (const item of marketCategories) assert.ok(sitemap.includes(`${siteUrl}${item.path}`));
const shell = await readFile(new URL('index.html', dist), 'utf8');
assert.ok(shell.includes('<div id="root"></div>'), 'Application routes must keep their original shell');
console.log('SEO checks passed: 20 initial HTML pages, metadata, category links, sitemap and application shell.');
