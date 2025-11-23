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
    res.status(200).json({
      success: true,
      message: 'n8n API endpoint\'i çalışıyor',
      timestamp: new Date().toISOString(),
      endpoints: {
        webhook: '/api/n8n/webhook',
        test: '/api/n8n/test'
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

