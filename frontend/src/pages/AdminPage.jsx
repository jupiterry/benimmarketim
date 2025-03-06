import { BarChart, PlusCircle, ShoppingBasket, Upload, Users, Package2 } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import AnalyticsTab from "../components/AnalyticsTab";
import CreateProductForm from "../components/CreateProductForm";
import ProductsList from "../components/ProductsList";
import OrdersList from "../components/OrdersList";
import { useProductStore } from "../stores/useProductStore";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("products");
  const { fetchAllProducts, products } = useProductStore();
  const [editingProduct, setEditingProduct] = useState(null);
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState(null);

  useEffect(() => {
    fetchAllProducts();
    fetchUsers();
  }, [fetchAllProducts]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await axios.get("/users");
      setUsers(response.data.users || []);
      setErrorUsers(null);
    } catch (error) {
      console.error("Kullanıcılar getirilirken hata:", error);
      setErrorUsers("Kullanıcılar yüklenemedi.");
      toast.error(error.response?.data?.message || "Kullanıcılar yüklenirken hata oluştu.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUpdateUser = async (userId, updatedData) => {
    try {
      const response = await axios.put(`/users/${userId}`, updatedData);
      if (response.data.success) {
        setUsers(users.map((user) => (user._id === userId ? response.data.user : user)));
        setEditingUser(null);
        toast.success("Kullanıcı başarıyla güncellendi!");
      }
    } catch (error) {
      console.error("Kullanıcı güncellenirken hata:", error);
      toast.error(error.response?.data?.message || "Kullanıcı güncellenirken hata oluştu.");
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
  };

  const handleSave = async (productId, updatedData) => {
    try {
      const response = await axios.put(`/products/${productId}`, updatedData);
      if (response.data) {
        setEditingProduct(null);
        toast.success("Ürün başarıyla güncellendi!");
        fetchAllProducts();
      }
    } catch (error) {
      console.error("Güncelleme hatası:", error);
      toast.error(error.response?.data?.message || "Ürün güncellenirken hata oluştu");
    }
  };

  const handleBulkUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      toast.error("Lütfen bir dosya seçin.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post("/products/bulk-upload", formData);
      if (response.data.success) {
        toast.success("Ürünler başarıyla yüklendi!");
        fetchAllProducts();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Yükleme sırasında hata oluştu");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent mb-4">
            Yönetici Paneli
          </h1>
          <p className="text-gray-400 text-lg">Ürünleri, siparişleri ve kullanıcıları yönetin</p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <AnimatePresence mode="wait">
            {["products", "create", "analytics", "orders", "users", "bulk-upload"].map((tab) => (
              <motion.div
                key={tab}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <TabButton
                  active={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  icon={
                    tab === "products" ? <ShoppingBasket /> :
                    tab === "create" ? <PlusCircle /> :
                    tab === "analytics" ? <BarChart /> :
                    tab === "orders" ? <Package2 /> :
                    tab === "users" ? <Users /> :
                    <Upload />
                  }
                  text={
                    tab === "products" ? "Ürünler" :
                    tab === "create" ? "Ürün Ekle" :
                    tab === "analytics" ? "Analiz" :
                    tab === "orders" ? "Siparişler" :
                    tab === "users" ? "Kullanıcılar" :
                    "Toplu Yükleme"
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 pointer-events-none" />
            
            {activeTab === "create" && <CreateProductForm />}
            {activeTab === "products" && (
              <ProductsList
                products={products}
                onEdit={handleEdit}
                editingProduct={editingProduct}
                setEditingProduct={setEditingProduct}
                onSave={handleSave}
              />
            )}
            {activeTab === "analytics" && <AnalyticsTab />}
            {activeTab === "orders" && <OrdersList />}
            {activeTab === "users" && (
              <UsersTab
                users={users}
                loading={loadingUsers}
                error={errorUsers}
                onEdit={setEditingUser}
                onUpdate={handleUpdateUser}
                onCancel={() => setEditingUser(null)}
                editingUser={editingUser}
              />
            )}
            {activeTab === "bulk-upload" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-xl mx-auto bg-gray-700/30 rounded-xl p-8 border border-gray-600/30"
              >
                <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent mb-4">
                  Toplu Ürün Yükleme
                </h2>
                <p className="text-gray-300 mb-6">
                  CSV formatında bir dosya yükleyerek ürünleri toplu olarak ekleyebilirsiniz.
                </p>
                <label className="block">
                  <span className="sr-only">CSV Dosyası Seç</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleBulkUpload}
                    className="block w-full text-sm text-gray-300
                      file:mr-4 file:py-3 file:px-6
                      file:rounded-xl file:border-0
                      file:text-sm file:font-semibold
                      file:bg-gradient-to-r file:from-emerald-500 file:to-teal-600
                      file:text-white
                      hover:file:from-emerald-600 hover:file:to-teal-700
                      file:cursor-pointer file:transition-all
                      file:duration-300"
                  />
                </label>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, text }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-300 ${
      active
        ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
        : "bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white"
    }`}
  >
    {icon}
    <span className="font-medium">{text}</span>
  </motion.button>
);

const UsersTab = ({ users, loading, error, onEdit, onUpdate, onCancel, editingUser }) => {
  const [editedUser, setEditedUser] = useState({});

  useEffect(() => {
    if (editingUser) {
      setEditedUser(editingUser);
    }
  }, [editingUser]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedUser((prev) => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 text-lg font-medium">{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          Yeniden Dene
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700/50">
        <thead className="bg-gray-800/30">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ad Soyad</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">E-posta</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Telefon</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">İşlemler</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700/50">
          {users.map((user) => (
            <motion.tr
              key={user._id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="hover:bg-gray-700/20 transition-colors group"
            >
              <td className="px-6 py-4 whitespace-nowrap">
                {editingUser && editingUser._id === user._id ? (
                  <input
                    type="text"
                    name="name"
                    value={editedUser.name || ""}
                    onChange={handleChange}
                    className="bg-gray-700/50 text-white border border-gray-600/50 rounded-lg px-3 py-2 w-full
                      focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                      transition-all duration-200"
                  />
                ) : (
                  <div className="text-sm text-gray-300 font-medium">{user.name}</div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {editingUser && editingUser._id === user._id ? (
                  <input
                    type="email"
                    name="email"
                    value={editedUser.email || ""}
                    onChange={handleChange}
                    className="bg-gray-700/50 text-white border border-gray-600/50 rounded-lg px-3 py-2 w-full
                      focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                      transition-all duration-200"
                  />
                ) : (
                  <div className="text-sm text-gray-300">{user.email}</div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {editingUser && editingUser._id === user._id ? (
                  <input
                    type="tel"
                    name="phone"
                    value={editedUser.phone || ""}
                    onChange={handleChange}
                    className="bg-gray-700/50 text-white border border-gray-600/50 rounded-lg px-3 py-2 w-full
                      focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                      transition-all duration-200"
                  />
                ) : (
                  <div className="text-sm text-gray-300">{user.phone || "Belirtilmemiş"}</div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                {editingUser && editingUser._id === user._id ? (
                  <div className="flex space-x-3">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onUpdate(user._id, editedUser)}
                      className="text-emerald-400 hover:text-emerald-300 transition-colors px-4 py-2 rounded-lg
                        bg-emerald-500/10 hover:bg-emerald-500/20"
                    >
                      Kaydet
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={onCancel}
                      className="text-red-400 hover:text-red-300 transition-colors px-4 py-2 rounded-lg
                        bg-red-500/10 hover:bg-red-500/20"
                    >
                      İptal
                    </motion.button>
                  </div>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onEdit(user)}
                    className="text-blue-400 hover:text-blue-300 transition-colors px-4 py-2 rounded-lg
                      bg-blue-500/10 hover:bg-blue-500/20 opacity-0 group-hover:opacity-100"
                  >
                    Düzenle
                  </motion.button>
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPage;