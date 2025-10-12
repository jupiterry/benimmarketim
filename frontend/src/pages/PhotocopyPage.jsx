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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
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

  // Dosya silme modal'ını aç
  const openDeleteModal = (file) => {
    setFileToDelete(file);
    setShowDeleteModal(true);
  };

  // Dosya silme
  const handleDelete = async () => {
    if (!fileToDelete) return;

    try {
      await axios.delete(`/photocopy/${fileToDelete._id}`);
      toast.success("Dosya silindi");
      fetchFiles();
      setShowDeleteModal(false);
      setFileToDelete(null);
    } catch (error) {
      console.error("Silme hatası:", error);
      toast.error("Dosya silinirken hata oluştu");
    }
  };

  // Modal'ı kapat
  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setFileToDelete(null);
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

      <div className="min-h-screen pt-24 pb-16 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8 md:mb-12"
          >
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-6">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center shadow-2xl">
                <FileText className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              <div className="text-center md:text-left">
                <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 bg-clip-text text-transparent">
                  Fotokopi Hizmeti
                </h1>
                 <div className="flex items-center justify-center gap-2 mt-2">
                   <div className="w-8 md:w-12 h-1 bg-gradient-to-r from-orange-500 to-red-600 rounded-full"></div>
                   <span className="text-gray-400 text-sm md:text-lg">
                     Dijital Fotokopi
                   </span>
                   <div className="w-8 md:w-12 h-1 bg-gradient-to-r from-red-600 to-pink-500 rounded-full"></div>
                 </div>
              </div>
              <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-r from-red-600 to-pink-500 rounded-full flex items-center justify-center shadow-2xl">
                <span className="text-xl md:text-2xl">📄</span>
              </div>
            </div>
            
            <motion.p 
              className="text-gray-300 text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Dosyalarınızı yükleyin ve fotokopi çıktısı alın. PDF, resim, Word, Excel ve diğer belgelerinizi kolayca yükleyebilirsiniz.
            </motion.p>
          </motion.div>

          {/* Yükleme Alanı */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-4 md:p-8 mb-8"
          >
            <div className="text-center">
              <div
                className="border-2 border-dashed border-gray-600 rounded-2xl p-6 md:p-12 cursor-pointer hover:border-orange-500 transition-all duration-300 hover:bg-gray-800/30 group"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="relative">
                  <Upload className="w-12 h-12 md:w-16 md:h-16 text-gray-400 mx-auto mb-4 md:mb-6 group-hover:text-orange-400 transition-colors" />
                  <div className="absolute -top-1 -right-1 md:-top-2 md:-right-2 w-5 h-5 md:w-6 md:h-6 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">+</span>
                  </div>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white mb-2 md:mb-3">
                  Dosya Yükle
                </h3>
                <p className="text-gray-300 mb-3 md:mb-4 text-sm md:text-lg">
                  PDF, resim, Word, Excel, PowerPoint veya metin dosyası yükleyin
                </p>
                <div className="flex items-center justify-center gap-2 text-xs md:text-sm text-gray-400">
                  <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-orange-500 rounded-full"></span>
                  <span>Maksimum dosya boyutu: 50MB</span>
                  <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-red-500 rounded-full"></span>
                </div>
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
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 p-8 mb-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">
                  Yükleme Ayarları
                </h3>
                <button
                  onClick={() => {
                    setShowUploadForm(false);
                    setSelectedFile(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Dosya Bilgileri */}
                <div>
                  <div className="flex items-center space-x-4 mb-6 p-4 bg-gray-700/50 rounded-xl border border-gray-600/50">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                      <File className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white text-sm md:text-lg truncate">{selectedFile.name}</p>
                      <p className="text-xs md:text-sm text-gray-300">{formatFileSize(selectedFile.size)}</p>
                    </div>
                  </div>
                </div>

                {/* Ayarlar */}
                <div className="space-y-4 md:space-y-6">
                  {/* Kopya Sayısı */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-3">
                      Kopya Sayısı
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.copies}
                      onChange={(e) => setFormData({ ...formData, copies: parseInt(e.target.value) || 1 })}
                      className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                    />
                  </div>

                  {/* Renk */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-3">
                      Renk
                    </label>
                    <select
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                    >
                      <option value="black_white">Siyah-Beyaz</option>
                      <option value="color">Renkli</option>
                    </select>
                  </div>

                  {/* Kağıt Boyutu */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-3">
                      Kağıt Boyutu
                    </label>
                    <select
                      value={formData.paperSize}
                      onChange={(e) => setFormData({ ...formData, paperSize: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                    >
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                      <option value="A5">A5</option>
                      <option value="Letter">Letter</option>
                    </select>
                  </div>

                  {/* Notlar */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-3">
                      Notlar (Opsiyonel)
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Özel isteklerinizi buraya yazabilirsiniz..."
                      className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                      rows="3"
                    />
                  </div>
                </div>
              </div>

              {/* Yükleme Butonu */}
              <div className="mt-8 flex justify-end space-x-4">
                <button
                  onClick={() => {
                    setShowUploadForm(false);
                    setSelectedFile(null);
                  }}
                  className="px-6 py-3 text-gray-300 bg-gray-700/50 border border-gray-600 rounded-xl hover:bg-gray-700 hover:text-white transition-all duration-300 font-medium"
                >
                  İptal
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-400 hover:to-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-2 font-bold shadow-lg hover:shadow-orange-500/25"
                >
                  {uploading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Yükleniyor...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
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
            className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50"
          >
            <div className="px-8 py-6 border-b border-gray-700/50">
              <h3 className="text-2xl font-bold text-white">
                Yüklenen Dosyalar
              </h3>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader className="w-8 h-8 animate-spin text-orange-500" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Henüz dosya yüklenmemiş</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700/50">
                {files.map((file) => (
                  <div key={file._id} className="p-4 md:p-6 hover:bg-gray-700/30 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                            <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base md:text-lg font-bold text-white truncate">
                            {file.originalName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="text-xs md:text-sm text-gray-300 bg-gray-700/50 px-2 md:px-3 py-1 rounded-full">
                              {formatFileSize(file.fileSize)}
                            </span>
                            <span className="text-xs md:text-sm text-gray-300 bg-gray-700/50 px-2 md:px-3 py-1 rounded-full">
                              {file.copies} kopya
                            </span>
                            <span className="text-xs md:text-sm text-gray-300 bg-gray-700/50 px-2 md:px-3 py-1 rounded-full">
                              {file.color === 'color' ? 'Renkli' : 'Siyah-Beyaz'}
                            </span>
                            <span className="text-xs md:text-sm text-gray-300 bg-gray-700/50 px-2 md:px-3 py-1 rounded-full">
                              {file.paperSize}
                            </span>
                          </div>
                          {file.notes && (
                            <p className="text-xs md:text-sm text-gray-400 mt-2 bg-gray-700/30 p-2 md:p-3 rounded-lg">
                              <strong>Not:</strong> {file.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between md:justify-end space-x-4">
                        <div className="flex items-center space-x-2 bg-gray-700/50 px-3 md:px-4 py-2 rounded-xl">
                          {getStatusIcon(file.status)}
                          <span className="text-xs md:text-sm text-white font-medium">
                            {getStatusText(file.status)}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleDownload(file._id, file.originalName)}
                            className="p-2 md:p-3 text-orange-400 hover:bg-orange-500/20 rounded-xl transition-all duration-300 hover:text-orange-300"
                            title="İndir"
                          >
                            <Download className="w-4 h-4 md:w-5 md:h-5" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(file)}
                            className="p-2 md:p-3 text-red-400 hover:bg-red-500/20 rounded-xl transition-all duration-300 hover:text-red-300"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {file.adminNotes && (
                      <div className="mt-4 p-3 md:p-4 bg-blue-900/30 border border-blue-700/50 rounded-xl">
                        <p className="text-xs md:text-sm text-blue-300">
                          <strong>Admin Notu:</strong> {file.adminNotes}
                        </p>
                      </div>
                    )}
                    
                    <div className="mt-3 text-xs text-gray-500 bg-gray-800/50 px-2 md:px-3 py-1 md:py-2 rounded-lg inline-block">
                      Yüklenme: {new Date(file.createdAt).toLocaleString('tr-TR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Silme Onay Modal'ı */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700/50 max-w-md w-full p-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Dosyayı Sil</h3>
                <p className="text-gray-400">Bu işlem geri alınamaz</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-3">
                <strong className="text-white">{fileToDelete?.originalName}</strong> dosyasını silmek istediğinizden emin misiniz?
              </p>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-red-300 text-sm">
                  ⚠️ Bu dosya kalıcı olarak silinecek ve geri getirilemeyecek.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors duration-300"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors duration-300 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Sil
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
};

export default PhotocopyPage;
