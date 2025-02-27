import { BarChart, PlusCircle, ShoppingBasket, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import AnalyticsTab from "../components/AnalyticsTab";
import CreateProductForm from "../components/CreateProductForm";
import ProductsList from "../components/ProductsList";
import OrdersList from "../components/OrdersList";
import { useProductStore } from "../stores/useProductStore";

const tabs = [
  { id: "create", label: "Ürün Oluştur", icon: PlusCircle },
  { id: "products", label: "Ürünler", icon: ShoppingBasket },
  { id: "analytics", label: "Analiz", icon: BarChart },
  { id: "orders", label: "Siparişler", icon: ShoppingBasket },
  { id: "bulk-upload", label: "Toplu Yükleme", icon: Upload },
];

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("create");
  const { fetchAllProducts, products } = useProductStore();
  const [editingProduct, setEditingProduct] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(""); // Yükleme mesajı için state

  useEffect(() => {
    fetchAllProducts();
  }, [fetchAllProducts]);

  // Düzenleme başlat
  const handleEdit = (product) => {
    setEditingProduct({ ...product });
  };

  // Değişiklikleri kaydet
  const handleSave = async (productId, updatedData) => {
    try {
      const response = await fetch(`http://localhost:5000/api/products/${productId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`, // Eğer token varsa
        },
        body: JSON.stringify({
          name: updatedData.name || "",
          category: updatedData.category || "",
        }),
      });
      const data = await response.json();
      if (response.ok) {
        fetchAllProducts(); // Ürünleri yenile
        setEditingProduct(null);
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
      const response = await fetch("http://localhost:5000/api/products/bulk-upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`, // Admin doğrulama
        },
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setUploadMessage("Ürünler başarıyla yüklendi!");
        fetchAllProducts(); // Ürün listesini yenile
      } else {
        setUploadMessage(`Hata: ${data.message}`);
      }
    } catch (error) {
      setUploadMessage(`Yükleme sırasında hata oluştu: ${error.message}`);
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
      </div>
    </div>
  );
};

export default AdminPage;