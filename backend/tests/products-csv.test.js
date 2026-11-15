// CSV ile toplu ürün yükleme: satır satır doğrulama, Türkçe ondalık, kategori eşleme, kopya ayıklama ve
// panelin beklediği yanıt ({ success, created, skipped, duplicates }). Veritabanı yok: modeller taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import AdminAudit from "../models/adminAudit.model.js";
import Product from "../models/product.model.js";
import {
  CSV_HEADERS, CSV_MAX_BYTES, CSV_MAX_ROWS, decodeCsvBuffer, detectDelimiter, parseCsvBoolean, parseCsvText,
  productNameKey, resolveCategory, validateProductCsv,
} from "../services/productCsv.service.js";
import { PRODUCT_CATEGORIES } from "../services/productAssist.service.js";
import { bulkUploadProducts } from "../controllers/productImport.controller.js";
import {
  CATEGORIES, IMPORT_HEADERS, IMPORT_MAX_MB, buildImportTemplate,
} from "../../frontend/src/components/products/productUtils.js";

const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const BOM = String.fromCharCode(0xfeff);
const csv = (lines, { bom = false, eol = "\r\n" } = {}) => Buffer.from((bom ? BOM : "") + lines.join(eol), "utf8");
const HEADER = "name;description;price;image;category;isOutOfStock;isHidden;discountedPrice";

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const chain = (result) => {
  const c = { select() { return c; }, lean: async () => result };
  return c;
};
const fakeIo = () => {
  const events = [];
  return { events, to(room) { return { emit: (name, payload) => events.push({ room, name, payload }) }; } };
};
const uploadRequest = (buffer, io) => ({
  user: ADMIN, method: "POST", originalUrl: "/api/products/bulk-upload",
  file: buffer ? { buffer, originalname: "urunler.csv" } : undefined,
  app: { get: (key) => (key === "io" ? io : undefined) },
});

test("CSV okuma: ayırıcı algılama, tırnaklı alan, BOM ve satır sonları", () => {
  assert.equal(detectDelimiter("name;price;category"), ";");
  assert.equal(detectDelimiter("name,price,category"), ",");
  assert.equal(detectDelimiter("name\tprice\tcategory"), "\t");
  assert.equal(detectDelimiter('"a;b",price,category'), ",", "tırnak içindeki ayırıcı sayılmaz");
  assert.deepEqual(parseCsvText('a;b;c\r\n"x;1";"y ""z""";\n\nson'), [["a", "b", "c"], ["x;1", 'y "z"', ""], [""], ["son"]]);
  assert.deepEqual(parseCsvText('ad,not\n"çok\nsatırlı",2'), [["ad", "not"], ["çok\nsatırlı", "2"]]);
  assert.equal(decodeCsvBuffer(Buffer.from(`${BOM}name`, "utf8")), "name");
  // Excel'in Türkçe Windows'ta kaydettiği dosya (Windows-1254): ş = 0xFE, ü = 0xFC, ı = 0xFD
  assert.equal(decodeCsvBuffer(Buffer.from([0x53, 0xfc, 0x74, 0x20, 0xfe, 0x69, 0xfe, 0x65, 0x73, 0x69, 0x20, 0x49, 0xfd])), "Süt şişesi Iı");
});

test("kategori: kod ya da ad kabul edilir; evet/hayır değerleri", () => {
  assert.equal(resolveCategory("sut"), "sut");
  assert.equal(resolveCategory("/sut"), "sut");
  assert.equal(resolveCategory(" SUT "), "sut");
  assert.equal(resolveCategory("Süt & Süt Ürünleri"), "sut");
  assert.equal(resolveCategory("süt & süt ürünleri"), "sut");
  assert.equal(resolveCategory("ÇAY VE ŞEKERLER"), "cayseker");
  assert.equal(resolveCategory("meyve-sebze"), "meyve-sebze");
  assert.equal(resolveCategory("içecek"), null);
  assert.equal(resolveCategory(""), null);
  for (const category of PRODUCT_CATEGORIES) {
    assert.equal(resolveCategory(category.slug), category.slug);
    assert.equal(resolveCategory(category.name), category.slug);
  }
  assert.deepEqual(CATEGORIES.map((c) => c.slug), PRODUCT_CATEGORIES.map((c) => c.slug), "panel ve sunucu aynı kategori listesini kullanır");

  for (const yes of ["true", "TRUE", "1", "evet", "Evet", "EVET", "x", "Tükendi", "Stokta yok", "Gizli"]) assert.equal(parseCsvBoolean(yes), true, yes);
  for (const no of ["", "  ", "false", "0", "hayır", "HAYIR", "Hayir", "Stokta", "Görünür"]) assert.equal(parseCsvBoolean(no), false, no);
  assert.equal(parseCsvBoolean("belki"), undefined);
});

