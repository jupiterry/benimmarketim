import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";

// Saat kontrolü için global bir önbellek tanımlayalım
global.orderHoursCache = {
  startHour: 10,
  startMinute: 0,
  endHour: 1,
  endMinute: 0,
  lastUpdated: 0
};

// Önbellek süresini 1 dakikaya indirelim
const CACHE_TTL = 60 * 1000; 

// Önbelleği hemen temizleme/yenileme fonksiyonu
export const refreshOrderHoursCache = async () => {
  try {
    const settings = await Settings.getSettings();
    console.log("Sipariş saatleri önbelleği yenileniyor:", settings);
    global.orderHoursCache = {
      startHour: settings.orderStartHour,
      startMinute: settings.orderStartMinute,
      endHour: settings.orderEndHour,
      endMinute: settings.orderEndMinute,
      lastUpdated: new Date().getTime()
    };
    return true;
  } catch (error) {
    console.error("Önbellek yenilenirken hata:", error);
    return false;
  }
};

const isWithinOrderHours = async () => {
  // Europe/Istanbul saatine göre şimdiki zamanı hesapla (sunucu UTC olsa bile)
  const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const currentTime = nowTr.getTime();

  // Önbellek süresi dolduysa veya ilk kez çağrılıyorsa veritabanından getir
  if (currentTime - global.orderHoursCache.lastUpdated > CACHE_TTL) {
    try {
      const settings = await Settings.getSettings();
      console.log("Sipariş saatleri ayarları alındı:", settings);
      global.orderHoursCache = {
        startHour: settings.orderStartHour,
        startMinute: settings.orderStartMinute,
        endHour: settings.orderEndHour,
        endMinute: settings.orderEndMinute,
        lastUpdated: currentTime
      };
    } catch (error) {
      console.error("Sipariş saatleri ayarları getirilirken hata:", error);
      // Hata durumunda önbellekteki son değerleri kullan
    }
  }

  const currentHour = nowTr.getHours();
  const currentMinute = nowTr.getMinutes();

  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const startTimeInMinutes = global.orderHoursCache.startHour * 60 + global.orderHoursCache.startMinute;
  const endTimeInMinutes = global.orderHoursCache.endHour * 60 + global.orderHoursCache.endMinute;

  console.log("Zaman Kontrolü Yapılıyor:");
  console.log(`Şuanki Zaman: ${currentHour}:${currentMinute} (${currentTimeInMinutes} dakika)`);
  console.log(`Başlangıç: ${global.orderHoursCache.startHour}:${global.orderHoursCache.startMinute} (${startTimeInMinutes} dakika)`);
  console.log(`Bitiş: ${global.orderHoursCache.endHour}:${global.orderHoursCache.endMinute} (${endTimeInMinutes} dakika)`);

  // Gece yarısını geçen saat aralığını doğru şekilde kontrol et
  let isWithinHours;
  if (startTimeInMinutes < endTimeInMinutes) {
    // Normal durum: Başlangıç saati, bitiş saatinden önce (aynı gün içinde)
    isWithinHours = currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
    console.log("Normal saat aralığı kontrolü sonucu:", isWithinHours);
  } else {
    // Gece yarısını geçen durum: (ör: 10:00'dan 01:00'a)
    isWithinHours = currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
    console.log("Gece yarısını geçen saat aralığı kontrolü sonucu:", isWithinHours);
  }

  return isWithinHours;
};

// Sipariş saati mesajını oluşturan yardımcı fonksiyon
const getOrderHoursMessage = async () => {
  try {
    const settings = await Settings.getSettings();
    console.log("Hata mesajı için sipariş saatleri:", settings);
    
    // Daha anlamlı saat ifadeleri kullanalım
    const formatHour = (hour) => {
      if (hour === 0) return "00:00";
      if (hour < 12) return `sabah ${hour}`;
      if (hour === 12) return "öğlen 12";
      if (hour < 17) return `öğleden sonra ${hour}`;
      if (hour < 21) return `akşam ${hour}`;
      return `gece ${hour}`;
    };
    
    return `Siparişler sadece ${formatHour(settings.orderStartHour)}:${settings.orderStartMinute.toString().padStart(2, '0')} ile ${formatHour(settings.orderEndHour)}:${settings.orderEndMinute.toString().padStart(2, '0')} arasında verilebilir.`;
  } catch (error) {
    console.error("Sipariş saatleri mesajı oluşturulurken hata:", error);
    return "Siparişler sadece belirlenen saatler arasında verilebilir.";
  }
};

