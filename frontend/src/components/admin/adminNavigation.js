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
  Plus,
  MessageSquare,
} from "lucide-react";

export const adminMenuGroups = [
  {
    title: "ÇALIŞMA ALANI",
    items: [
      { id: "dashboard", label: "Genel bakış", icon: LayoutDashboard },
      { id: "orders", label: "Siparişler", icon: ShoppingBag, badge: "orders" },
      { id: "analytics", label: "Satış analizi", icon: BarChart3 },
    ],
  },
  {
    title: "MAĞAZA YÖNETİMİ",
    items: [
      { id: "products", label: "Ürün kataloğu", icon: Package },
      { id: "create", label: "Yeni ürün", icon: Plus },
      {
        id: "weekly-products",
        label: "Haftalık fırsatlar",
        icon: CalendarDays,
      },
      { id: "coupons", label: "Kuponlar", icon: Tag },
      { id: "banners", label: "Vitrin görselleri", icon: Image },
    ],
  },
  {
    title: "MÜŞTERİ İLİŞKİLERİ",
    items: [
      { id: "users", label: "Müşteriler", icon: Users },
      { id: "chat", label: "Mesajlar", icon: MessageCircle, badge: "chats" },
      { id: "referrals", label: "Davet sistemi", icon: Gift },
      { id: "feedback", label: "Geri bildirimler", icon: MessageSquare },
    ],
  },
  {
    title: "ARAÇLAR",
    items: [
      { id: "photocopy", label: "Fotokopi", icon: Files },
      { id: "bulk-upload", label: "Toplu yükleme", icon: Upload },
      { id: "settings", label: "Mağaza ayarları", icon: Settings },
    ],
  },
];
