import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Edit, Trash2, Image as ImageIcon, X, Save, Loader } from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

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

  const handleDelete = async (id) => {
    if (!window.confirm("Bu banner'ı silmek istediğinize emin misiniz?")) {
      return;
    }

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
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Banner Yönetimi</h2>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-all"
        >
          <Plus className="w-5 h-5" />
          Yeni Banner Ekle
        </motion.button>
      </div>

      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-700/50 rounded-xl p-6 border border-gray-600/50"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">
              {editingBanner ? "Banner Düzenle" : "Yeni Banner Ekle"}
            </h3>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Görsel URL
              </label>
              <input
                type="url"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                required
              />
              {formData.image && (
                <div className="mt-2">
                  <img
                    src={formData.image}
                    alt="Preview"
                    className="max-w-full h-32 object-cover rounded-lg border border-gray-600"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Başlık *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Banner başlığı"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Alt Başlık
              </label>
              <input
                type="text"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="Banner alt başlığı"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Link URL (Opsiyonel)
              </label>
              <input
                type="url"
                value={formData.linkUrl}
                onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                placeholder="https://example.com"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sıra
                </label>
                <input
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-emerald-500 bg-gray-800 border-gray-600 rounded focus:ring-emerald-500"
                  />
                  Aktif
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <motion.button
                type="submit"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingBanner ? "Güncelle" : "Kaydet"}
              </motion.button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
              >
                İptal
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {banners.map((banner) => (
          <motion.div
            key={banner._id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-700/50 rounded-xl overflow-hidden border border-gray-600/50"
          >
            {banner.image && (
              <div className="relative h-48 bg-gray-800">
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-500"><ImageIcon class="w-12 h-12" /></div>';
                  }}
                />
                {!banner.isActive && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                    Pasif
                  </div>
                )}
              </div>
            )}
            <div className="p-4">
              <h3 className="text-lg font-bold text-white mb-1">{banner.title}</h3>
              {banner.subtitle && (
                <p className="text-sm text-gray-400 mb-2">{banner.subtitle}</p>
              )}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                <span>Sıra: {banner.order}</span>
                {banner.linkUrl && (
                  <a
                    href={banner.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    Link →
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleEdit(banner)}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg hover:bg-emerald-500/30 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Düzenle
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDelete(banner._id)}
                  className="flex items-center justify-center gap-2 bg-red-500/20 text-red-400 px-3 py-2 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {banners.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-400">
          <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Henüz banner eklenmemiş.</p>
        </div>
      )}
    </div>
  );
};

export default BannerTab;

