import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import ordersAnalyticsRoutes from "./routes/ordersAnalytics.route.js";
import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.route.js";
import cartRoutes from "./routes/cart.route.js";
import couponRoutes from "./routes/coupon.route.js";
import paymentRoutes from "./routes/payment.route.js";
import analyticsRoutes from "./routes/analytics.route.js";
import feedbackRoutes from "./routes/feedback.route.js";
import settingsRoutes from "./routes/settings.route.js";
import flashSaleRoutes from "./routes/flashSale.route.js";
import photocopyRoutes from "./routes/photocopy.route.js";
import bannerRoutes from "./routes/banner.route.js";
import categoryRoutes from "./routes/category.route.js";
import cartReminderRoutes from "./routes/cartReminder.route.js";
import n8nRoutes from "./routes/n8n.route.js";
import versionRoutes from "./routes/version.route.js";
import referralRoutes from "./routes/referral.route.js";
import chatRoutes from "./routes/chat.route.js";
import { createServer } from "http";
import { Server } from "socket.io";

import { connectDB } from "./lib/db.js";
import { refreshOrderHoursCache } from "./controllers/cart.controller.js";
import { startCartReminderJob } from "./jobs/cartReminder.job.js";

dotenv.config();

const corsOptions = {
  origin: [
    "http://localhost:5173", 
    "https://www.devrekbenimmarketim.com",
    "http://www.devrekbenimmarketim.com",
    "https://devrekbenimmarketim.com", // www olmayan domain
    "http://devrekbenimmarketim.com",  // www olmayan domain (http)
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
  exposedHeaders: ['Access-Control-Allow-Origin', 'Set-Cookie'],
  optionsSuccessStatus: 200,
};

const app = express();
const httpServer = createServer(app);

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

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

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
  
  if (redisUrl) {
    const pubClient = new Redis(redisUrl);
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
  console.log('Yeni bir kullanıcı bağlandı. Socket ID:', socket.id);

  socket.on('joinAdminRoom', () => {
    socket.join('adminRoom');
    console.log('Admin odaya katıldı');
  });

  // ========== CANLI SOHBET EVENT'LERİ ==========
  
  // Sohbet odasına katıl
  socket.on('joinChat', (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} sohbet odasına katıldı: chat_${chatId}`);
  });

  // Sohbet odasından ayrıl
  socket.on('leaveChat', (chatId) => {
    socket.leave(`chat_${chatId}`);
    console.log(`Socket ${socket.id} sohbet odasından ayrıldı: chat_${chatId}`);
  });

  // Kullanıcı sohbete girdi - Admin'e bildir
  socket.on('userInChat', ({ chatId, userId, userName }) => {
    // Admin odasına bildir
    socket.to('adminRoom').emit('userInChat', { chatId, userId, userName });
    console.log(`Kullanıcı sohbete girdi: ${userName || userId} - Chat: ${chatId}`);
  });

  // Kullanıcı sohbetten çıktı - Admin'e bildir
  socket.on('userLeftChat', ({ chatId, userId }) => {
    // Admin odasına bildir
    socket.to('adminRoom').emit('userLeftChat', { chatId, userId });
    console.log(`Kullanıcı sohbetten çıktı: ${userId} - Chat: ${chatId}`);
  });

  // Yazıyor göstergesi
  socket.on('typing', ({ chatId, sender }) => {
    socket.to(`chat_${chatId}`).emit('userTyping', { chatId, sender });
  });

  // Yazmayı bıraktı
  socket.on('stopTyping', ({ chatId, sender }) => {
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
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/flash-sales", flashSaleRoutes);
app.use("/api/photocopy", photocopyRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart-reminders", cartReminderRoutes);
app.use("/api/n8n", n8nRoutes);
app.use("/api", versionRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/chat", chatRoutes);

import fs from "fs";
import Product from "./models/product.model.js";

// ============ SEO ENDPOINTS ============

// robots.txt endpoint
app.get('/robots.txt', (req, res) => {
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /panel

# Sitemap
Sitemap: https://devrekbenimmarketim.com/sitemap.xml

# Crawl-delay
Crawl-delay: 1
`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

// sitemap.xml endpoint
app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://devrekbenimmarketim.com';
    const today = new Date().toISOString().split('T')[0];
    
    // Statik sayfalar
    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/hakkimizda', priority: '0.7', changefreq: 'monthly' },
      { url: '/iletisim', priority: '0.7', changefreq: 'monthly' },
      { url: '/sss', priority: '0.6', changefreq: 'monthly' },
      { url: '/gizlilik', priority: '0.5', changefreq: 'yearly' },
      { url: '/kullanim-kosullari', priority: '0.5', changefreq: 'yearly' },
      { url: '/kvkk', priority: '0.5', changefreq: 'yearly' },
      { url: '/mesafeli-satis', priority: '0.5', changefreq: 'yearly' },
      { url: '/iade-politikasi', priority: '0.5', changefreq: 'yearly' },
      { url: '/cerez-politikasi', priority: '0.5', changefreq: 'yearly' },
    ];
    
    // Kategori sayfaları
    const categories = [
      'kahve', 'yiyecekler', 'kahvalti', 'icecekler', 'sut-urunleri',
      'atistirma', 'kisisel-bakim', 'temizlik', 'su', 'ev-gerecleri',
      'dondurulmus', 'baharat', 'dondurma'
    ];
    
    const categoryPages = categories.map(cat => ({
      url: `/${cat}`,
      priority: '0.8',
      changefreq: 'daily'
    }));
    
    // Tüm sayfaları birleştir
    const allPages = [...staticPages, ...categoryPages];
    
    // XML oluştur
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
    
    for (const page of allPages) {
      xml += `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    }
    
    xml += `</urlset>`;
    
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Sitemap oluşturulurken hata:', error);
    res.status(500).send('Sitemap oluşturulamadı');
  }
});

// ============ END SEO ENDPOINTS ============

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
});