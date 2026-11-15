// CSV ile toplu ürün yükleme: dosyayı okur, satır satır doğrular, kopyaları ayıklar.
// Saf fonksiyonlar (veritabanı yok); denetleyici yalnızca geçerli satırları ekler.
import { PRODUCT_CATEGORIES } from "./productAssist.service.js";
import { parseMoneyInput } from "./productAdmin.service.js";
import { roundMoney, toKurus } from "./productPricing.js";

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 2000;
export const CSV_HEADERS = ["name", "description", "price", "image", "category", "isOutOfStock", "isHidden", "discountedPrice"];
const REQUIRED_HEADERS = ["name", "price", "category"];
const NAME_MAX = 160;
const DESCRIPTION_MAX = 2000;

// Türkçe büyük/küçük harf ve aksan farkı gözetmeyen karşılaştırma anahtarı (başlık, kategori, evet/hayır)
const fold = (value) => String(value ?? "")
  .toLocaleLowerCase("tr")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Ürün adı karşılaştırma anahtarı: Türkçe büyük/küçük harf duyarsız ("SÜT" = "süt", "IŞIK" = "ışık"),
 * fazla boşluk yok sayılır. I/ı/İ/i tek harf sayılır: Türkçe klavye olmadan yazılan "KIVI" ile "Kivi" aynı üründür.
 */
export const productNameKey = (name) => String(name ?? "").normalize("NFC").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/\s+/g, " ").trim();

// Başlık takma adları (şablondaki İngilizce adlar + Türkçe karşılıkları + dışa aktarılan dosyanın başlıkları)
const HEADER_ALIASES = {
  name: ["name", "ad", "urun", "urun adi", "isim"],
  description: ["description", "aciklama"],
  price: ["price", "fiyat", "satis fiyati", "liste fiyati"],
  image: ["image", "gorsel", "resim", "gorsel baglantisi"],
  category: ["category", "kategori"],
  isOutOfStock: ["isoutofstock", "tukendi", "stokta yok", "stok"],
  isHidden: ["ishidden", "gizli", "gorunurluk"],
  discountedPrice: ["discountedprice", "indirimli fiyat", "indirimli"],
};
const HEADER_LOOKUP = new Map(Object.entries(HEADER_ALIASES).flatMap(([field, names]) => names.map((n) => [n, field])));

const TRUE_WORDS = new Set(["true", "1", "evet", "e", "yes", "y", "x", "dogru", "tukendi", "stokta yok", "gizli"]);
const FALSE_WORDS = new Set(["", "false", "0", "hayir", "h", "no", "n", "yanlis", "stokta", "stokta var", "gorunur"]);
/** "evet" / "1" / "true" → true; boş / "hayır" / "0" → false; anlaşılamazsa undefined */
export const parseCsvBoolean = (value) => {
  const key = fold(value);
  if (TRUE_WORDS.has(key)) return true;
  if (FALSE_WORDS.has(key)) return false;
  return undefined;
};

// "1.250": Türkçe yazımda 1250, İngilizce yazımda 1,25 demektir. Yanlış fiyatla ürün eklemek yerine satır atlanır.
const isAmbiguousThousands = (value) => /^\d{1,3}(\.\d{3})+$/.test(String(value ?? "").replace(/\s|₺/g, "").replace(/(tl|try)$/i, ""));
const ambiguousReason = (label, value) => {
  const digits = String(value).replace(/\D/g, "");
  return `${label} belirsiz: “${value}”. ${digits} ₺ için ${digits}, kuruşlu fiyat için virgül kullanın (ör. 1,25)`;
};

const CATEGORY_BY_SLUG = new Map(PRODUCT_CATEGORIES.map((c) => [c.slug, c.slug]));
const CATEGORY_BY_NAME = new Map(PRODUCT_CATEGORIES.map((c) => [fold(c.name), c.slug]));
/** Kategori kodu ("sut", "/sut") ya da adı ("Süt & Süt Ürünleri") → kod; tanınmazsa null */
export const resolveCategory = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const slug = text.replace(/^\//, "").trim().toLowerCase();
  return CATEGORY_BY_SLUG.get(slug) || CATEGORY_BY_NAME.get(fold(text)) || null;
};

/** Dosya içeriğini metne çevirir: UTF-8 (BOM'lu/BOM'suz); değilse Excel'in Türkçe kodlaması (Windows-1254) */
export const decodeCsvBuffer = (buffer) => {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      text = new TextDecoder("windows-1254").decode(bytes);
    } catch {
      text = bytes.toString("latin1");
    }
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
};

/** Başlık satırına bakarak ayırıcıyı bulur (Excel Türkçe'de ";" kullanır) */
export const detectDelimiter = (text) => {
  const firstLine = String(text || "").split(/\r?\n/, 1)[0] || "";
  let best = ",";
  let bestCount = 0;
  for (const delimiter of [";", ",", "\t"]) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === delimiter && !quoted) count++;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
};

