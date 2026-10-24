import mongoose from "mongoose";
import FlashSale from "../models/flashSale.model.js";
import Product from "../models/product.model.js";
import { ensureFlashSalesSynced, rangesOverlap, releaseSale, saleStatus, syncFlashSales, syncSale } from "../services/flashSale.service.js";
import { money, recordAdminAction } from "../services/adminAudit.service.js";
import { applyWeeklyPricesToProducts } from "../services/weeklyPrice.service.js";
import { resolveUnitPrice } from "../services/productPricing.js";

const trDate = (d) => new Date(d).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const auditSale = (req, sale, productName, action, changes = []) =>
  recordAdminAction(req, { action, category: "campaign", target: String(sale.product?._id || sale.product || sale._id), targetName: productName || sale.name || "Flash sale", changes, meta: { flashSaleId: String(sale._id) } });

const withStatus = (sale, now = new Date()) => {
  const obj = typeof sale.toObject === "function" ? sale.toObject() : sale;
  return { ...obj, status: saleStatus(obj, now), cancelled: Boolean(obj.cancelledAt) };
};

// Kampanyanın ürününü diğer ürün uç noktalarıyla aynı fiyat alanlarıyla döndür (actualPrice vb.)
const withPricedProducts = async (sales) => {
  const products = sales.map((sale) => (sale.product && typeof sale.product === "object" && sale.product.price !== undefined ? sale.product : null));
  const priced = await applyWeeklyPricesToProducts(products.filter(Boolean));
  let i = 0;
  return sales.map((sale, index) => (products[index] ? { ...sale, product: priced[i++] } : sale));
};

// İstek gövdesinde süre (saat) verildiyse bitiş sunucu saatine göre hesaplanır
const parseDurationHours = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 && hours <= 24 * 60 ? hours : NaN;
};

const parseDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Aynı ürün için zaman aralığı çakışan, açık bir kampanya var mı?
const findOverlap = async (productId, start, end, excludeId = null) => {
  const query = { product: productId, isActive: true, endDate: { $gt: new Date() } };
  if (excludeId) query._id = { $ne: excludeId };
  const sales = await FlashSale.find(query);
  return sales.find((sale) => rangesOverlap(start, end, sale.startDate, sale.endDate)) || null;
};

/** Gelen alanları doğrular; hata varsa { error } döner. */
export const validateFlashSaleInput = ({ discountPercentage, startDate, endDate }, { requireAll = true } = {}) => {
  const out = {};
  if (discountPercentage !== undefined && discountPercentage !== null && discountPercentage !== "") {
    const pct = Number(discountPercentage);
    if (!Number.isFinite(pct) || pct < 1 || pct > 99) return { error: "İndirim oranı 1-99 arasında olmalı" };
    out.discountPercentage = Math.round(pct * 100) / 100;
  } else if (requireAll) return { error: "İndirim oranı gerekli" };
  if (startDate !== undefined) {
    const d = parseDate(startDate);
    if (!d) return { error: "Başlangıç tarihi geçersiz" };
    out.startDate = d;
  } else if (requireAll) return { error: "Başlangıç tarihi gerekli" };
  if (endDate !== undefined) {
    const d = parseDate(endDate);
    if (!d) return { error: "Bitiş tarihi geçersiz" };
    out.endDate = d;
  } else if (requireAll) return { error: "Bitiş tarihi gerekli" };
  return { data: out };
};

