import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Download,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  User,
  Calendar,
  Filter,
  Search,
  Eye,
  Edit,
  Save,
  X
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

const PhotocopyTab = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [filters, setFilters] = useState({
    status: "",
    user: "",
    dateFrom: "",
    dateTo: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [editingFile, setEditingFile] = useState(null);
  const [editData, setEditData] = useState({});

  // Dosyaları getir
  const fetchFiles = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.user) params.append('user', filters.user);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

      const response = await axios.get(`/photocopy/admin/all?${params}`);
      setFiles(response.data.data);
    } catch (error) {
      console.error("Dosyalar getirilirken hata:", error);
      toast.error("Dosyalar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // İstatistikleri getir
  const fetchStats = async () => {
    try {
      const response = await axios.get('/photocopy/admin/stats');
      setStats(response.data.data);
    } catch (error) {
      console.error("İstatistikler getirilirken hata:", error);
    }
  };

  // Dosya durumunu güncelle
  const updateFileStatus = async (fileId, data) => {
    try {
      await axios.put(`/photocopy/admin/${fileId}`, data);
      toast.success("Dosya durumu güncellendi");
      fetchFiles();
      setEditingFile(null);
    } catch (error) {
      console.error("Güncelleme hatası:", error);
      toast.error("Dosya güncellenirken hata oluştu");
    }
  };

  // Dosya silme (Admin)
  const deleteFile = async (fileId) => {
    if (!window.confirm("Bu dosyayı silmek istediğinizden emin misiniz?")) return;

    try {
      await axios.delete(`/photocopy/admin/${fileId}`);
      toast.success("Dosya silindi");
      fetchFiles();
    } catch (error) {
      console.error("Silme hatası:", error);
      toast.error("Dosya silinirken hata oluştu");
    }
  };

  // Dosya indirme
  const downloadFile = async (fileId, fileName) => {
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

  // Düzenleme başlat
  const startEditing = (file) => {
    setEditingFile(file._id);
    setEditData({
      status: file.status,
      adminNotes: file.adminNotes || "",
      price: file.price || 0,
      isPaid: file.isPaid || false
    });
  };

  // Düzenlemeyi kaydet
  const saveEdit = () => {
    updateFileStatus(editingFile, editData);
  };

  // Düzenlemeyi iptal et
  const cancelEdit = () => {
    setEditingFile(null);
    setEditData({});
  };

  // Filtrelenmiş dosyalar
  const filteredFiles = files.filter(file => {
    const matchesSearch = file.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         file.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         file.user?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Durum ikonu
  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing':
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
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

  useEffect(() => {
    fetchFiles();
    fetchStats();
  }, [filters]);

  return (
    <div className="space-y-6">
      {/* İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Toplam Dosya</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalFiles || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Beklemede</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingFiles || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Tamamlanan</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completedFiles || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Bugün</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayFiles || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Durum
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tümü</option>
              <option value="pending">Beklemede</option>
              <option value="processing">İşleniyor</option>
              <option value="ready">Hazır</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Arama
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Dosya adı, kullanıcı..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilters({ status: "", user: "", dateFrom: "", dateTo: "" });
                setSearchTerm("");
              }}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Temizle
            </button>
          </div>
        </div>
      </div>

      {/* Dosya Listesi */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Fotokopi Dosyaları ({filteredFiles.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Dosya bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredFiles.map((file) => (
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
                      <div className="flex items-center space-x-4 mt-2">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {file.user?.name} ({file.user?.email})
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {new Date(file.createdAt).toLocaleString('tr-TR')}
                          </span>
                        </div>
                      </div>
                      {file.notes && (
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Not:</strong> {file.notes}
                        </p>
                      )}
                      {file.adminNotes && (
                        <p className="text-sm text-blue-600 mt-1">
                          <strong>Admin Notu:</strong> {file.adminNotes}
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
                        onClick={() => downloadFile(file._id, file.originalName)}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                        title="İndir"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEditing(file)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Düzenle"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteFile(file._id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Düzenleme Formu */}
                {editingFile === file._id && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Durum
                        </label>
                        <select
                          value={editData.status}
                          onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="pending">Beklemede</option>
                          <option value="processing">İşleniyor</option>
                          <option value="ready">Hazır</option>
                          <option value="completed">Tamamlandı</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Fiyat (TL)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.price}
                          onChange={(e) => setEditData({ ...editData, price: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      
                      <div className="flex items-end">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={editData.isPaid}
                            onChange={(e) => setEditData({ ...editData, isPaid: e.target.checked })}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-700">Ödendi</span>
                        </label>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Admin Notu
                      </label>
                      <textarea
                        value={editData.adminNotes}
                        onChange={(e) => setEditData({ ...editData, adminNotes: e.target.value })}
                        placeholder="Admin notu..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        rows="2"
                      />
                    </div>
                    
                    <div className="mt-4 flex justify-end space-x-3">
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        İptal
                      </button>
                      <button
                        onClick={saveEdit}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotocopyTab;
