import Order from "../models/order.model.js";
import Product from "../models/product.model.js";

// Sipariş oluşturma fonksiyonu
export const createOrder = async (req, res) => {
  try {
    const { products, city, phone, note, deliveryPoint, deliveryPointName } = req.body;

    console.log("Sipariş oluşturma isteği:", { products, city, phone, deliveryPoint, deliveryPointName });

    // Geçerli ürünlerin olup olmadığını kontrol et
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Sepetiniz boş" });
    }

    // Geçerli şehir seçimi kontrolü
    if (!city) {
      return res.status(400).json({ message: "Lütfen il seçiniz" });
    }

    // Geçerli telefon numarası kontrolü
    if (!phone || phone.length < 10) {
      return res.status(400).json({ message: "Geçerli bir telefon numarası girin" });
    }

    // Teslimat noktası kontrolü
    if (!deliveryPoint) {
      return res.status(400).json({ message: "Lütfen teslimat noktası seçiniz" });
    }

    // Ayarları al
    const Settings = (await import("../models/settings.model.js")).default;
    const settings = await Settings.getSettings();
    
    // Teslimat noktaları kontrolü - hem kız hem erkek yurdu kapalıysa sipariş alınamaz
    const girlsDormEnabled = settings.deliveryPoints?.girlsDorm?.enabled;
    const boysDormEnabled = settings.deliveryPoints?.boysDorm?.enabled;
    
    if (!girlsDormEnabled && !boysDormEnabled) {
      return res.status(400).json({ message: "Şu anda tüm teslimat noktaları kapalı. Sipariş alınamıyor!" });
    }
    
    // Seçilen teslimat noktasının aktif olup olmadığını kontrol et
    const selectedPointEnabled = deliveryPoint === 'girlsDorm' ? girlsDormEnabled : boysDormEnabled;
    if (!selectedPointEnabled) {
      return res.status(400).json({ message: "Seçtiğiniz teslimat noktası şu anda kapalı. Lütfen başka bir nokta seçin!" });
    }

    let totalAmount = 0;

    // Ürünleri kontrol et ve sipariş için gerekli verileri oluştur
    const orderProducts = await Promise.all(
      products.map(async (p) => {
        if (!p.product) {
          throw new Error("Ürün ID'si eksik!");
        }

        const product = await Product.findById(p.product);
        if (!product) {
          throw new Error(`Ürün bulunamadı: ${p.product}`);
        }

        totalAmount += product.price * p.quantity;

        return {
          product: product._id,
          name: product.name,
          quantity: p.quantity,
          price: product.price,
        };
      })
    );

    // Yeni siparişi oluştur
    const orderData = {
      user: req.user._id,
      products: orderProducts,
      totalAmount,
      city,
      phone,
      note: note || "",
      deliveryPoint,
      deliveryPointName: deliveryPointName || ""
    };

    console.log("Oluşturulacak sipariş verisi:", orderData);

    const newOrder = new Order(orderData);

    // Siparişi kaydet
    console.log("Sipariş kaydediliyor...");
    await newOrder.save();
    console.log("Sipariş başarıyla kaydedildi:", newOrder._id);

    // Socket.IO ile admin'e bildirim gönder
    try {
        const io = req.app.get('io');
        if (!io) {
            console.error('Socket.IO nesnesi bulunamadı!');
        } else {
            console.log('Socket.IO bildirimi gönderiliyor...');
            const adminRoom = io.sockets.adapter.rooms.get('adminRoom');
            console.log('Admin odası üyeleri:', adminRoom?.size || 0);

            const notification = {
                message: 'Yeni bir sipariş geldi!',
                order: {
                    id: newOrder._id.toString(),
                    totalAmount: newOrder.totalAmount,
                    status: newOrder.status,
                    createdAt: newOrder.createdAt
                }
            };

            io.to('adminRoom').emit('newOrder', notification);
            console.log('Bildirim gönderildi:', notification);
        }
    } catch (socketError) {
        console.error('Socket.IO bildirimi gönderilirken hata:', socketError);
    }

    // Sipariş başarıyla oluşturulduğunda, kullanıcının sepetini temizle
    req.user.cartItems = [];
    await req.user.save(); // Sepeti sıfırla

    res.status(201).json({
      success: true,
      message: "Sipariş başarıyla oluşturuldu.",
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error("Sipariş oluşturulurken hata oluştu:");
    console.error("Hata mesajı:", error.message);
    console.error("Hata stack:", error.stack);
    if (error.name === 'ValidationError') {
      console.error("Validation hataları:", error.errors);
    }
    res.status(500).json({ 
      message: "Sipariş oluşturulurken hata oluştu", 
      error: error.message,
      details: error.errors || {}
    });
  }
};

// Sipariş detaylarını döndürme
export const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Siparişi ID ile bulalım
    const order = await Order.findById(orderId)
      .populate("products.product", "name price") // Ürün ismi ve fiyatını da alalım
      .populate("user", "name email"); // Kullanıcı bilgileri
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    res.status(200).json(order); // Sipariş bilgilerini gönderiyoruz
  } catch (error) {
    console.error("Sipariş detayları alınırken hata oluştu:", error);
    res.status(500).json({ message: "Sipariş detayları alınırken hata oluştu", error: error.message });
  }
};
// Admin siparişlerini listeleme

// payment.controller.js

export const getAdminOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email') // Kullanıcı bilgilerini ekleyebilirsiniz
      .populate('products.product', 'name price'); // Ürün bilgilerini ekleyebilirsiniz

    res.status(200).json(orders); // Siparişleri geri döndürüyoruz
  } catch (error) {
    console.error('Siparişler alınırken hata oluştu:', error);
    res.status(500).json({ message: 'Siparişler alınırken hata oluştu', error: error.message });
  }
};
export const getOrders = async (req, res) => {
  try {
    // MongoDB'den tüm siparişleri alıyoruz
    const orders = await Order.find().populate('user', 'name email').populate('products.product', 'name price');
    
    // Eğer sipariş bulunamazsa hata döndür
    if (!orders || orders.length === 0) {
      return res.status(404).json({ message: 'Sipariş bulunamadı' });
    }

    // Siparişleri döndürüyoruz
    res.status(200).json(orders);
  } catch (error) {
    console.error('Siparişler alınırken hata oluştu:', error);
    res.status(500).json({ message: 'Siparişler alınırken hata oluştu', error: error.message });
  }
};
