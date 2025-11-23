/**
 * n8n Controller
 * n8n'den gelen webhook'ları almak ve işlemek için
 */

/**
 * n8n'den gelen webhook'u alır ve işler
 * POST /api/n8n/webhook
 */
export const receiveWebhook = async (req, res) => {
  try {
    const payload = req.body;
    const headers = req.headers;

    console.log('n8n webhook alındı:', {
      headers: headers,
      body: payload
    });

    // Webhook doğrulaması (isteğe bağlı)
    // const signature = headers['x-n8n-signature'];
    // if (!verifyN8NWebhook(signature, payload)) {
    //   return res.status(401).json({ message: 'Geçersiz webhook imzası' });
    // }

    // Webhook tipine göre işlem yapabilirsiniz
    const { event, data } = payload;

    // Örnek: n8n'den gelen komutları işleme
    switch (event) {
      case 'update_order_status':
        // Sipariş durumu güncelleme işlemi
        // await updateOrderStatus(data.orderId, data.status);
        break;
      
      case 'send_notification':
        // Bildirim gönderme işlemi
        // await sendNotification(data.userId, data.message);
        break;

      default:
        console.log('Bilinmeyen event tipi:', event);
    }

    // n8n'e başarılı yanıt gönder
    res.status(200).json({
      success: true,
      message: 'Webhook başarıyla alındı ve işlendi',
      receivedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('n8n webhook işlenirken hata oluştu:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook işlenirken hata oluştu',
      error: error.message
    });
  }
};

/**
 * Test endpoint - n8n bağlantısını test etmek için
 * GET /api/n8n/test
 */
export const testConnection = async (req, res) => {
  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    
    res.status(200).json({
      success: true,
      message: 'n8n API endpoint\'i çalışıyor',
      timestamp: new Date().toISOString(),
      environment: {
        N8N_WEBHOOK_URL: webhookUrl ? `${webhookUrl.substring(0, 30)}...` : 'TANIMLANMAMIŞ',
        N8N_WEBHOOK_URL_SET: !!webhookUrl
      },
      endpoints: {
        webhook: '/api/n8n/webhook',
        test: '/api/n8n/test',
        testOrder: '/api/n8n/test-order'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Test endpoint\'i çalışırken hata oluştu',
      error: error.message
    });
  }
};

/**
 * Test sipariş bildirimi endpoint'i
 * POST /api/n8n/test-order
 * Gerçek sipariş oluşturmadan n8n'e test bildirimi gönderir
 */
export const testOrderNotification = async (req, res) => {
  try {
    const { sendOrderNotification } = await import("../services/n8n.service.js");
    
    // Test sipariş verisi
    const testOrderData = {
      orderId: "test-order-" + Date.now(),
      _id: "test-order-" + Date.now(),
      user: {
        id: "test-user-id",
        _id: "test-user-id",
        name: "Test Kullanıcı",
        email: "test@example.com",
        phone: "5551234567"
      },
      products: [
        {
          name: "Test Ürün 1",
          quantity: 2,
          price: 25.50,
          total: 51.00
        },
        {
          name: "Test Ürün 2",
          quantity: 1,
          price: 15.00,
          total: 15.00
        }
      ],
      totalAmount: 66.00,
      city: "İstanbul",
      deliveryPoint: "Kadıköy",
      deliveryPointName: "Kadıköy Test Şubesi",
      status: "pending",
      createdAt: new Date().toISOString(),
      note: "Bu bir test siparişidir"
    };
    
    console.log('🧪 [Test] Test sipariş bildirimi gönderiliyor...');
    const result = await sendOrderNotification(testOrderData);
    
    res.status(200).json({
      success: result,
      message: result 
        ? 'Test sipariş bildirimi başarıyla n8n\'e gönderildi. Console log\'larını kontrol edin.' 
        : 'Test sipariş bildirimi gönderilemedi. Console log\'larını kontrol edin.',
      timestamp: new Date().toISOString(),
      testData: testOrderData,
      webhookUrl: process.env.N8N_WEBHOOK_URL ? `${process.env.N8N_WEBHOOK_URL.substring(0, 30)}...` : 'TANIMLANMAMIŞ'
    });
  } catch (error) {
    console.error('❌ [Test Error] Test sipariş bildirimi gönderilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Test sipariş bildirimi gönderilirken hata oluştu',
      error: error.message,
      stack: error.stack
    });
  }
};

