import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Trash, Star, Edit, Save, X } from "lucide-react";
import { useProductStore } from "../stores/useProductStore";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import InfiniteScroll from "react-infinite-scroll-component";

const categories = [
  { href: "/kahve", name: "Benim Kahvem", displayName: "Benim Kahvem", imageUrl: "/kahve.png" },
  { href: "/yiyecekler", name: "Yiyecekler", displayName: "Lezzetli Yiyecekler", imageUrl: "/foods.png" },
  { href: "/kahvalti", name: "Kahvaltılık Ürünler", displayName: "Kahvaltılık Ürünler", imageUrl: "/kahvalti.png" },
  { href: "/gida", name: "Temel Gıda", displayName: "Temel Gıda", imageUrl: "/food2.png" },
  { href: "/meyve-sebze", name: "Meyve & Sebze", displayName: "Taze Meyve & Sebzeler", imageUrl: "/fruit.png" },
  { href: "/sut", name: "Süt & Süt Ürünleri", displayName: "Doğal Süt Ürünleri", imageUrl: "/milk.png" },
  { href: "/bespara", name: "Beş Para Etmeyen Ürünler", displayName: "Beş Para Etmeyen Ürünler", imageUrl: "/bespara.png" },
  { href: "/tozicecekler", name: "Toz İçecekler", displayName: "Toz İçecekler", imageUrl: "/instant.png" },
  { href: "/cips", name: "Cips & Çerez", displayName: "Cips & Çerez", imageUrl: "/dd.png" },
  { href: "/cayseker", name: "Çay ve Şekerler", displayName: "Çay ve Şekerler", imageUrl: "/cay.png" },
  { href: "/atistirma", name: "Atıştırmalıklar", displayName: "Lezzetli Atıştırmalıklar", imageUrl: "/atistirmaa.png" },
  { href: "/temizlik", name: "Temizlik Ürünleri", displayName: "Temizlik Ürünleri", imageUrl: "/clean.png" },
  { href: "/kisisel", name: "Kişisel Bakım Ürünleri", displayName: "Kişisel Bakım Ürünleri", imageUrl: "/care.png" },
  { href: "/makarna", name: "Makarna ve Kuru Bakliyat", displayName: "Makarna ve Kuru Bakliyat", imageUrl: "/makarna.png" },
  { href: "/et", name: "Şarküteri & Et Ürünleri", displayName: "Taze Et & Şarküteri", imageUrl: "/chicken.png" },
  { href: "/icecekler", name: "İçecek", displayName: "Serinletici İçecekler", imageUrl: "/juice.png" },
  { href: "/dondulurmus", name: "Dondurulmuş Gıdalar", displayName: "Dondurulmuş Gıdalar", imageUrl: "/juice.png" },
  { href: "/baharat", name: "Baharatlar", displayName: "Baharatlar", imageUrl: "/juice.png" },
];

