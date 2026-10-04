import { useState } from "react";
import { CheckSquare, X, Trash2, Eye, EyeOff, DollarSign, Zap, Replace } from "lucide-react";
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
  // Metin değiştirme state'leri
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const handleBulkAction = async (actionType) => {
    if (selectedProducts.length === 0) {
      toast.error("Lütfen en az bir ürün seçin");
      return;
    }

    setAction(actionType);
    
    // Bazı işlemler için modal göster
    if (actionType === "updatePrice" || actionType === "addFlashSale" || actionType === "replaceText") {
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

        case "replaceText":
          if (!findText || findText.trim() === "") {
            toast.error("Aranacak metin boş olamaz");
            setLoading(false);
            return;
          }
          if (replaceText === undefined || replaceText === null) {
            toast.error("Değiştirilecek metin gerekli");
            setLoading(false);
            return;
          }
          
          // Onay iste
          const confirmMessage = `${selectedProducts.length} ürünün isminde "${findText}" metni "${replaceText}" ile değiştirilecek. Devam etmek istiyor musunuz?`;
          if (!window.confirm(confirmMessage)) {
            setLoading(false);
            return;
          }

          const response = await axios.post("/products/bulk-replace-text", {
            findText: findText.trim(),
            replaceText: replaceText,
            caseSensitive: caseSensitive,
            productIds: selectedProducts.length > 0 ? selectedProducts : null
          });
          
          if (response.data.success) {
            toast.success(response.data.message);
            setShowModal(false);
            setFindText("");
            setReplaceText("");
            setCaseSensitive(false);
          }
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
      <div className="ui-bulkbar" role="region" aria-label="Toplu işlemler">
        <span className="ui-bulkbar-count">
          <CheckSquare />
          {selectedProducts.length} / {totalProducts} ürün seçildi
        </span>

        <div className="ui-cluster ui-grow">
          <button
            onClick={() => handleBulkAction("updatePrice")}
            className="ui-btn ui-btn--sm"
            disabled={loading}
          >
            <DollarSign />
            <span>Fiyat Güncelle</span>
          </button>

          <button
            onClick={() => handleBulkAction("show")}
            className="ui-btn ui-btn--sm"
            disabled={loading}
          >
            <Eye />
            <span>Göster</span>
          </button>

          <button
            onClick={() => handleBulkAction("hide")}
            className="ui-btn ui-btn--sm"
            disabled={loading}
          >
            <EyeOff />
            <span>Gizle</span>
          </button>

          <button
            onClick={() => handleBulkAction("addFlashSale")}
            className="ui-btn ui-btn--sm"
            disabled={loading}
          >
            <Zap />
            <span>Flash Sale</span>
          </button>

          <button
            onClick={() => handleBulkAction("replaceText")}
            className="ui-btn ui-btn--sm"
            disabled={loading}
          >
            <Replace />
            <span>Metin Değiştir</span>
          </button>

          <button
            onClick={() => handleBulkAction("delete")}
            className="ui-btn ui-btn--sm ui-btn--danger"
            disabled={loading}
          >
            <Trash2 />
            <span>Sil</span>
          </button>
        </div>

        <button
          onClick={onClearSelection}
          className="ui-icon-btn"
          title="Seçimi temizle"
          aria-label="Seçimi temizle"
        >
          <X />
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal" role="dialog" aria-modal="true">
            <div className="ui-modal-header">
              <h3 className="ui-title">
                {action === "updatePrice" 
                  ? "Toplu Fiyat Güncelle" 
                  : action === "addFlashSale" 
                  ? "Flash Sale Ekle"
                  : "Toplu Metin Değiştir"}
              </h3>
            </div>

            <div className="ui-modal-body">
              {action === "updatePrice" && (
                <div className="ui-stack">
                  <div>
                    <label className="ui-label" htmlFor="bulk-price-type">İşlem Tipi</label>
                    <select
                      id="bulk-price-type"
                      value={priceType}
                      onChange={(e) => setPriceType(e.target.value)}
                      className="ui-field"
                    >
                      <option value="set">Fiyat Belirle (₺)</option>
                      <option value="increase">Artır (₺)</option>
                      <option value="decrease">Azalt (₺)</option>
                      <option value="percentage">Yüzde (%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="ui-label" htmlFor="bulk-price-value">
                      {priceType === "percentage" ? "Yüzde Değeri" : "Tutar (₺)"}
                    </label>
                    <input
                      id="bulk-price-value"
                      type="number"
                      step="0.01"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      className="ui-field"
                      placeholder={priceType === "percentage" ? "Örn: 10 (10% artış için)" : "Örn: 5.50"}
                    />
                  </div>
                </div>
              )}

              {action === "addFlashSale" && (
                <div className="ui-stack">
                  <div>
                    <label className="ui-label" htmlFor="bulk-flash-value">İndirim Oranı (%)</label>
                    <input
                      id="bulk-flash-value"
                      type="number"
                      min="1"
                      max="99"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      className="ui-field"
                      placeholder="Örn: 25"
                    />
                  </div>
                  <p className="ui-text-sm ui-muted">
                    {selectedProducts.length} ürüne %{priceValue || "0"} indirim uygulanacak
                  </p>
                </div>
              )}

              {action === "replaceText" && (
                <div className="ui-stack">
                  <div>
                    <label className="ui-label" htmlFor="bulk-find-text">Aranacak Metin</label>
                    <input
                      id="bulk-find-text"
                      type="text"
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      className="ui-field"
                      placeholder="Örn: a, i, Coca Cola"
                    />
                    <p className="ui-hint">
                      Ürün isimlerinde değiştirilecek metin/karakter
                    </p>
                  </div>

                  <div>
                    <label className="ui-label" htmlFor="bulk-replace-text">Yeni Metin</label>
                    <input
                      id="bulk-replace-text"
                      type="text"
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      className="ui-field"
                      placeholder="Örn: b, ı, Pepsi"
                    />
                    <p className="ui-hint">
                      Yerine konulacak metin/karakter (boş bırakılabilir)
                    </p>
                  </div>

                  <label htmlFor="caseSensitive" className="ui-check">
                    <input
                      type="checkbox"
                      id="caseSensitive"
                      checked={caseSensitive}
                      onChange={(e) => setCaseSensitive(e.target.checked)}
                    />
                    Büyük/küçük harf duyarlı
                  </label>

                  <div className="order-detail-box" style={{ background: "var(--ui-surface-2)" }}>
                    <p className="ui-strong ui-text-sm">Örnek:</p>
                    <p className="ui-text-sm">
                      "{findText || "a"}" → "{replaceText || "b"}"
                    </p>
                    <p className="ui-text-xs ui-muted">
                      {selectedProducts.length > 0 
                        ? `${selectedProducts.length} seçili ürünün isminde değişiklik yapılacak`
                        : "Tüm ürünlerde değişiklik yapılacak"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="ui-modal-footer">
              <button
                onClick={() => {
                  setShowModal(false);
                  setPriceValue("");
                  setFindText("");
                  setReplaceText("");
                  setCaseSensitive(false);
                }}
                className="ui-btn ui-grow"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (action === "replaceText") {
                    executeBulkAction(action);
                  } else {
                    executeBulkAction(action, priceValue);
                  }
                }}
                disabled={loading || (action === "replaceText" && !findText.trim())}
                className="ui-btn ui-btn--primary ui-grow"
              >
                {loading ? "İşleniyor..." : "Uygula"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BulkActionsToolbar;
