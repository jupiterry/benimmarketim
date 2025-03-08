import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Trash, Star, Edit, Save, X, Upload } from "lucide-react";
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
    try {
      const response = await axios.patch(`/products/toggle-out-of-stock/${productId}`, {}, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (response.data.message) {
        toast.success(response.data.message);
        setLocalProducts(prevProducts =>
          prevProducts.map(product =>
            product._id === productId
              ? { ...product, isOutOfStock: !product.isOutOfStock }
              : product
          )
        );
      }
    } catch (error) {
      console.error("Tükendi durumu değiştirme hatası:", error);
      toast.error(error.response?.data?.message || "Tükendi durumu değiştirilirken hata oluştu.");
    }
  };

  const handlePriceChange = (id, value) => {
    setNewPrices({ ...newPrices, [id]: value });
  };

  const savePrice = async (id) => {
    if (newPrices[id] !== undefined) {
      try {
        await updateProductPrice(id, parseFloat(newPrices[id]));
        setEditingPrice({ ...editingPrice, [id]: false });
        
        setLocalProducts(prevProducts =>
          prevProducts.map(product =>
            product._id === id ? { ...product, price: parseFloat(newPrices[id]) } : product
          )
        );
        
        await fetchAllProducts();
        
        toast.success("Fiyat başarıyla güncellendi");
      } catch (error) {
        console.error("Fiyat güncelleme hatası:", error);
        toast.error("Fiyat güncellenirken hata oluştu");
      }
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
    try {
      const response = await axios.patch(`/products/toggle-hidden/${productId}`, {}, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (response.data.message) {
        toast.success(response.data.message);
        setLocalProducts(prevProducts =>
          prevProducts.map(product =>
            product._id === productId
              ? { ...product, isHidden: !product.isHidden }
              : product
          )
        );
      }
    } catch (error) {
      console.error("Ürün gizleme/gösterme hatası:", error);
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

  const loadProducts = useCallback(async () => {
    if (loading) return;
    
    try {
      setLoading(true);
      const response = await axios.get("/products", {
        params: {
          page,
          limit: 50,
          category: selectedCategory ? selectedCategory.replace("/", "") : undefined,
          search: debouncedSearchTerm || undefined
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

  return (
    <motion.div
      className="bg-gray-800/30 shadow-2xl rounded-2xl overflow-hidden max-w-full mx-auto border border-gray-700/50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="p-6 bg-gray-900/50 space-y-4 backdrop-blur-xl border-b border-gray-700/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label htmlFor="category" className="block text-sm font-medium text-gray-300 mb-2">
              Kategori Seçin
            </label>
            <select
              id="category"
              value={selectedCategory}
              onChange={handleFilterCategoryChange}
              className="mt-1 block w-full bg-gray-800/50 border border-gray-600/50 rounded-xl shadow-sm py-3 px-4 text-white 
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
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-300 mb-2">
              Ürün Ara
            </label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ürün adı ile ara..."
              className="mt-1 block w-full bg-gray-800/50 border border-gray-600/50 rounded-xl shadow-sm py-3 px-4 text-white 
                focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                transition-all duration-200"
            />
          </div>
        </div>
      </div>

      <InfiniteScroll
        dataLength={localProducts.length}
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
                  {localProducts.map((product, index) => (
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
                                onClick={() => toggleFeaturedProduct(product._id)}
                                className={`p-2 rounded-xl transition-all duration-200 ${
                                  product.isFeatured
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
                                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                  product.isHidden
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
                                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                  product.isOutOfStock
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
                                    onClick={() => deleteProduct(product._id)}
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
    </motion.div>
  );
};

export default ProductsList;