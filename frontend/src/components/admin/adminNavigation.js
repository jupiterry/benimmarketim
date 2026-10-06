import {
  LayoutDashboard,
  BarChart3,
  Package,
  ShoppingBag,
  Users,
  MessageCircle,
  Tag,
  Gift,
  Image,
  CalendarDays,
  Files,
  Upload,
  Settings,
  ClipboardList,
  Plus,
  MessageSquare,
  BrainCircuit,
  Headphones,
  BellRing,
  Inbox,
} from "lucide-react";

export const adminMenuGroups = [
  {
    title: "ÇALIŞMA ALANI", short: "Operasyon",
    items: [
      { id: "dashboard", short: "Genel bakış", label: "Genel bakış", icon: LayoutDashboard },
      { id: "orders", short: "Siparişler", label: "Siparişler", icon: ShoppingBag, badge: "orders" },
      { id: "analytics", short: "Analiz", label: "Satış analizi", icon: BarChart3 },
    ],
  },
  {
    title: "MAĞAZA YÖNETİMİ", short: "Katalog",
    items: [
      { id: "products", short: "Ürünler", label: "Ürün kataloğu", icon: Package },
      { id: "create", short: "Yeni ürün", label: "Yeni ürün", icon: Plus },
      {
        id: "weekly-products",
        short: "Fırsatlar",
        label: "Haftalık fırsatlar",
        icon: CalendarDays,
      },
      { id: "coupons", short: "Kuponlar", label: "Kuponlar", icon: Tag },
      { id: "banners", short: "Vitrin", label: "Vitrin görselleri", icon: Image },
    ],
  },
  {
    title: "MÜŞTERİ İLİŞKİLERİ", short: "Müşteri",
    items: [
      { id: "users", short: "Müşteriler", label: "Müşteriler", icon: Users },
      { id: "chat", short: "Mesajlar", label: "Mesajlar", icon: MessageCircle, badge: "chats" },
      { id: "support-queue", short: "Destek", label: "Bekleyen Destekler", icon: Headphones },
      { id: "ai-knowledge", short: "AI bilgi", label: "Yapay Zekâ Bilgi Merkezi", icon: BrainCircuit },
      { id: "referrals", short: "Davetler", label: "Davet sistemi", icon: Gift },
      { id: "feedback", short: "Geri bildirim", label: "Geri bildirimler", icon: MessageSquare },
      { id: "site-messages", short: "Başvurular", label: "Başvurular ve mesajlar", icon: Inbox },
      { id: "push", short: "Bildirim gönder", label: "Bildirim gönder", icon: BellRing },
    ],
  },
  {
    title: "ARAÇLAR", short: "Sistem",
    items: [
      { id: "photocopy", short: "Fotokopi", label: "Fotokopi", icon: Files },
      { id: "bulk-upload", short: "Toplu yükleme", label: "Toplu yükleme", icon: Upload },
      { id: "settings", short: "Ayarlar", label: "Mağaza ayarları", icon: Settings },
      { id: "audit", short: "Kayıtlar", label: "İşlem kayıtları", icon: ClipboardList },
    ],
  },
];
