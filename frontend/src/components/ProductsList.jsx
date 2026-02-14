import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash,
  Star,
  Edit,
  Save,
  X,
  Upload,
  Search,
  Filter,
  SlidersHorizontal,
  AlertTriangle,
  Eye,
  EyeOff,
  Package,
  TrendingUp,
  DollarSign,
  CheckSquare,
  Square,
  Trash2,
  ToggleLeft,
  ToggleRight,
  DollarSign as DollarIcon,
  Zap,
  Clock,
  Calendar
} from "lucide-react";
import { useProductStore } from "../stores/useProductStore";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import InfiniteScroll from "react-infinite-scroll-component";

const categories = [
  { href: "/kahve", name: "Benim Kahvem", imageUrl: "/kahve.png" },
  { href: "/yiyecekler", name: "Yiyecekler", imageUrl: "/foods.png" },
  { href: "/kahvalti", name: "Kahvaltılık Ürünler", imageUrl: "/kahvalti.png" },
  { href: "/gida", name: "Temel Gıda", imageUrl: "/basic.png" },
  { href: "/meyve-sebze", name: "Meyve & Sebze", imageUrl: "/fruit.png" },
  { href: "/sut", name: "Süt & Süt Ürünleri", imageUrl: "/milk.png" },
  { href: "/bespara", name: "Beş Para Etmeyen Ürünler", imageUrl: "/bespara.png" },
  { href: "/tozicecekler", name: "Toz İçecekler", imageUrl: "/instant.png" },
  { href: "/cips", name: "Cips & Çerez", imageUrl: "/dd.png" },
  { href: "/cayseker", name: "Çay ve Şekerler", imageUrl: "/cay.png" },
  { href: "/atistirma", name: "Atıştırmalıklar", imageUrl: "/atistirmaa.png" },
  { href: "/temizlik", name: "Temizlik & Hijyen", imageUrl: "/clean.png" },
  { href: "/kisisel", name: "Kişisel Bakım", imageUrl: "/care.png" },
  { href: "/makarna", name: "Makarna ve Kuru Bakliyat", imageUrl: "/makarna.png" },
  { href: "/et", name: "Şarküteri & Et Ürünleri", imageUrl: "/chicken.png" },
  { href: "/icecekler", name: "Buz Gibi İçecekler", imageUrl: "/juice.png" },
  { href: "/dondurulmus", name: "Dondurulmuş Gıdalar", imageUrl: "/frozen.png" },
  { href: "/baharat", name: "Baharatlar", imageUrl: "/spices.png" },
  { href: "/dondurma", name: "Dondurmalar", imageUrl: "/dondurma.png" }
];


