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
  PackagePlus,
  MessageSquare,
  BrainCircuit,
  Headphones,
  BellRing,
  Inbox,
  ScanLine,
  Radar,
  UserX,
  MapPin,
} from "lucide-react";

// Kenar menüsü ve komut paleti aynı listeyi kullanır.
// `short` menüde görünen addır (kenar çubuğuna sığacak uzunlukta, kesilmeden okunur);
// `label` sayfa başlığı/ipucu için tam addır; `keywords` menü aramasında eşleşir.
export const adminMenuGroups = [
  {
    id: "ops",
    title: "Operasyon",
    items: [
      { id: "dashboard", short: "Genel bakış", label: "Genel bakış", icon: LayoutDashboard, keywords: "özet anasayfa dashboard" },
      { id: "orders", short: "Siparişler", label: "Siparişler", icon: ShoppingBag, badge: "orders", keywords: "teslimat kurye" },
      { id: "delivery-zones", short: "Teslimat bölgeleri", label: "Teslimat bölgeleri", icon: MapPin, keywords: "bölge mahalle köy yurt teslimat ücreti ücretsiz adres pilot kampanya" },
      { id: "analytics", short: "Satış analizi", label: "Satış analizi", icon: BarChart3, keywords: "rapor ciro grafik" },
    ],
  },
  {
    id: "catalog",
    title: "Ürünler",
    items: [
      { id: "products", short: "Ürün kataloğu", label: "Ürün kataloğu", icon: Package, keywords: "ürünler fiyat stok flash sale indirim" },
      { id: "create", short: "Ürün ekle", label: "Yeni ürün ekle", icon: PackagePlus, keywords: "yeni ürün oluştur" },
      { id: "photo-create", short: "Fotoğrafla ekle", label: "Fotoğraftan ürün ekle", icon: ScanLine, keywords: "kamera fotoğraf yapay zeka ürün bul tanı" },
      { id: "bulk-upload", short: "Toplu yükleme", label: "Toplu ürün yükleme (CSV)", icon: Upload, keywords: "csv excel içe aktar" },
      { id: "price-watch", short: "Fiyat bekçisi", label: "Fiyat bekçisi", icon: Radar, keywords: "piyasa rakip fiyat karşılaştır" },
    ],
  },
  {
    id: "marketing",
    title: "Kampanya ve vitrin",
    items: [
      { id: "weekly-products", short: "Haftalık fırsatlar", label: "Haftalık fırsatlar", icon: CalendarDays, keywords: "fırsat kampanya" },
      { id: "coupons", short: "Kuponlar", label: "Kuponlar", icon: Tag, keywords: "indirim kodu görev" },
      { id: "banners", short: "Vitrin görselleri", label: "Vitrin görselleri", icon: Image, keywords: "banner afiş slider" },
      { id: "push", short: "Bildirim gönder", label: "Bildirim gönder", icon: BellRing, keywords: "push duyuru" },
      { id: "referrals", short: "Davet sistemi", label: "Davet sistemi", icon: Gift, keywords: "referans arkadaş ödül" },
    ],
  },
  {
    id: "customers",
    title: "Müşteri ve destek",
    items: [
      { id: "users", short: "Müşteriler", label: "Müşteriler", icon: Users, keywords: "kullanıcı hesap" },
      { id: "account-cleanup", short: "Hesap temizliği", label: "Pasif hesap temizliği", icon: UserX, keywords: "pasif inaktif silme kvkk temizlik hesap" },
      { id: "chat", short: "Mesajlar", label: "Mesajlar", icon: MessageCircle, badge: "chats", keywords: "sohbet chat" },
      { id: "support-queue", short: "Bekleyen destek", label: "Bekleyen destekler", icon: Headphones, keywords: "destek talep" },
      { id: "feedback", short: "Geri bildirimler", label: "Geri bildirimler", icon: MessageSquare, keywords: "yorum puan şikayet" },
      { id: "site-messages", short: "Başvurular", label: "Başvurular ve mesajlar", icon: Inbox, keywords: "iletişim form kvkk" },
    ],
  },
  {
    id: "system",
    title: "Sistem",
    items: [
      { id: "ai-knowledge", short: "Asistan bilgileri", label: "Yapay zekâ bilgi merkezi", icon: BrainCircuit, keywords: "ai yapay zeka asistan bilgi" },
      { id: "photocopy", short: "Fotokopi", label: "Fotokopi", icon: Files, keywords: "baskı çıktı" },
      { id: "settings", short: "Mağaza ayarları", label: "Mağaza ayarları", icon: Settings, keywords: "çalışma saatleri teslimat" },
      { id: "audit", short: "İşlem kayıtları", label: "İşlem kayıtları", icon: ClipboardList, keywords: "log geçmiş" },
    ],
  },
];