test("ad karşılaştırma: Türkçe büyük/küçük harf duyarsız", () => {
  assert.equal(productNameKey("PINAR SÜT 1 L"), productNameKey("pınar süt 1 l"));
  assert.equal(productNameKey("  Işık   Çay "), productNameKey("ışık çay"));
  assert.equal(productNameKey("İÇECEK"), productNameKey("içecek"));
  assert.equal(productNameKey("KIVI"), productNameKey("Kivi"), "Türkçe klavye olmadan yazılan ad");
  assert.notEqual(productNameKey("Süt 1 L"), productNameKey("Süt 2 L"));
});

test("satır satır doğrulama: geçerli satırlar eklenir, hatalılar satır numarası ve nedeniyle atlanır", () => {
  const file = csv([
    HEADER,
    "Pınar Süt 1 L;Tam yağlı;42,50;;sut;hayır;hayır;39,90", // 2: geçerli, indirimli
    ";;10;;sut;;;", // 3: ad yok
    "Ekmek;;abc;;gida;;;", // 4: fiyat anlaşılamadı
    "Simit;;0;;gida;;;", // 5: fiyat 0
    "Peynir;;120;;mandira;;;", // 6: kategori yok
    "Zeytin;;80;;Kahvaltılık Ürünler;evet;evet;", // 7: geçerli, kategori adıyla
    "Bal;;200;;kahvalti;;;250", // 8: indirimli fiyat fiyattan yüksek
    "Çay;;90.75;resim.png;cayseker;;;", // 9: görsel bağlantısı geçersiz
    "Kola;;35;;icecekler;belki;;", // 10: evet/hayır anlaşılamadı
    ";;;;;;;", // 11: boş satır (sayılmaz)
    "Su;;;;icecekler;;;", // 12: fiyat boş
    "Tuz;;1.250,50;https://ornek.com/tuz.jpg;gida;;;", // 13: geçerli, binlik ayırıcı
    "Un;;45;;;;;", // 14: kategori boş
  ], { bom: true });
  const result = validateProductCsv(file, []);
  assert.equal(result.error, undefined);
  assert.equal(result.total, 12);
  assert.deepEqual(result.valid.map((v) => v.row), [2, 7, 13]);
  assert.deepEqual(result.valid[0].doc, {
    name: "Pınar Süt 1 L", description: "Tam yağlı", price: 42.5, image: "", category: "sut",
    isOutOfStock: false, isHidden: false, isDiscounted: true, discountedPrice: 39.9,
  });
  assert.deepEqual(result.valid[1].doc, {
    name: "Zeytin", description: "", price: 80, image: "", category: "kahvalti",
    isOutOfStock: true, isHidden: true, isDiscounted: false, discountedPrice: null,
  });
  assert.equal(result.valid[2].doc.price, 1250.5);
  assert.equal(result.valid[2].doc.image, "https://ornek.com/tuz.jpg");

  const reasons = Object.fromEntries(result.skipped.map((s) => [s.row, s.reason]));
  assert.deepEqual(Object.keys(reasons).map(Number), [3, 4, 5, 6, 8, 9, 10, 12, 14]);
  assert.match(reasons[3], /Ürün adı boş/);
  assert.match(reasons[4], /Fiyat anlaşılamadı: “abc”/);
  assert.match(reasons[5], /0'dan büyük/);
  assert.match(reasons[6], /Kategori tanınmadı: “mandira”/);
  assert.match(reasons[8], /İndirimli fiyat, fiyattan düşük olmalı/);
  assert.match(reasons[9], /Görsel bağlantısı/);
  assert.match(reasons[10], /isOutOfStock anlaşılamadı/);
  assert.match(reasons[12], /Fiyat boş/);
  assert.match(reasons[14], /Kategori boş/);
  assert.equal(result.skipped.find((s) => s.row === 4).name, "Ekmek");
  assert.deepEqual(result.duplicates, []);
});

test("belirsiz binlik yazımı (1.250) yanlış fiyatla eklenmez, satır atlanır", () => {
  const result = validateProductCsv(csv([
    "name;price;category;discountedPrice",
    "Zeytinyağı 5 L;1.250;gida;", // 2: 1250 mi, 1,25 mi?
    "Pirinç 5 kg;1.250,00;gida;", // 3: açık: 1250
    "Sakız;1,25;gida;", // 4: açık: 1,25
    "Bal;1250;kahvalti;1.100", // 5: indirimli fiyat belirsiz
    "Çay;12.5;cayseker;", // 6: açık: 12,5
  ]), []);
  assert.deepEqual(result.valid.map((v) => [v.row, v.doc.price]), [[3, 1250], [4, 1.25], [6, 12.5]]);
  assert.deepEqual(result.skipped.map((s) => s.row), [2, 5]);
  assert.match(result.skipped[0].reason, /Fiyat belirsiz: “1\.250”/);
  assert.match(result.skipped[1].reason, /İndirimli fiyat belirsiz/);
});

test("kopyalar: katalogda ya da dosyada daha önce geçen ad eklenmez", () => {
  const file = csv([
    "name,price,category",
    "Pınar Süt 1 L,42.5,sut", // 2: katalogda var (büyük/küçük harf farkı)
    "Ekmek,10,gida", // 3: geçerli
    "EKMEK,12,gida", // 4: dosyada 3. satırla aynı
    "  ekmek  ,12,gida", // 5: dosyada 3. satırla aynı
    "Simit,8,gida", // 6: geçerli
  ]);
  const result = validateProductCsv(file, ["PINAR SÜT 1 L", "Ayran", null]);
  assert.deepEqual(result.valid.map((v) => [v.row, v.doc.name]), [[3, "Ekmek"], [6, "Simit"]]);
  assert.deepEqual(result.duplicates, [
    { row: 2, name: "Pınar Süt 1 L", of: "catalog" },
    { row: 4, name: "EKMEK", of: "file", firstRow: 3 },
    { row: 5, name: "ekmek", of: "file", firstRow: 3 },
  ]);
  assert.deepEqual(result.skipped, []);
});

test("başlık: Türkçe başlıklar ve dışa aktarılan dosyanın sütunları tanınır; eksik zorunlu sütun açıkça söylenir", () => {
  const turkish = validateProductCsv(csv([
    "Ürün;Kategori;Fiyat;İndirimli fiyat;Stok;Görünürlük",
    "Ayran 1 L;Süt & Süt Ürünleri;25,00;;Stokta yok;Gizli",
  ]), []);
  assert.deepEqual(turkish.valid[0].doc, {
    name: "Ayran 1 L", description: "", price: 25, image: "", category: "sut",
    isOutOfStock: true, isHidden: true, isDiscounted: false, discountedPrice: null,
  });

  const missing = validateProductCsv(csv(["name;description", "Süt;iyi"]), []);
  assert.match(missing.error, /eksik: price, category/);
  assert.match(validateProductCsv(Buffer.from(""), []).error, /Dosya boş/);
  assert.match(validateProductCsv(csv([HEADER]), []).error, /ürün satırı yok/);

  const tooMany = validateProductCsv(csv(["name,price,category", ...Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `Ürün ${i},5,gida`)]), []);
  assert.match(tooMany.error, new RegExp(`en fazla ${CSV_MAX_ROWS}`));
  const limit = validateProductCsv(csv(["name,price,category", ...Array.from({ length: CSV_MAX_ROWS }, (_, i) => `Ürün ${i},5,gida`)]), []);
  assert.equal(limit.valid.length, CSV_MAX_ROWS);
});

