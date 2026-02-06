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

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-xl p-5 rounded-2xl border border-emerald-500/30"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-xl bg-emerald-500/20">
              <Package className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2 py-1 rounded-full">Toplam</span>
          </div>
          <p className="text-gray-400 text-xs mb-1">Ürün Sayısı</p>
          <p className="text-2xl font-bold text-white">{localProducts.length || products.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 backdrop-blur-xl p-5 rounded-2xl border border-blue-500/30"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-xl bg-blue-500/20">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-blue-400 text-xs font-semibold bg-blue-500/10 px-2 py-1 rounded-full">Değer</span>
          </div>
          <p className="text-gray-400 text-xs mb-1">Toplam Stok Değeri</p>
          <p className="text-2xl font-bold text-white">
            ₺{localProducts.reduce((sum, p) => sum + (p.price * (p.stock || 0)), 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-xl p-5 rounded-2xl border border-amber-500/30"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-xl bg-amber-500/20">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-amber-400 text-xs font-semibold bg-amber-500/10 px-2 py-1 rounded-full">Flash</span>
          </div>
          <p className="text-gray-400 text-xs mb-1">Aktif Flash Sale</p>
          <p className="text-2xl font-bold text-white">{flashSales.filter(s => new Date(s.endDate) > new Date()).length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-br from-red-500/20 to-pink-500/20 backdrop-blur-xl p-5 rounded-2xl border border-red-500/30"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-xl bg-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-red-400 text-xs font-semibold bg-red-500/10 px-2 py-1 rounded-full">Uyarı</span>
          </div>
          <p className="text-gray-400 text-xs mb-1">Düşük Stok</p>
          <p className="text-2xl font-bold text-white">{localProducts.filter(p => (p.stock || 0) < 5 && (p.stock || 0) > 0).length}</p>
        </motion.div>
      </div>

      {/* Ana Ürün Listesi Kartı */}
      <div className="bg-gray-800/30 shadow-2xl rounded-2xl overflow-hidden border border-gray-700/50">
        {/* Gelişmiş Filtreleme Paneli */}
        <div className="p-6 bg-gray-900/50 space-y-4 backdrop-blur-xl border-b border-gray-700/50">
          {/* Üst Arama ve Filtre Butonları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Arama */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ürün adı ile ara..."
                  className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl pl-10 pr-4 py-3 text-white 
                  focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                  transition-all duration-200"
                />
              </div>
            </div>

            {/* Filtre Toggle Butonu */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all ${showFilters
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-700/50 text-gray-300 hover:bg-gray-700"
                }`}
            >
              <SlidersHorizontal className="w-5 h-5" />
              Gelişmiş Filtreler
              {(filters.stockStatus !== "all" || filters.visibility !== "all" || filters.featured !== "all" ||
                filters.discount !== "all" || filters.priceRange.min || filters.priceRange.max) && (
                  <span className="ml-2 bg-emerald-400 text-gray-900 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                    !
                  </span>
                )}
            </button>
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
                <div className="pt-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Kategori Filtresi */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Package className="w-4 h-4 inline mr-2" />
                        Kategori
                      </label>
                      <select
                        value={selectedCategory}
                        onChange={handleFilterCategoryChange}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-4 text-white 
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                        transition-all duration-200"
                      >
                        <option value="">Tüm Kategoriler</option>
                        {categories.map((category) => (
                          <option key={category.href} value={category.href}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Fiyat Aralığı */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <DollarSign className="w-4 h-4 inline mr-2" />
                        Fiyat Aralığı
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.priceRange.min}
                          onChange={(e) => setFilters({
                            ...filters,
                            priceRange: { ...filters.priceRange, min: e.target.value }
                          })}
                          className="w-1/2 bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-3 text-white 
                          focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.priceRange.max}
                          onChange={(e) => setFilters({
                            ...filters,
                            priceRange: { ...filters.priceRange, max: e.target.value }
                          })}
                          className="w-1/2 bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-3 text-white 
                          focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>
                    </div>

                    {/* Stok Durumu */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <AlertTriangle className="w-4 h-4 inline mr-2" />
                        Stok Durumu
                      </label>
                      <select
                        value={filters.stockStatus}
                        onChange={(e) => setFilters({ ...filters, stockStatus: e.target.value })}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-4 text-white 
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="all">Tümü</option>
                        <option value="inStock">Stokta</option>
                        <option value="outOfStock">Tükendi</option>
                      </select>
                    </div>

                    {/* Görünürlük */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Eye className="w-4 h-4 inline mr-2" />
                        Görünürlük
                      </label>
                      <select
                        value={filters.visibility}
                        onChange={(e) => setFilters({ ...filters, visibility: e.target.value })}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-4 text-white 
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="all">Tümü</option>
                        <option value="visible">Görünür</option>
                        <option value="hidden">Gizli</option>
                      </select>
                    </div>

                    {/* Öne Çıkan */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Star className="w-4 h-4 inline mr-2" />
                        Öne Çıkan
                      </label>
                      <select
                        value={filters.featured}
                        onChange={(e) => setFilters({ ...filters, featured: e.target.value })}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-4 text-white 
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="all">Tümü</option>
                        <option value="featured">Öne Çıkan</option>
                        <option value="notFeatured">Öne Çıkmayan</option>
                      </select>
                    </div>

                    {/* İndirim */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <TrendingUp className="w-4 h-4 inline mr-2" />
                        İndirim Durumu
                      </label>
                      <select
                        value={filters.discount}
                        onChange={(e) => setFilters({ ...filters, discount: e.target.value })}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-4 text-white 
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="all">Tümü</option>
                        <option value="discounted">İndirimli</option>
                        <option value="notDiscounted">İndirimsiz</option>
                      </select>
                    </div>

                    {/* Görsel Durumu */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Upload className="w-4 h-4 inline mr-2" />
                        Görsel Durumu
                      </label>
                      <select
                        value={filters.image}
                        onChange={(e) => setFilters({ ...filters, image: e.target.value })}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-4 text-white 
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="all">Tümü</option>
                        <option value="hasImage">Görseli Var</option>
                        <option value="noImage">🚨 Görseli Yok</option>
                      </select>
                    </div>

                    {/* Sıralama */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Filter className="w-4 h-4 inline mr-2" />
                        Sıralama
                      </label>
                      <select
                        value={filters.sortBy}
                        onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl py-2.5 px-4 text-white 
                        focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="order">Varsayılan Sıralama</option>
                        <option value="name">İsme Göre (A-Z)</option>
                        <option value="price">Fiyata Göre (Düşük-Yüksek)</option>
                        <option value="priceDesc">Fiyata Göre (Yüksek-Düşük)</option>
                      </select>
                    </div>

                    {/* Temizle Butonu */}
                    <div className="flex items-end">
                      <button
                        onClick={() => {
                          setFilters({
                            priceRange: { min: "", max: "" },
                            stockStatus: "all",
                            visibility: "all",
                            featured: "all",
                            discount: "all",
                            sortBy: "order"
                          });
                          setSelectedCategory("");
                        }}
                        className="w-full bg-red-500/10 text-red-400 px-4 py-2.5 rounded-xl hover:bg-red-500/20 transition-all"
                      >
                        Filtreleri Temizle
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Filtreleme Sonucu Bilgisi */}
        {filteredProducts.length !== localProducts.length && (
          <div className="px-6 py-3 bg-emerald-500/10 border-y border-emerald-500/20">
            <p className="text-emerald-400 text-sm">
              <Filter className="w-4 h-4 inline mr-2" />
              {filteredProducts.length} ürün gösteriliyor ({localProducts.length} ürün içinden)
            </p>
          </div>
        )}

        <InfiniteScroll
          dataLength={filteredProducts.length}
          next={loadMore}
          hasMore={hasMore}
          loader={
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
            </div>
          }
          endMessage={
            <div className="text-center py-8 text-gray-400">
              Tüm ürünler yüklendi
            </div>
          }
          scrollableTarget="scrollableDiv"
        >
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="products">
              {(provided) => (
                <div
                  className="min-w-full divide-y divide-gray-700/50"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  <div className="bg-gray-900/50 sticky top-0 z-10 backdrop-blur-xl">
                    <div className="grid grid-cols-[2fr,1fr,1fr,0.5fr,0.5fr,0.5fr,1fr] gap-4 px-6 py-4">
                      <div className="text-xs font-medium text-gray-300 uppercase tracking-wider">ÜRÜN</div>
                      <div className="text-xs font-medium text-gray-300 uppercase tracking-wider">FİYAT</div>
                      <div className="text-xs font-medium text-gray-300 uppercase tracking-wider">KATEGORİ</div>
                      <div className="text-xs font-medium text-gray-300 uppercase tracking-wider text-center">ÖNE ÇIKANLAR</div>
                      <div className="text-xs font-medium text-gray-300 uppercase tracking-wider text-center">GİZLİ</div>
                      <div className="text-xs font-medium text-gray-300 uppercase tracking-wider text-center">TÜKENDİ</div>
                      <div className="text-xs font-medium text-gray-300 uppercase tracking-wider text-center">İŞLEMLER</div>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-700/50">
                    {filteredProducts.map((product, index) => (
                      <Draggable key={product._id} draggableId={product._id} index={index}>
                        {(provided) => (
                          <motion.div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="hover:bg-gray-800/30 transition-all duration-200 group"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <div className="grid grid-cols-[2fr,1fr,1fr,0.5fr,0.5fr,0.5fr,1fr] gap-4 px-6 py-4 items-center">
                              <div className="flex items-center gap-4">
                                <div className="relative flex-shrink-0 h-16 w-16 bg-gray-800/50 rounded-xl overflow-hidden border border-gray-700/50 group">
                                  <input
                                    type="file"
                                    id={`image-upload-${product._id}`}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => handleImageUpload(product._id, e.target.files[0])}
                                  />
                                  <label
                                    htmlFor={`image-upload-${product._id}`}
                                    className="cursor-pointer w-full h-full flex items-center justify-center"
                                  >
                                    {imageUploading[product._id] ? (
                                      <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
                                      </div>
                                    ) : (
                                      <>
                                        <img
                                          className="h-full w-full object-contain p-2"
                                          src={product.image || '/placeholder.png'}
                                          alt={product.name}
                                        />
                                        <div className="absolute inset-0 bg-gray-900/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                                          <Upload className="h-5 w-5 text-white" />
                                        </div>
                                      </>
                                    )}
                                  </label>

                                  {/* Flash Sale Süre Göstergesi */}
                                  {getFlashSaleTimeRemaining(product._id) && (
                                    <div className={`absolute -top-1 -right-1 px-2 py-1 rounded-lg text-xs font-bold text-white shadow-lg ${getFlashSaleStatus(product._id) === 'active' ? 'bg-gradient-to-r from-red-500 to-orange-500' :
                                        getFlashSaleStatus(product._id) === 'upcoming' ? 'bg-gradient-to-r from-blue-500 to-purple-500' :
                                          'bg-gray-500'
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
                                    <input
                                      type="text"
                                      name="name"
                                      value={editingProduct.name}
                                      onChange={(e) => handleProductChange("name", e.target.value)}
                                      className="bg-gray-800/50 text-white border border-gray-600/50 rounded-lg px-3 py-2 w-full
                                      focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                                      transition-all duration-200"
                                    />
                                  ) : (
                                    <div
                                      className="text-sm font-medium text-white truncate"
                                      title={product.name}
                                    >
                                      {product.name}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div>
                                {editingPrice[product._id] ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={newPrices[product._id] ?? product.price}
                                      onChange={(e) => handlePriceChange(product._id, e.target.value)}
                                      className="bg-gray-800/50 text-white border border-gray-600/50 rounded-lg px-3 py-2 w-24
                                      focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                                      transition-all duration-200"
                                    />
                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => savePrice(product._id)}
                                      className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 p-2 rounded-lg
                                      hover:bg-emerald-500/20 transition-all duration-200"
                                    >
                                      <Save className="h-4 w-4" />
                                    </motion.button>
                                  </div>
                                ) : editingDiscount[product._id] ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={discountPrices[product._id] ?? product.price}
                                      onChange={(e) => handleDiscountChange(product._id, e.target.value)}
                                      className="bg-gray-800/50 text-white border border-gray-600/50 rounded-lg px-3 py-2 w-24
                                      focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                                      transition-all duration-200"
                                    />
                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => saveDiscount(product._id, product.price)}
                                      className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 p-2 rounded-lg
                                      hover:bg-emerald-500/20 transition-all duration-200"
                                    >
                                      <Save className="h-4 w-4" />
                                    </motion.button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col">
                                    {product.isDiscounted && (
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs text-gray-400 line-through">
                                          ₺{(product.price || 0).toFixed(2)}
                                        </span>
                                        <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                                          %{calculateDiscountPercentage(product.price, product.discountedPrice)} İndirim
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-300 font-medium">
                                        ₺{((product.isDiscounted ? product.discountedPrice : product.price) || 0).toFixed(2)}
                                      </span>
                                      <div className="flex gap-1">
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={() => setEditingPrice({ ...editingPrice, [product._id]: true })}
                                          className="text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 p-2 rounded-lg
                                          hover:bg-yellow-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </motion.button>
                                        {product.isDiscounted ? (
                                          <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => removeDiscount(product._id)}
                                            className="text-red-400 hover:text-red-300 bg-red-500/10 p-2 rounded-lg
                                            hover:bg-red-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                          >
                                            <X className="h-4 w-4" />
                                          </motion.button>
                                        ) : (
                                          <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => setEditingDiscount({ ...editingDiscount, [product._id]: true })}
                                            className="text-purple-400 hover:text-purple-300 bg-purple-500/10 p-2 rounded-lg
                                            hover:bg-purple-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                            title="İndirim Ekle"
                                          >
                                            %
                                          </motion.button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div>
                                {editingProduct && editingProduct._id === product._id ? (
                                  <select
                                    value={editingProduct.category ? `/${editingProduct.category}` : ""}
                                    onChange={handleProductCategoryChange}
                                    className="bg-gray-800/50 text-white border border-gray-600/50 rounded-lg px-3 py-2 w-full
                                    focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                                    transition-all duration-200"
                                  >
                                    <option value="">Kategori Seçin</option>
                                    {categories.map((category) => (
                                      <option key={category.href} value={category.href}>
                                        {category.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="text-sm text-gray-300" title={product.category || "Kategori Yok"}>
                                    {product.category || "Kategori Yok"}
                                  </div>
                                )}
                              </div>

                              <div className="flex justify-center">
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleFeatureToggle(product._id)}
                                  className={`p-2 rounded-xl transition-all duration-200 ${product.isFeatured
                                      ? "bg-yellow-500/20 text-yellow-400"
                                      : "bg-gray-800/50 text-gray-400 opacity-50 group-hover:opacity-100"
                                    } hover:bg-yellow-500/30`}
                                >
                                  <Star className="h-5 w-5" />
                                </motion.button>
                              </div>

                              <div className="flex justify-center">
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => toggleProductHidden(product._id)}
                                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${product.isHidden
                                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                      : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                    }`}
                                >
                                  {product.isHidden ? "Gizli" : "Görünür"}
                                </motion.button>
                              </div>

                              <div className="flex justify-center">
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => toggleOutOfStock(product._id)}
                                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${product.isOutOfStock
                                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                      : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                    }`}
                                >
                                  {product.isOutOfStock ? "Tükendi" : "Stokta"}
                                </motion.button>
                              </div>

                              <div className="flex justify-center gap-2">
                                {editingProduct && editingProduct._id === product._id ? (
                                  <>
                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => onSave(product._id, editingProduct)}
                                      className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 p-2 rounded-lg
                                      hover:bg-emerald-500/20 transition-all duration-200"
                                    >
                                      <Save className="h-5 w-5" />
                                    </motion.button>
                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => setEditingProduct(null)}
                                      className="text-red-400 hover:text-red-300 bg-red-500/10 p-2 rounded-lg
                                      hover:bg-red-500/20 transition-all duration-200"
                                    >
                                      <X className="h-5 w-5" />
                                    </motion.button>
                                  </>
                                ) : (
                                  <>
                                    {/* Flash Sale Butonu */}
                                    {product.isDiscounted ? (
                                      <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => handleRemoveFlashSale(product._id)}
                                        className="text-orange-400 hover:text-orange-300 bg-orange-500/10 p-2 rounded-lg
                                        hover:bg-orange-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                        title="Flash Sale Kaldır"
                                      >
                                        <Zap className="h-5 w-5" />
                                      </motion.button>
                                    ) : (
                                      <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => handleFlashSale(product)}
                                        className="text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 p-2 rounded-lg
                                        hover:bg-yellow-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                        title="Flash Sale Ekle"
                                      >
                                        <Zap className="h-5 w-5" />
                                      </motion.button>
                                    )}

                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => onEdit(product)}
                                      className="text-blue-400 hover:text-blue-300 bg-blue-500/10 p-2 rounded-lg
                                      hover:bg-blue-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                    >
                                      <Edit className="h-5 w-5" />
                                    </motion.button>
                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => handleDeleteProduct(product._id)}
                                      className="text-red-400 hover:text-red-300 bg-red-500/10 p-2 rounded-lg
                                      hover:bg-red-500/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                    >
                                      <Trash className="h-5 w-5" />
                                    </motion.button>
                                  </>
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

        {/* Flash Sale Modal */}
        <AnimatePresence>
          {showFlashSaleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Zap className="w-6 h-6 text-yellow-400" />
                    Flash Sale Ekle
                  </h3>
                  <button
                    onClick={() => setShowFlashSaleModal(false)}
                    className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {flashSaleProduct && (
                  <div className="mb-4 p-3 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {flashSaleProduct.image && (
                        <img
                          src={flashSaleProduct.image}
                          alt={flashSaleProduct.name}
                          className="w-12 h-12 object-cover rounded-lg"
                        />
                      )}
                      <div>
                        <h4 className="text-white font-semibold">{flashSaleProduct.name}</h4>
                        <p className="text-gray-400 text-sm">₺{flashSaleProduct.price}</p>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleFlashSaleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Kampanya Adı</label>
                    <input
                      type="text"
                      value={flashSaleData.name}
                      onChange={(e) => setFlashSaleData({ ...flashSaleData, name: e.target.value })}
                      placeholder="Örn: Hafta Sonu Kampanyası"
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">İndirim Oranı (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={flashSaleData.discountPercentage}
                      onChange={(e) => setFlashSaleData({ ...flashSaleData, discountPercentage: e.target.value })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Başlangıç Tarihi</label>
                    <input
                      type="datetime-local"
                      value={flashSaleData.startDate}
                      onChange={(e) => setFlashSaleData({ ...flashSaleData, startDate: e.target.value })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Bitiş Tarihi</label>
                    <input
                      type="datetime-local"
                      value={flashSaleData.endDate}
                      onChange={(e) => setFlashSaleData({ ...flashSaleData, endDate: e.target.value })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      required
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowFlashSaleModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      İptal
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
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