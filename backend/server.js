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
import { createServer } from "http";
import { Server } from "socket.io";

import { connectDB } from "./lib/db.js";

dotenv.config();

const corsOptions = {
  origin: [
    "http://localhost:5173", 
    "https://www.devrekbenimmarketim.com",
    "http://www.devrekbenimmarketim.com",
    "https://devrekbenimmarketim.com", // www olmayan domain
    "http://devrekbenimmarketim.com",  // www olmayan domain (http)
    "https://res.cloudinary.com"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ['Access-Control-Allow-Origin'],
  optionsSuccessStatus: 200,
};

const app = express();
const httpServer = createServer(app);

// Express middleware'leri
app.use(cors(corsOptions));

// CORS Pre-flight için
app.options('*', cors(corsOptions));

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

// Socket.IO yapılandırması
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://www.devrekbenimmarketim.com", 
      "http://www.devrekbenimmarketim.com",
      "https://devrekbenimmarketim.com", // www olmayan domain
      "http://devrekbenimmarketim.com",  // www olmayan domain (http)
      "http://localhost:5173", // Development frontend
      "http://localhost:3000"  // Alternatif development port
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    transports: ['websocket', 'polling']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

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

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "/frontend/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
  });
}

httpServer.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
  connectDB();
});