test("uç: geçerli satırları ekler ve panelin beklediği yanıtı döner", async (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (entry) => { writes.push(entry); return entry; });
  t.mock.method(Product, "find", () => chain([{ name: "Ayran" }]));
  const insertMany = t.mock.method(Product, "insertMany", async (docs) => docs.map((d, i) => ({ _id: `id${i}`, ...d })));
  const io = fakeIo();

  const res = response();
  await bulkUploadProducts(uploadRequest(csv([
    HEADER,
    "Süt;;42,50;;sut;evet;;39,90",
    "Ayran;;25;;sut;;;",
    "Ekmek;;-3;;gida;;;",
    "Simit;;8;;gida;;;",
  ], { bom: true }), io), res);
  await tick();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true, "panel başarıyı bu alandan anlar");
  assert.equal(res.body.created, 2);
  assert.equal(res.body.total, 4);
  assert.deepEqual(res.body.duplicates, [{ row: 3, name: "Ayran", of: "catalog" }]);
  assert.deepEqual(res.body.skipped, [{ row: 4, name: "Ekmek", reason: "Fiyat 0'dan büyük olmalı" }]);
  assert.equal(res.body.message, "2 ürün eklendi · 2 satır atlandı");

  const docs = insertMany.mock.calls[0].arguments[0];
  assert.deepEqual(docs.map((d) => d.name), ["Süt", "Simit"]);
  assert.equal(docs[0].isDiscounted, true, "indirimli fiyat verilince indirim görünür");
  assert.equal(docs[0].discountedPrice, 39.9);
  assert.equal(docs[0].isOutOfStock, true);
  assert.ok(docs[0].outOfStockSince instanceof Date, "tükendi eklenen ürünün tükenme tarihi yazılır");
  assert.equal(docs[1].outOfStockSince, null);
  assert.equal(docs[1].isDiscounted, false);

  assert.equal(writes[0].action, "CSV ile toplu ürün yükleme");
  assert.equal(writes[0].target, "2 ürün");
  assert.equal(io.events[0].name, "productsChanged");
  assert.equal(io.events[0].payload.reload, true);
});