export const addToCart = async (req, res) => {
  try {
	if (!await isWithinOrderHours()) {
		return res.status(400).json({ error: await getOrderHoursMessage() });
	  }
    const { productId, quantity = 1 } = req.body; // 🚀 `quantity` eksikse 1 olarak ayarla
    const user = req.user;

    if (!productId) {
      return res.status(400).json({ error: "Ürün ID eksik!" });
    }

    if (isNaN(quantity) || quantity <= 0) {
      console.log("HATA: Geçersiz miktar!", quantity);
      return res.status(400).json({ error: "Geçersiz miktar!" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Ürün bulunamadı!" });
    }

    // Kullanıcının sepetindeki ürünleri kontrol et
    const existingItem = user.cartItems.find((item) => item.product.toString() === productId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      user.cartItems.push({ product: productId, quantity });
    }

    await user.save();
    res.status(200).json(user.cartItems);
  } catch (error) {
    console.error("Sepete ürün eklerken hata oluştu:", error.message);
    res.status(500).json({ message: "Sepete ürün eklenirken hata oluştu", error: error.message });
  }
};

// ✅ Sepetteki ürünleri getiren fonksiyon
export const getCartProducts = async (req, res) => {
  try {
    const validCartItems = req.user.cartItems.filter((item) => item.product);
    const products = await Product.find({ _id: { $in: validCartItems.map((item) => item.product) } });

    const cartItems = products.map((product) => {
      const item = validCartItems.find((cartItem) => cartItem.product.toString() === product._id.toString());
      return { ...product.toJSON(), quantity: item.quantity };
    });

    res.json(cartItems);
  } catch (error) {
    console.error("Error in getCartProducts controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Sepetteki tüm ürünleri kaldırma fonksiyonu
export const removeAllFromCart = async (req, res) => {
  try {
    const { productId } = req.body;
    const user = req.user;

    if (!productId) {
      user.cartItems = [];
    } else {
      user.cartItems = user.cartItems.filter((item) => item.product.toString() !== productId);
    }

    await user.save();
    res.json(user.cartItems);
  } catch (error) {
    console.error("Error in removeAllFromCart controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Sepetteki ürün miktarını güncelleyen fonksiyon
export const updateQuantity = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { quantity } = req.body;
    const user = req.user;

    const existingItem = user.cartItems.find((item) => item.product && item.product.toString() === productId);

    if (existingItem) {
      if (quantity === 0) {
        user.cartItems = user.cartItems.filter((item) => item.product.toString() !== productId);
        await user.save();
        return res.json(user.cartItems);
      }

      existingItem.quantity = quantity;
      await user.save();
      res.json(user.cartItems);
    } else {
      res.status(404).json({ message: "Product not found in cart" });
    }
  } catch (error) {
    console.error("Error in updateQuantity controller:", error.message);
    res.status(500).json({ message: "Error updating quantity", error: error.message });
  }
};

// ✅ Sipariş oluşturma fonksiyonu
export const placeOrder = async (req, res) => {
	try {
	  // Saat kontrolü
	  if (!await isWithinOrderHours()) {
		return res.status(400).json({ error: await getOrderHoursMessage() });
	  }
  
	  const { products, city, phone, note, deliveryPoint, deliveryPointName } = req.body;
  
	  console.log("Sipariş oluşturma isteği:", { products: products?.length, city, phone, deliveryPoint, deliveryPointName });

	  // Sepet boş mu kontrolü
	  if (!products || products.length === 0) {
		return res.status(400).json({ error: "Sepet boş!" });
	  }
  
	  // Şehir ve telefon numarası zorunlu alanlar
	  if (!city || !phone) {
		return res.status(400).json({ error: "Şehir ve telefon numarası zorunludur!" });
	  }

	  // Teslimat noktası kontrolü
	  if (!deliveryPoint) {
		return res.status(400).json({ error: "Lütfen teslimat noktası seçiniz!" });
	  }

	  // Ayarları al
	  const settings = await Settings.getSettings();
	  
	  // Teslimat noktaları kontrolü - hem kız hem erkek yurdu kapalıysa sipariş alınamaz
	  const girlsDormEnabled = settings.deliveryPoints?.girlsDorm?.enabled;
	  const boysDormEnabled = settings.deliveryPoints?.boysDorm?.enabled;
	  
	  if (!girlsDormEnabled && !boysDormEnabled) {
		return res.status(400).json({ error: "Şu anda tüm teslimat noktaları kapalı. Sipariş alınamıyor!" });
	  }
	  
	  // Seçilen teslimat noktasının aktif olup olmadığını kontrol et
	  const selectedPointEnabled = deliveryPoint === 'girlsDorm' ? girlsDormEnabled : boysDormEnabled;
	  if (!selectedPointEnabled) {
		return res.status(400).json({ error: "Seçtiğiniz teslimat noktası şu anda kapalı. Lütfen başka bir nokta seçin!" });
	  }
  
	  // Toplam tutarı hesapla
	  let totalAmount = 0;
	  const orderProducts = await Promise.all(
		products.map(async (cartItem) => {
		  const product = await Product.findById(cartItem.product);
		  if (!product) {
			throw new Error(`Ürün bulunamadı: ${cartItem.product}`);
		  }
		  totalAmount += product.price * cartItem.quantity;
		  return {
			product: product._id,
			name: product.name,
			quantity: cartItem.quantity,
			price: product.price,
		  };
		})
	  );
  
	  // Minimum sipariş tutarı kontrolü - ayarlardan al
	  const settings = await Settings.getSettings();
	  const minimumOrderAmount = settings.minimumOrderAmount || 250; // Varsayılan 250 TL
  
	  if (totalAmount < minimumOrderAmount) {
		return res.status(400).json({ error: `Sipariş tutarı minimum ${minimumOrderAmount} TL olmalıdır!` });
	  }
  
	  // Yeni sipariş oluştur
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
                      createdAt: newOrder.createdAt,
                      customerName: req.user.name,
                      city: city,
                      phone: phone
                  }
              };

              io.to('adminRoom').emit('newOrder', notification);
              console.log('Bildirim gönderildi:', notification);
          }
      } catch (socketError) {
          console.error('Socket.IO bildirimi gönderilirken hata:', socketError);
      }
  
	  // Kullanıcının sepetini temizle
	  req.user.cartItems = [];
	  await req.user.save();
  
	  // Başarılı yanıt döndür
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