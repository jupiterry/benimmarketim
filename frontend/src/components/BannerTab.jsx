import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Image as ImageIcon, X, Save, Loader } from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useConfirm } from "./ConfirmModal";

const BannerTab = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [formData, setFormData] = useState({
    image: "",
    title: "",
    subtitle: "",
    linkUrl: "",
    isActive: true,
    order: 0,
  });

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const response = await axios.get("/banners/admin");
      if (response.data.success) {
        setBanners(response.data.banners);
      }
    } catch (error) {
      console.error("Banner'lar yüklenirken hata:", error);
      toast.error("Banner'lar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingBanner) {
        // Güncelle
        const response = await axios.put(`/banners/${editingBanner._id}`, formData);
        if (response.data.success) {
          toast.success("Banner başarıyla güncellendi!");
          setEditingBanner(null);
          resetForm();
          fetchBanners();
        }
      } else {
        // Yeni oluştur
        const response = await axios.post("/banners", formData);
        if (response.data.success) {
          toast.success("Banner başarıyla oluşturuldu!");
          resetForm();
          fetchBanners();
        }
      }
    } catch (error) {
      console.error("Banner kaydedilirken hata:", error);
      toast.error(error.response?.data?.message || "Banner kaydedilirken hata oluştu");
    }
  };

  const handleEdit = (banner) => {
    setEditingBanner(banner);
    setFormData({
      image: banner.image || "",
      title: banner.title || "",
      subtitle: banner.subtitle || "",
      linkUrl: banner.linkUrl || "",
      isActive: banner.isActive !== undefined ? banner.isActive : true,
      order: banner.order || 0,
    });
    setShowForm(true);
  };

  const { confirm } = useConfirm();

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Banner Sil',
      message: 'Bu banner\'ı silmek istediğinize emin misiniz?',
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      const response = await axios.delete(`/banners/${id}`);
      if (response.data.success) {
        toast.success("Banner başarıyla silindi!");
        fetchBanners();
      }
    } catch (error) {
      console.error("Banner silinirken hata:", error);
      toast.error("Banner silinirken hata oluştu");
    }
  };

  const resetForm = () => {
    setFormData({
      image: "",
      title: "",
      subtitle: "",
      linkUrl: "",
      isActive: true,
      order: 0,
    });
    setShowForm(false);
    setEditingBanner(null);
  };

  if (loading) {
    return (
      <div className="ui-loading">
        <Loader className="ui-spin" />
      </div>
    );
  }

  return (
    <div className="ui-page">
      <header className="app-pagehead">
        <div>
          <h1>Vitrin görselleri</h1>
          <p>Mağazanızın vitrinini kampanyalarınıza uygun şekilde düzenleyin.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="ui-btn ui-btn--primary"
        >
          <Plus />
          Yeni Banner Ekle
        </button>
      </header>

      {showForm && (
        <section className="ui-card" style={{ maxWidth: 720 }}>
          <div className="ui-card-header">
            <h3 className="ui-title">
              {editingBanner ? "Banner Düzenle" : "Yeni Banner Ekle"}
            </h3>
            <button
              onClick={resetForm}
              className="ui-icon-btn"
              aria-label="Formu kapat"
            >
              <X />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="ui-card-body ui-stack">
            <div>
              <label className="ui-label" htmlFor="banner-image">
                Görsel URL
              </label>
              <input
                id="banner-image"
                type="url"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="https://example.com/image.jpg"
                className="ui-field"
                required
              />
              {formData.image && (
                <div style={{ marginTop: 8 }}>
                  <img
                    src={formData.image}
                    alt="Preview"
                    className="banner-preview"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="ui-label" htmlFor="banner-title">
                Başlık *
              </label>
              <input
                id="banner-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Banner başlığı"
                className="ui-field"
                required
              />
            </div>

            <div>
              <label className="ui-label" htmlFor="banner-subtitle">
                Alt Başlık
              </label>
              <input
                id="banner-subtitle"
                type="text"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="Banner alt başlığı"
                className="ui-field"
              />
            </div>

            <div>
              <label className="ui-label" htmlFor="banner-link">
                Link URL (Opsiyonel)
              </label>
              <input
                id="banner-link"
                type="url"
                value={formData.linkUrl}
                onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                placeholder="https://example.com"
                className="ui-field"
              />
            </div>

            <div className="ui-grid-2">
              <div>
                <label className="ui-label" htmlFor="banner-order">
                  Sıra
                </label>
                <input
                  id="banner-order"
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                  className="ui-field"
                />
              </div>

              <label className="ui-check" style={{ alignSelf: "end", minHeight: 38 }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Aktif
              </label>
            </div>

            <div className="ui-cluster">
              <button
                type="submit"
                className="ui-btn ui-btn--primary"
              >
                <Save />
                {editingBanner ? "Güncelle" : "Kaydet"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="ui-btn"
              >
                İptal
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="ui-grid-3" style={{ gap: 16 }}>
        {banners.map((banner) => (
          <article
            key={banner._id}
            className="ui-card"
            style={{ overflow: "hidden" }}
          >
            {banner.image && (
              <div className="banner-image">
                <img
                  src={banner.image}
                  alt={banner.title}
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-500"><ImageIcon class="w-12 h-12" /></div>';
                  }}
                />
                {!banner.isActive && (
                  <span className="ui-badge ui-badge--danger banner-flag">
                    Pasif
                  </span>
                )}
              </div>
            )}
            <div className="ui-card-body ui-stack ui-stack--sm">
              <div>
                <h3 className="ui-list-title ui-wrap-anywhere">{banner.title}</h3>
                {banner.subtitle && (
                  <p className="ui-list-sub ui-wrap-anywhere">{banner.subtitle}</p>
                )}
              </div>
              <div className="ui-between ui-text-xs ui-muted">
                <span>Sıra: {banner.order}</span>
                {banner.linkUrl && (
                  <a
                    href={banner.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-link"
                    style={{ marginTop: 0 }}
                  >
                    Link →
                  </a>
                )}
              </div>
              <div className="ui-cluster">
                <button
                  onClick={() => handleEdit(banner)}
                  className="ui-btn ui-btn--sm ui-grow"
                >
                  <Edit />
                  Düzenle
                </button>
                <button
                  onClick={() => handleDelete(banner._id)}
                  className="ui-btn ui-btn--sm ui-btn--danger"
                  aria-label="Banner'ı sil"
                  title="Sil"
                >
                  <Trash2 />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {banners.length === 0 && !showForm && (
        <div className="ui-card ui-empty">
          <ImageIcon />
          <p>Henüz banner eklenmemiş.</p>
        </div>
      )}
    </div>
  );
};

export default BannerTab;
