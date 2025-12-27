import Order from "../models/order.model.js";
import User from "../models/user.model.js";

// Tüm siparişleri getirirken "status" bilgisini de ekleyelim
export const getOrderAnalyticsData = async () => {
  try {
    const totalOrders = await Order.countDocuments();
    const orders = await Order.find()
      .populate("user", "name email")
      .populate("products.product", "name price image")
      .sort({ createdAt: -1 });

    const groupedOrders = orders.reduce((acc, order) => {
      if (!order.user || !order.products) {
        console.log("Eksik veriler: ", order);
        return acc;
      }

      const userId = order.user._id.toString();
      if (!acc[userId]) {
        acc[userId] = {
          user: {
            id: order.user._id,
            name: order.user.name || "Bilinmeyen Kullanıcı",
            email: order.user.email,
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
        })),
        totalAmount: order.totalAmount,
        subtotalAmount: order.subtotalAmount || order.totalAmount,
        couponCode: order.couponCode || null,
        couponDiscount: order.couponDiscount || 0,
        discountPercentage: order.discountPercentage || 0,
        status: order.status,
        note: order.note,
        city: order.city,
        deliveryPoint: order.deliveryPoint,
        deliveryPointName: order.deliveryPointName,
        createdAt: order.createdAt,
      });

      return acc;
    }, {});

    return {
      totalOrders,
      usersOrders: Object.values(groupedOrders),
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

    // Eğer sipariş zaten teslim edilmiş veya iptal edilmişse, durumu değiştirilemez
    if (order.status === "Teslim Edildi" || order.status === "İptal Edildi") {
      return res.status(400).json({ message: "Bu siparişin durumu artık değiştirilemez!" });
    }

    // Yolda olan bir sipariş sadece teslim edildi olarak işaretlenebilir
    if (order.status === "Yolda" && status !== "Teslim Edildi") {
      return res.status(400).json({ message: "Yoldaki sipariş sadece teslim edildi olarak işaretlenebilir!" });
    }

    order.status = status;
    await order.save();

    // Socket.IO ile kullanıcıya bildirim gönder
    try {
        const io = req.app.get('io');
        if (io) {
            io.emit('orderStatusUpdated', {
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
    // Admin userId query parametresi gönderebilir, yoksa kendi userId'sini kullan
    const userId = req.query.userId || req.user._id;
    
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
    if (!req.user.isAdmin && order.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bu siparişi iptal etme yetkiniz yok!" });
    }

    // Sadece "Hazırlanıyor" durumundaki siparişler iptal edilebilir
    if (order.status !== "Hazırlanıyor") {
      return res.status(400).json({ message: "Bu sipariş artık iptal edilemez!" });
    }

    order.status = "İptal Edildi";
    await order.save();

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
      image: customProduct.image
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