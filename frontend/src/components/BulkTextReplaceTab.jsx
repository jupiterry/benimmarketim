import { useState } from "react";
import { motion } from "framer-motion";
import { Replace, AlertTriangle, CheckCircle, Loader } from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const BulkTextReplaceTab = () => {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  // Önizleme yap
  const handlePreview = async () => {
    if (!findText.trim()) {
      toast.error("Lütfen aranacak metni girin");
      return;
    }

    setLoading(true);
    try {
      // Önizleme için tüm ürünleri getir ve filtrele
      const response = await axios.get("/products");
      const products = response.data.products || [];

      // Hangi ürünlerde değişiklik olacağını bul
      const regex = caseSensitive
        ? new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        : new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      const affectedProducts = products
        .filter(product => regex.test(product.name))
        .map(product => {
          const oldName = product.name;
          const newName = oldName.replace(regex, replaceText || '');
          const matches = oldName.match(regex);
          const replacementCount = matches ? matches.length : 0;

          return {
            id: product._id,
            oldName,
            newName,
            replacementCount,
            willChange: oldName !== newName
          };
        })
        .filter(item => item.willChange)
        .slice(0, 20); // İlk 20'sini göster

      setPreview({
        totalProducts: products.length,
        affectedCount: products.filter(p => regex.test(p.name)).length,
        sampleProducts: affectedProducts
      });
    } catch (error) {
      console.error("Önizleme hatası:", error);
      toast.error("Önizleme yapılırken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Değişikliği uygula
  const handleReplace = async () => {
    if (!findText.trim()) {
      toast.error("Lütfen aranacak metni girin");
      return;
    }

    // Onay iste
    const confirmMessage = `TÜM ürünlerde "${findText}" metni "${replaceText || '(silinecek)'}" ile değiştirilecek. Bu işlem geri alınamaz! Devam etmek istiyor musunuz?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setResult(null);
    
    try {
      const response = await axios.post("/products/bulk-replace-text", {
        findText: findText.trim(),
        replaceText: replaceText || "",
        caseSensitive: caseSensitive,
        productIds: null // Tüm ürünler için null
      });

      if (response.data.success) {
        setResult(response.data);
        toast.success(response.data.message);
        setPreview(null);
        setFindText("");
        setReplaceText("");
        setCaseSensitive(false);
      }
    } catch (error) {
      console.error("Metin değiştirme hatası:", error);
      toast.error(error.response?.data?.message || "Metin değiştirme işlemi başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto bg-gray-700/30 rounded-xl p-8 border border-gray-600/30"
    >
      <div className="flex items-center gap-3 mb-6">
        <Replace className="w-8 h-8 text-purple-400" />
        <h2 className="text-2xl font-bold text-white">Toplu Metin Değiştirme</h2>
      </div>

      <p className="text-gray-400 mb-6">
        Tüm ürün isimlerinde belirli bir metni/karakteri başka bir metin/karakterle değiştirin. 
        Bu işlem <span className="text-red-400 font-semibold">geri alınamaz</span>!
      </p>

      {/* Form */}
      <div className="space-y-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Aranacak Metin/Karakter <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={findText}
            onChange={(e) => {
              setFindText(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Örn: a, i, Coca Cola, Türkçe karakter"
          />
          <p className="text-xs text-gray-500 mt-1">
            Ürün isimlerinde değiştirilecek metin veya karakter
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Yeni Metin/Karakter
          </label>
          <input
            type="text"
            value={replaceText}
            onChange={(e) => {
              setReplaceText(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Örn: b, ı, Pepsi, İngilizce karakter"
          />
          <p className="text-xs text-gray-500 mt-1">
            Yerine konulacak metin veya karakter (boş bırakılırsa silinir)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="caseSensitive"
            checked={caseSensitive}
            onChange={(e) => {
              setCaseSensitive(e.target.checked);
              setPreview(null);
              setResult(null);
            }}
            className="w-5 h-5 text-purple-600 bg-gray-800 border-gray-600 rounded focus:ring-purple-500"
          />
          <label htmlFor="caseSensitive" className="text-sm text-gray-300 cursor-pointer">
            Büyük/küçük harf duyarlı (A ≠ a)
          </label>
        </div>

        {/* Önizleme Butonu */}
        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={loading || !findText.trim()}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Kontrol Ediliyor...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Önizleme Yap</span>
              </>
            )}
          </button>

          <button
            onClick={handleReplace}
            disabled={loading || !findText.trim()}
            className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>İşleniyor...</span>
              </>
            ) : (
              <>
                <Replace className="w-5 h-5" />
                <span>Değiştir</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Önizleme Sonuçları */}
      {preview && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Önizleme Sonuçları</h3>
          </div>
          
          <div className="space-y-2 mb-4">
            <p className="text-gray-300">
              <span className="font-semibold">Toplam Ürün:</span> {preview.totalProducts}
            </p>
            <p className="text-blue-300">
              <span className="font-semibold">Etkilenecek Ürün:</span> {preview.affectedCount}
            </p>
          </div>

          {preview.sampleProducts.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-2">Örnek Değişiklikler (İlk 20):</p>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {preview.sampleProducts.map((product, index) => (
                  <div
                    key={index}
                    className="bg-gray-800/50 rounded p-3 text-sm"
                  >
                    <div className="text-gray-400 line-through mb-1">
                      {product.oldName}
                    </div>
                    <div className="text-green-400 font-semibold">
                      {product.newName}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {product.replacementCount} değişiklik
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.affectedCount === 0 && (
            <p className="text-yellow-400 text-sm">
              Hiçbir üründe "{findText}" metni bulunamadı.
            </p>
          )}
        </motion.div>
      )}

      {/* İşlem Sonuçları */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-900/20 border border-green-500/30 rounded-lg p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-white">İşlem Tamamlandı</h3>
          </div>
          
          <div className="space-y-2">
            <p className="text-gray-300">
              <span className="font-semibold">Güncellenen Ürün:</span> {result.stats.updatedProducts}
            </p>
            <p className="text-gray-300">
              <span className="font-semibold">Toplam Değişiklik:</span> {result.stats.totalReplacements}
            </p>
          </div>

          {result.updatedProducts && result.updatedProducts.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-2">Güncellenen Ürünler (İlk 50):</p>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {result.updatedProducts.map((product, index) => (
                  <div
                    key={index}
                    className="bg-gray-800/50 rounded p-3 text-sm"
                  >
                    <div className="text-gray-400 line-through mb-1">
                      {product.oldName}
                    </div>
                    <div className="text-green-400 font-semibold">
                      {product.newName}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {product.replacements} değişiklik
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Uyarı */}
      <div className="mt-6 bg-red-900/20 border border-red-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-semibold text-red-400 mb-1">Dikkat!</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Bu işlem <span className="text-red-400 font-semibold">geri alınamaz</span></li>
              <li>Tüm ürünlerde değişiklik yapılacak (seçim yapılmazsa)</li>
              <li>İşlem öncesi mutlaka <span className="text-blue-400">Önizleme Yap</span> butonunu kullanın</li>
              <li>Değişiklikler anında veritabanına kaydedilir</li>
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default BulkTextReplaceTab;

