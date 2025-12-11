import axios from "axios";

/**
 * n8n'e webhook gönderme servisi
 * .env dosyasında N8N_WEBHOOK_URL değişkenini tanımlamanız gerekiyor
 */

/**
 * n8n webhook'una veri gönderir
 * @param {string} eventType - Olay tipi (order.created, user.registered, user.logged_in, vb.)
 * @param {object} data - Gönderilecek veri
 * @returns {Promise<boolean>} - Başarılı olup olmadığı
 */
export const sendToN8N = async (eventType, data) => {
  try {
    // Event tipine göre özel webhook URL'i kontrol et
    let webhookUrl;
    
    if (eventType === 'user.logged_in' && process.env.N8N_LOGIN_WEBHOOK_URL) {
      // Login için özel webhook URL'i varsa onu kullan
      webhookUrl = process.env.N8N_LOGIN_WEBHOOK_URL;
    } else {
      // Diğer event'ler için genel webhook URL'ini kullan
      webhookUrl = process.env.N8N_WEBHOOK_URL;
    }
    
    if (!webhookUrl) {
      console.warn(`N8N webhook URL tanımlanmamış (${eventType}). Webhook gönderilmedi.`);
      return false;
    }

    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: data
    };

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000, // 5 saniye timeout
    });

    if (response.status === 200 || response.status === 201) {
      console.log(`n8n webhook başarıyla gönderildi: ${eventType}`);
      return true;
    }

    return false;
  } catch (error) {
    // Webhook gönderiminde hata olsa bile ana işlemi engellememek için
    // sadece logluyoruz, hata fırlatmıyoruz
    console.error(`n8n webhook gönderilirken hata oluştu (${eventType}):`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return false;
  }
};

/**
 * Sipariş bildirimi için özel fonksiyon
 * n8n'e sipariş detaylarını gönderir
 * @param {object} orderData - Sipariş verisi
 * @returns {Promise<boolean>} - Başarılı olup olmadığı
 */
export const sendOrderNotification = async (orderData) => {
  try {
    // Önce genel webhook URL'ini kontrol et
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    
    console.log('🔍 [n8n Debug] N8N_WEBHOOK_URL kontrol ediliyor...');
    console.log('🔍 [n8n Debug] Webhook URL:', webhookUrl ? `${webhookUrl.substring(0, 30)}...` : 'TANIMLANMAMIŞ');
    
    if (!webhookUrl) {
      console.error('❌ [n8n Error] N8N_WEBHOOK_URL tanımlanmamış. Sipariş bildirimi gönderilmedi.');
      console.error('❌ [n8n Error] Lütfen .env dosyasına N8N_WEBHOOK_URL ekleyin.');
      return false;
    }

    // n8n'e gönderilecek sipariş verisi formatı
    const payload = {
      event: 'order.created',
      timestamp: new Date().toISOString(),
      order: {
        id: orderData.orderId || orderData._id?.toString(),
        orderNumber: orderData.orderNumber || orderData._id?.toString(),
        user: {
          id: orderData.user?.id || orderData.user?._id?.toString(),
          name: orderData.user?.name || '',
          email: orderData.user?.email || '',
          phone: orderData.user?.phone || orderData.phone || ''
        },
        products: orderData.products || [],
        totalAmount: orderData.totalAmount || 0,
        city: orderData.city || '',
        deliveryPoint: orderData.deliveryPoint || '',
        deliveryPointName: orderData.deliveryPointName || '',
        status: orderData.status || 'pending',
        createdAt: orderData.createdAt || new Date().toISOString(),
        note: orderData.note || ''
      }
    };

    console.log('📤 [n8n Debug] n8n\'e sipariş bildirimi gönderiliyor...');
    console.log('📤 [n8n Debug] Webhook URL:', webhookUrl);
    console.log('📤 [n8n Debug] Sipariş ID:', payload.order.id);
    console.log('📤 [n8n Debug] Payload (ilk 500 karakter):', JSON.stringify(payload).substring(0, 500));

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 saniye timeout (sipariş bildirimleri için daha uzun)
    });

    console.log('📥 [n8n Debug] Response alındı');
    console.log('📥 [n8n Debug] Response status:', response.status);
    console.log('📥 [n8n Debug] Response data:', JSON.stringify(response.data).substring(0, 200));

    if (response.status === 200 || response.status === 201) {
      console.log(`✅ [n8n Success] Sipariş bildirimi başarıyla n8n'e gönderildi: ${payload.order.id}`);
      return true;
    }

    console.warn(`⚠️ [n8n Warning] Beklenmeyen response status: ${response.status}`);
    return false;
  } catch (error) {
    // Webhook gönderiminde hata olsa bile ana işlemi engellememek için
    // sadece logluyoruz, hata fırlatmıyoruz
    console.error('❌ [n8n Error] n8n sipariş bildirimi gönderilirken hata oluştu!');
    console.error('❌ [n8n Error] Hata mesajı:', error.message);
    
    if (error.response) {
      console.error('❌ [n8n Error] Response alındı ama hata var:');
      console.error('❌ [n8n Error] Status:', error.response.status);
      console.error('❌ [n8n Error] Status text:', error.response.statusText);
      console.error('❌ [n8n Error] Data:', JSON.stringify(error.response.data).substring(0, 500));
      console.error('❌ [n8n Error] Headers:', JSON.stringify(error.response.headers).substring(0, 300));
    } else if (error.request) {
      console.error('❌ [n8n Error] Request gönderildi ama response alınamadı!');
      console.error('❌ [n8n Error] Bu genellikle şu anlama gelir:');
      console.error('   1. n8n sunucusu çalışmıyor olabilir');
      console.error('   2. n8n URL\'i yanlış olabilir');
      console.error('   3. Network bağlantısı yok olabilir');
      console.error('   4. Firewall/proxy isteği engelliyor olabilir');
      console.error('❌ [n8n Error] Request detayları:', JSON.stringify(error.request).substring(0, 300));
    } else {
      console.error('❌ [n8n Error] İstek hazırlanırken hata oluştu');
      console.error('❌ [n8n Error] Error config:', JSON.stringify(error.config).substring(0, 500));
    }
    
    console.error('❌ [n8n Error] Full error stack:', error.stack?.substring(0, 500));
    return false;
  }
};

