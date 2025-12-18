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

// Redis Adapter Kurulumu (Cluster Mode için)
try {
  const pubClient = new Redis(process.env.UPSTASH_REDIS_URL);
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis Adapter başarıyla bağlandı.');
  }).catch(err => {
    // ioredis auto-connects, but explicit connect handling is good for adapter setup check
    // If using ioredis v5+, connect() returns a promise. 
    // However, if UPSTASH_REDIS_URL is valid, it should work.
    // Fallback: ioredis usually connects automatically.
    // Let's just set the adapter synchronously if we assume auto-connect, 
    // but the adapter expects connected clients or clients that will connect.
    console.log('Redis bağlantısı bekleniyor...');
  });
  
  // Hata yönetimi
  pubClient.on('error', (err) => console.error('Redis Pub Error:', err));
  subClient.on('error', (err) => console.error('Redis Sub Error:', err));
  
  // Basit senkron atama (ioredis bağlantıyı arka planda halleder)
  io.adapter(createAdapter(pubClient, subClient));
  
} catch (error) {
  console.error('❌ Redis Adapter kurulum hatası:', error);
  console.log('⚠️ Sistem tekil modda (Single Implementation) çalışmaya devam edecek.');
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

import fs from "fs";

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