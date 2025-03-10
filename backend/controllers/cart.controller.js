import Product from "../models/product.model.js";
import Order from "../models/order.model.js";

// Saat kontrolü için yardımcı fonksiyon
const isWithinOrderHours = () => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Sabah 11:30'dan gece 23:30'a kadar olan aralığı kontrol et
  const startHour = 1;
  const startMinute = 30;
  const endHour = 23;
  const endMinute = 30;

  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const startTimeInMinutes = startHour * 60 + startMinute; // 11:30 = 690 dakika
  const endTimeInMinutes = endHour * 60 + endMinute;       // 23:30 = 1410 dakika

  return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
};

export const addToCart = async (req, res) => {
  try {
	if (!isWithinOrderHours()) {
		return res.status(400).json({ error: "Siparişler sadece sabah 11:30 ile gece 23:30 arasında verilebilir." });
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
	  if (!isWithinOrderHours()) {
		return res.status(400).json({ error: "Siparişler sadece sabah 10:00 ile gece 01:00 arasında verilebilir." });
	  }
  
	  const { products, city, phone, note } = req.body;
  
	  // Sepet boş mu kontrolü
	  if (!products || products.length === 0) {
		return res.status(400).json({ error: "Sepet boş!" });
	  }
  
	  // Şehir ve telefon numarası zorunlu alanlar
	  if (!city || !phone) {
		return res.status(400).json({ error: "Şehir ve telefon numarası zorunludur!" });
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
  
	  // Minimum sipariş tutarı kontrolü
	  if (totalAmount < 250) {
		return res.status(400).json({ error: "Sipariş tutarı minimum 250 TL olmalıdır!" });
	  }
  
	  // Yeni sipariş oluştur
	  const newOrder = new Order({
		user: req.user._id,
		products: orderProducts,
		totalAmount,
		city,
		phone,
		note,
	  });
  
	  // Siparişi kaydet
	  await newOrder.save();

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
	  console.error("Sipariş oluşturulurken hata oluştu:", error);
	  res.status(500).json({ message: "Sipariş oluşturulurken hata oluştu", error: error.message });
	}
  };