import Order from "../models/order.model.js";
import { paymentMethodLabel } from "../lib/paymentMethods.js";
import Coupon from "../models/coupon.model.js";
import { processReferralFirstOrder } from "./referral.controller.js";
import User from "../models/user.model.js";
import { notifyOrderStatusChange } from "../services/orderStatusNotifier.js";
import { evaluateMissionsForUser } from "../services/mission.service.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const DELIVERED_STATUS = "Teslim Edildi";

// Referral ödülü: davet edilen kullanıcının İLK siparişi teslim edildiğinde bir kez verilir.
// (Referral belgesinde ilgili kaydın status alanı "pending" ise verilir; sonrasında "rewarded" olur.)
export const grantReferralRewardIfDelivered = async (order, previousStatus) => {
  try {
    if (!order || order.status !== DELIVERED_STATUS || previousStatus === DELIVERED_STATUS) return null;
    const deliveredBefore = await Order.countDocuments({
      user: order.user,
      status: DELIVERED_STATUS,
      _id: { $ne: order._id },
    });
    if (deliveredBefore > 0) return null; // ilk teslim edilen sipariş değil
    const result = await processReferralFirstOrder(order.user);
    if (result?.success) console.log("Referral ödülü verildi. Referrer:", result.referrerId);
    return result;
  } catch (error) {
    console.error("Referral ödülü işlenirken hata:", error.message);
    return null;
  }
};

// İptal edilen siparişin kuponunu geri açar: usedBy kaydı çıkarılır, usageCount azaltılır
export const releaseCouponForOrder = async (order) => {
  try {
    if (!order?.couponCode) return;
    const updated = await Coupon.findOneAndUpdate(
      { code: String(order.couponCode).toUpperCase().trim(), "usedBy.orderId": order._id },
      { $pull: { usedBy: { orderId: order._id } }, $inc: { usageCount: -1 } },
      { new: true }
    );
    if (!updated) return;
    // Limit dolduğu için kapatılmış bir kupon tekrar kullanılabilir hale gelir (süresi geçmemişse)
    if (
      !updated.isActive &&
      updated.usageLimit !== null &&
      updated.usageCount < updated.usageLimit &&
      updated.expirationDate > new Date()
    ) {
      await Coupon.updateOne({ _id: updated._id }, { $set: { isActive: true } });
    }
  } catch (error) {
    console.error("Kupon kullanımı geri alınırken hata:", error.message);
  }
};

export const ACTIVE_ORDER_STATUSES = ["Hazırlanıyor", "Yolda"];
const ORDER_LIST_FIELDS =
  "user products totalAmount subtotalAmount couponCode couponDiscount discountPercentage status deliveryTracking statusHistory note phone city deliveryPoint deliveryPointName paymentMethod createdAt updatedAt device";

const listQuery = (filter) =>
  Order.find(filter)
    .select(ORDER_LIST_FIELDS)
    .populate("user", "name email avatar")
    .populate("products.product", "name price image")
    .sort({ createdAt: -1 });

/** Siparişleri müşteriye göre gruplar (yanıt biçimi eskisiyle aynı) */
export const groupOrdersByUser = (orders) => {
  const groupedOrders = orders.reduce((acc, order) => {
    if (!order.user || !order.products) {
      console.log("Eksik veriler: ", order._id);
      return acc;
    }

    const userId = order.user._id.toString();
    if (!acc[userId]) {
      acc[userId] = {
        user: {
          id: order.user._id,
          name: order.user.name || "Bilinmeyen Kullanıcı",
          email: order.user.email,
          avatar: order.user.avatar || null,
          phone: order.phone,
          address: `${order.city}`,
        },
        orders: [],
      };
    }

    acc[userId].orders.push({
      orderId: order._id,
      products: order.products.map((p) => ({
        name: p.name || p.product?.name || "Bilinmeyen Ürün",
        quantity: p.quantity,
        price: p.price ?? p.product?.price ?? 0,
        image: p.image || p.product?.image || null,
        isManual: p.isManual || false,
      })),
      totalAmount: order.totalAmount,
      subtotalAmount: order.subtotalAmount || order.totalAmount,
      couponCode: order.couponCode || null,
      couponDiscount: order.couponDiscount || 0,
      discountPercentage: order.discountPercentage || 0,
      status: order.status,
      deliveryTracking: order.deliveryTracking || "",
      statusHistory: order.statusHistory || [],
      note: order.note,
      // Siparişte girilen telefon; müşteri her siparişte farklı numara verebilir
      phone: order.phone,
      city: order.city,
      deliveryPoint: order.deliveryPoint,
      deliveryPointName: order.deliveryPointName,
      paymentMethod: order.paymentMethod || null,
      paymentMethodLabel: paymentMethodLabel(order.paymentMethod),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      // Cihaz bilgisi
      device: order.device || null,
    });

    return acc;
  }, {});
  return Object.values(groupedOrders);
};