/** CSV metnini hücre dizilerine ayırır (tırnaklı alan, "" kaçışı, alan içi satır sonu desteklenir) */
export const parseCsvText = (text, delimiter = detectDelimiter(text)) => {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

/**
 * Dosyayı doğrular. Satır numarası Excel'deki numaradır (başlık 1, ilk ürün 2).
 * @param buffer dosya içeriği
 * @param existingNames katalogdaki ürün adları
 * @returns {{ error?: string, total: number, valid: Array<{ row, doc }>, skipped: Array<{ row, name, reason }>,
 *   duplicates: Array<{ row, name, of: "catalog"|"file", firstRow?: number }> }}
 */
export const validateProductCsv = (buffer, existingNames = []) => {
  const result = { total: 0, valid: [], skipped: [], duplicates: [] };
  const table = parseCsvText(decodeCsvBuffer(buffer));
  const headerIndex = table.findIndex((cells) => cells.some((c) => String(c).trim() !== ""));
  if (headerIndex < 0) return { ...result, error: "Dosya boş. Şablonu indirip doldurabilirsiniz." };

  const columns = table[headerIndex].map((h) => HEADER_LOOKUP.get(fold(h)) || null);
  const missing = REQUIRED_HEADERS.filter((field) => !columns.includes(field));
  if (missing.length) {
    return { ...result, error: `Başlık satırında şu sütunlar eksik: ${missing.join(", ")}. Şablondaki başlıkları kullanın.` };
  }

  const records = [];
  table.slice(headerIndex + 1).forEach((cells, i) => {
    if (cells.every((c) => String(c).trim() === "")) return; // boş satır
    const record = {};
    columns.forEach((field, c) => {
      if (field && record[field] === undefined) record[field] = String(cells[c] ?? "").trim();
    });
    records.push({ row: headerIndex + i + 2, record });
  });
  result.total = records.length;
  if (!records.length) return { ...result, error: "Dosyada başlık satırı var ama ürün satırı yok." };
  if (records.length > CSV_MAX_ROWS) {
    return { ...result, error: `Bir dosyada en fazla ${CSV_MAX_ROWS} ürün satırı olabilir (bu dosyada ${records.length}). Dosyayı bölün.` };
  }

  const catalog = new Set(existingNames.map(productNameKey).filter(Boolean));
  const seenInFile = new Map(); // ad anahtarı → ilk satır
  for (const { row, record } of records) {
    const name = record.name || "";
    const skip = (reason) => result.skipped.push({ row, name, reason });
    if (!name) { skip("Ürün adı boş"); continue; }
    if (name.length > NAME_MAX) { skip(`Ürün adı çok uzun (en fazla ${NAME_MAX} karakter)`); continue; }

    const priceNumber = parseMoneyInput(record.price ?? "");
    if (!record.price) { skip("Fiyat boş"); continue; }
    if (isAmbiguousThousands(record.price)) { skip(ambiguousReason("Fiyat", record.price)); continue; }
    if (!Number.isFinite(priceNumber)) { skip(`Fiyat anlaşılamadı: “${record.price}”`); continue; }
    const price = roundMoney(priceNumber);
    if (toKurus(price) <= 0) { skip("Fiyat 0'dan büyük olmalı"); continue; }

    if (!record.category) { skip("Kategori boş"); continue; }
    const category = resolveCategory(record.category);
    if (!category) { skip(`Kategori tanınmadı: “${record.category}”`); continue; }

    let discountedPrice = null;
    if (record.discountedPrice) {
      if (isAmbiguousThousands(record.discountedPrice)) { skip(ambiguousReason("İndirimli fiyat", record.discountedPrice)); continue; }
      const discountNumber = parseMoneyInput(record.discountedPrice);
      if (!Number.isFinite(discountNumber)) { skip(`İndirimli fiyat anlaşılamadı: “${record.discountedPrice}”`); continue; }
      discountedPrice = roundMoney(discountNumber);
      if (toKurus(discountedPrice) <= 0) { skip("İndirimli fiyat 0'dan büyük olmalı"); continue; }
      if (toKurus(discountedPrice) >= toKurus(price)) { skip("İndirimli fiyat, fiyattan düşük olmalı"); continue; }
    }

    const isOutOfStock = parseCsvBoolean(record.isOutOfStock);
    if (isOutOfStock === undefined) { skip(`isOutOfStock anlaşılamadı: “${record.isOutOfStock}” (evet ya da hayır yazın)`); continue; }
    const isHidden = parseCsvBoolean(record.isHidden);
    if (isHidden === undefined) { skip(`isHidden anlaşılamadı: “${record.isHidden}” (evet ya da hayır yazın)`); continue; }

    const image = record.image || "";
    if (image && !/^https?:\/\/\S+$/i.test(image)) { skip("Görsel bağlantısı http:// ya da https:// ile başlamalı"); continue; }
    const description = record.description || "";
    if (description.length > DESCRIPTION_MAX) { skip(`Açıklama çok uzun (en fazla ${DESCRIPTION_MAX} karakter)`); continue; }

    const key = productNameKey(name);
    if (catalog.has(key)) { result.duplicates.push({ row, name, of: "catalog" }); continue; }
    if (seenInFile.has(key)) { result.duplicates.push({ row, name, of: "file", firstRow: seenInFile.get(key) }); continue; }
    seenInFile.set(key, row);

    result.valid.push({
      row,
      doc: {
        name,
        description,
        price,
        image,
        category,
        isOutOfStock,
        isHidden,
        isDiscounted: discountedPrice !== null,
        discountedPrice,
      },
    });
  }
  return result;
};
