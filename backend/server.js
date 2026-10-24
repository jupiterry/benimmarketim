import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import compression from "compression";
import { auditFallback } from "./services/adminAudit.service.js";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import userRoutes from "./routes/userRoutes.js";
import ordersAnalyticsRoutes from "./routes/ordersAnalytics.route.js";
import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.route.js";
import cartRoutes from "./routes/cart.route.js";
import couponRoutes from "./routes/coupon.route.js";
import couponRequestRoutes from "./routes/couponRequest.route.js";
import paymentRoutes from "./routes/payment.route.js";
import analyticsRoutes from "./routes/analytics.route.js";
import feedbackRoutes from "./routes/feedback.route.js";
import settingsRoutes from "./routes/settings.route.js";
import flashSaleRoutes from "./routes/flashSale.route.js";
import { startFlashSaleJob } from "./services/flashSale.service.js";
import { startRecommendationJob } from "./services/recommendation.service.js";
import { startOpenRouterModelRefresh } from "./services/ai/openrouterModels.service.js";
import photocopyRoutes from "./routes/photocopy.route.js";
import bannerRoutes from "./routes/banner.route.js";
import categoryRoutes from "./routes/category.route.js";
import cartReminderRoutes from "./routes/cartReminder.route.js";
import versionRoutes from "./routes/version.route.js";
import referralRoutes from "./routes/referral.route.js";
import chatRoutes from "./routes/chat.route.js";
import aiRoutes from "./routes/ai.route.js";
import supportRequestRoutes from "./routes/supportRequest.route.js";
import weeklyProductRoutes from "./routes/weeklyProductRoutes.js";
import notificationRoutes from "./routes/notification.route.js";
import siteMessageRoutes from "./routes/siteMessage.route.js";
import missionRoutes from "./routes/mission.route.js";
import cartAssistantRoutes from "./routes/cartAssistant.route.js";
import savedCartRoutes from "./routes/savedCart.route.js";
import productAssistRoutes from "./routes/productAssist.route.js";
import priceWatchRoutes from "./routes/priceWatch.route.js";
import adminFeedRoutes from "./routes/adminFeed.route.js";
import orderAlarmRoutes from "./routes/orderAlarm.route.js";
import accountCleanupRoutes from "./routes/accountCleanup.route.js";
import deliveryRoutes from "./routes/delivery.route.js";
import addressRoutes from "./routes/address.route.js";
import Product from "./models/product.model.js";
import User from "./models/user.model.js";
import Chat from "./models/chat.model.js";
import { connectDB } from "./lib/db.js";
import { refreshOrderHoursCache } from "./controllers/cart.controller.js";
import { startCartReminderJob } from "./jobs/cartReminder.job.js";

dotenv.config();

const corsOptions = {
  origin: [
    "http://localhost:5173", 
    "https://www.devrekbenimmarketim.com",
    "https://devrekbenimmarketim.com", // www olmayan domain
    "https://res.cloudinary.com",
    // Flutter için localhost ve emulator IP'leri
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.0.2.2:5000", // Android emulator için
    "http://localhost:5000" // iOS simulator için
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "Accept", 
    "Origin", 
    "X-Requested-With",
    "Cache-Control",
    "Pragma",
    "If-Modified-Since",
    "If-None-Match"
  ],
  // Sipariş listesi toplam sayısı (GET /api/orders-analytics) tarayıcıdan okunabilsin
  exposedHeaders: ["X-Total-Count"],
  optionsSuccessStatus: 200,
};

const app = express();
const httpServer = createServer(app);

// Nginx arkasında çalışır: req.ip ve secure cookie için ilk proxy'ye güvenilir
app.set("trust proxy", 1);

// Express middleware'leri
app.use(cors(corsOptions));

// CORS Pre-flight için
app.options('*', cors(corsOptions));

// Socket.IO için özel CORS middleware kaldırıldı - Socket.IO kendi CORS'unu yönetiyor

// Cloudinary görselleri için CORS header'ları (sadece Cloudinary istekleri için)
app.use((req, res, next) => {
  // Sadece Cloudinary istekleri için wildcard kullan
  if (req.url.includes('cloudinary.com') || req.url.includes('res.cloudinary.com')) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  next();
});

// gzip sıkıştırma: ürün listesi JSON'u 5–10 kat küçülür. Socket.IO kendi aktarımını yönetir.
app.use(compression({
  threshold: 1024,
  filter: (req, res) => !req.path.startsWith("/socket.io") && compression.filter(req, res),
}));
app.use(express.json({ limit: "10mb" }));
// Sorgu/gövde içindeki "$" ve "." ile başlayan anahtarları temizler (Mongo operatör enjeksiyonu)
app.use(mongoSanitize());
// Güvenlik başlıkları. SPA ve Cloudinary görselleri bozulmasın diye CSP/CORP/COEP kapalı.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cookieParser());
// Yönetici işlem kayıtları: ayrıntılı kaydı olmayan her başarılı yönetici değişikliği de kaydedilir
app.use(auditFallback);

