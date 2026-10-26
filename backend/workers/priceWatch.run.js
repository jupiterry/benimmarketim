import { startPriceWatchWorker } from "./priceWatch.worker.js";
import dotenv from "dotenv";
import { extractPagePrice, fetchProductPage, marketOf, matchProduct } from "../services/marketPrice.service.js";
import { camgozSettings, describeCamgozError, findCamgozPrices } from "../services/camgoz.service.js";
import { describeMarketfiyatiError, findMarketfiyatiPrices, marketfiyatiSettings } from "../services/marketfiyati.service.js";

// pm2 start backend/workers/priceWatch.run.js --name benimmarketim-price-watch --time
// Deneme (3 ürün kontrol edip çıkar): node backend/workers/priceWatch.run.js --deneme
// Tek sayfa denemesi: node backend/workers/priceWatch.run.js --sayfa=https://www.sokmarket.com.tr/...-p-123 --ad="Ürün adı 65 g"
// Camgöz denemesi (kredi harcar: isimle ~12, barkodla ~2): node backend/workers/priceWatch.run.js --camgoz="Eti Sütlü Kare Çikolata 65 g"
// Market Fiyatı denemesi (ücretsiz, veritabanı gerekmez): node backend/workers/priceWatch.run.js --marketfiyati="Pınar Süt 1 L" [--barkod=869...]
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}`))?.split("=").slice(1).join("=");

const checkPage = async (url, name) => {
  if (!marketOf(url)) throw new Error("Bu adres desteklenen bir market ürün sayfası değil.");
  const found = extractPagePrice(await fetchProductPage(url));
  if (!found) {
    console.log("Sayfada fiyat okunamadı.");
    return;
  }
  console.log(`Sayfadaki ürün: ${found.name}\nFiyat: ₺${found.price} (okuma yolu: ${found.method})`);
  if (name) {
    const match = matchProduct(name, found.name);
    console.log(match.ok ? `Eşleşme: evet (${match.confidence === "high" ? "gramaj tuttu" : match.reason})` : `Eşleşme: hayır — ${match.reason}`);
  }
};

const checkCamgoz = async (query) => {
  dotenv.config();
  const settings = camgozSettings();
  if (!settings.apiKey) throw new Error("JOJAPI_API_KEY tanımlı değil.");
  try {
    const result = await findCamgozPrices(query, { settings });
    console.log(`Harcanan kredi: ${result.credits || "?"}`);
    console.log(result.matchedName ? `Eşleşen ürün: ${result.matchedName} (barkod ${result.barcode})` : "Eşleşen ürün yok.");
    for (const offer of result.offers) console.log(`  ✓ ${offer.source}: ₺${offer.price} (${offer.readAt.toLocaleDateString("tr-TR")}) ${offer.title}`);
    for (const item of result.rejected) console.log(`  ✗ ${item.source}: ${item.reason} — ${item.title}`);
    console.log(result.offers.length ? `Piyasa: ₺${result.median}${result.confidence === "low" ? ` (emin değil: ${result.note})` : ""}` : result.note);
  } catch (error) {
    throw new Error(describeCamgozError(error), { cause: error });
  }
};

const checkMarketfiyati = async (query, barcode) => {
  dotenv.config();
  const settings = marketfiyatiSettings();
  console.log(`Konum ${settings.latitude}, ${settings.longitude} · ${settings.distanceKm} km · son ${settings.maxAgeDays} gün`);
  try {
    const result = await findMarketfiyatiPrices(query, { settings, barcode: barcode || null, trustedBarcode: Boolean(barcode), useCache: false });
    console.log(`İstek sayısı: ${result.requests}`);
    console.log(result.matchedName ? `Eşleşen ürün: ${result.matchedName} (id ${result.productId})` : "Eşleşen ürün yok.");
    for (const offer of result.offers) console.log(`  ✓ ${offer.source}: ₺${offer.price} (${offer.readAt.toLocaleDateString("tr-TR")}) ${offer.note}`);
    for (const item of result.rejected) console.log(`  ✗ ${item.source}: ${item.reason}`);
    console.log(result.offers.length ? `Piyasa: ₺${result.median}${result.confidence === "low" ? ` (emin değil: ${result.note})` : result.note ? ` — ${result.note}` : ""}` : result.note);
  } catch (error) {
    throw new Error(`${describeMarketfiyatiError(error)}${error.status ? ` [HTTP ${error.status}]` : ""}`, { cause: error });
  }
};

const page = arg("sayfa");
const marketfiyatiQuery = arg("marketfiyati");
const camgozQuery = arg("camgoz");
const trialArg = process.argv.find((item) => item.startsWith("--deneme"));
const trial = trialArg ? Math.min(20, Math.max(1, Number(trialArg.split("=")[1]) || 3)) : 0;
const job = marketfiyatiQuery ? checkMarketfiyati(marketfiyatiQuery, arg("barkod")) : camgozQuery ? checkCamgoz(camgozQuery) : page ? checkPage(page, arg("ad")) : startPriceWatchWorker({ trial });
job
  .then(() => { if (trial || page || camgozQuery || marketfiyatiQuery) process.exit(0); })
  .catch((error) => {
    console.error("Fiyat bekçisi çalışamadı:", error?.message || "", "— MONGO_URI, JOJAPI_API_KEY ve SEARXNG_URL ayarlarını kontrol edin.");
    process.exit(1);
  });
