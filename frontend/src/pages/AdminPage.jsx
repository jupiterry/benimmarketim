import { BarChart, PlusCircle, ShoppingBasket, Upload, Users, RefreshCw } from "lucide-react"; // Users ikonunu ekledik
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import AnalyticsTab from "../components/AnalyticsTab";
import CreateProductForm from "../components/CreateProductForm";
import ProductsList from "../components/ProductsList";
import OrdersList from "../components/OrdersList";
import { useProductStore } from "../stores/useProductStore";
import axios from "../lib/axios"; // Axios için import
import toast from "react-hot-toast"; // Hata ve başarı mesajları için

const tabs = [
  { id: "create", label: "Ürün Oluştur", icon: PlusCircle },
  { id: "products", label: "Ürünler", icon: ShoppingBasket },
  { id: "analytics", label: "Analiz", icon: BarChart },
  { id: "orders", label: "Siparişler", icon: ShoppingBasket },
  { id: "bulk-upload", label: "Toplu Yükleme", icon: Upload },
  { id: "users", label: "Kullanıcılar", icon: Users }, // Yeni sekme
  { id: "recategorize", label: "KULLANMA!", icon: RefreshCw },
];

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("products");
  const { fetchAllProducts, products } = useProductStore();
  const [editingProduct, setEditingProduct] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [users, setUsers] = useState([]); // Kullanıcılar için state
  const [editingUser, setEditingUser] = useState(null); // Düzenlenen kullanıcı için state
  const [loadingUsers, setLoadingUsers] = useState(false); // Kullanıcılar yükleniyor durumu
  const [errorUsers, setErrorUsers] = useState(null); // Kullanıcılar için hata durumu

  useEffect(() => {
    fetchAllProducts();
    fetchUsers(); // Kullanıcıları getir
  }, [fetchAllProducts]);

  // Kullanıcıları backend'den getirme
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await axios.get("/users", {
        headers: {
          
        },
      });
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

  // Kullanıcıyı güncelle
  const handleUpdateUser = async (userId, updatedData) => {
    try {
      const response = await axios.put(`/users/${userId}`, updatedData, {
        headers: {
          
        },
      });
      if (response.data.success) {
        setUsers(users.map((user) => (user._id === userId ? response.data.user : user)));
        setEditingUser(null);
        toast.success("Kullanıcı başarıyla güncellendi!");
      } else {
        setUploadMessage(`Hata: ${response.data.message}`);
      }
    } catch (error) {
      console.error("Kullanıcı güncellenirken hata:", error);
      setUploadMessage(`Yükleme sırasında hata oluştu: ${error.message}`);
      toast.error(error.response?.data?.message || "Kullanıcı güncellenirken hata oluştu.");
    }
  };

  // Düzenleme başlat
  const handleEditUser = (user) => {
    setEditingUser(user);
  };

  // Düzenleme iptal
  const handleCancelEditUser = () => {
    setEditingUser(null);
  };

  // Ürünlerle ilgili mevcut fonksiyonlar
  const handleEdit = (product) => {
    setEditingProduct(product);
  };

  const handleSave = async (productId, updatedData) => {
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          name: updatedData.name || "",
          category: updatedData.category || "",
          subcategory: updatedData.subcategory || "",
          discountedPrice: updatedData.discountedPrice || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        fetchAllProducts();
        setEditingProduct(null);
        setUploadMessage("Ürün başarıyla güncellendi!");
      } else {
        console.error("Güncelleme başarısız:", data.message);
        setUploadMessage(`Hata: ${data.message}`);
      }
    } catch (error) {
      console.error("Hata:", error);
      setUploadMessage(`Yükleme sırasında hata oluştu: ${error.message}`);
    }
  };

  // CSV dosyasını yükle
  const handleBulkUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setUploadMessage("Lütfen bir dosya seçin.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/products/bulk-upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setUploadMessage("Ürünler başarıyla yüklendi!");
        fetchAllProducts();
      } else {
        setUploadMessage(`Hata: ${data.message}`);
      }
    } catch (error) {
      setUploadMessage(`Yükleme sırasında hata oluştu: ${error.message}`);
    }
  };

  const handleRecategorize = async () => {
    try {
      const response = await axios.post('/products/recategorize', {}, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      if (response.data.success) {
        toast.success(response.data.message);
        
        // Kategori dağılımını göster
        const distribution = response.data.results.categoryDistribution;
        console.log('Kategori Dağılımı:', distribution);
        
        // Ürünleri yeniden yükle
        fetchAllProducts();
      } else {
        toast.error('Kategoriler güncellenirken bir hata oluştu');
      }
    } catch (error) {
      console.error('Kategori güncelleme hatası:', error);
      toast.error(error.response?.data?.message || 'Kategoriler güncellenirken bir hata oluştu');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="relative z-10 container mx-auto px-4 py-16">
        <motion.h1
          className="text-4xl font-bold mb-8 text-emerald-400 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          Yönetici Paneli
        </motion.h1>

        <div className="flex justify-center mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 mx-2 rounded-md transition-colors duration-200 ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              <tab.icon className="mr-2 h-5 w-5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Aktif sekmeye göre içerik göster */}
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
        {activeTab === "bulk-upload" && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4 text-emerald-400">Toplu Ürün Yükleme</h2>
            <p className="text-gray-300 mb-4">
              CSV formatında bir dosya yükleyerek ürünleri toplu olarak ekleyebilirsiniz.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleBulkUpload}
              className="mb-4 p-2 bg-gray-700 text-white border border-gray-500 rounded"
            />
            {uploadMessage && (
              <p className={`mt-2 ${uploadMessage.includes("Hata") ? "text-red-400" : "text-green-400"}`}>
                {uploadMessage}
              </p>
            )}
          </div>
        )}
        {activeTab === "users" && (
          <UsersTab
            users={users}
            loading={loadingUsers}
            error={errorUsers}
            onEdit={handleEditUser}
            onUpdate={handleUpdateUser}
            onCancel={handleCancelEditUser}
            editingUser={editingUser}
          />
        )}
        {activeTab === "recategorize" && (
          <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-emerald-400 mb-4">KULLANMA!</h2>
            <p className="text-gray-300 mb-4">
              Bu işlem tüm ürünlerin kategorilerini ürün adı ve marka bilgilerine göre otomatik olarak güncelleyecektir.
            </p>
            <button
              onClick={handleRecategorize}
              className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-colors duration-200"
            >
              KULLANMA!
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Yeni UsersTab Bileşeni
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

  const handleSave = (userId) => {
    onUpdate(userId, editedUser);
  };

  if (loading) return <p className="text-center text-gray-300">Yükleniyor...</p>;
  if (error) return <p className="text-center text-red-400">{error}</p>;

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-emerald-400">Kullanıcı Listesi</h2>
      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-900">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/4">Adı</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/4">E-posta</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/4">Telefon</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/4">İşlemler</th>
          </tr>
        </thead>
        <tbody className="bg-gray-800 divide-y divide-gray-700">
          {users.map((user) => (
            <tr key={user._id} className="hover:bg-gray-700">
              <td className="px-4 py-4 whitespace-nowrap w-1/4">
                {editingUser && editingUser._id === user._id ? (
                  <input
                    type="text"
                    name="name"
                    value={editedUser.name || ""}
                    onChange={handleChange}
                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <div className="text-sm text-gray-300">{user.name}</div>
                )}
              </td>
              <td className="px-4 py-4 whitespace-nowrap w-1/4">
                {editingUser && editingUser._id === user._id ? (
                  <input
                    type="email"
                    name="email"
                    value={editedUser.email || ""}
                    onChange={handleChange}
                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <div className="text-sm text-gray-300">{user.email}</div>
                )}
              </td>
              <td className="px-4 py-4 whitespace-nowrap w-1/4">
                {editingUser && editingUser._id === user._id ? (
                  <input
                    type="tel"
                    name="phone"
                    value={editedUser.phone || ""}
                    onChange={handleChange}
                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <div className="text-sm text-gray-300">{user.phone || "Belirtilmemiş"}</div>
                )}
              </td>
              <td className="px-4 py-4 whitespace-nowrap w-1/4 text-sm font-medium">
                {editingUser && editingUser._id === user._id ? (
                  <div className="flex justify-center space-x-2">
                    <button
                      onClick={() => handleSave(user._id)}
                      className="text-green-400 hover:text-green-300 px-2 py-1 rounded"
                    >
                      Kaydet
                    </button>
                    <button
                      onClick={onCancel}
                      className="text-red-400 hover:text-red-300 px-2 py-1 rounded"
                    >
                      İptal
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onEdit(user)}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Düzenle
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPage;