import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, Search, Plus, X, Save, Trash2, Percent, Tag, 
  Package, CheckCircle, AlertCircle, Clock, ChevronDown, Edit2
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const WeeklyProductsTab = () => {
  const [weeklyProducts, setWeeklyProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [weeklyPrice, setWeeklyPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  useEffect(() => {
    fetchWeeklyProducts();
    fetchAllProducts();
  }, []);

  const fetchWeeklyProducts = async () => {
    try {
      const response = await axios.get("/weekly-products/all");
      setWeeklyProducts(response.data.weeklyProducts || []);
    } catch (error) {
      console.error("Haftalık ürünler yüklenirken hata:", error);
      toast.error("Haftalık ürünler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllProducts = async () => {
    try {
      const response = await axios.get("/products");
      setAllProducts(response.data.products || []);
    } catch (error) {
      console.error("Ürünler yüklenirken hata:", error);
    }
  };

  const handleAddWeeklyProduct = async () => {
    if (!selectedProduct || !weeklyPrice) {
      toast.error("Lütfen ürün ve fiyat seçin");
      return;
    }

    if (parseFloat(weeklyPrice) >= selectedProduct.price) {
      toast.error("Haftalık fiyat, orijinal fiyattan düşük olmalı");
      return;
    }

    setAdding(true);
    try {
      const response = await axios.post("/weekly-products", {
        productId: selectedProduct._id,
        weeklyPrice: parseFloat(weeklyPrice),
      });

      if (response.data.success) {
        toast.success("Ürün haftalık listeye eklendi!");
        fetchWeeklyProducts();
        setShowAddModal(false);
        setSelectedProduct(null);
        setWeeklyPrice("");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveWeeklyProduct = async (id) => {
    try {
      const response = await axios.delete(`/weekly-products/${id}`);
      if (response.data.success) {
        toast.success("Ürün haftalık listeden kaldırıldı");
        fetchWeeklyProducts();
      }
    } catch (error) {
      toast.error("Ürün kaldırılırken hata oluştu");
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      const response = await axios.patch(`/weekly-products/${id}/toggle`);
      if (response.data.success) {
        toast.success(response.data.message);
        fetchWeeklyProducts();
      }
    } catch (error) {
      toast.error("Durum değiştirilemedi");
    }
  };

  const filteredProducts = allProducts.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
    const notAlreadyAdded = !weeklyProducts.some(
      (wp) => wp.product?._id === product._id && wp.isActive
    );
    return matchesSearch && notAlreadyAdded;
  });

  const calculateDiscount = (original, weekly) => {
    return Math.round(((original - weekly) / original) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-400" />
            Haftalık Ürünler
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Bu hafta öne çıkaracağınız indirimli ürünleri yönetin
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all"
        >
          <Plus className="w-5 h-5" />
          Ürün Ekle
        </motion.button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl p-4 border border-emerald-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <Package className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Toplam</p>
              <p className="text-white text-xl font-bold">{weeklyProducts.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl p-4 border border-blue-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <CheckCircle className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Aktif</p>
              <p className="text-white text-xl font-bold">
                {weeklyProducts.filter((wp) => wp.isActive).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl p-4 border border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <Percent className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Ort. İndirim</p>
              <p className="text-white text-xl font-bold">
                %{weeklyProducts.length > 0 
                  ? Math.round(
                      weeklyProducts.reduce((acc, wp) => 
                        acc + (wp.discountPercentage || 0), 0
                      ) / weeklyProducts.length
                    )
                  : 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-4 border border-purple-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Güncelleme</p>
              <p className="text-white text-sm font-medium">Manuel</p>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Products List */}
      <div className="bg-gray-900/50 rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-white font-semibold">Haftalık Ürün Listesi</h3>
        </div>

        {weeklyProducts.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-white text-lg font-semibold mb-2">Henüz haftalık ürün yok</h3>
            <p className="text-gray-400 text-sm mb-6">
              İndirimli göstermek istediğiniz ürünleri ekleyin
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
            >
              İlk Ürünü Ekle
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {weeklyProducts.map((wp) => (
              <motion.div
                key={wp._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-4 flex items-center gap-4 hover:bg-white/5 transition-colors ${
                  !wp.isActive ? "opacity-50" : ""
                }`}
              >
                {/* Product Image */}
                <div className="w-16 h-16 rounded-xl bg-gray-800 overflow-hidden flex-shrink-0">
                  {wp.product?.image || wp.product?.thumbnail ? (
                    <img
                      src={wp.product.thumbnail || wp.product.image}
                      alt={wp.product?.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium truncate">
                    {wp.product?.name || "Ürün Silinmiş"}
                  </h4>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-gray-500 line-through text-sm">
                      ₺{wp.product?.price?.toFixed(2)}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      ₺{wp.weeklyPrice?.toFixed(2)}
                    </span>
                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
                      %{wp.discountPercentage} İndirim
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="hidden sm:block">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      wp.isActive
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {wp.isActive ? "Aktif" : "Pasif"}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleToggleStatus(wp._id)}
                    className={`p-2 rounded-lg transition-colors ${
                      wp.isActive
                        ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    }`}
                    title={wp.isActive ? "Pasif Yap" : "Aktif Yap"}
                  >
                    {wp.isActive ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleRemoveWeeklyProduct(wp._id)}
                    className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    title="Kaldır"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-gray-900 rounded-2xl border border-white/10 p-6 z-50 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Haftalık Ürün Ekle</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Product Search */}
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Ürün Seçin</label>
                  <div className="relative">
                    <div
                      onClick={() => setShowProductDropdown(!showProductDropdown)}
                      className="w-full bg-gray-800/50 border border-white/10 rounded-xl p-3 cursor-pointer flex items-center justify-between hover:border-emerald-500/50 transition-colors"
                    >
                      {selectedProduct ? (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-700 overflow-hidden">
                            {selectedProduct.thumbnail ? (
                              <img
                                src={selectedProduct.thumbnail}
                                alt={selectedProduct.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-4 h-4 text-gray-500" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-white text-sm">{selectedProduct.name}</p>
                            <p className="text-gray-500 text-xs">₺{selectedProduct.price}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">Ürün seçin...</span>
                      )}
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showProductDropdown ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Dropdown */}
                    <AnimatePresence>
                      {showProductDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-white/10 rounded-xl overflow-hidden z-10 max-h-60 overflow-y-auto"
                        >
                          <div className="p-2 border-b border-white/10">
                            <div className="flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-2">
                              <Search className="w-4 h-4 text-gray-500" />
                              <input
                                type="text"
                                placeholder="Ürün ara..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-transparent text-white text-sm placeholder:text-gray-500 focus:outline-none flex-1"
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredProducts.length === 0 ? (
                              <div className="p-4 text-center text-gray-500 text-sm">
                                Ürün bulunamadı
                              </div>
                            ) : (
                              filteredProducts.slice(0, 20).map((product) => (
                                <div
                                  key={product._id}
                                  onClick={() => {
                                    setSelectedProduct(product);
                                    setShowProductDropdown(false);
                                    setSearchQuery("");
                                  }}
                                  className="flex items-center gap-3 p-3 hover:bg-white/5 cursor-pointer transition-colors"
                                >
                                  <div className="w-10 h-10 rounded-lg bg-gray-700 overflow-hidden">
                                    {product.thumbnail ? (
                                      <img
                                        src={product.thumbnail}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <Package className="w-4 h-4 text-gray-500" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm truncate">{product.name}</p>
                                    <p className="text-gray-500 text-xs">₺{product.price?.toFixed(2)}</p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Weekly Price */}
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Haftalık Fiyat</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₺</span>
                    <input
                      type="number"
                      step="0.01"
                      value={weeklyPrice}
                      onChange={(e) => setWeeklyPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-gray-800/50 border border-white/10 rounded-xl p-3 pl-8 text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                  {selectedProduct && weeklyPrice && parseFloat(weeklyPrice) < selectedProduct.price && (
                    <p className="text-emerald-400 text-sm mt-2">
                      %{calculateDiscount(selectedProduct.price, parseFloat(weeklyPrice))} indirim uygulanacak
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-3 bg-white/5 text-gray-400 rounded-xl hover:bg-white/10 transition-colors"
                  >
                    İptal
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAddWeeklyProduct}
                    disabled={adding || !selectedProduct || !weeklyPrice}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {adding ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Ekle
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WeeklyProductsTab;