const ProductsList = ({ onEdit, editingProduct, setEditingProduct, onSave }) => {
  const {
    deleteProduct,
    toggleFeaturedProduct,
    products,
    updateProductPrice,
    fetchAllProducts,
    reorderProducts,
  } = useProductStore();

  const [editingPrice, setEditingPrice] = useState({});
  const [newPrices, setNewPrices] = useState({});
  const [discountPrices, setDiscountPrices] = useState({});
  const [editingDiscount, setEditingDiscount] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [localProducts, setLocalProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [imageUploading, setImageUploading] = useState({});

  // Gelişmiş filtreleme state'leri
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    priceRange: { min: "", max: "" },
    stockStatus: "all", // all, inStock, outOfStock, lowStock
    visibility: "all", // all, visible, hidden
    featured: "all", // all, featured, notFeatured
    discount: "all", // all, discounted, notDiscounted
    image: "all", // all, hasImage, noImage
    sortBy: "order" // order, name, price, priceDesc
  });

  // Toplu işlemler state'leri
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [bulkActionMode, setBulkActionMode] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkPriceValue, setBulkPriceValue] = useState("");

  // Flash Sale state'leri
  const [showFlashSaleModal, setShowFlashSaleModal] = useState(false);
  const [flashSaleProduct, setFlashSaleProduct] = useState(null);
  const [flashSales, setFlashSales] = useState([]);
  const [flashSaleData, setFlashSaleData] = useState({
    discountPercentage: "",
    startDate: "",
    endDate: "",
    name: ""
  });

  // Flash Sale verilerini yükle
  useEffect(() => {
    fetchFlashSales();
  }, []);

  // Flash Sale süre güncellemesi için interval
  useEffect(() => {
    const interval = setInterval(() => {
      // Flash sale'leri yeniden render etmek için state'i güncelle
      setFlashSales(prev => [...prev]);
    }, 60000); // Her dakika güncelle

    return () => clearInterval(interval);
  }, []);

  const fetchFlashSales = async () => {
    try {
      const response = await axios.get("/flash-sales");
      setFlashSales(response.data.flashSales || []);
    } catch (error) {
      console.error("Flash sale'ler getirilemedi:", error);
    }
  };

  const saveOrderToBackend = async (newProducts) => {
    try {
      const productIds = newProducts.map((product) => product._id);
      await axios.post(
        "/products/reorder",
        { productIds },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      toast.success("Ürün sıralaması güncellendi!");
      await fetchAllProducts();
    } catch (error) {
      console.error("Sıralama güncelleme hatası:", error);
      toast.error("Sıralama güncellenirken hata oluştu.");
    }
  };

  // Flash Sale fonksiyonları
  const handleFlashSale = (product) => {
    setFlashSaleProduct(product);
    setFlashSaleData({
      discountPercentage: "",
      startDate: "",
      endDate: "",
      name: `${product.name} - Flash Sale`
    });
    setShowFlashSaleModal(true);
  };

  const handleFlashSaleSubmit = async (e) => {
    e.preventDefault();

    if (!flashSaleData.discountPercentage || !flashSaleData.startDate || !flashSaleData.endDate) {
      toast.error("Tüm alanları doldurun");
      return;
    }

    if (parseFloat(flashSaleData.discountPercentage) < 1 || parseFloat(flashSaleData.discountPercentage) > 99) {
      toast.error("İndirim oranı 1-99 arasında olmalı");
      return;
    }

    try {
      await axios.post("/flash-sales", {
        productId: flashSaleProduct._id,
        ...flashSaleData,
        discountPercentage: parseFloat(flashSaleData.discountPercentage)
      });

      toast.success("Flash sale oluşturuldu!");
      setShowFlashSaleModal(false);
      setFlashSaleProduct(null);
      setFlashSaleData({
        discountPercentage: "",
        startDate: "",
        endDate: "",
        name: ""
      });
      fetchAllProducts(); // Ürünleri yenile
      fetchFlashSales(); // Flash sale'leri yenile
    } catch (error) {
      console.error("Flash sale oluşturulamadı:", error);
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  const handleRemoveFlashSale = async (productId) => {
    if (!window.confirm("Bu ürünün flash sale'ini kaldırmak istediğinizden emin misiniz?")) {
      return;
    }

    try {
      // Flash sale'i bul ve sil
      const response = await axios.get("/flash-sales");
      const flashSales = response.data.flashSales || [];
      const productFlashSale = flashSales.find(sale => sale.product?._id === productId);

      if (productFlashSale) {
        await axios.delete(`/flash-sales/${productFlashSale._id}`);
        toast.success("Flash sale kaldırıldı!");
        fetchAllProducts(); // Ürünleri yenile
        fetchFlashSales(); // Flash sale'leri yenile
      }
    } catch (error) {
      console.error("Flash sale kaldırılamadı:", error);
      toast.error("İşlem başarısız");
    }
  };

  // Flash Sale kalan süre hesaplama
  const getFlashSaleTimeRemaining = (productId) => {
    const flashSale = flashSales.find(sale => sale.product?._id === productId);
    if (!flashSale) return null;

    const now = new Date();
    const start = new Date(flashSale.startDate);
    const end = new Date(flashSale.endDate);

    // Henüz başlamamış
    if (now < start) {
      const diff = start - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) return `${days}g ${hours}s sonra başlar`;
      if (hours > 0) return `${hours}s ${minutes}d sonra başlar`;
      return `${minutes}d sonra başlar`;
    }

    // Sona ermiş
    if (now > end) return "Sona erdi";

    // Aktif - kalan süre
    const diff = end - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}g ${hours}s kaldı`;
    if (hours > 0) return `${hours}s ${minutes}d kaldı`;
    return `${minutes}d kaldı`;
  };

  // Flash Sale durumu
  const getFlashSaleStatus = (productId) => {
    const flashSale = flashSales.find(sale => sale.product?._id === productId);
    if (!flashSale) return null;

    const now = new Date();
    const start = new Date(flashSale.startDate);
    const end = new Date(flashSale.endDate);

    if (now < start) return "upcoming";
    if (now > end) return "expired";
    return "active";
  };

  const onDragEnd = (result) => {
    const { destination, source } = result;

    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) {
      return;
    }

    const newProducts = Array.from(products);
    const [movedProduct] = newProducts.splice(source.index, 1);
    newProducts.splice(destination.index, 0, movedProduct);

    reorderProducts(newProducts);
    saveOrderToBackend(newProducts);
  };

  const toggleOutOfStock = async (productId) => {
    // Optimistic update - hemen UI'ı güncelle
    const previousState = localProducts.find(p => p._id === productId);
    if (!previousState) return;

    setLocalProducts(prevProducts =>
      prevProducts.map(product =>
        product._id === productId
          ? { ...product, isOutOfStock: !product.isOutOfStock }
          : product
      )
    );

    try {
      const response = await axios.patch(`/products/toggle-out-of-stock/${productId}`, {}, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.data && response.data.product) {
        // Backend'den gelen güncellenmiş ürünü kullan
        setLocalProducts(prevProducts =>
          prevProducts.map(product =>
            product._id === productId
              ? { ...product, ...response.data.product }
              : product
          )
        );
        toast.success(response.data.message || "Stok durumu güncellendi");
      } else {
        toast.success(response.data?.message || "Stok durumu güncellendi");
      }
    } catch (error) {
      console.error("Tükendi durumu değiştirme hatası:", error);
      // Hata durumunda önceki değere geri dön
      setLocalProducts(prevProducts =>
        prevProducts.map(product =>
          product._id === productId ? previousState : product
        )
      );
      toast.error(error.response?.data?.message || "Tükendi durumu değiştirilirken hata oluştu.");
    }
  };

  const handlePriceChange = (id, value) => {
    setNewPrices({ ...newPrices, [id]: value });
  };

  const savePrice = async (id) => {
    if (newPrices[id] === undefined) return;

    const newPrice = parseFloat(newPrices[id]);
    if (isNaN(newPrice) || newPrice < 0) {
      toast.error("Geçerli bir fiyat giriniz");
      return;
    }

    // Optimistic update - hemen UI'ı güncelle
    const previousPrice = localProducts.find(p => p._id === id)?.price;
    setLocalProducts(prevProducts =>
      prevProducts.map(product =>
        product._id === id ? { ...product, price: newPrice } : product
      )
    );
    setEditingPrice({ ...editingPrice, [id]: false });

    try {
      // API'ye gönder
      const updatedProduct = await updateProductPrice(id, newPrice);
      // Response'dan gelen güncellenmiş fiyatı kullan (server'dan gelen değer)
      if (updatedProduct) {
        setLocalProducts(prevProducts =>
          prevProducts.map(product =>
            product._id === id ? { ...product, price: updatedProduct.price } : product
          )
        );
      }
      toast.success("Fiyat başarıyla güncellendi");
    } catch (error) {
      console.error("Fiyat güncelleme hatası:", error);
      // Hata durumunda önceki değere geri dön
      setLocalProducts(prevProducts =>
        prevProducts.map(product =>
          product._id === id ? { ...product, price: previousPrice } : product
        )
      );
      toast.error(error.response?.data?.message || error.response?.data?.error || error.message || "Fiyat güncellenirken hata oluştu");
    }
  };

  const handleDiscountChange = (id, value) => {
    setDiscountPrices({ ...discountPrices, [id]: value });
  };

  const saveDiscount = async (id, originalPrice) => {
    if (discountPrices[id] !== undefined) {
      try {
        const discountedPrice = parseFloat(discountPrices[id]);
        if (discountedPrice >= originalPrice) {
          toast.error("İndirimli fiyat normal fiyattan yüksek olamaz!");
          return;
        }

        await axios.patch(`/products/${id}/discount`,
          { discountedPrice },
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        setLocalProducts(prevProducts =>
          prevProducts.map(product =>
            product._id === id ? {
              ...product,
              isDiscounted: true,
              discountedPrice: discountedPrice
            } : product
          )
        );

        setEditingDiscount({ ...editingDiscount, [id]: false });
        toast.success("İndirim başarıyla uygulandı");
      } catch (error) {
        console.error("İndirim uygulama hatası:", error);
        toast.error("İndirim uygulanırken hata oluştu");
      }
    }
  };

  const removeDiscount = async (id) => {
    try {
      await axios.delete(`/products/${id}/discount`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      setLocalProducts(prevProducts =>
        prevProducts.map(product =>
          product._id === id ? {
            ...product,
            isDiscounted: false,
            discountedPrice: null
          } : product
        )
      );

      toast.success("İndirim kaldırıldı");
    } catch (error) {
      console.error("İndirim kaldırma hatası:", error);
      toast.error("İndirim kaldırılırken hata oluştu");
    }
  };

  const handleProductChange = (field, value) => {
    setEditingProduct({
      ...editingProduct,
      [field]: value,
    });

    setLocalProducts(prevProducts =>
      prevProducts.map(product =>
        product._id === editingProduct?._id ? { ...product, [field]: value } : product
      )
    );
  };

  const handleFilterCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
  };

  const handleProductCategoryChange = (e) => {
    const newCategory = e.target.value.replace("/", "");
    handleProductChange("category", newCategory);
  };

  const toggleProductHidden = async (productId) => {
    // Optimistic update - hemen UI'ı güncelle
    const previousState = localProducts.find(p => p._id === productId);
    if (!previousState) return;

    setLocalProducts(prevProducts =>
      prevProducts.map(product =>
        product._id === productId
          ? { ...product, isHidden: !product.isHidden }
          : product
      )
    );

    try {
      const response = await axios.patch(`/products/toggle-hidden/${productId}`, {}, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.data && response.data.product) {
        // Backend'den gelen güncellenmiş ürünü kullan
        setLocalProducts(prevProducts =>
          prevProducts.map(product =>
            product._id === productId
              ? { ...product, ...response.data.product }
              : product
          )
        );
        toast.success(response.data.message || "Ürün durumu güncellendi");
      } else {
        toast.success(response.data?.message || "Ürün durumu güncellendi");
      }
    } catch (error) {
      console.error("Ürün gizleme/gösterme hatası:", error);
      // Hata durumunda önceki değere geri dön
      setLocalProducts(prevProducts =>
        prevProducts.map(product =>
          product._id === productId ? previousState : product
        )
      );
      toast.error(error.response?.data?.message || "Ürün gizleme/gösterme sırasında hata oluştu.");
    }
  };

  const handleImageUpload = async (productId, file) => {
    try {
      setImageUploading(prev => ({ ...prev, [productId]: true }));

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const response = await axios.patch(
            `/products/${productId}/image`,
            { image: reader.result },
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          );

          setLocalProducts(prevProducts =>
            prevProducts.map(product =>
              product._id === productId ? { ...product, image: response.data.image } : product
            )
          );

          toast.success("Ürün görseli güncellendi");
        } catch (error) {
          console.error("Görsel yükleme hatası:", error);
          toast.error("Görsel yüklenirken hata oluştu");
        } finally {
          setImageUploading(prev => ({ ...prev, [productId]: false }));
        }
      };
    } catch (error) {
      console.error("Dosya okuma hatası:", error);
      toast.error("Dosya okunurken hata oluştu");
      setImageUploading(prev => ({ ...prev, [productId]: false }));
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filtrelenmiş ürünleri hesapla
  const getFilteredProducts = () => {
    let filtered = [...localProducts];

    // Fiyat aralığı filtresi
    if (filters.priceRange.min) {
      filtered = filtered.filter(p => p.price >= parseFloat(filters.priceRange.min));
    }
    if (filters.priceRange.max) {
      filtered = filtered.filter(p => p.price <= parseFloat(filters.priceRange.max));
    }

    // Stok durumu filtresi
    if (filters.stockStatus === "inStock") {
      filtered = filtered.filter(p => !p.isOutOfStock);
    } else if (filters.stockStatus === "outOfStock") {
      filtered = filtered.filter(p => p.isOutOfStock);
    }

    // Görünürlük filtresi
    if (filters.visibility === "visible") {
      filtered = filtered.filter(p => !p.isHidden);
    } else if (filters.visibility === "hidden") {
      filtered = filtered.filter(p => p.isHidden);
    }

    // Öne çıkan filtresi
    if (filters.featured === "featured") {
      filtered = filtered.filter(p => p.isFeatured);
    } else if (filters.featured === "notFeatured") {
      filtered = filtered.filter(p => !p.isFeatured);
    }

    // İndirim filtresi
    if (filters.discount === "discounted") {
      filtered = filtered.filter(p => p.isDiscounted);
    } else if (filters.discount === "notDiscounted") {
      filtered = filtered.filter(p => !p.isDiscounted);
    }

    // Görsel filtresi
    if (filters.image === "hasImage") {
      filtered = filtered.filter(p => p.image && p.image.trim() !== "");
    } else if (filters.image === "noImage") {
      filtered = filtered.filter(p => !p.image || p.image.trim() === "");
    }

    // Sıralama
    if (filters.sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    } else if (filters.sortBy === "price") {
      filtered.sort((a, b) => a.price - b.price);
    } else if (filters.sortBy === "priceDesc") {
      filtered.sort((a, b) => b.price - a.price);
    }

    return filtered;
  };

  const filteredProducts = getFilteredProducts();

  const loadProducts = useCallback(async () => {
    if (loading) return;

    try {
      setLoading(true);
      const response = await axios.get("/products", {
        params: {
          page,
          limit: 50,
          category: selectedCategory ? selectedCategory.replace("/", "") : undefined,
          search: debouncedSearchTerm || undefined,
          _t: Date.now() // Cache busting için timestamp
        }
      });

      const { products: newProducts, pagination } = response.data;

      setLocalProducts(prev => {
        if (page === 1) return newProducts;
        return [...prev, ...newProducts];
      });

      setHasMore(pagination.hasMore);

      if (page === 1) {
        setEditingPrice({});
        setNewPrices({});
        setEditingDiscount({});
        setDiscountPrices({});
      }
    } catch (error) {
      console.error("Ürünler yüklenirken hata:", error);
      toast.error("Ürünler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [page, selectedCategory, debouncedSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setLocalProducts([]);
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedCategory, debouncedSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 300);

    return () => clearTimeout(timer);
  }, [loadProducts, page]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [loading, hasMore]);

  const calculateDiscountPercentage = (price, discountedPrice) => {
    if (!price || !discountedPrice) return 0;
    return (((price - discountedPrice) / price) * 100).toFixed(0);
  };

  const handleDeleteProduct = async (productId) => {
    try {
      await deleteProduct(productId);
      setLocalProducts(prevProducts => prevProducts.filter(product => product._id !== productId));
    } catch (error) {
      console.error("Ürün silme hatası:", error);
      toast.error("Ürün silinirken hata oluştu");
    }
  };

  const handleFeatureToggle = async (productId) => {
    const product = localProducts.find(p => p._id === productId);
    if (!product) return;

    try {
      await toggleFeaturedProduct(productId);
      setLocalProducts(prevProducts =>
        prevProducts.map(p =>
          p._id === productId
            ? { ...p, isFeatured: !p.isFeatured }
            : p
        )
      );
    } catch (error) {
      console.error("Öne çıkarma durumu değiştirme hatası:", error);
      toast.error("Öne çıkarma durumu değiştirilirken hata oluştu");
    }
  };

  // Quick filter chip state
  const [quickFilter, setQuickFilter] = useState("all");
  const quickFilterChips = [
    { key: "all", label: "Tümü", icon: Package, count: localProducts.length },
    { key: "inStock", label: "Stokta", icon: CheckSquare, count: localProducts.filter(p => !p.isOutOfStock).length },
    { key: "outOfStock", label: "Tükendi", icon: AlertTriangle, count: localProducts.filter(p => p.isOutOfStock).length },
    { key: "hidden", label: "Gizli", icon: EyeOff, count: localProducts.filter(p => p.isHidden).length },
    { key: "featured", label: "Öne Çıkanlar", icon: Star, count: localProducts.filter(p => p.isFeatured).length },
  ];

  // Apply quick filter on top of advanced filters
  const applyQuickFilter = (prods) => {
    if (quickFilter === "inStock") return prods.filter(p => !p.isOutOfStock);
    if (quickFilter === "outOfStock") return prods.filter(p => p.isOutOfStock);
    if (quickFilter === "hidden") return prods.filter(p => p.isHidden);
    if (quickFilter === "featured") return prods.filter(p => p.isFeatured);
    return prods;
  };

  const displayProducts = applyQuickFilter(filteredProducts);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* ════════ Stat Cards — Neon Glow ════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Package, label: "Ürün Sayısı", tag: "Toplam", value: localProducts.length || products.length, color: "cyan", delay: 0.05 },
          { icon: DollarSign, label: "Toplam Stok Değeri", tag: "Değer", value: `₺${localProducts.reduce((sum, p) => sum + (p.price * (p.stock || 0)), 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`, color: "blue", delay: 0.1 },
          { icon: Zap, label: "Aktif Flash Sale", tag: "Flash", value: flashSales.filter(s => new Date(s.endDate) > new Date()).length, color: "amber", delay: 0.15 },
          { icon: AlertTriangle, label: "Düşük Stok", tag: "Uyarı", value: localProducts.filter(p => (p.stock || 0) < 5 && (p.stock || 0) > 0).length, color: "rose", delay: 0.2 },
        ].map(({ icon: Icon, label, tag, value, color, delay }) => (
          <motion.div
            key={tag}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className={`relative overflow-hidden bg-gray-900/60 backdrop-blur-xl p-5 rounded-2xl border border-${color}-500/20 shadow-[0_0_25px_rgba(var(--tw-shadow-color),0.08)] group hover:border-${color}-400/40 transition-all duration-300`}
            style={{ "--tw-shadow-color": color === "cyan" ? "6,182,212" : color === "blue" ? "59,130,246" : color === "amber" ? "245,158,11" : "244,63,94" }}
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-${color}-500/5 rounded-full blur-2xl -translate-y-6 translate-x-6`} />
            <div className="relative flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl bg-${color}-500/10 border border-${color}-500/20`}>
                <Icon className={`w-5 h-5 text-${color}-400`} />
              </div>
              <span className={`text-${color}-400 text-[10px] font-bold uppercase tracking-widest bg-${color}-500/10 px-2.5 py-1 rounded-full border border-${color}-500/20`}>{tag}</span>
            </div>
            <p className="text-gray-500 text-xs mb-1 font-medium">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
          </motion.div>
        ))}
      </div>

      {/* ════════ Main Panel — Frosted Glass ════════ */}
      <div className="bg-gray-900/60 backdrop-blur-2xl shadow-[0_0_40px_rgba(6,182,212,0.04)] rounded-2xl overflow-hidden border border-cyan-500/10">
        {/* Decorative top border glow */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

        {/* ─── Filter & Search Panel ─── */}
        <div className="p-6 space-y-4 border-b border-white/[0.04]">
          {/* Search Bar */}
          <div className="flex gap-3">
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 w-5 h-5 transition-colors duration-300" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ürün adı ile ara..."
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-600
                focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.05] focus:shadow-[0_0_20px_rgba(6,182,212,0.08)]
                transition-all duration-300 text-sm"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-xl transition-all duration-300 text-sm font-medium ${showFilters
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                : "bg-white/[0.03] text-gray-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-gray-200"
                }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Gelişmiş Filtreler</span>
              {(filters.stockStatus !== "all" || filters.visibility !== "all" || filters.featured !== "all" ||
                filters.discount !== "all" || filters.priceRange.min || filters.priceRange.max) && (
                  <span className="bg-cyan-400 text-gray-950 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                    !
                  </span>
                )}
            </motion.button>
          </div>

          {/* Quick Filter Chips */}
          <div className="flex flex-wrap gap-2">
            {quickFilterChips.map(chip => {
              const isActive = quickFilter === chip.key;
              const ChipIcon = chip.icon;
              return (
                <motion.button
                  key={chip.key}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setQuickFilter(chip.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 border ${isActive
                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.12)]"
                    : "bg-white/[0.02] text-gray-500 border-white/[0.04] hover:bg-white/[0.05] hover:text-gray-300"
                    }`}
                >
                  <ChipIcon size={14} />
                  {chip.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.05] text-gray-600"}`}>
                    {chip.count}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Genişletilebilir Filtre Paneli */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Kategori */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <Package className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />Kategori
                      </label>
                      <select value={selectedCategory} onChange={handleFilterCategoryChange}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500/30 transition-all duration-300">
                        <option value="">Tüm Kategoriler</option>
                        {categories.map(c => <option key={c.href} value={c.href}>{c.name}</option>)}
                      </select>
                    </div>
                    {/* Fiyat Aralığı */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <DollarSign className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />Fiyat Aralığı
                      </label>
                      <div className="flex gap-2">
                        <input type="number" placeholder="Min" value={filters.priceRange.min}
                          onChange={(e) => setFilters({ ...filters, priceRange: { ...filters.priceRange, min: e.target.value } })}
                          className="w-1/2 bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                        <input type="number" placeholder="Max" value={filters.priceRange.max}
                          onChange={(e) => setFilters({ ...filters, priceRange: { ...filters.priceRange, max: e.target.value } })}
                          className="w-1/2 bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                      </div>
                    </div>
                    {/* Stok Durumu */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />Stok Durumu
                      </label>
                      <select value={filters.stockStatus} onChange={(e) => setFilters({ ...filters, stockStatus: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                        <option value="all">Tümü</option><option value="inStock">Stokta</option><option value="outOfStock">Tükendi</option>
                      </select>
                    </div>
                    {/* Görünürlük */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <Eye className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />Görünürlük
                      </label>
                      <select value={filters.visibility} onChange={(e) => setFilters({ ...filters, visibility: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                        <option value="all">Tümü</option><option value="visible">Görünür</option><option value="hidden">Gizli</option>
                      </select>
                    </div>
                    {/* Öne Çıkan */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <Star className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />Öne Çıkan
                      </label>
                      <select value={filters.featured} onChange={(e) => setFilters({ ...filters, featured: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                        <option value="all">Tümü</option><option value="featured">Öne Çıkan</option><option value="notFeatured">Öne Çıkmayan</option>
                      </select>
                    </div>
                    {/* İndirim */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />İndirim Durumu
                      </label>
                      <select value={filters.discount} onChange={(e) => setFilters({ ...filters, discount: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                        <option value="all">Tümü</option><option value="discounted">İndirimli</option><option value="notDiscounted">İndirimsiz</option>
                      </select>
                    </div>
                    {/* Görsel Durumu */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <Upload className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />Görsel Durumu
                      </label>
                      <select value={filters.image} onChange={(e) => setFilters({ ...filters, image: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                        <option value="all">Tümü</option><option value="hasImage">Görseli Var</option><option value="noImage">🚨 Görseli Yok</option>
                      </select>
                    </div>
                    {/* Sıralama */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        <Filter className="w-3.5 h-3.5 inline mr-1.5 text-cyan-500" />Sıralama
                      </label>
                      <select value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                        <option value="order">Varsayılan</option><option value="name">İsme Göre (A-Z)</option><option value="price">Fiyat (Düşük-Yüksek)</option><option value="priceDesc">Fiyat (Yüksek-Düşük)</option>
                      </select>
                    </div>
                    {/* Temizle */}
                    <div className="flex items-end">
                      <button onClick={() => { setFilters({ priceRange: { min: "", max: "" }, stockStatus: "all", visibility: "all", featured: "all", discount: "all", image: "all", sortBy: "order" }); setSelectedCategory(""); }}
                        className="w-full bg-rose-500/10 text-rose-400 px-4 py-2.5 rounded-xl hover:bg-rose-500/20 border border-rose-500/10 hover:border-rose-500/20 transition-all text-sm font-medium">
                        Filtreleri Temizle
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Filter info bar */}
        {displayProducts.length !== localProducts.length && (
          <div className="px-6 py-3 bg-cyan-500/[0.04] border-b border-cyan-500/10">
            <p className="text-cyan-400 text-xs font-medium">
              <Filter className="w-3.5 h-3.5 inline mr-1.5" />
              {displayProducts.length} ürün gösteriliyor ({localProducts.length} toplam)
            </p>
          </div>
        )}

        <InfiniteScroll
          dataLength={displayProducts.length}
          next={loadMore}
          hasMore={hasMore}
          loader={
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-500/30 border-t-cyan-400 mx-auto"></div>
            </div>
          }
          endMessage={
            <div className="text-center py-8 text-gray-600 text-sm">
              Tüm ürünler yüklendi
            </div>
          }
          scrollableTarget="scrollableDiv"
        >
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="products">
              {(provided) => (
                <div
                  className="min-w-full"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {/* ─── Table Header ─── */}
                  <div className="bg-gray-950/60 sticky top-0 z-10 backdrop-blur-xl border-b border-white/[0.04]">
                    <div className="grid grid-cols-[2fr,1fr,1fr,0.5fr,0.5fr,0.5fr,1fr] gap-4 px-6 py-3.5">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em]">ÜRÜN</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em]">FİYAT</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em]">KATEGORİ</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] text-center">ÖNE ÇIKANLAR</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] text-center">DURUM</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] text-center">STOK</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] text-center">İŞLEMLER</div>
                    </div>
                  </div>

                  {/* ─── Product Rows ─── */}
                  <div>
                    {displayProducts.map((product, index) => (
                      <Draggable key={product._id} draggableId={product._id} index={index}>
                        {(provided) => (
                          <motion.div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="border-b border-white/[0.03] hover:bg-white/[0.03] hover:border-cyan-500/10 hover:-translate-y-[1px] hover:shadow-[inset_0_0_20px_rgba(6,182,212,0.03)] transition-all duration-300 group"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div className="grid grid-cols-[2fr,1fr,1fr,0.5fr,0.5fr,0.5fr,1fr] gap-4 px-6 py-4 items-center">
                              {/* ── Product Column (Image + Name) ── */}
                              <div className="flex items-center gap-4">
                                <div className="relative flex-shrink-0 h-20 w-20 bg-white/[0.02] rounded-2xl overflow-hidden border border-white/[0.06] group/img hover:border-cyan-500/20 hover:shadow-[0_0_15px_rgba(6,182,212,0.08)] transition-all duration-300">
                                  <input type="file" id={`image-upload-${product._id}`} className="hidden" accept="image/*"
                                    onChange={(e) => handleImageUpload(product._id, e.target.files[0])} />
                                  <label htmlFor={`image-upload-${product._id}`} className="cursor-pointer w-full h-full flex items-center justify-center">
                                    {imageUploading[product._id] ? (
                                      <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-500/30 border-t-cyan-400"></div>
                                      </div>
                                    ) : (
                                      <>
                                        <img className="h-full w-full object-contain p-2" src={product.image || '/placeholder.png'} alt={product.name} />
                                        <div className="absolute inset-0 bg-gray-950/80 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity duration-200">
                                          <Upload className="h-5 w-5 text-cyan-400" />
                                        </div>
                                      </>
                                    )}
                                  </label>
                                  {/* Flash Sale Badge */}
                                  {getFlashSaleTimeRemaining(product._id) && (
                                    <div className={`absolute -top-1 -right-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white shadow-lg ${getFlashSaleStatus(product._id) === 'active' ? 'bg-gradient-to-r from-rose-500 to-orange-500 shadow-rose-500/30' :
                                      getFlashSaleStatus(product._id) === 'upcoming' ? 'bg-gradient-to-r from-blue-500 to-purple-500 shadow-blue-500/30' : 'bg-gray-600'
                                      }`}>
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span className="whitespace-nowrap">{getFlashSaleTimeRemaining(product._id)}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  {editingProduct && editingProduct._id === product._id ? (
                                    <input type="text" name="name" value={editingProduct.name}
                                      onChange={(e) => handleProductChange("name", e.target.value)}
                                      className="bg-white/[0.04] text-white border border-cyan-500/20 rounded-xl px-3 py-2 w-full text-sm focus:outline-none focus:border-cyan-500/40 transition-all" />
                                  ) : (
                                    <div>
                                      <div className="text-sm font-semibold text-white truncate mb-0.5" title={product.name}>{product.name}</div>
                                      <div className="text-[11px] text-gray-600 truncate">{product.category || "Kategori Yok"}</div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* ── Price Column ── */}
                              <div>
                                {editingPrice[product._id] ? (
                                  <div className="flex items-center gap-2">
                                    <input type="number" value={newPrices[product._id] ?? product.price}
                                      onChange={(e) => handlePriceChange(product._id, e.target.value)}
                                      className="bg-white/[0.04] text-white border border-cyan-500/20 rounded-lg px-3 py-2 w-24 text-sm focus:outline-none focus:border-cyan-500/40" />
                                    <button onClick={() => savePrice(product._id)} className="text-cyan-400 bg-cyan-500/10 p-2 rounded-lg hover:bg-cyan-500/20 transition-all"><Save className="h-4 w-4" /></button>
                                  </div>
                                ) : editingDiscount[product._id] ? (
                                  <div className="flex items-center gap-2">
                                    <input type="number" value={discountPrices[product._id] ?? product.price}
                                      onChange={(e) => handleDiscountChange(product._id, e.target.value)}
                                      className="bg-white/[0.04] text-white border border-cyan-500/20 rounded-lg px-3 py-2 w-24 text-sm focus:outline-none focus:border-cyan-500/40" />
                                    <button onClick={() => saveDiscount(product._id, product.price)} className="text-cyan-400 bg-cyan-500/10 p-2 rounded-lg hover:bg-cyan-500/20 transition-all"><Save className="h-4 w-4" /></button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col">
                                    {product.isDiscounted && (
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[11px] text-gray-600 line-through">₺{(product.price || 0).toFixed(2)}</span>
                                        <span className="text-[10px] bg-rose-500/15 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/10 font-bold">
                                          %{calculateDiscountPercentage(product.price, product.discountedPrice)}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-white font-semibold">
                                        ₺{((product.isDiscounted ? product.discountedPrice : product.price) || 0).toFixed(2)}
                                      </span>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditingPrice({ ...editingPrice, [product._id]: true })}
                                          className="text-amber-400 bg-amber-500/10 p-1.5 rounded-lg hover:bg-amber-500/20 transition-all"><Edit className="h-3.5 w-3.5" /></button>
                                        {product.isDiscounted ? (
                                          <button onClick={() => removeDiscount(product._id)}
                                            className="text-rose-400 bg-rose-500/10 p-1.5 rounded-lg hover:bg-rose-500/20 transition-all"><X className="h-3.5 w-3.5" /></button>
                                        ) : (
                                          <button onClick={() => setEditingDiscount({ ...editingDiscount, [product._id]: true })}
                                            className="text-violet-400 bg-violet-500/10 p-1.5 rounded-lg hover:bg-violet-500/20 transition-all text-xs font-bold" title="İndirim Ekle">%</button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* ── Category Column ── */}
                              <div>
                                {editingProduct && editingProduct._id === product._id ? (
                                  <select value={editingProduct.category ? `/${editingProduct.category}` : ""} onChange={handleProductCategoryChange}
                                    className="bg-white/[0.04] text-white border border-cyan-500/20 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:border-cyan-500/40">
                                    <option value="">Kategori Seçin</option>
                                    {categories.map(c => <option key={c.href} value={c.href}>{c.name}</option>)}
                                  </select>
                                ) : (
                                  <span className="text-sm text-gray-400">{product.category || "—"}</span>
                                )}
                              </div>

                              {/* ── Featured Column ── */}
                              <div className="flex justify-center">
                                <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                                  onClick={() => handleFeatureToggle(product._id)}
                                  className={`p-2 rounded-xl transition-all duration-200 ${product.isFeatured
                                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                                    : "bg-white/[0.02] text-gray-600 border border-white/[0.04] opacity-50 group-hover:opacity-100"
                                    }`}
                                >
                                  <Star className="h-4 w-4" fill={product.isFeatured ? "currentColor" : "none"} />
                                </motion.button>
                              </div>

                              {/* ── Visibility Column — Neon Pill ── */}
                              <div className="flex justify-center">
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                  onClick={() => toggleProductHidden(product._id)}
                                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-300 border ${product.isHidden
                                    ? "bg-gray-500/10 text-gray-400 border-gray-500/20 shadow-[0_0_8px_rgba(107,114,128,0.15)]"
                                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                                    }`}
                                >
                                  {product.isHidden ? "Gizli" : "Görünür"}
                                </motion.button>
                              </div>

                              {/* ── Stock Column — Neon Pill ── */}
                              <div className="flex justify-center">
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                  onClick={() => toggleOutOfStock(product._id)}
                                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-300 border ${product.isOutOfStock
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.15)]"
                                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                                    }`}
                                >
                                  {product.isOutOfStock ? "Tükendi" : "Stokta"}
                                </motion.button>
                              </div>

                              {/* ── Actions Column ── */}
                              <div className="flex justify-center gap-1.5">
                                {editingProduct && editingProduct._id === product._id ? (
                                  <>
                                    <button onClick={() => onSave(product._id, editingProduct)}
                                      className="text-cyan-400 bg-cyan-500/10 p-2 rounded-xl hover:bg-cyan-500/20 border border-cyan-500/10 transition-all"><Save className="h-4 w-4" /></button>
                                    <button onClick={() => setEditingProduct(null)}
                                      className="text-rose-400 bg-rose-500/10 p-2 rounded-xl hover:bg-rose-500/20 border border-rose-500/10 transition-all"><X className="h-4 w-4" /></button>
                                  </>
                                ) : (
                                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    {product.isDiscounted ? (
                                      <button onClick={() => handleRemoveFlashSale(product._id)} title="Flash Sale Kaldır"
                                        className="text-orange-400 bg-orange-500/10 p-2 rounded-xl hover:bg-orange-500/20 border border-orange-500/10 transition-all"><Zap className="h-4 w-4" /></button>
                                    ) : (
                                      <button onClick={() => handleFlashSale(product)} title="Flash Sale Ekle"
                                        className="text-amber-400 bg-amber-500/10 p-2 rounded-xl hover:bg-amber-500/20 border border-amber-500/10 transition-all"><Zap className="h-4 w-4" /></button>
                                    )}
                                    <button onClick={() => onEdit(product)}
                                      className="text-cyan-400 bg-cyan-500/10 p-2 rounded-xl hover:bg-cyan-500/20 border border-cyan-500/10 transition-all"><Edit className="h-4 w-4" /></button>
                                    <button onClick={() => handleDeleteProduct(product._id)}
                                      className="text-rose-400 bg-rose-500/10 p-2 rounded-xl hover:bg-rose-500/20 border border-rose-500/10 transition-all"><Trash className="h-4 w-4" /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </InfiniteScroll>

        {/* ─── Flash Sale Modal — Glass ─── */}
        <AnimatePresence>
          {showFlashSaleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 10 }}
                className="bg-gray-900/90 backdrop-blur-2xl rounded-2xl p-6 max-w-md w-full border border-amber-500/15 shadow-[0_0_40px_rgba(245,158,11,0.08)]"
              >
                <div className="h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent -mt-6 mb-6 -mx-6 rounded-t-2xl" />
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    Flash Sale Ekle
                  </h3>
                  <button onClick={() => setShowFlashSaleModal(false)} className="p-2 hover:bg-white/[0.05] rounded-xl transition-colors border border-white/[0.04]">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                {flashSaleProduct && (
                  <div className="mb-5 p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      {flashSaleProduct.image && (
                        <img src={flashSaleProduct.image} alt={flashSaleProduct.name} className="w-12 h-12 object-cover rounded-xl border border-white/[0.06]" />
                      )}
                      <div>
                        <h4 className="text-white font-semibold text-sm">{flashSaleProduct.name}</h4>
                        <p className="text-gray-500 text-xs mt-0.5">₺{flashSaleProduct.price}</p>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleFlashSaleSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">Kampanya Adı</label>
                    <input type="text" value={flashSaleData.name} onChange={(e) => setFlashSaleData({ ...flashSaleData, name: e.target.value })}
                      placeholder="Örn: Hafta Sonu Kampanyası"
                      className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500/30 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">İndirim Oranı (%)</label>
                    <input type="number" min="1" max="99" value={flashSaleData.discountPercentage} onChange={(e) => setFlashSaleData({ ...flashSaleData, discountPercentage: e.target.value })}
                      className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500/30 transition-all" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">Başlangıç Tarihi</label>
                    <input type="datetime-local" value={flashSaleData.startDate} onChange={(e) => setFlashSaleData({ ...flashSaleData, startDate: e.target.value })}
                      className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500/30 transition-all" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">Bitiş Tarihi</label>
                    <input type="datetime-local" value={flashSaleData.endDate} onChange={(e) => setFlashSaleData({ ...flashSaleData, endDate: e.target.value })}
                      className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500/30 transition-all" required />
                  </div>
                  <div className="flex gap-3 pt-3">
                    <button type="button" onClick={() => setShowFlashSaleModal(false)}
                      className="flex-1 px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] text-gray-300 rounded-xl transition-all border border-white/[0.06] text-sm font-medium">
                      İptal
                    </button>
                    <button type="submit"
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all flex items-center justify-center gap-2 text-sm font-bold">
                      <Zap className="w-4 h-4" />
                      Flash Sale Oluştur
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ProductsList;