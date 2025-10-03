import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, X, Trash2, Eye, EyeOff, DollarSign, Zap } from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const BulkActionsToolbar = ({ 
  selectedProducts, 
  onClearSelection, 
  onRefresh,
  totalProducts 
}) => {
  const [showModal, setShowModal] = useState(false);
  const [action, setAction] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [priceType, setPriceType] = useState("set"); // set, increase, decrease, percentage
  const [loading, setLoading] = useState(false);

  const handleBulkAction = async (actionType) => {
    if (selectedProducts.length === 0) {
      toast.error("Lütfen en az bir ürün seçin");
      return;
    }

    setAction(actionType);
    
    // Bazı işlemler için modal göster
    if (actionType === "updatePrice" || actionType === "addFlashSale") {
      setShowModal(true);
    } else {
      executeBulkAction(actionType);
    }
  };

  const executeBulkAction = async (actionType, value = null) => {
    setLoading(true);
    try {
      switch (actionType) {
        case "delete":
          if (!window.confirm(`${selectedProducts.length} ürünü silmek istediğinize emin misiniz?`)) {
            setLoading(false);
            return;
          }
          await axios.post("/products/bulk-delete", { productIds: selectedProducts });
          toast.success(`${selectedProducts.length} ürün silindi`);
          break;

        case "hide":
          await axios.post("/products/bulk-visibility", { 
            productIds: selectedProducts, 
            isHidden: true 
          });
          toast.success(`${selectedProducts.length} ürün gizlendi`);
          break;

        case "show":
          await axios.post("/products/bulk-visibility", { 
            productIds: selectedProducts, 
            isHidden: false 
          });
          toast.success(`${selectedProducts.length} ürün görünür yapıldı`);
          break;

        case "updatePrice":
          if (!value || parseFloat(value) <= 0) {
            toast.error("Geçerli bir fiyat girin");
            setLoading(false);
            return;
          }
          await axios.post("/products/bulk-price-update", {
            productIds: selectedProducts,
            priceValue: parseFloat(value),
            priceType: priceType
          });
          toast.success("Fiyatlar güncellendi");
          setShowModal(false);
          break;

        case "addFlashSale":
          if (!value || parseFloat(value) <= 0) {
            toast.error("Geçerli bir indirim oranı girin");
            setLoading(false);
            return;
          }
          await axios.post("/products/bulk-flash-sale", {
            productIds: selectedProducts,
            discountPercentage: parseFloat(value)
          });
          toast.success("Flash sale uygulandı");
          setShowModal(false);
          break;
      }

      onRefresh();
      onClearSelection();
    } catch (error) {
      console.error("Toplu işlem hatası:", error);
      toast.error(error.response?.data?.message || "İşlem başarısız");
    } finally {
      setLoading(false);
    }
  };

  if (selectedProducts.length === 0) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-emerald-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4"
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5" />
          <span className="font-semibold">{selectedProducts.length} / {totalProducts} ürün seçildi</span>
        </div>

        <div className="h-6 w-px bg-white/30" />

        <div className="flex gap-2">
          <button
            onClick={() => handleBulkAction("updatePrice")}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-1.5"
            disabled={loading}
          >
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Fiyat Güncelle</span>
          </button>

          <button
            onClick={() => handleBulkAction("show")}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-1.5"
            disabled={loading}
          >
            <Eye className="w-4 h-4" />
            <span className="text-sm">Göster</span>
          </button>

          <button
            onClick={() => handleBulkAction("hide")}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-1.5"
            disabled={loading}
          >
            <EyeOff className="w-4 h-4" />
            <span className="text-sm">Gizle</span>
          </button>

          <button
            onClick={() => handleBulkAction("addFlashSale")}
            className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 rounded-lg transition-colors flex items-center gap-1.5"
            disabled={loading}
          >
            <Zap className="w-4 h-4" />
            <span className="text-sm">Flash Sale</span>
          </button>

          <button
            onClick={() => handleBulkAction("delete")}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-1.5"
            disabled={loading}
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm">Sil</span>
          </button>
        </div>

        <button
          onClick={onClearSelection}
          className="ml-2 p-1.5 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700"
            >
              <h3 className="text-xl font-bold text-white mb-4">
                {action === "updatePrice" ? "Toplu Fiyat Güncelle" : "Flash Sale Ekle"}
              </h3>

              {action === "updatePrice" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">İşlem Tipi</label>
                    <select
                      value={priceType}
                      onChange={(e) => setPriceType(e.target.value)}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="set">Fiyat Belirle (₺)</option>
                      <option value="increase">Artır (₺)</option>
                      <option value="decrease">Azalt (₺)</option>
                      <option value="percentage">Yüzde (%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">
                      {priceType === "percentage" ? "Yüzde Değeri" : "Tutar (₺)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder={priceType === "percentage" ? "Örn: 10 (10% artış için)" : "Örn: 5.50"}
                    />
                  </div>
                </div>
              )}

              {action === "addFlashSale" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">İndirim Oranı (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      placeholder="Örn: 25"
                    />
                  </div>
                  <p className="text-sm text-gray-400">
                    {selectedProducts.length} ürüne %{priceValue || "0"} indirim uygulanacak
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setPriceValue("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={() => executeBulkAction(action, priceValue)}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "İşleniyor..." : "Uygula"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BulkActionsToolbar;

