import { useState } from "react";
import { motion } from "framer-motion";
import { Trash, Star, Edit } from "lucide-react";
import { useProductStore } from "../stores/useProductStore";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

const ProductsList = ({ onEdit, editingProduct, onSave }) => {
  const {
    deleteProduct,
    toggleFeaturedProduct,
    products,
    updateProductPrice,
    fetchAllProducts,
    updateProductName,
    reorderProducts, // Store'dan yeni fonksiyon
  } = useProductStore();

  const [editingPrice, setEditingPrice] = useState({});
  const [newPrices, setNewPrices] = useState({});
  const [newName, setNewName] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("");

  const categories = [
    "kahve",
    "yiyecekler",
    "gida",
    "meyve-sebze",
    "sut",
    "atistirma",
    "temizlik-hijyen",
    "şarküteri-et-ürünleri",
    "icecekler",
  ];

  // Backend'e sıralama değişikliğini kaydeden fonksiyon
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
      await fetchAllProducts(); // Ürünleri yeniden çek
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
  
    reorderProducts(newProducts); // Store'daki ürünleri güncelle
    saveOrderToBackend(newProducts); // Backend'e kaydet ve ürünleri yeniden çek
  };

  // Diğer toggle ve yardımcı fonksiyonlar (toggleOutOfStock, handlePriceChange, vb.) aynı kalabilir
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
    if (editingProduct) {
      onEdit({ ...editingProduct, [field]: value || "" });
    }
  };

  const filteredProducts = selectedCategory
    ? products.filter((product) => product.category.toLowerCase() === selectedCategory.toLowerCase())
    : products;

  const toggleProductHidden = async (productId) => {
    try {
      const response = await axios.patch(`/products/toggle-hidden/${productId}`, {}, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (response.data.message) {
        toast.success(response.data.message);
        fetchAllProducts();
      }
    } catch (error) {
      console.error("Ürün gizleme/gösterme hatası:", error);
      toast.error(error.response?.data?.message || "Ürün gizleme/gösterme sırasında hata oluştu.");
    }
  };

  return (
    <motion.div
      className="bg-gray-800 shadow-lg rounded-lg overflow-hidden max-w-full mx-auto border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="p-4 bg-gray-900">
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
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="products">
          {(provided) => (
            <table
              className="min-w-full divide-y divide-gray-700"
              {...provided.droppableProps}
              ref={provided.innerRef}
            >
              <thead className="bg-gray-900">
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
                {filteredProducts?.map((product, index) => (
                  <Draggable key={product._id} draggableId={product._id} index={index}>
                    {(provided) => (
                      <tr
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="hover:bg-gray-700"
                      >
                        {/* Ürün sütunları aynı kalabilir */}
                        <td className="px-4 py-4 whitespace-nowrap w-1/4">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <img
                                className="h-10 w-10 rounded object-cover"
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
                                  className="text-sm font-medium text-white max-w-[150px] truncate"
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
                          <div className="text-sm text-gray-300 max-w-[100px] truncate" title={product.category}>
                            {product.category}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap w-1/6">
                          <div className="text-sm text-gray-300 max-w-[100px] truncate" title={product.subcategory || "Yok"}>
                            {product.subcategory || "Yok"}
                          </div>
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
                                onClick={() => onSave(product._id, {
                                  name: editingProduct.name,
                                  category: editingProduct.category,
                                  subcategory: editingProduct.subcategory || "",
                                })}
                                className="text-green-400 hover:text-green-300 px-2 py-1 rounded"
                              >
                                Kaydet
                              </button>
                              <button
                                onClick={() => onEdit(null)}
                                className="text-red-400 hover:text-red-300 px-2 py-1 rounded"
                              >
                                İptal
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
                      </tr>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </tbody>
            </table>
          )}
        </Droppable>
      </DragDropContext>
    </motion.div>
  );
};

export default ProductsList;