// Tüm flash sale'leri getir (yönetici)
export const getAllFlashSales = async (req, res) => {
  try {
    const flashSales = await FlashSale.find().populate("product").sort({ startDate: -1 });
    const now = new Date();
    // serverTime: panel durumları (Yayında/Planlı/Bitti) bilgisayarın saati yanlış olsa da
    // sunucu saatine göre hesaplasın
    res.json({ flashSales: flashSales.map((sale) => withStatus(sale, now)), serverTime: now.toISOString() });
  } catch (error) {
    console.error("Flash sale'ler getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Aktif flash sale'leri getir
export const getActiveFlashSales = async (req, res) => {
  try {
    // Zamanı gelen kampanyayı uygula / biteni geri al (zamanlayıcıyı beklemeden)
    await ensureFlashSalesSynced();
    const now = new Date();
    // Yalnızca fiyatı ürüne gerçekten uygulanmış kampanyalar: rozet görünüp fiyat eski kalmaz
    const flashSales = await FlashSale.find({
      isActive: true,
      applied: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    })
      .populate("product")
      .sort({ endDate: 1 });

    const live = flashSales.filter((sale) => sale.product).map((sale) => withStatus(sale, now));
    res.setHeader("Cache-Control", "no-store");
    res.json({ flashSales: await withPricedProducts(live), serverTime: now.toISOString() });
  } catch (error) {
    console.error("Aktif flash sale'ler getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Yeni flash sale oluştur
export const createFlashSale = async (req, res) => {
  try {
    const { productId, name } = req.body;
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: "Ürün seçin" });
    }
    const { data, error } = validateFlashSaleInput(req.body);
    if (error) return res.status(400).json({ message: error });

    const now = new Date();
    // "Hemen başlat": başlangıç ve bitiş sunucu saatine göre (yöneticinin bilgisayar saati
    // ileri/geri ya da saat dilimi yanlışsa kampanya saatlerce "planlı" kalmasın)
    const durationHours = parseDurationHours(req.body.durationHours);
    if (Number.isNaN(durationHours)) return res.status(400).json({ message: "Süre geçersiz" });
    if (req.body.startNow === true || req.body.startNow === "true") data.startDate = now;
    if (durationHours) data.endDate = new Date(data.startDate.getTime() + durationHours * 3600 * 1000);
    if (data.startDate >= data.endDate) {
      return res.status(400).json({ message: "Bitiş tarihi başlangıç tarihinden sonra olmalı" });
    }
    if (data.endDate <= now) {
      return res.status(400).json({ message: "Bitiş tarihi geçmiş olamaz" });
    }
    // Geçmiş başlangıç "hemen başlat" anlamına gelir
    if (data.startDate < now) data.startDate = now;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    const overlap = await findOverlap(productId, data.startDate, data.endDate);
    if (overlap) {
      return res.status(400).json({
        message: "Bu ürünün aynı tarihlerde başka bir flash sale'i var. Önce onu bitirin ya da tarihleri değiştirin.",
        existingSale: overlap,
      });
    }

    const flashSale = new FlashSale({
      product: productId,
      discountPercentage: data.discountPercentage,
      startDate: data.startDate,
      endDate: data.endDate,
      name: (name || "").trim() || `${product.name} - Flash Sale`,
    });
    await flashSale.save();
    let warning;
    try {
      await syncSale(flashSale, now);
    } catch (syncError) {
      // Kayıt durur; zamanlayıcı bir dakika içinde yeniden dener
      console.error("Flash sale ürüne uygulanamadı:", syncError.message);
      warning = "Kampanya kaydedildi ama ürüne henüz uygulanamadı; bir dakika içinde yeniden denenecek.";
    }
    auditSale(req, flashSale, product.name, "Flash sale oluşturuldu", [
      { label: "İndirim", from: "—", to: `%${flashSale.discountPercentage}` },
      { label: "Tarih", from: "—", to: `${trDate(flashSale.startDate)} – ${trDate(flashSale.endDate)}` },
    ]);

    await flashSale.populate("product");
    res.status(201).json({ message: "Flash sale başarıyla oluşturuldu", flashSale: withStatus(flashSale, now), ...(warning ? { warning } : {}) });
  } catch (error) {
    console.error("Flash sale oluşturulurken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Flash sale güncelle
export const updateFlashSale = async (req, res) => {
  try {
    const { id } = req.params;
    const flashSale = await FlashSale.findById(id);
    if (!flashSale) {
      return res.status(404).json({ message: "Flash sale bulunamadı" });
    }
    const { data, error } = validateFlashSaleInput(req.body, { requireAll: false });
    if (error) return res.status(400).json({ message: error });

    const productId = req.body.productId || String(flashSale.product);
    const start = data.startDate || flashSale.startDate;
    const end = data.endDate || flashSale.endDate;
    if (start >= end) {
      return res.status(400).json({ message: "Bitiş tarihi başlangıç tarihinden sonra olmalı" });
    }
    const overlap = await findOverlap(productId, start, end, flashSale._id);
    if (overlap) {
      return res.status(400).json({ message: "Bu ürünün aynı tarihlerde başka bir flash sale'i var.", existingSale: overlap });
    }

    const before = { pct: flashSale.discountPercentage, start: flashSale.startDate, end: flashSale.endDate, isActive: flashSale.isActive };
    // Değişiklikten önce mevcut etkisini geri al, sonra yeni duruma göre yeniden uygula
    if (flashSale.applied) await releaseSale(flashSale);

    flashSale.product = productId;
    if (data.discountPercentage) flashSale.discountPercentage = data.discountPercentage;
    flashSale.startDate = start;
    flashSale.endDate = end;
    if (req.body.name !== undefined) flashSale.name = String(req.body.name).trim();
    if (req.body.isActive !== undefined) flashSale.isActive = Boolean(req.body.isActive);
    if (flashSale.isActive) { flashSale.cancelledAt = null; flashSale.cancelledBy = ""; }
    await flashSale.save();
    await syncSale(flashSale);
    const productDoc = await Product.findById(flashSale.product).select("name").lean();
    auditSale(req, flashSale, productDoc?.name, "Flash sale düzenlendi", [
      before.pct !== flashSale.discountPercentage && { label: "İndirim", from: `%${before.pct}`, to: `%${flashSale.discountPercentage}` },
      (String(before.start) !== String(flashSale.startDate) || String(before.end) !== String(flashSale.endDate)) &&
        { label: "Tarih", from: `${trDate(before.start)} – ${trDate(before.end)}`, to: `${trDate(flashSale.startDate)} – ${trDate(flashSale.endDate)}` },
      before.isActive !== flashSale.isActive && { label: "Durum", from: before.isActive ? "Açık" : "Kapalı", to: flashSale.isActive ? "Açık" : "Kapalı" },
    ].filter(Boolean));

    await flashSale.populate("product");
    res.json({ message: "Flash sale güncellendi", flashSale: withStatus(flashSale) });
  } catch (error) {
    console.error("Flash sale güncellenirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Flash sale'i hemen bitir (yayındaysa) ya da iptal et (planlıysa). Kayıt geçmişte
// "İptal edildi" olarak kalır; ürün kampanyadan önceki fiyatına hemen döner.
// POST /api/flash-sales/:id/end  (eş: /:id/cancel)
export const endFlashSale = async (req, res) => {
  try {
    const flashSale = await FlashSale.findById(req.params.id);
    if (!flashSale) {
      return res.status(404).json({ message: "Flash sale bulunamadı" });
    }
    const now = new Date();
    const status = saleStatus(flashSale, now);
    if (status === "ended" && !flashSale.applied) {
      return res.status(400).json({ message: "Bu kampanya zaten bitmiş" });
    }
    if (flashSale.applied) await releaseSale(flashSale);
    flashSale.isActive = false;
    // Yayındaki kampanyanın gerçek bitişi şimdi; planlı kampanyanın tarihleri plan olarak kalır
    if (status === "active" && flashSale.endDate > now) flashSale.endDate = now;
    flashSale.cancelledAt = now;
    flashSale.cancelledBy = String(req.user?.name || req.user?.email || "");
    await flashSale.save();
    await flashSale.populate("product");

    const product = flashSale.product && typeof flashSale.product === "object" ? flashSale.product : null;
    const restored = product ? resolveUnitPrice(product).price : null;
    auditSale(req, flashSale, product?.name,
      status === "upcoming" ? "Planlı flash sale iptal edildi" : "Flash sale erkenden bitirildi", [
        { label: "Flash sale", from: `%${flashSale.discountPercentage}`, to: "İptal edildi" },
        ...(status === "active" && restored != null ? [{ label: "Fiyat", from: money(flashSale.appliedPrice ?? restored), to: money(restored) }] : []),
      ]);
    const [priced] = product ? await applyWeeklyPricesToProducts([product]) : [null];
    res.json({
      message: status === "upcoming" ? "Planlı kampanya iptal edildi" : "Kampanya bitirildi, ürün eski fiyatına döndü",
      flashSale: { ...withStatus(flashSale, now), ...(priced ? { product: priced } : {}) },
    });
  } catch (error) {
    console.error("Flash sale bitirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Flash sale sil
export const deleteFlashSale = async (req, res) => {
  try {
    const flashSale = await FlashSale.findById(req.params.id);
    if (!flashSale) {
      return res.status(404).json({ message: "Flash sale bulunamadı" });
    }
    // Yalnızca ürüne uygulanmış kampanyanın indirimi geri alınır; ürünün kendi indirimine dokunulmaz
    if (flashSale.applied) await releaseSale(flashSale);
    await flashSale.deleteOne();
    const productDoc = await Product.findById(flashSale.product).select("name").lean();
    auditSale(req, flashSale, productDoc?.name, "Flash sale kaydı silindi", [{ label: "İndirim", from: `%${flashSale.discountPercentage}`, to: "—" }]);
    res.json({ message: "Flash sale silindi" });
  } catch (error) {
    console.error("Flash sale silinirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Süresi dolan flash sale'leri temizle (geriye dönük uyumluluk)
export const cleanExpiredFlashSales = async () => {
  try {
    const { released } = await syncFlashSales();
    console.log(`${released} süresi dolmuş flash sale temizlendi`);
  } catch (error) {
    console.error("Flash sale temizlenirken hata:", error);
  }
};