test("uç: aynı dosya ikinci kez yüklenirse kopya ürün oluşmaz", async (t) => {
  t.mock.method(AdminAudit, "create", async (entry) => entry);
  t.mock.method(Product, "find", () => chain([{ name: "Süt" }, { name: "Simit" }]));
  const insertMany = t.mock.method(Product, "insertMany", async (docs) => docs);
  const res = response();
  await bulkUploadProducts(uploadRequest(csv([HEADER, "Süt;;42,50;;sut;;;", "Simit;;8;;gida;;;"])), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, 0);
  assert.equal(res.body.duplicates.length, 2);
  assert.equal(res.body.message, "Hiç ürün eklenmedi");
  assert.equal(insertMany.mock.callCount(), 0);
});

test("uç: dosya yok, başlık hatalı ya da kayıt hatası", async (t) => {
  t.mock.method(AdminAudit, "create", async (entry) => entry);
  t.mock.method(Product, "find", () => chain([]));
  const insertMany = t.mock.method(Product, "insertMany", async () => { throw new Error("db kapalı"); });

  const none = response();
  await bulkUploadProducts(uploadRequest(null), none);
  assert.equal(none.statusCode, 400);
  assert.equal(none.body.success, false);

  const header = response();
  await bulkUploadProducts(uploadRequest(csv(["ad soyad;telefon", "Ali;555"])), header);
  assert.equal(header.statusCode, 400);
  assert.match(header.body.message, /eksik/);
  assert.equal(insertMany.mock.callCount(), 0);

  const originalError = console.error;
  console.error = () => {};
  t.after(() => { console.error = originalError; });
  const failed = response();
  await bulkUploadProducts(uploadRequest(csv([HEADER, "Süt;;42,50;;sut;;;"])), failed);
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.success, false);
  assert.ok(!/db kapalı/.test(failed.body.message), "iç hata metni panele sızmaz");
});

test("panel şablonu: sunucunun başlıklarıyla aynı, ';' ayırıcı ve BOM ile; örnek satır sunucuda geçerli", () => {
  assert.deepEqual(IMPORT_HEADERS, CSV_HEADERS);
  assert.ok(!IMPORT_HEADERS.includes("stock"), "şemada olmayan stock sütunu yok");
  assert.equal(IMPORT_MAX_MB * 1024 * 1024, CSV_MAX_BYTES, "ekrandaki boyut sınırı sunucuyla aynı");
  const template = buildImportTemplate();
  assert.equal(template.charCodeAt(0), 0xfeff, "Excel Türkçe karakterleri doğru açsın");
  const [headerLine, exampleLine] = template.slice(1).split("\r\n");
  assert.equal(headerLine, CSV_HEADERS.join(";"));
  assert.equal(exampleLine.split(";").length, CSV_HEADERS.length);
  const result = validateProductCsv(Buffer.from(template, "utf8"), []);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].doc.isDiscounted, true);
  assert.ok(result.valid[0].doc.discountedPrice < result.valid[0].doc.price);
});
