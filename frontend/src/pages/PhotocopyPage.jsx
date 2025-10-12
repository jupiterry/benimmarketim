import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { 
  Upload, 
  FileText, 
  Download, 
  Trash2, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Copy,
  Palette,
  File,
  Loader,
  X
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useUserStore } from "../stores/useUserStore";

const PhotocopyPage = () => {
  const { user } = useUserStore();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const fileInputRef = useRef(null);

  // Form verileri
  const [formData, setFormData] = useState({
    copies: 1,
    color: "black_white",
    paperSize: "A4",
    notes: ""
  });

  // Desteklenen dosya türleri
  const supportedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ];

  // Dosya seçme
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Dosya türü kontrolü
    if (!supportedTypes.includes(file.type)) {
      toast.error("Desteklenmeyen dosya türü. Lütfen PDF, resim, Word, Excel, PowerPoint veya metin dosyası seçin.");
      return;
    }

    // Dosya boyutu kontrolü (50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Dosya boyutu 50MB'dan büyük olamaz.");
      return;
    }

    setSelectedFile(file);
    setShowUploadForm(true);
  };

  // Dosya yükleme
  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    const formDataToSend = new FormData();
    formDataToSend.append('file', selectedFile);
    formDataToSend.append('copies', formData.copies);
    formDataToSend.append('color', formData.color);
    formDataToSend.append('paperSize', formData.paperSize);
    formDataToSend.append('notes', formData.notes);

    try {
      const response = await axios.post('/photocopy/upload', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success("Dosya başarıyla yüklendi!");
      setSelectedFile(null);
      setShowUploadForm(false);
      setFormData({
        copies: 1,
        color: "black_white",
        paperSize: "A4",
        notes: ""
      });
      fetchFiles();
    } catch (error) {
      console.error("Yükleme hatası:", error);
      toast.error(error.response?.data?.message || "Dosya yüklenirken hata oluştu");
    } finally {
      setUploading(false);
    }
  };

  // Dosyaları getir
  const fetchFiles = async () => {
    try {
      const response = await axios.get('/photocopy/my-files');
      setFiles(response.data.data);
    } catch (error) {
      console.error("Dosyalar getirilirken hata:", error);
      toast.error("Dosyalar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Dosya indirme
  const handleDownload = async (fileId, fileName) => {
    try {
      const response = await axios.get(`/photocopy/download/${fileId}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Dosya indirildi");
    } catch (error) {
      console.error("İndirme hatası:", error);
      toast.error("Dosya indirilirken hata oluştu");
    }
  };

  // Dosya silme
  const handleDelete = async (fileId) => {
    if (!window.confirm("Bu dosyayı silmek istediğinizden emin misiniz?")) return;

    try {
      await axios.delete(`/photocopy/${fileId}`);
      toast.success("Dosya silindi");
      fetchFiles();
    } catch (error) {
      console.error("Silme hatası:", error);
      toast.error("Dosya silinirken hata oluştu");
    }
  };

  // Durum ikonu
  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing':
        return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  // Durum metni
  const getStatusText = (status) => {
    switch (status) {
      case 'pending':
        return "Beklemede";
      case 'processing':
        return "İşleniyor";
      case 'ready':
        return "Hazır";
      case 'completed':
        return "Tamamlandı";
      default:
        return "Bilinmiyor";
    }
  };

  // Dosya boyutunu formatla
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Sayfa yüklendiğinde dosyaları getir
  useState(() => {
    fetchFiles();
  }, []);

  return (
    <>
      <Helmet>
        <title>Fotokopi - Benim Marketim</title>
        <meta name="description" content="Dosyalarınızı yükleyin ve fotokopi çıktısı alın. PDF, resim, Word, Excel ve diğer belgelerinizi kolayca yükleyebilirsiniz." />
      </Helmet>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Fotokopi Hizmeti
            </h1>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Dosyalarınızı yükleyin ve fotokopi çıktısı alın. PDF, resim, Word, Excel ve diğer belgelerinizi kolayca yükleyebilirsiniz.
            </p>
          </motion.div>

          {/* Yükleme Alanı */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-lg p-6 mb-8"
          >
            <div className="text-center">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-emerald-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Dosya Yükle
                </h3>
                <p className="text-gray-500 mb-4">
                  PDF, resim, Word, Excel, PowerPoint veya metin dosyası yükleyin
                </p>
                <p className="text-sm text-gray-400">
                  Maksimum dosya boyutu: 50MB
                </p>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              />
            </div>
          </motion.div>

          {/* Yükleme Formu */}
          {showUploadForm && selectedFile && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg shadow-lg p-6 mb-8"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Yükleme Ayarları
                </h3>
                <button
                  onClick={() => {
                    setShowUploadForm(false);
                    setSelectedFile(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dosya Bilgileri */}
                <div>
                  <div className="flex items-center space-x-3 mb-4">
                    <File className="w-8 h-8 text-emerald-500" />
                    <div>
                      <p className="font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                    </div>
                  </div>
                </div>

                {/* Ayarlar */}
                <div className="space-y-4">
                  {/* Kopya Sayısı */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kopya Sayısı
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.copies}
                      onChange={(e) => setFormData({ ...formData, copies: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Renk */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Renk
                    </label>
                    <select
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="black_white">Siyah-Beyaz</option>
                      <option value="color">Renkli</option>
                    </select>
                  </div>

                  {/* Kağıt Boyutu */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kağıt Boyutu
                    </label>
                    <select
                      value={formData.paperSize}
                      onChange={(e) => setFormData({ ...formData, paperSize: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                      <option value="A5">A5</option>
                      <option value="Letter">Letter</option>
                    </select>
                  </div>

                  {/* Notlar */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notlar (Opsiyonel)
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Özel isteklerinizi buraya yazabilirsiniz..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      rows="3"
                    />
                  </div>
                </div>
              </div>

              {/* Yükleme Butonu */}
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowUploadForm(false);
                    setSelectedFile(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Yükleniyor...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Yükle</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Dosya Listesi */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-lg"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Yüklenen Dosyalar
              </h3>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader className="w-8 h-8 animate-spin text-emerald-500" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Henüz dosya yüklenmemiş</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {files.map((file) => (
                  <div key={file._id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <FileText className="w-8 h-8 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.originalName}
                          </p>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-gray-500">
                              {formatFileSize(file.fileSize)}
                            </span>
                            <span className="text-sm text-gray-500">
                              {file.copies} kopya
                            </span>
                            <span className="text-sm text-gray-500">
                              {file.color === 'color' ? 'Renkli' : 'Siyah-Beyaz'}
                            </span>
                            <span className="text-sm text-gray-500">
                              {file.paperSize}
                            </span>
                          </div>
                          {file.notes && (
                            <p className="text-sm text-gray-600 mt-1">
                              Not: {file.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(file.status)}
                          <span className="text-sm text-gray-600">
                            {getStatusText(file.status)}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleDownload(file._id, file.originalName)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                            title="İndir"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(file._id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {file.adminNotes && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-md">
                        <p className="text-sm text-blue-800">
                          <strong>Admin Notu:</strong> {file.adminNotes}
                        </p>
                      </div>
                    )}
                    
                    <div className="mt-2 text-xs text-gray-500">
                      Yüklenme: {new Date(file.createdAt).toLocaleString('tr-TR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default PhotocopyPage;
