import { useState, useEffect } from "react";
import { 
  Calendar, Search, Plus, X, Save, Trash2,
  Package, CheckCircle, AlertCircle, ChevronDown
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
      <div className="ui-loading">
        <div className="ui-loader" />
      </div>
    );
  }

  return (
    <div className="ui-page">
      {/* Header */}
      <div className="ui-between">
        <div>
          <h2 className="ui-title">Haftalık Ürünler</h2>
          <p className="ui-subtitle">
            Bu hafta öne çıkaracağınız indirimli ürünleri yönetin
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="ui-btn ui-btn--primary"
        >
          <Plus />
          Ürün Ekle
        </button>
      </div>

      {/* Stats */}
      <div className="ui-stats">
        <div className="ui-stat">
          <span className="ui-stat-label">Toplam</span>
          <span className="ui-stat-value">{weeklyProducts.length}</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label"><span className="ui-dot ui-dot--ok" />Aktif</span>
          <span className="ui-stat-value">
            {weeklyProducts.filter((wp) => wp.isActive).length}
          </span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Ort. İndirim</span>
          <span className="ui-stat-value">
            %{weeklyProducts.length > 0 
              ? Math.round(
                  weeklyProducts.reduce((acc, wp) => 
                    acc + (wp.discountPercentage || 0), 0
                  ) / weeklyProducts.length
                )
              : 0}
          </span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Güncelleme</span>
          <span className="ui-stat-value" style={{ fontSize: 18 }}>Manuel</span>
        </div>
      </div>

      {/* Weekly Products List */}
      <section className="ui-card" style={{ overflow: "hidden" }}>
        <div className="ui-card-header">
          <h3 className="ui-title">Haftalık Ürün Listesi</h3>
        </div>

        {weeklyProducts.length === 0 ? (
          <div className="ui-empty">
            <Calendar />
            <h3 className="ui-title">Henüz haftalık ürün yok</h3>
            <p>
              İndirimli göstermek istediğiniz ürünleri ekleyin
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="ui-btn"
              style={{ marginTop: 10 }}
            >
              İlk Ürünü Ekle
            </button>
          </div>
        ) : (
          <div>
            {weeklyProducts.map((wp) => (
              <div
                key={wp._id}
                className="ui-list-row"
                style={{ display: "flex" }}
                data-muted={!wp.isActive}
              >
                {/* Product Image */}
                <div className="ui-thumb">
                  {wp.product?.image || wp.product?.thumbnail ? (
                    <img
                      src={wp.product.thumbnail || wp.product.image}
                      alt={wp.product?.name}
                    />
                  ) : (
                    <Package size={20} />
                  )}
                </div>

                {/* Product Info */}
                <div className="ui-grow">
                  <h4 className="ui-list-title ui-truncate">
                    {wp.product?.name || "Ürün Silinmiş"}
                  </h4>
                  <div className="products-price" style={{ marginTop: 2 }}>
                    <span className="products-price-now">
                      ₺{wp.weeklyPrice?.toFixed(2)}
                    </span>
                    <span className="products-price-old">
                      ₺{wp.product?.price?.toFixed(2)}
                    </span>
                    <span className="ui-badge ui-badge--danger">
                      %{wp.discountPercentage} İndirim
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                <span className={`ui-badge ${wp.isActive ? "ui-badge--ok" : ""}`}>
                  {wp.isActive ? "Aktif" : "Pasif"}
                </span>

                {/* Actions */}
                <div className="products-actions">
                  <button
                    onClick={() => handleToggleStatus(wp._id)}
                    className="ui-icon-btn"
                    title={wp.isActive ? "Pasif Yap" : "Aktif Yap"}
                    aria-label={wp.isActive ? "Pasif Yap" : "Aktif Yap"}
                  >
                    {wp.isActive ? (
                      <AlertCircle />
                    ) : (
                      <CheckCircle />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemoveWeeklyProduct(wp._id)}
                    className="ui-icon-btn ui-icon-btn--danger"
                    title="Kaldır"
                    aria-label="Kaldır"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="ui-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="ui-modal" style={{ overflow: "visible" }} role="dialog" aria-modal="true" aria-label="Haftalık Ürün Ekle" onClick={(e) => e.stopPropagation()}>
            <div className="ui-modal-header">
              <h3 className="ui-title">Haftalık Ürün Ekle</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="ui-icon-btn"
                aria-label="Kapat"
              >
                <X />
              </button>
            </div>

            {/* Product Search */}
            <div className="ui-modal-body ui-stack" style={{ overflow: "visible" }}>
              <div>
                <span className="ui-label">Ürün Seçin</span>
                <div style={{ position: "relative" }}>
                  <div
                    onClick={() => setShowProductDropdown(!showProductDropdown)}
                    className="ui-row ui-row--selectable"
                    style={{ borderColor: "var(--ui-line-strong)" }}
                  >
                    {selectedProduct ? (
                      <>
                        <div className="ui-thumb" style={{ width: 36, height: 36 }}>
                          {selectedProduct.thumbnail ? (
                            <img
                              src={selectedProduct.thumbnail}
                              alt={selectedProduct.name}
                            />
                          ) : (
                            <Package size={16} />
                          )}
                        </div>
                        <div className="ui-grow">
                          <p className="order-item-name">{selectedProduct.name}</p>
                          <p className="order-item-sub">₺{selectedProduct.price}</p>
                        </div>
                      </>
                    ) : (
                      <span className="ui-grow ui-muted">Ürün seçin...</span>
                    )}
                    <ChevronDown size={18} style={{ flexShrink: 0, transform: showProductDropdown ? "rotate(180deg)" : "none" }} />
                  </div>

                  {/* Dropdown */}
                  {showProductDropdown && (
                    <div className="ui-popover">
                      <div className="ui-search" style={{ margin: 8 }}>
                        <Search />
                        <input
                          type="text"
                          placeholder="Ürün ara..."
                          aria-label="Ürün ara"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="ui-field ui-field--sm"
                        />
                      </div>
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {filteredProducts.length === 0 ? (
                          <div className="ui-loading" style={{ padding: 16 }}>
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
                              className="ui-row ui-row--selectable"
                              style={{ border: 0, borderRadius: 0 }}
                            >
                              <div className="ui-thumb" style={{ width: 36, height: 36 }}>
                                {product.thumbnail ? (
                                  <img
                                    src={product.thumbnail}
                                    alt={product.name}
                                  />
                                ) : (
                                  <Package size={16} />
                                )}
                              </div>
                              <div className="ui-grow">
                                <p className="order-item-name ui-truncate">{product.name}</p>
                                <p className="order-item-sub">₺{product.price?.toFixed(2)}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Weekly Price */}
              <div>
                <label className="ui-label" htmlFor="weekly-price">Haftalık Fiyat</label>
                <div className="ui-field-prefix">
                  <span>₺</span>
                  <input
                    id="weekly-price"
                    type="number"
                    step="0.01"
                    value={weeklyPrice}
                    onChange={(e) => setWeeklyPrice(e.target.value)}
                    placeholder="0.00"
                    className="ui-field"
                  />
                </div>
                {selectedProduct && weeklyPrice && parseFloat(weeklyPrice) < selectedProduct.price && (
                  <p className="ui-hint" style={{ color: "var(--ui-ok-ink)" }}>
                    %{calculateDiscount(selectedProduct.price, parseFloat(weeklyPrice))} indirim uygulanacak
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="orders-queue-actions">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="ui-btn"
                >
                  İptal
                </button>
                <button
                  onClick={handleAddWeeklyProduct}
                  disabled={adding || !selectedProduct || !weeklyPrice}
                  className="ui-btn ui-btn--primary"
                >
                  {adding ? (
                    <div className="ui-loader" style={{ width: 16, height: 16 }} />
                  ) : (
                    <>
                      <Save />
                      Ekle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyProductsTab;