/**
 * Belirli bir workflow için webhook gönderir
 * @param {string} workflowId - n8n workflow ID'si veya path
 * @param {object} data - Gönderilecek veri
 * @returns {Promise<boolean>} - Başarılı olup olmadığı
 */
export const sendToN8NWorkflow = async (workflowId, data) => {
  try {
    const baseUrl = process.env.N8N_BASE_URL || process.env.N8N_WEBHOOK_URL;
    
    if (!baseUrl) {
      console.warn('N8N_BASE_URL veya N8N_WEBHOOK_URL tanımlanmamış. Webhook gönderilmedi.');
      return false;
    }

    // n8n webhook URL formatı: https://your-n8n-instance.com/webhook/{workflow-id}
    const webhookUrl = baseUrl.endsWith('/') 
      ? `${baseUrl}webhook/${workflowId}`
      : `${baseUrl}/webhook/${workflowId}`;

    const response = await axios.post(webhookUrl, data, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });

    if (response.status === 200 || response.status === 201) {
      console.log(`n8n workflow webhook başarıyla gönderildi: ${workflowId}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`n8n workflow webhook gönderilirken hata oluştu (${workflowId}):`, error.message);
    return false;
  }
};

/**
 * n8n'den gelen webhook doğrulaması için helper
 * (isteğe bağlı: güvenlik için webhook secret kullanabilirsiniz)
 * @param {string} signature - Webhook signature
 * @param {object} payload - Request payload
 * @returns {boolean} - Doğrulama başarılı mı
 */
export const verifyN8NWebhook = (signature, payload) => {
  // Eğer webhook secret kullanıyorsanız, burada doğrulama yapabilirsiniz
  // Şimdilik basit bir kontrol yapıyoruz
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    // Secret tanımlanmamışsa, doğrulama yapmıyoruz
    return true;
  }

  // TODO: Webhook signature doğrulaması implement edilebilir
  // HMAC-SHA256 gibi bir yöntem kullanılabilir
  return true;
};