// Socket.IO yapılandırması - Sağlam ve Güvenilir
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";

// Socket.IO yapılandırması - Sağlam ve Güvenilir
const io = new Server(httpServer, {
  cors: {
    origin: corsOptions.origin, // Express ile aynı origin listesini kullan
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'] // Websocket öncelikli, polling destekli
});

// Redis Adapter Kurulumu (PM2 Cluster Mode için)
// Bu sayede tüm worker'lar aynı oda bilgisini paylaşır
try {
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  
  if (redisUrl && process.env.REDIS_DISABLED !== 'true') {
    const pubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    const subClient = pubClient.duplicate();

    // ioredis otomatik bağlanır, connect() çağırmaya gerek yok
    pubClient.on('connect', () => console.log('✅ Redis Pub Client bağlandı'));
    subClient.on('connect', () => console.log('✅ Redis Sub Client bağlandı'));
    
    pubClient.on('error', (err) => console.error('Redis Pub Error:', err.message));
    subClient.on('error', (err) => console.error('Redis Sub Error:', err.message));

    // Adapter'ı ayarla - PM2 cluster mode'da tüm instance'lar mesajları paylaşır
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis Adapter kuruldu (PM2 Cluster Mode Destekli)');
  } else {
    console.warn('⚠️ UPSTASH_REDIS_URL tanımlanmamış, Redis adapter kullanılamıyor');
  }
} catch (error) {
  console.error('❌ Redis Adapter kurulum hatası:', error.message);
  console.log('⚠️ Sistem tekil modda (Single Instance) çalışıyor.');
}

// Global socket.io erişimi için
app.set('io', io);

// Socket.IO bağlantı yönetimi
io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandtı. Socket ID:', socket.id);

  const authenticateSocket = async () => {
    if (socket.data.authUser) return socket.data.authUser;
    const cookieHeader = socket.handshake.headers.cookie || '';
    const cookieToken = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('accessToken='))
      ?.slice('accessToken='.length);
    const token = socket.handshake.auth?.token ||
      (cookieToken ? decodeURIComponent(cookieToken) : null);
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded.userId).select('_id role name').lean();
    if (user) socket.data.authUser = user;
    return user;
  };

  // Bağlanan kullanıcıyı yalnızca sunucunun doğruladığı kimliğe ait odaya al.
  // Web HttpOnly cookie, native istemci ise mevcut handshake auth token'ını kullanır.
  authenticateSocket()
    .then((user) => {
      if (!user) return;
      socket.join(`user_${user._id.toString()}`);
      if (user.role === 'admin') socket.join('adminRoom');
    })
    .catch(() => {
      // Kimliği doğrulanamayan socket bağlı kalabilir ancak özel odalara katılmaz.
    });

  // #9 — joinAdminRoom: JWT ve rol doğrulaması eklendi.
  // Önceden herhangi bir kullanıcı bu olaya emit gönderip admin bildirimlerini dinleyebiliyordu.
  socket.on('joinAdminRoom', async ({ token } = {}) => {
    try {
      // Web panelinde access token HttpOnly cookie içinde tutulur. Sayfa
      // yenilendiğinde token JS state'inde bulunmasa da Socket.IO handshake
      // cookie'sinden güvenli biçimde okunabilir. Flutter/harici istemciler
      // için payload token desteği korunur.
      const cookieHeader = socket.handshake.headers.cookie || '';
      const cookieToken = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('accessToken='))
        ?.slice('accessToken='.length);
      const accessToken = token || (cookieToken ? decodeURIComponent(cookieToken) : null);

      if (!accessToken) {
        socket.emit('error', { message: 'Yetki hatası: Token gerekli' });
        return;
      }
      const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded.userId).select('role').lean();
      if (!user || user.role !== 'admin') {
        socket.emit('error', { message: 'Yetki hatası: Sadece adminler bu odaya katılabilir' });
        return;
      }
      socket.join('adminRoom');
      console.log('Admin odaya katıldı. Socket:', socket.id);
    } catch {
      socket.emit('error', { message: 'Geçersiz veya süresi dolmuş token' });
    }
  });

  // ========== CANLI SOHBET EVENT'LERİ ==========
  
  // Sohbet odasına katıl
  socket.on('joinChat', async (chatId) => {
    try {
      const user = await authenticateSocket();
      if (!user) return socket.emit('error', { message: 'Sohbet için oturum gerekli' });
      const chat = await Chat.findById(chatId).select('user').lean();
      if (!chat || (user.role !== 'admin' && chat.user.toString() !== user._id.toString())) {
        return socket.emit('error', { message: 'Bu sohbete erişim yetkiniz yok' });
      }
      socket.join(`chat_${chatId}`);
      console.log(`Socket ${socket.id} sohbet odasına katıldı: chat_${chatId}`);
    } catch {
      socket.emit('error', { message: 'Sohbet yetkisi doğrulanamadı' });
    }
  });

  // Sohbet odasından ayrıl
  socket.on('leaveChat', (chatId) => {
    socket.leave(`chat_${chatId}`);
    console.log(`Socket ${socket.id} sohbet odasından ayrıldı: chat_${chatId}`);
  });

  // Kullanıcı sohbete girdi - Admin'e bildir
  socket.on('userInChat', ({ chatId, userId, userName, platform, appVersion }) => {
    if (!socket.rooms.has(`chat_${chatId}`)) return;
    // Admin odasına bildir
    socket.to('adminRoom').emit('userInChat', { chatId, userId, userName, platform, appVersion });
    console.log(`Kullanıcı sohbete girdi: ${userName || userId} - Chat: ${chatId} - ${platform} v${appVersion}`);
  });

  // Kullanıcı sohbetten çıktı - Admin'e bildir
  socket.on('userLeftChat', ({ chatId, userId }) => {
    if (!socket.rooms.has(`chat_${chatId}`)) return;
    // Admin odasına bildir
    socket.to('adminRoom').emit('userLeftChat', { chatId, userId });
    console.log(`Kullanıcı sohbetten çıktı: ${userId} - Chat: ${chatId}`);
  });

  // Yazıyor göstergesi
  socket.on('typing', ({ chatId, sender }) => {
    if (!socket.rooms.has(`chat_${chatId}`)) return;
    socket.to(`chat_${chatId}`).emit('userTyping', { chatId, sender });
  });

  // Yazmayı bıraktı
  socket.on('stopTyping', ({ chatId, sender }) => {
    if (!socket.rooms.has(`chat_${chatId}`)) return;
    socket.to(`chat_${chatId}`).emit('userStopTyping', { chatId, sender });
  });

  // ========== CANLI SOHBET EVENT'LERİ SONU ==========

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı');
  });
});

