import { useState, useEffect, useCallback } from "react";
import {
  Trash,
  Star,
  Edit,
  Save,
  X,
  Upload,
  Search,
  SlidersHorizontal,
  Zap,
  Clock,
  Percent,
  GripVertical,
  Package
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

  // ── Sunum yardımcıları (yalnızca görünüm; veri akışını değiştirmez) ──
  const categoryName = (slug) =>
    categories.find((category) => category.href === `/${slug}`)?.name || slug;
  const advancedFilterCount =
    (filters.stockStatus !== "all" ? 1 : 0) +
    (filters.visibility !== "all" ? 1 : 0) +
    (filters.featured !== "all" ? 1 : 0) +
    (filters.discount !== "all" ? 1 : 0) +
    (filters.image && filters.image !== "all" ? 1 : 0) +
    (filters.priceRange.min || filters.priceRange.max ? 1 : 0);
  const isFiltered = filteredProducts.length !== localProducts.length;
  const editingRow = editingProduct
    ? filteredProducts.find((product) => product._id === editingProduct._id)
    : null;
  const clearFilters = () => {
    setFilters({
      priceRange: { min: "", max: "" },
      stockStatus: "all",
      visibility: "all",
      featured: "all",
      discount: "all",
      sortBy: "order"
    });
    setSelectedCategory("");
  };

  return (
    <div className="cat">
      {/* Katalog özeti: tek şerit */}
      <section className="ui-metrics cat-metrics" aria-label="Katalog özeti">
        <div className="ui-metric">
          <span className="ui-metric-label">Ürün Sayısı</span>
          <strong className="ui-metric-value">{localProducts.length || products.length}</strong>
        </div>
        <div className="ui-metric">
          <span className="ui-metric-label">Toplam Stok Değeri</span>
          <strong className="ui-metric-value">
            ₺{localProducts.reduce((sum, p) => sum + (p.price * (p.stock || 0)), 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
          </strong>
        </div>
        <div className="ui-metric">
          <span className="ui-metric-label"><i className="ui-dot ui-dot--warn" />Aktif Flash Sale</span>
          <strong className="ui-metric-value">{flashSales.filter(s => new Date(s.endDate) > new Date()).length}</strong>
        </div>
        <div className="ui-metric">
          <span className="ui-metric-label"><i className="ui-dot ui-dot--danger" />Düşük Stok</span>
          <strong className="ui-metric-value">{localProducts.filter(p => (p.stock || 0) < 5 && (p.stock || 0) > 0).length}</strong>
        </div>
      </section>

      {/* Araç çubuğu: arama, kategori, filtreler */}
      <div className="cat-toolbar">
        <div className="ui-search cat-search">
          <Search />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ürün adı ile ara..."
            aria-label="Ürün ara"
            className="ui-field"
          />
        </div>

        <select
          id="products-filter-category"
          aria-label="Kategori"
          value={selectedCategory}
          onChange={handleFilterCategoryChange}
          className="ui-field ui-field--auto cat-category"
        >
          <option value="">Tüm Kategoriler</option>
          {categories.map((category) => (
            <option key={category.href} value={category.href}>
              {category.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          className="ui-btn"
        >
          <SlidersHorizontal />
          <span>Filtreler</span>
          {advancedFilterCount > 0 && <b className="ui-count">{advancedFilterCount}</b>}
        </button>

        <span className="cat-toolbar-meta ui-num" aria-live="polite">
          {isFiltered
            ? `${filteredProducts.length} ürün gösteriliyor (${localProducts.length} ürün içinden)`
            : `${localProducts.length} ürün`}
        </span>
        {(isFiltered || selectedCategory) && (
          <button onClick={clearFilters} className="ui-btn ui-btn--ghost ui-btn--sm">
            <X />
            Filtreleri Temizle
          </button>
        )}
      </div>

      {/* Ürün tablosu */}
      <section className="ui-panel cat-table" aria-label="Ürün listesi">
        <div className="cat-row cat-head" aria-hidden="true">
          <span />
          <span>Ürün</span>
          <span className="cat-col-category">Kategori</span>
          <span>Fiyat</span>
          <span>İndirim</span>
          <span>Stok</span>
          <span>Görünürlük</span>
          <span className="ui-right">İşlemler</span>
        </div>

        <InfiniteScroll
          dataLength={filteredProducts.length}
          next={loadMore}
          hasMore={hasMore}
          loader={
            <div className="ui-loading">
              <div className="ui-loader"></div>
            </div>
          }
          endMessage={
            <div className="ui-loading">
              Tüm ürünler yüklendi
            </div>
          }
          scrollableTarget="scrollableDiv"
        >
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="products">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {filteredProducts.map((product, index) => {
                    const flashLabel = getFlashSaleTimeRemaining(product._id);
                    const flashStatus = getFlashSaleStatus(product._id);
                    return (
                      <Draggable key={product._id} draggableId={product._id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="cat-row"
                            data-hidden={product.isHidden || undefined}
                            data-editing={editingProduct?._id === product._id || undefined}
                            data-dragging={snapshot.isDragging || undefined}
                          >
                            <GripVertical className="cat-grip" aria-hidden="true" />

                            {/* Görsel + ad */}
                            <div className="cat-product">
                              <input
                                type="file"
                                id={`image-upload-${product._id}`}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => handleImageUpload(product._id, e.target.files[0])}
                              />
                              <label
                                htmlFor={`image-upload-${product._id}`}
                                className="cat-thumb"
                                title="Görseli değiştir"
                              >
                                {imageUploading[product._id] ? (
                                  <span className="cat-thumb-overlay" data-busy="true">
                                    <span className="ui-loader" style={{ width: 14, height: 14 }}></span>
                                  </span>
                                ) : (
                                  <>
                                    <img
                                      src={product.image || '/placeholder.png'}
                                      alt={product.name}
                                    />
                                    <span className="cat-thumb-overlay">
                                      <Upload />
                                    </span>
                                  </>
                                )}
                              </label>
                              <div className="cat-name">
                                <strong title={product.name}>{product.name}</strong>
                                <small>
                                  <span className="cat-name-category">
                                    {product.category ? categoryName(product.category) : "Kategori Yok"}
                                  </span>
                                  {flashLabel && (
                                    <span className={`ui-badge ${flashStatus === 'active' ? 'ui-badge--warn' :
                                        flashStatus === 'upcoming' ? 'ui-badge--info' :
                                          ''
                                      }`}>
                                      <Clock />
                                      {flashLabel}
                                    </span>
                                  )}
                                </small>
                              </div>
                            </div>

                            {/* Kategori */}
                            <div className="cat-col-category ui-truncate" title={product.category || "Kategori Yok"}>
                              {product.category ? categoryName(product.category) : <span className="ui-muted">Kategori Yok</span>}
                            </div>

                            {/* Fiyat */}
                            <div className="cat-cell" data-label="Fiyat">
                              {editingPrice[product._id] ? (
                                <div className="cat-inline-edit">
                                  <input
                                    type="number"
                                    aria-label="Yeni fiyat"
                                    value={newPrices[product._id] ?? product.price}
                                    onChange={(e) => handlePriceChange(product._id, e.target.value)}
                                    className="ui-field ui-field--sm"
                                  />
                                  <button
                                    onClick={() => savePrice(product._id)}
                                    className="ui-icon-btn ui-icon-btn--sm"
                                    title="Fiyatı kaydet"
                                    aria-label="Fiyatı kaydet"
                                  >
                                    <Save />
                                  </button>
                                </div>
                              ) : (
                                <div className="cat-price">
                                  <span className="cat-price-now">
                                    ₺{((product.isDiscounted ? product.discountedPrice : product.price) || 0).toFixed(2)}
                                  </span>
                                  {product.isDiscounted && (
                                    <span className="cat-price-old">₺{(product.price || 0).toFixed(2)}</span>
                                  )}
                                  <button
                                    onClick={() => setEditingPrice({ ...editingPrice, [product._id]: true })}
                                    className="ui-icon-btn ui-icon-btn--sm cat-hover-btn"
                                    title="Fiyatı düzenle"
                                    aria-label="Fiyatı düzenle"
                                  >
                                    <Edit />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* İndirim */}
                            <div className="cat-cell" data-label="İndirim">
                              {editingDiscount[product._id] ? (
                                <div className="cat-inline-edit">
                                  <input
                                    type="number"
                                    aria-label="İndirimli fiyat"
                                    value={discountPrices[product._id] ?? product.price}
                                    onChange={(e) => handleDiscountChange(product._id, e.target.value)}
                                    className="ui-field ui-field--sm"
                                  />
                                  <button
                                    onClick={() => saveDiscount(product._id, product.price)}
                                    className="ui-icon-btn ui-icon-btn--sm"
                                    title="İndirimi kaydet"
                                    aria-label="İndirimi kaydet"
                                  >
                                    <Save />
                                  </button>
                                </div>
                              ) : product.isDiscounted ? (
                                <div className="cat-price">
                                  <span className="ui-badge ui-badge--danger">
                                    %{calculateDiscountPercentage(product.price, product.discountedPrice)}
                                  </span>
                                  <button
                                    onClick={() => removeDiscount(product._id)}
                                    className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger cat-hover-btn"
                                    title="İndirimi kaldır"
                                    aria-label="İndirimi kaldır"
                                  >
                                    <X />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingDiscount({ ...editingDiscount, [product._id]: true })}
                                  className="cat-add-discount"
                                  title="İndirim Ekle"
                                  aria-label="İndirim Ekle"
                                >
                                  <Percent />
                                  <span>Ekle</span>
                                </button>
                              )}
                            </div>

                            {/* Stok */}
                            <div className="cat-cell" data-label="Stok">
                              <button
                                onClick={() => toggleOutOfStock(product._id)}
                                className={`ui-badge ${product.isOutOfStock ? "ui-badge--danger" : "ui-badge--ok"}`}
                                title="Stok durumunu değiştir"
                              >
                                {product.isOutOfStock ? "Tükendi" : "Stokta"}
                              </button>
                              {typeof product.stock === "number" && (
                                <small className="cat-stock-qty" data-low={product.stock > 0 && product.stock < 5 || undefined}>
                                  {product.stock} adet
                                </small>
                              )}
                            </div>

                            {/* Görünürlük */}
                            <div className="cat-cell" data-label="Görünürlük">
                              <button
                                onClick={() => toggleProductHidden(product._id)}
                                aria-pressed={!product.isHidden}
                                className="ui-toggle cat-visibility"
                                title="Görünürlüğü değiştir"
                              >
                                <i />
                                <span>{product.isHidden ? "Gizli" : "Görünür"}</span>
                              </button>
                            </div>

                            {/* İşlemler */}
                            <div className="cat-actions">
                              <button
                                onClick={() => handleFeatureToggle(product._id)}
                                aria-pressed={!!product.isFeatured}
                                className="ui-icon-btn ui-icon-btn--sm"
                                title={product.isFeatured ? "Öne çıkanlardan kaldır" : "Öne çıkar"}
                                aria-label="Öne çıkar"
                              >
                                <Star fill={product.isFeatured ? "currentColor" : "none"} />
                              </button>

                              {/* Flash Sale Butonu */}
                              {product.isDiscounted ? (
                                <button
                                  onClick={() => handleRemoveFlashSale(product._id)}
                                  className="ui-icon-btn ui-icon-btn--sm"
                                  aria-pressed="true"
                                  title="Flash Sale Kaldır"
                                  aria-label="Flash Sale Kaldır"
                                >
                                  <Zap />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleFlashSale(product)}
                                  className="ui-icon-btn ui-icon-btn--sm"
                                  title="Flash Sale Ekle"
                                  aria-label="Flash Sale Ekle"
                                >
                                  <Zap />
                                </button>
                              )}

                              <button
                                onClick={() => onEdit(product)}
                                className="ui-icon-btn ui-icon-btn--sm"
                                title="Ürünü düzenle"
                                aria-label="Ürünü düzenle"
                              >
                                <Edit />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product._id)}
                                className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger"
                                title="Ürünü sil"
                                aria-label="Ürünü sil"
                              >
                                <Trash />
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </InfiniteScroll>

        {!loading && filteredProducts.length === 0 && (
          <div className="ui-empty">
            <Package />
            <h3 className="ui-title">Ürün bulunamadı</h3>
            <p>Arama veya filtreleri değiştirerek tekrar deneyin.</p>
          </div>
        )}
      </section>

      {/* Filtre çekmecesi */}
      {showFilters && (
        <div className="ui-drawer-backdrop" onClick={() => setShowFilters(false)}>
          <aside
            className="ui-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Gelişmiş Filtreler"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-drawer-head">
              <h3 className="ui-title">Filtreler</h3>
              <button onClick={() => setShowFilters(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>

            <div className="ui-drawer-body">
              {/* Fiyat Aralığı */}
              <div>
                <label className="ui-label" htmlFor="products-filter-min">Fiyat Aralığı</label>
                <div className="ui-grid-2">
                  <input
                    id="products-filter-min"
                    type="number"
                    placeholder="Min"
                    value={filters.priceRange.min}
                    onChange={(e) => setFilters({
                      ...filters,
                      priceRange: { ...filters.priceRange, min: e.target.value }
                    })}
                    className="ui-field"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    aria-label="En yüksek fiyat"
                    value={filters.priceRange.max}
                    onChange={(e) => setFilters({
                      ...filters,
                      priceRange: { ...filters.priceRange, max: e.target.value }
                    })}
                    className="ui-field"
                  />
                </div>
              </div>

              <div className="ui-grid-2">
                {/* Stok Durumu */}
                <div>
                  <label className="ui-label" htmlFor="products-filter-stock">Stok Durumu</label>
                  <select
                    id="products-filter-stock"
                    value={filters.stockStatus}
                    onChange={(e) => setFilters({ ...filters, stockStatus: e.target.value })}
                    className="ui-field"
                  >
                    <option value="all">Tümü</option>
                    <option value="inStock">Stokta</option>
                    <option value="outOfStock">Tükendi</option>
                  </select>
                </div>

                {/* Görünürlük */}
                <div>
                  <label className="ui-label" htmlFor="products-filter-visibility">Görünürlük</label>
                  <select
                    id="products-filter-visibility"
                    value={filters.visibility}
                    onChange={(e) => setFilters({ ...filters, visibility: e.target.value })}
                    className="ui-field"
                  >
                    <option value="all">Tümü</option>
                    <option value="visible">Görünür</option>
                    <option value="hidden">Gizli</option>
                  </select>
                </div>

                {/* Öne Çıkan */}
                <div>
                  <label className="ui-label" htmlFor="products-filter-featured">Öne Çıkan</label>
                  <select
                    id="products-filter-featured"
                    value={filters.featured}
                    onChange={(e) => setFilters({ ...filters, featured: e.target.value })}
                    className="ui-field"
                  >
                    <option value="all">Tümü</option>
                    <option value="featured">Öne Çıkan</option>
                    <option value="notFeatured">Öne Çıkmayan</option>
                  </select>
                </div>

                {/* İndirim */}
                <div>
                  <label className="ui-label" htmlFor="products-filter-discount">İndirim Durumu</label>
                  <select
                    id="products-filter-discount"
                    value={filters.discount}
                    onChange={(e) => setFilters({ ...filters, discount: e.target.value })}
                    className="ui-field"
                  >
                    <option value="all">Tümü</option>
                    <option value="discounted">İndirimli</option>
                    <option value="notDiscounted">İndirimsiz</option>
                  </select>
                </div>

                {/* Görsel Durumu */}
                <div>
                  <label className="ui-label" htmlFor="products-filter-image">Görsel Durumu</label>
                  <select
                    id="products-filter-image"
                    value={filters.image}
                    onChange={(e) => setFilters({ ...filters, image: e.target.value })}
                    className="ui-field"
                  >
                    <option value="all">Tümü</option>
                    <option value="hasImage">Görseli Var</option>
                    <option value="noImage">Görseli Yok</option>
                  </select>
                </div>

                {/* Sıralama */}
                <div>
                  <label className="ui-label" htmlFor="products-filter-sort">Sıralama</label>
                  <select
                    id="products-filter-sort"
                    value={filters.sortBy}
                    onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                    className="ui-field"
                  >
                    <option value="order">Varsayılan Sıralama</option>
                    <option value="name">İsme Göre (A-Z)</option>
                    <option value="price">Fiyata Göre (Düşük-Yüksek)</option>
                    <option value="priceDesc">Fiyata Göre (Yüksek-Düşük)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="ui-drawer-foot">
              <button onClick={clearFilters} className="ui-btn">
                <X />
                Filtreleri Temizle
              </button>
              <button onClick={() => setShowFilters(false)} className="ui-btn ui-btn--primary">
                {filteredProducts.length} ürünü göster
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Ürün düzenleme çekmecesi: ad ve kategori */}
      {editingRow && (
        <div className="ui-drawer-backdrop">
          <aside
            className="ui-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Ürünü düzenle"
          >
            <div className="ui-drawer-head">
              <h3 className="ui-title">Ürünü düzenle</h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="ui-icon-btn"
                title="Vazgeç"
                aria-label="Vazgeç"
              >
                <X />
              </button>
            </div>

            <div className="ui-drawer-body">
              <div className="cat-edit-summary">
                <span className="cat-thumb cat-thumb--lg">
                  <img src={editingRow.image || '/placeholder.png'} alt={editingRow.name} />
                </span>
                <div>
                  <p className="ui-text-sm ui-muted">Mevcut fiyat</p>
                  <strong className="ui-num">
                    ₺{((editingRow.isDiscounted ? editingRow.discountedPrice : editingRow.price) || 0).toFixed(2)}
                  </strong>
                  <p className="ui-text-xs ui-muted">
                    {editingRow.isOutOfStock ? "Tükendi" : "Stokta"} · {editingRow.isHidden ? "Gizli" : "Görünür"}
                  </p>
                </div>
              </div>

              <div>
                <label className="ui-label" htmlFor="products-edit-name">Ürün adı</label>
                <input
                  id="products-edit-name"
                  type="text"
                  name="name"
                  value={editingProduct.name}
                  onChange={(e) => handleProductChange("name", e.target.value)}
                  className="ui-field"
                />
              </div>

              <div>
                <label className="ui-label" htmlFor="products-edit-category">Kategori</label>
                <select
                  id="products-edit-category"
                  value={editingProduct.category ? `/${editingProduct.category}` : ""}
                  onChange={handleProductCategoryChange}
                  className="ui-field"
                >
                  <option value="">Kategori Seçin</option>
                  {categories.map((category) => (
                    <option key={category.href} value={category.href}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <p className="ui-hint">
                Fiyat, indirim, stok ve görünürlük doğrudan tablodan güncellenir.
              </p>
            </div>

            <div className="ui-drawer-foot">
              <button onClick={() => setEditingProduct(null)} className="ui-btn">
                Vazgeç
              </button>
              <button
                onClick={() => onSave(editingRow._id, editingProduct)}
                className="ui-btn ui-btn--primary"
              >
                <Save />
                Kaydet
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Flash Sale çekmecesi */}
      {showFlashSaleModal && (
        <div className="ui-drawer-backdrop">
          <aside className="ui-drawer" role="dialog" aria-modal="true" aria-label="Flash Sale Ekle">
            <div className="ui-drawer-head">
              <h3 className="ui-title">Flash Sale Ekle</h3>
              <button
                onClick={() => setShowFlashSaleModal(false)}
                className="ui-icon-btn"
                aria-label="Kapat"
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleFlashSaleSubmit} className="ui-drawer-form">
              <div className="ui-drawer-body">
                {flashSaleProduct && (
                  <div className="cat-edit-summary">
                    {flashSaleProduct.image && (
                      <span className="cat-thumb cat-thumb--lg">
                        <img
                          src={flashSaleProduct.image}
                          alt={flashSaleProduct.name}
                        />
                      </span>
                    )}
                    <div>
                      <strong>{flashSaleProduct.name}</strong>
                      <p className="ui-text-sm ui-muted ui-num">₺{flashSaleProduct.price}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="ui-label" htmlFor="flash-sale-name">Kampanya Adı</label>
                  <input
                    id="flash-sale-name"
                    type="text"
                    value={flashSaleData.name}
                    onChange={(e) => setFlashSaleData({ ...flashSaleData, name: e.target.value })}
                    placeholder="Örn: Hafta Sonu Kampanyası"
                    className="ui-field"
                  />
                </div>

                <div>
                  <label className="ui-label" htmlFor="flash-sale-discount">İndirim Oranı (%)</label>
                  <input
                    id="flash-sale-discount"
                    type="number"
                    min="1"
                    max="99"
                    value={flashSaleData.discountPercentage}
                    onChange={(e) => setFlashSaleData({ ...flashSaleData, discountPercentage: e.target.value })}
                    className="ui-field"
                    required
                  />
                </div>

                <div className="ui-grid-2">
                  <div>
                    <label className="ui-label" htmlFor="flash-sale-start">Başlangıç Tarihi</label>
                    <input
                      id="flash-sale-start"
                      type="datetime-local"
                      value={flashSaleData.startDate}
                      onChange={(e) => setFlashSaleData({ ...flashSaleData, startDate: e.target.value })}
                      className="ui-field"
                      required
                    />
                  </div>

                  <div>
                    <label className="ui-label" htmlFor="flash-sale-end">Bitiş Tarihi</label>
                    <input
                      id="flash-sale-end"
                      type="datetime-local"
                      value={flashSaleData.endDate}
                      onChange={(e) => setFlashSaleData({ ...flashSaleData, endDate: e.target.value })}
                      className="ui-field"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="ui-drawer-foot">
                <button
                  type="button"
                  onClick={() => setShowFlashSaleModal(false)}
                  className="ui-btn"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn--primary"
                >
                  <Zap />
                  Flash Sale Oluştur
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
};

export default ProductsList;