/**
 * Sipariş listesi. Seçenek verilmezse eskisi gibi TÜM siparişler döner (panoda tüm zamanlar
 * cirosu için). Sipariş ekranı yalnızca ihtiyacı olanı ister:
 *  - since:        bu tarihten sonra oluşturulanlar (örn. son 30 gün)
 *  - before+limit: bu tarihten eski en yeni `limit` sipariş ("daha eski siparişleri yükle")
 *  - active:       tarihten bağımsız tüm Hazırlanıyor / Yolda siparişleri
 *  - updatedSince: yalnızca bu andan sonra değişen siparişler (yenileme; diğerleri yok sayılır)
 */
export const getOrderAnalyticsData = async (options = {}) => {
  try {
    const { since, before, limit, active, updatedSince } = options;
    const scoped = Boolean(since || before || limit || active || updatedSince);
    const serverTime = new Date();
    const totalOrders = await Order.countDocuments();

    if (!scoped) {
      const orders = await listQuery({}).lean();
      return { totalOrders, usersOrders: groupOrdersByUser(orders) };
    }

    let orders;
    let hasMore = false;
    let oldestCreatedAt = null;
    if (updatedSince) {
      orders = await listQuery({ updatedAt: { $gt: updatedSince } }).lean();
    } else {
      const created = {};
      if (since) created.$gte = since;
      if (before) created.$lt = before;
      const recentFilter = Object.keys(created).length ? { createdAt: created } : {};
      let recentQuery = listQuery(recentFilter);
      if (limit) recentQuery = recentQuery.limit(limit + 1);
      const [recent, activeOrders] = await Promise.all([
        since || before || limit ? recentQuery.lean() : Promise.resolve([]),
        active ? listQuery({ status: { $in: ACTIVE_ORDER_STATUSES } }).lean() : Promise.resolve([]),
      ]);
      if (limit && recent.length > limit) {
        recent.length = limit;
        hasMore = true;
      }
      const oldest = recent.length ? recent[recent.length - 1].createdAt : since || before;
      if (!limit && oldest) hasMore = Boolean(await Order.exists({ createdAt: { $lt: oldest } }));
      const seen = new Set();
      orders = [...recent, ...activeOrders].filter((order) => {
        const id = order._id.toString();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      oldestCreatedAt = oldest || null;
    }

    return {
      totalOrders,
      usersOrders: groupOrdersByUser(orders),
      meta: {
        serverTime: serverTime.toISOString(),
        hasMore,
        oldestCreatedAt: oldestCreatedAt ? new Date(oldestCreatedAt).toISOString() : null,
        count: orders.length,
      },
    };
  } catch (error) {
    console.error("Siparişler alınırken hata oluştu:", error.message);
    throw error;
  }
};

// Admin sipariş durumunu günceller
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"].includes(status)) {
      return res.status(400).json({ message: "Geçersiz sipariş durumu!" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    // Admin tüm durum değişikliklerini yapabilir - kısıtlama yok

    const previousStatus = order.status;
    order.status = status;
    order.statusHistory.push({ status, changedAt: new Date(), changedBy: req.user._id });
    await order.save();
    if (previousStatus !== status) {
      recordAdminAction(req, { action: "Sipariş durumu değiştirildi", category: "order", target: String(order._id),
        targetName: `Sipariş #${String(order._id).slice(-6).toUpperCase()} · ${order.deliveryPointName || order.deliveryPoint || ""}`.trim(),
        changes: [{ label: "Durum", from: previousStatus, to: status }] });
    }

    // Müşterinin telefonuna anlık bildirim (yanıtı bekletmez, hata siparişi etkilemez)
    notifyOrderStatusChange(order, previousStatus);
    // Teslim edilen sipariş bir görevi tamamlıyorsa ödül kuponu tanımlanır (yanıtı bekletmez)
    if (status === "Teslim Edildi" && previousStatus !== status) {
      evaluateMissionsForUser(order.user, new Date(), { deliveredOrder: order });
      grantReferralRewardIfDelivered(order, previousStatus);
    }
    if (status === "İptal Edildi" && previousStatus !== status) releaseCouponForOrder(order);

    // Socket.IO ile kullanıcıya bildirim gönder
    try {
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${order.user.toString()}`).to('adminRoom').emit('orderStatusUpdated', {
                orderId: order._id,
                newStatus: status,
                message: `Sipariş durumu güncellendi: ${status}`
            });
        }
    } catch (socketError) {
        console.error('Socket.IO bildirimi gönderilirken hata:', socketError);
    }

    res.json({ message: "Sipariş durumu başarıyla güncellendi!", order });
  } catch (error) {
    console.error("Sipariş durumu güncellenirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Günlük sipariş verilerini getiren fonksiyon
export const getDailyOrdersData = async (startDate, endDate) => {
  try {
    const dailyOrdersData = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dateArray = getDatesInRange(startDate, endDate);

    return dateArray.map((date) => {
      const foundData = dailyOrdersData.find((item) => item._id === date);
      return {
        date,
        orders: foundData?.orders || 0,
        revenue: foundData?.revenue || 0,
      };
    });
  } catch (error) {
    console.error("Günlük sipariş verileri alınırken hata:", error.message);
    throw error;
  }
};

function getDatesInRange(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dates.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

// Kullanıcının siparişlerini getiren fonksiyon (admin için userId query desteği)
export const getUserOrders = async (req, res) => {
  try {
    // Sadece admin başka bir kullanıcı için sorgu yapabilir.
    const userId = req.user.role === "admin" && req.query.userId
      ? req.query.userId
      : req.user._id;
    
    const orders = await Order.find({ user: userId })
      .populate({
        path: 'products.product',
        select: 'name price image'
      })
      .sort({ createdAt: -1 });

    const formattedOrders = orders.map(order => ({
      _id: order._id,
      orderId: order._id,
      products: order.products.map(p => ({
        // Mobil "tekrar sipariş" için; ürün silinmişse null döner.
        productId: p.product?._id || null,
        name: p.product?.name || p.name || "Bilinmeyen Ürün",
        quantity: p.quantity,
        price: p.product?.price || p.price || 0,
        image: p.product?.image || p.image || null,
      })),
      totalAmount: order.totalAmount,
      subtotalAmount: order.subtotalAmount || order.totalAmount,
      couponCode: order.couponCode || null,
      couponDiscount: order.couponDiscount || 0,
      status: order.status,
      note: order.note,
      city: order.city,
      deliveryPoint: order.deliveryPoint,
      deliveryPointName: order.deliveryPointName,
      paymentMethod: order.paymentMethod || null,
      paymentMethodLabel: paymentMethodLabel(order.paymentMethod),
      phone: order.phone,
      createdAt: order.createdAt,
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error("Kullanıcı siparişleri alınırken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Sipariş iptal etme fonksiyonu
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user._id;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    // Kullanıcının kendi siparişini iptal etme kontrolü
    if (req.user.role !== "admin" && order.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bu siparişi iptal etme yetkiniz yok!" });
    }

    // Sadece "Hazırlanıyor" durumundaki siparişler iptal edilebilir
    if (order.status !== "Hazırlanıyor") {
      return res.status(400).json({ message: "Bu sipariş artık iptal edilemez!" });
    }

    order.status = "İptal Edildi";
    order.statusHistory.push({ status: "İptal Edildi", changedAt: new Date(), changedBy: req.user._id });
    await order.save();
    await releaseCouponForOrder(order);

    // Yönetim paneli müşterinin iptalini 30 sn'lik yenilemeyi beklemeden görsün
    try {
      req.app.get("io")?.to("adminRoom").emit("orderStatusUpdated", {
        orderId: order._id,
        newStatus: order.status,
        message: "Müşteri siparişi iptal etti",
      });
    } catch (socketError) {
      console.error("Socket.IO iptal bildirimi gönderilirken hata:", socketError);
    }

    res.json({ message: "Sipariş başarıyla iptal edildi!", order });
  } catch (error) {
    console.error("Sipariş iptal edilirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Siparişe özel ürün/tutar ekleme fonksiyonu
export const addCustomItemToOrder = async (req, res) => {
  try {
    const { orderId, amount, name } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ message: "Sipariş ID ve tutar zorunludur!" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    // "Diğer" veya "Özel Ürün" adında genel bir ürün bul veya oluştur
    // Bu ürün veritabanında "isHidden: true" olarak işaretlenmeli ki katalogda çıkmasın
    // Ama kodda dinamik olarak oluşturuyoruz
    let customProduct = await import("../models/product.model.js").then(m => m.default.findOne({ name: "Özel Ekleme", isHidden: true }));
    
    if (!customProduct) {
        const Product = (await import("../models/product.model.js")).default;
        customProduct = await Product.create({
            name: "Özel Ekleme",
            price: 0, // Fiyatı sipariş anında belirlenecek (aslında quantity * price mantığıyla değil, direkt tutar ekleyeceğiz)
            description: "Yönetici tarafından eklenen özel ürün/tutar",
            category: "Diğer",
            image: "", 
            isHidden: true,
            order: 9999
        });
    }

    const newItem = {
      product: customProduct._id,
      name: name || "Özel Ekleme",
      quantity: 1, // Adet her zaman 1
      price: parseFloat(amount), // Fiyat girilen tutar
      image: customProduct.image,
      isManual: true, // Manuel eklenen ürün - kar marjı hesaplamasında hariç tutulacak
    };

    // Siparişe ekle
    order.products.push(newItem);
    
    // Toplam tutarı güncelle
    order.totalAmount += parseFloat(amount);
    
    await order.save();

    res.json({ message: "Ürün siparişe başarıyla eklendi!", order });

  } catch (error) {
    console.error("Siparişe ürün eklenirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Sipariş silme fonksiyonu (Admin only) - Veritabanından kalıcı olarak siler
export const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Sipariş ID gerekli!" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    await Order.findByIdAndDelete(orderId);

    res.json({ 
      success: true,
      message: "Sipariş başarıyla silindi!",
      deletedOrderId: orderId 
    });
  } catch (error) {
    console.error("Sipariş silinirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Siparişten ürün silme fonksiyonu (Admin only)
export const removeItemFromOrder = async (req, res) => {
  try {
    const { orderId, productIndex } = req.body;

    if (!orderId || productIndex === undefined) {
      return res.status(400).json({ message: "Sipariş ID ve ürün index'i gerekli!" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    if (productIndex < 0 || productIndex >= order.products.length) {
      return res.status(400).json({ message: "Geçersiz ürün index'i!" });
    }

    // Silinecek ürünün tutarını hesapla
    const removedProduct = order.products[productIndex];
    const removedAmount = removedProduct.price * removedProduct.quantity;

    // Ürünü diziden kaldır
    order.products.splice(productIndex, 1);

    // Eğer sipariş boş kalırsa engelle
    if (order.products.length === 0) {
      return res.status(400).json({ message: "Siparişte en az bir ürün olmalı! Siparişi tamamen silmek için 'Sipariş Sil' seçeneğini kullanın." });
    }

    // Toplam tutarı güncelle
    order.totalAmount = Math.max(0, order.totalAmount - removedAmount);
    
    // Eğer subtotalAmount varsa onu da güncelle
    if (order.subtotalAmount) {
      order.subtotalAmount = Math.max(0, order.subtotalAmount - removedAmount);
    }

    await order.save();

    res.json({ 
      success: true,
      message: "Ürün siparişten başarıyla silindi!", 
      order,
      removedProduct: removedProduct.name
    });
  } catch (error) {
    console.error("Siparişten ürün silinirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Siparişteki ürün miktarını güncelleme fonksiyonu (Admin only)
export const updateItemQuantity = async (req, res) => {
  try {
    const { orderId, productIndex, newQuantity } = req.body;

    if (!orderId || productIndex === undefined || newQuantity === undefined) {
      return res.status(400).json({ message: "Sipariş ID, ürün index'i ve yeni miktar gerekli!" });
    }

    if (newQuantity < 1) {
      return res.status(400).json({ message: "Miktar en az 1 olmalı! Ürünü kaldırmak için silme işlemini kullanın." });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    if (productIndex < 0 || productIndex >= order.products.length) {
      return res.status(400).json({ message: "Geçersiz ürün index'i!" });
    }

    const product = order.products[productIndex];
    const oldQuantity = product.quantity;
    const priceDifference = product.price * (newQuantity - oldQuantity);

    // Miktarı güncelle
    order.products[productIndex].quantity = newQuantity;

    // Toplam tutarı güncelle
    order.totalAmount = Math.max(0, order.totalAmount + priceDifference);
    
    // Eğer subtotalAmount varsa onu da güncelle
    if (order.subtotalAmount) {
      order.subtotalAmount = Math.max(0, order.subtotalAmount + priceDifference);
    }

    await order.save();

    res.json({ 
      success: true,
      message: "Ürün miktarı başarıyla güncellendi!", 
      order,
      updatedProduct: product.name,
      oldQuantity,
      newQuantity
    });
  } catch (error) {
    console.error("Ürün miktarı güncellenirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Siparişe katalog ürünü ekleme fonksiyonu (Admin only)
export const addProductToOrder = async (req, res) => {
  try {
    const { orderId, productId, quantity = 1 } = req.body;

    if (!orderId || !productId) {
      return res.status(400).json({ message: "Sipariş ID ve ürün ID gerekli!" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    // Ürünü veritabanından bul
    const Product = (await import("../models/product.model.js")).default;
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı!" });
    }

    // Ürün zaten siparişte var mı kontrol et
    const existingProductIndex = order.products.findIndex(
      p => p.product && p.product.toString() === productId
    );

    if (existingProductIndex !== -1) {
      // Mevcut ürünün miktarını artır
      order.products[existingProductIndex].quantity += quantity;
    } else {
      // Yeni ürün ekle
      order.products.push({
        product: product._id,
        name: product.name,
        quantity: quantity,
        price: product.price,
        image: product.image
      });
    }

    // Toplam tutarı güncelle
    const addedAmount = product.price * quantity;
    order.totalAmount += addedAmount;
    
    // Eğer subtotalAmount varsa onu da güncelle
    if (order.subtotalAmount) {
      order.subtotalAmount += addedAmount;
    }

    await order.save();

    res.json({ 
      success: true,
      message: `${product.name} siparişe başarıyla eklendi!`, 
      order,
      addedProduct: product.name,
      addedQuantity: quantity
    });
  } catch (error) {
    console.error("Siparişe ürün eklenirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Ürünün manuel işaretini değiştirme fonksiyonu (Admin only)
export const toggleManualFlag = async (req, res) => {
  try {
    const { orderId, productIndex, isManual } = req.body;

    if (!orderId || productIndex === undefined || isManual === undefined) {
      return res.status(400).json({ message: "Sipariş ID, ürün index'i ve isManual değeri gerekli!" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    if (productIndex < 0 || productIndex >= order.products.length) {
      return res.status(400).json({ message: "Geçersiz ürün index'i!" });
    }

    // isManual değerini güncelle
    order.products[productIndex].isManual = isManual;

    await order.save();

    res.json({ 
      success: true,
      message: isManual ? "Ürün manuel olarak işaretlendi!" : "Manuel işareti kaldırıldı!",
      order,
      updatedProduct: order.products[productIndex].name,
      isManual
    });
  } catch (error) {
    console.error("Manuel işareti güncellenirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// ── Genel bakış özeti (yönetici panosu) ──────────────────────────────────────
// Tüm sipariş geçmişini belleğe çekmek yerine dönem özetini sunucuda aggregate ile hesaplar.
// Mağaza saati Türkiye (UTC+3, yaz saati yok); gün/ay sınırları buna göre alınır.
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DELAYED_PREPARING_MINUTES = 20;
export const DASHBOARD_PERIODS = ["today", "7d", "30d", "month", "all", "custom"];

const startOfTrDay = (date) => new Date(Math.floor((date.getTime() + TR_OFFSET_MS) / DAY_MS) * DAY_MS - TR_OFFSET_MS);
const startOfTrMonth = (date) => {
  const shifted = new Date(date.getTime() + TR_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - TR_OFFSET_MS);
};
const addTrMonths = (start, months) => {
  const shifted = new Date(start.getTime() + TR_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + months, 1) - TR_OFFSET_MS);
};
const parseIsoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Dönem sınırlarını üretir: { period, start, end, previous: {start, end} | null, bucket }
 *  - today: bugün 00:00'dan şimdiye (saatlik seri), önceki = dün aynı saate kadar
 *  - 7d / 30d: son N gün (bugün dahil, günlük seri), önceki = ondan önceki N gün
 *  - month: bu ayın başından (günlük seri), önceki = geçen ayın tamamı
 *  - all: sınırsız (aylık seri), karşılaştırma yok
 *  - custom: from/to (ISO; to hariç) — revenuePeriods dönemleri için; önceki = aynı uzunlukta bir önceki aralık
 */
export const buildDashboardRange = (query = {}, now = new Date()) => {
  const period = DASHBOARD_PERIODS.includes(query.period) ? query.period : "today";
  const todayStart = startOfTrDay(now);
  if (period === "today") {
    const elapsed = now.getTime() - todayStart.getTime();
    const previousStart = new Date(todayStart.getTime() - DAY_MS);
    return { period, start: todayStart, end: null, bucket: "hour", previous: { start: previousStart, end: new Date(previousStart.getTime() + elapsed) } };
  }
  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    const start = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    return { period, start, end: null, bucket: "day", previous: { start: new Date(start.getTime() - days * DAY_MS), end: start } };
  }
  if (period === "month") {
    const start = startOfTrMonth(now);
    return { period, start, end: null, bucket: "day", previous: { start: addTrMonths(start, -1), end: start } };
  }
  if (period === "custom") {
    const start = parseIsoDate(query.from);
    const end = parseIsoDate(query.to);
    if (start) {
      const effectiveEnd = end && end > start ? end : null;
      const length = (effectiveEnd || now).getTime() - start.getTime();
      const days = length / DAY_MS;
      return {
        period, start, end: effectiveEnd,
        bucket: days <= 2 ? "hour" : days <= 92 ? "day" : "month",
        previous: { start: new Date(start.getTime() - length), end: start },
      };
    }
  }
  return { period: "all", start: null, end: null, bucket: "month", previous: null };
};

const rangeMatch = (range) => {
  const createdAt = {};
  if (range.start) createdAt.$gte = range.start;
  if (range.end) createdAt.$lt = range.end;
  return Object.keys(createdAt).length ? { createdAt } : {};
};
const BUCKET_FORMAT = { hour: "%Y-%m-%dT%H", day: "%Y-%m-%d", month: "%Y-%m" };
const bucketKey = (date, bucket) => {
  const shifted = new Date(date.getTime() + TR_OFFSET_MS).toISOString();
  return bucket === "hour" ? shifted.slice(0, 13) : bucket === "day" ? shifted.slice(0, 10) : shifted.slice(0, 7);
};
/** Seriyi boş kovalarla doldurur; böylece grafik satışsız gün/saatleri de gösterir (en fazla 400 nokta) */
export const fillSeries = (rows, range, bucket, now = new Date()) => {
  const byKey = new Map(rows.map((row) => [row._id, row]));
  // Başlangıcı olmayan dönemde (tüm zamanlar) seri ilk satışla başlar
  const keyToDate = (key) => new Date(key.length === 7 ? `${key}-01T00:00:00+03:00` : key.length === 10 ? `${key}T00:00:00+03:00` : `${key}:00:00+03:00`);
  const first = range.start || (rows.length ? keyToDate(rows[0]._id) : now);
  const last = range.end ? new Date(range.end.getTime() - 1) : now;
  const series = [];
  let cursor = new Date(first.getTime());
  while (cursor <= last && series.length < 400) {
    const key = bucketKey(cursor, bucket);
    const row = byKey.get(key);
    series.push({ key, orders: row?.orders || 0, revenue: Math.round((row?.revenue || 0) * 100) / 100 });
    if (bucket === "hour") cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    else if (bucket === "day") cursor = new Date(cursor.getTime() + DAY_MS);
    else cursor = addTrMonths(startOfTrMonth(cursor), 1);
  }
  return series;
};

const periodTotalsStage = [
  { $group: {
    _id: null,
    orders: { $sum: 1 },
    cancelled: { $sum: { $cond: [{ $eq: ["$status", "İptal Edildi"] }, 1, 0] } },
    revenue: { $sum: { $cond: [{ $eq: ["$status", "İptal Edildi"] }, 0, "$totalAmount"] } },
  } },
];
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const pct = (current, previous) => (previous ? round2(((current - previous) / previous) * 100) : null);
const summarizeTotals = (row) => {
  const orders = row?.orders || 0;
  const cancelled = row?.cancelled || 0;
  const completed = orders - cancelled;
  const revenue = round2(row?.revenue);
  return { orders, cancelled, completed, revenue, averageBasket: completed ? round2(revenue / completed) : 0, cancelRate: orders ? round2((cancelled / orders) * 100) : 0 };
};

/** Model dosyası yoksa (örn. ayrı dağıtım) ilgili sayı atlanır */
const loadModel = async (path) => {
  try {
    return (await import(path)).default;
  } catch {
    return null;
  }
};
const safeCount = async (model, filter) => {
  if (!model) return null;
  try {
    return await model.countDocuments(filter);
  } catch {
    return null;
  }
};

export const computeDashboardSummary = async (query = {}, now = new Date()) => {
  const range = buildDashboardRange(query, now);
  const match = rangeMatch(range);
  const notCancelled = { status: { $ne: "İptal Edildi" } };
  const [facet] = await Order.aggregate([
    { $match: match },
    { $facet: {
      totals: periodTotalsStage,
      byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
      byDorm: [
        { $match: notCancelled },
        { $group: { _id: "$deliveryPoint", orders: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
        { $sort: { orders: -1 } },
      ],
      series: [
        { $match: notCancelled },
        { $group: { _id: { $dateToString: { format: BUCKET_FORMAT[range.bucket], date: "$createdAt", timezone: "+03:00" } }, orders: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
        { $sort: { _id: 1 } },
        { $limit: 400 },
      ],
      topProducts: [
        { $match: notCancelled },
        { $unwind: "$products" },
        { $match: { "products.isManual": { $ne: true } } },
        { $group: { _id: { $ifNull: ["$products.product", "$products.name"] }, name: { $first: "$products.name" }, quantity: { $sum: "$products.quantity" }, revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } } } },
        { $sort: { quantity: -1, revenue: -1 } },
        { $limit: 5 },
      ],
      manual: [
        { $match: notCancelled },
        { $unwind: "$products" },
        { $match: { "products.isManual": true } },
        { $group: { _id: null, revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } } } },
      ],
    } },
  ]);
  const previousRows = range.previous
    ? await Order.aggregate([{ $match: rangeMatch(range.previous) }, ...periodTotalsStage])
    : [];
  const current = summarizeTotals(facet?.totals?.[0]);
  const previous = range.previous ? summarizeTotals(previousRows[0]) : null;

  const [Product, SupportRequest] = await Promise.all([loadModel("../models/product.model.js"), loadModel("../models/supportRequest.model.js")]);
  const delayedBefore = new Date(now.getTime() - DELAYED_PREPARING_MINUTES * 60 * 1000);
  const [delayedOrders, preparingOrders, activeOrders, productsWithoutImage, productsOutOfStock, waitingSupport, totalCustomers, newCustomers, recentRows] = await Promise.all([
    Order.countDocuments({ status: "Hazırlanıyor", createdAt: { $lt: delayedBefore } }),
    Order.countDocuments({ status: "Hazırlanıyor" }),
    Order.countDocuments({ status: { $in: ACTIVE_ORDER_STATUSES } }),
    safeCount(Product, { isHidden: { $ne: true }, $or: [{ image: "" }, { image: null }, { image: { $exists: false } }] }),
    safeCount(Product, { isHidden: { $ne: true }, isOutOfStock: true }),
    safeCount(SupportRequest, { status: "waiting" }),
    safeCount(User, {}),
    range.start ? safeCount(User, rangeMatch(range)) : Promise.resolve(null),
    Order.find({}).select("user totalAmount status createdAt deliveryPoint deliveryPointName paymentMethod products").populate("user", "name avatar").sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  const statusCounts = Object.fromEntries((facet?.byStatus || []).map((row) => [row._id, row.count]));
  return {
    period: range.period,
    range: { start: range.start ? range.start.toISOString() : null, end: range.end ? range.end.toISOString() : null, bucket: range.bucket },
    generatedAt: now.toISOString(),
    totals: current,
    previous,
    delta: previous ? {
      orders: pct(current.orders, previous.orders),
      revenue: pct(current.revenue, previous.revenue),
      averageBasket: pct(current.averageBasket, previous.averageBasket),
      cancelRate: previous.orders ? round2(current.cancelRate - previous.cancelRate) : null,
    } : null,
    statusDistribution: ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"].map((status) => ({ status, count: statusCounts[status] || 0 })),
    dormDistribution: (facet?.byDorm || []).map((row) => ({ deliveryPoint: row._id || "unknown", orders: row.orders, revenue: round2(row.revenue) })),
    series: fillSeries(facet?.series || [], range, range.bucket, now),
    topProducts: (facet?.topProducts || []).map((row) => ({ productId: typeof row._id === "object" && row._id ? String(row._id) : null, name: row.name || "Bilinmeyen Ürün", quantity: row.quantity, revenue: round2(row.revenue) })),
    manualRevenue: round2(facet?.manual?.[0]?.revenue),
    customers: { total: totalCustomers, new: newCustomers },
    attention: { delayedOrders, preparingOrders, activeOrders, productsWithoutImage, productsOutOfStock, waitingSupport },
    recentOrders: recentRows.map((order) => ({
      orderId: String(order._id),
      customerName: order.user?.name || "Müşteri",
      customerAvatar: order.user?.avatar || null,
      paymentMethod: order.paymentMethod || null,
      paymentMethodLabel: paymentMethodLabel(order.paymentMethod),
      totalAmount: order.totalAmount,
      status: order.status,
      itemCount: Array.isArray(order.products) ? order.products.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0,
      deliveryPoint: order.deliveryPoint,
      deliveryPointName: order.deliveryPointName || "",
      createdAt: order.createdAt,
    })),
  };
};

// GET /orders-analytics/summary?period=today|7d|30d|month|all  (custom: &from=ISO&to=ISO)
export const getDashboardSummary = async (req, res) => {
  try {
    const summary = await computeDashboardSummary(req.query);
    res.set("Cache-Control", "no-store");
    res.json({ summary });
  } catch (error) {
    console.error("Pano özeti hesaplanırken hata:", error.message);
    res.status(500).json({ message: "Pano özeti hesaplanamadı", error: error.message });
  }
};