const PORT = process.env.PORT || 5000;

const __dirname = path.resolve();

// Routes
app.use("/api/orders-analytics", ordersAnalyticsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", paymentRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/coupon-requests", couponRequestRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/flash-sales", flashSaleRoutes);
app.use("/api/photocopy", photocopyRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart-reminders", cartReminderRoutes);
app.use("/api", versionRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/support-requests", supportRequestRoutes);
app.use("/api/weekly-products", weeklyProductRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/site-messages", siteMessageRoutes);
app.use("/api/missions", missionRoutes);
app.use("/api/cart-assistant", cartAssistantRoutes);
app.use("/api/saved-carts", savedCartRoutes);
app.use("/api/product-assist", productAssistRoutes);
app.use("/api/price-watch", priceWatchRoutes);
app.use("/api/admin-notifications", adminFeedRoutes);
app.use("/api/order-alarm", orderAlarmRoutes);
app.use("/api/account-cleanup", accountCleanupRoutes);
// Teslimat bölgeleri / ücret teklifi / adrese sipariş bayrağı ve kayıtlı adresler (istek sınırları rotalarda)
app.use("/api/delivery", deliveryRoutes);
app.use("/api/addresses", addressRoutes);

// robots.txt ve sitemap.xml frontend build'i tarafından üretilir (frontend/scripts/prerender-seo.mjs) ve
// production'da aşağıdaki express.static ile frontend/dist içinden sunulur; burada ayrıca üretilmez.

if (process.env.NODE_ENV === "production") {
  const currentDir = path.resolve(__dirname);
  const frontendDir = path.join(currentDir, "frontend/dist");
  const siblingFrontendDir = path.join(currentDir, "../frontend/dist");

  // Check which directory exists
  let staticDir;
  if (fs.existsSync(frontendDir)) {
    staticDir = frontendDir;
  } else if (fs.existsSync(siblingFrontendDir)) {
    staticDir = siblingFrontendDir;
  }

  if (staticDir) {
    console.log(`Serving static files from: ${staticDir}`);
    app.use(express.static(staticDir));
    app.get("*", (req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    console.error("Critical: Frontend build directory not found! Checked:", frontendDir, "and", siblingFrontendDir);
  }
}

httpServer.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
  connectDB();
  // Sunucu açılışında sipariş saatleri önbelleğini yenile
  refreshOrderHoursCache().then(() => {
    console.log('Sipariş saatleri önbelleği başlangıçta yenilendi');
  }).catch(() => {
    console.log('Sipariş saatleri önbelleği başlangıçta yenilenemedi');
  });
  
  // Start cart reminder cron job
  startCartReminderJob();

  // Flash sale'leri zamanında başlat ve bitir (dakikada bir)
  startFlashSaleJob();
  startRecommendationJob();
  // OpenRouter'daki güncel model listesi (geçersiz/kaldırılmış ücretsiz modeller istekten önce elensin diye)
  startOpenRouterModelRefresh();
});