const ProductsList = ({ onEdit, editingProduct, setEditingProduct, onSave }) => {
  const {
    deleteProduct,
    toggleFeaturedProduct,
    products,
    updateProductPrice,
    fetchAllProducts,
    updateProductName,
    reorderProducts,
  } = useProductStore();

  const [editingPrice, setEditingPrice] = useState({});
  const [newPrices, setNewPrices] = useState({});
  const [newName, setNewName] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [localProducts, setLocalProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

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
        fetchAllProducts();
      }
    } catch (error) {
      console.error("Tükendi durumu değiştirme hatası:", error);
      toast.error(error.response?.data?.message || "Tükendi durumu değiştirilirken hata oluştu.");
    }
  };

  const handlePriceChange = (id, value) => {
    setNewPrices({ ...newPrices, [id]: value });
  };

  const savePrice = (id) => {
    if (newPrices[id] !== undefined) {
      updateProductPrice(id, parseFloat(newPrices[id]));
      setEditingPrice({ ...editingPrice, [id]: false });
    }
  };

  const saveName = (id) => {
    if (newName[id] !== undefined) {
      updateProductName(id, newName[id]);
      setNewName({ ...newName, [id]: "" });
    }
  };

  const handleProductChange = (field, value) => {
    setEditingProduct({
      ...editingProduct,
      [field]: value,
    });
  };

  const handleCategoryChange = (categoryPath) => {
    const category = categories.find(cat => cat.href === categoryPath);
    if (category) {
      setEditingProduct({
        ...editingProduct,
        category: category.name
      });
    }
  };

  const handleSubcategoryChange = (subcategoryId) => {
    const category = categories.find(cat => cat.id === editingProduct.category.id);
    const subcategory = category?.subcategories.find(sub => sub.id === subcategoryId);
    if (subcategory) {
      setEditingProduct({
        ...editingProduct,
        subcategory: {
          id: subcategory.id,
          name: subcategory.name
        },
        brand: ""
      });
    }
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
        loadProducts();
      }
    } catch (error) {
      console.error("Ürün gizleme/gösterme hatası:", error);
      toast.error(error.response?.data?.message || "Ürün gizleme/gösterme sırasında hata oluştu.");
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
    setLoading(true);
    try {
      const response = await axios.get("/products", {
        params: {
          page,
          limit: 50,
          category: selectedCategory || undefined,
          search: debouncedSearchTerm
        }
      });

      const { products: newProducts, pagination } = response.data;

      setLocalProducts(prev => page === 1 ? newProducts : [...prev, ...newProducts]);
      setHasMore(pagination.hasMore);
      setLoading(false);
    } catch (error) {
      console.error("Ürünler yüklenirken hata:", error);
      toast.error("Ürünler yüklenirken hata oluştu");
      setLoading(false);
    }
  }, [page, selectedCategory, debouncedSearchTerm]);

  useEffect(() => {
    setPage(1);
    setLocalProducts([]);
    loadProducts();
  }, [selectedCategory, debouncedSearchTerm]);

  useEffect(() => {
    loadProducts();
  }, [page]);

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
    }
  };

  return (
    <motion.div
      className="bg-gray-800 shadow-lg rounded-lg overflow-hidden max-w-full mx-auto border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="p-4 bg-gray-900 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="category" className="block text-sm font-medium text-gray-300">
              Kategori Seçin
            </label>
            <select
              id="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
            <label htmlFor="search" className="block text-sm font-medium text-gray-300">
              Ürün Ara
            </label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ürün adı ile ara..."
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      <InfiniteScroll
        dataLength={localProducts.length}
        next={loadMore}
        hasMore={hasMore}
        loader={
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div>
          </div>
        }
        endMessage={
          <div className="text-center py-4 text-gray-400">
            Tüm ürünler yüklendi
          </div>
        }
        scrollableTarget="scrollableDiv"
      >
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="products">
            {(provided) => (
              <table
                className="min-w-full divide-y divide-gray-700"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                <thead className="bg-gray-900 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/4">ÜRÜN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/6">FİYAT</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/6">KATEGORİ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/6">ALT KATEGORİ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/12">ÖNE ÇIKANLAR</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/12">GİZLİ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/12">TÜKENDİ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/6">İŞLEMLER</th>
                  </tr>
                </thead>

                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {localProducts.map((product, index) => (
                    <Draggable key={product._id} draggableId={product._id} index={index}>
                      {(provided) => (
                        <motion.tr
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="hover:bg-gray-700"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                        >
                          <td className="px-4 py-4 whitespace-nowrap w-1/4">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-12 w-12 bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                                <img
                                  className="h-full w-full object-contain"
                                  src={product.image}
                                  alt={product.name}
                                />
                              </div>
                              <div className="ml-4 relative">
                                {editingProduct && editingProduct._id === product._id ? (
                                  <input
                                    type="text"
                                    name="name"
                                    value={editingProduct.name}
                                    onChange={(e) => handleProductChange("name", e.target.value)}
                                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 w-40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                ) : (
                                  <div
                                    className="text-sm font-medium text-white"
                                    title={product.name}
                                  >
                                    {product.name}
                                  </div>
                                )}
                                {editingProduct && editingProduct._id === product._id && (
                                  <button
                                    onClick={() => saveName(product._id)}
                                    className="ml-2 text-green-400 hover:text-green-300"
                                  >
                                    ✔
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap w-1/6">
                            {editingPrice[product._id] ? (
                              <div className="flex items-center">
                                <input
                                  type="number"
                                  value={newPrices[product._id] ?? product.price}
                                  onChange={(e) => handlePriceChange(product._id, e.target.value)}
                                  className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 w-16 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <button
                                  onClick={() => savePrice(product._id)}
                                  className="ml-2 text-green-400 hover:text-green-300"
                                >
                                  ✔
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <span className="text-sm text-gray-300">₺{product.price.toFixed(2)}</span>
                                <button
                                  onClick={() => setEditingPrice({ ...editingPrice, [product._id]: true })}
                                  className="ml-2 text-yellow-400 hover:text-yellow-300"
                                >
                                  ✏
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap w-1/6">
                            {editingProduct && editingProduct._id === product._id ? (
                              <select
                                value={editingProduct.category || ""}
                                onChange={(e) => handleCategoryChange(e.target.value)}
                                className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap w-1/6">
                            {editingProduct && editingProduct._id === product._id ? (
                              <select
                                value={editingProduct.subcategory?.id || ""}
                                onChange={(e) => handleSubcategoryChange(e.target.value)}
                                className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="">Alt Kategori Seçin</option>
                                {categories
                                  .find(cat => cat.id === editingProduct.category?.id)
                                  ?.subcategories?.map((subcategory) => (
                                    <option key={subcategory.id} value={subcategory.id}>
                                      {subcategory.name}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <div className="text-sm text-gray-300" title={product.subcategory?.name || "Alt Kategori Yok"}>
                                {product.subcategory?.name || "Alt Kategori Yok"}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap w-1/12">
                            <button
                              onClick={() => toggleFeaturedProduct(product._id)}
                              className={`p-1 rounded-full ${
                                product.isFeatured
                                  ? "bg-yellow-400 text-gray-900"
                                  : "bg-gray-600 text-gray-300"
                              } hover:bg-yellow-500 transition-colors duration-200`}
                            >
                              <Star className="h-5 w-5" />
                            </button>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap w-1/12">
                            <button
                              onClick={() => toggleProductHidden(product._id)}
                              className={`p-1 rounded-full ${
                                product.isHidden
                                  ? "bg-red-600 text-white"
                                  : "bg-emerald-600 text-white"
                              } hover:bg-${product.isHidden ? "red-700" : "emerald-700"} transition-colors duration-200`}
                            >
                              {product.isHidden ? "Gizli" : "Görünür"}
                            </button>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap w-1/12">
                            <button
                              onClick={() => toggleOutOfStock(product._id)}
                              className={`p-1 rounded-full ${
                                product.isOutOfStock
                                  ? "bg-red-600 text-white"
                                  : "bg-green-600 text-white"
                              } hover:bg-${product.isOutOfStock ? "red-700" : "green-700"} transition-colors duration-200`}
                            >
                              {product.isOutOfStock ? "Tükendi" : "Stokta"}
                            </button>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap w-1/6 text-sm font-medium">
                            {editingProduct && editingProduct._id === product._id ? (
                              <div className="flex justify-center space-x-2">
                                <button
                                  onClick={() => onSave(product._id, editingProduct)}
                                  className="text-green-400 hover:text-green-300 px-2 py-1 rounded"
                                >
                                  <Save className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => setEditingProduct(null)}
                                  className="text-red-400 hover:text-red-300 px-2 py-1 rounded"
                                >
                                  <X className="h-5 w-5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center space-x-2">
                                <button
                                  onClick={() => onEdit(product)}
                                  className="text-blue-400 hover:text-blue-300"
                                >
                                  <Edit className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => deleteProduct(product._id)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <Trash className="h-5 w-5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </motion.tr>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </tbody>
              </table>
            )}
          </Droppable>
        </DragDropContext>
      </InfiniteScroll>
    </motion.div>
  );
};

export default ProductsList;