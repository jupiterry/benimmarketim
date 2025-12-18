import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Download,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  User,
  Calendar,
  Search,
  Edit,
  X,
  Printer,
  Filter,
  RefreshCw,
  Copy,
  Palette,
  FileCheck
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

  // Dosya silme
  const deleteFile = async (fileId) => {
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
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'processing':
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'ready':
        return <FileCheck className="w-4 h-4 text-emerald-400" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  // Durum metni ve rengi
  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return { text: "Beklemede", color: "from-yellow-500/20 to-orange-500/20 border-yellow-500/30 text-yellow-400" };
      case 'processing':
        return { text: "İşleniyor", color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400" };
      case 'ready':
        return { text: "Hazır", color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400" };
      case 'completed':
        return { text: "Tamamlandı", color: "from-green-500/20 to-teal-500/20 border-green-500/30 text-green-400" };
      default:
        return { text: "Bilinmiyor", color: "from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-400" };
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

  // İstatistik Kartı
  const StatCard = ({ title, value, icon, gradient, delay = 0 }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -5, scale: 1.02 }}
      className={`bg-gradient-to-br ${gradient} backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl hover:shadow-2xl transition-all duration-300`}
    >
      <div className="flex items-center justify-between">
        <div className="p-3 rounded-xl bg-gray-800/50 shadow-lg">{icon}</div>
        <motion.div 
          className="w-3 h-3 rounded-full bg-current opacity-60"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
      <div className="mt-4">
        <motion.div 
          className="text-3xl font-bold text-white"
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: delay + 0.2 }}
        >
          {value}
        </motion.div>
        <div className="text-sm text-gray-400 mt-1">{title}</div>
      </div>
    </motion.div>
  );

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Başlık */}
      <motion.div 
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="inline-flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Printer className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 bg-clip-text text-transparent">
            Fotokopi Yönetimi
          </h2>
          <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-gray-400 text-lg">
          Fotokopi isteklerini yönetin ve takip edin
        </p>
      </motion.div>

      {/* İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Toplam Dosya"
          value={stats.totalFiles || 0}
          icon={<FileText className="w-6 h-6 text-blue-400" />}
          gradient="from-blue-500/20 to-cyan-500/10"
          delay={0}
        />
        <StatCard
          title="Beklemede"
          value={stats.pendingFiles || 0}
          icon={<Clock className="w-6 h-6 text-yellow-400" />}
          gradient="from-yellow-500/20 to-orange-500/10"
          delay={0.1}
        />
        <StatCard
          title="Tamamlanan"
          value={stats.completedFiles || 0}
          icon={<CheckCircle className="w-6 h-6 text-emerald-400" />}
          gradient="from-emerald-500/20 to-green-500/10"
          delay={0.2}
        />
        <StatCard
          title="Bugün"
          value={stats.todayFiles || 0}
          icon={<Calendar className="w-6 h-6 text-purple-400" />}
          gradient="from-purple-500/20 to-pink-500/10"
          delay={0.3}
        />
      </div>

      {/* Filtreler */}
      <motion.div 
        className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-lg">
            <Filter className="w-5 h-5 text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Filtreler</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Durum
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
            >
              <option value="">Tümü</option>
              <option value="pending">Beklemede</option>
              <option value="processing">İşleniyor</option>
              <option value="ready">Hazır</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Arama
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Dosya adı, kullanıcı..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setFilters({ status: "", user: "", dateFrom: "", dateTo: "" });
                setSearchTerm("");
              }}
              className="w-full px-4 py-3 bg-gray-600/50 hover:bg-gray-500/50 text-gray-200 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 font-medium"
            >
              <X className="w-4 h-4" />
              Temizle
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Dosya Listesi */}
      <motion.div 
        className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="px-6 py-5 border-b border-gray-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-lg">
              <FileText className="w-5 h-5 text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Fotokopi Dosyaları
            </h3>
            <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm font-medium">
              {filteredFiles.length} dosya
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-16 space-y-4">
            <motion.div
              className="relative"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <div className="w-16 h-16 border-4 border-orange-500/20 border-t-orange-500 rounded-full"></div>
            </motion.div>
            <p className="text-gray-400">Dosyalar yükleniyor...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-16">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, type: "spring" }}
              className="w-20 h-20 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <FileText className="w-10 h-10 text-orange-400" />
            </motion.div>
            <h4 className="text-xl font-semibold text-white mb-2">Dosya Bulunamadı</h4>
            <p className="text-gray-400">
              Henüz fotokopi dosyası yüklenmemiş veya filtrelere uygun dosya yok
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            <AnimatePresence>
              {filteredFiles.map((file, index) => {
                const statusInfo = getStatusInfo(file.status);
                return (
                  <motion.div
                    key={file._id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="p-6 hover:bg-gray-700/20 transition-all duration-300"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex items-start space-x-4 flex-1">
                        <motion.div 
                          className="flex-shrink-0"
                          whileHover={{ scale: 1.1, rotate: 5 }}
                        >
                          <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <FileText className="w-6 h-6 text-white" />
                          </div>
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-white truncate">
                            {file.originalName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded-lg text-xs">
                              {formatFileSize(file.fileSize)}
                            </span>
                            <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded-lg text-xs flex items-center gap-1">
                              <Copy className="w-3 h-3" />
                              {file.copies} kopya
                            </span>
                            <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded-lg text-xs flex items-center gap-1">
                              <Palette className="w-3 h-3" />
                              {file.color === 'color' ? 'Renkli' : 'Siyah-Beyaz'}
                            </span>
                            <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded-lg text-xs">
                              {file.paperSize}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-400">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              <span>{file.user?.name} ({file.user?.email})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{new Date(file.createdAt).toLocaleString('tr-TR')}</span>
                            </div>
                          </div>
                          {file.notes && (
                            <div className="mt-3 p-3 bg-gray-700/30 rounded-lg">
                              <p className="text-sm text-gray-300">
                                <strong className="text-white">Not:</strong> {file.notes}
                              </p>
                            </div>
                          )}
                          {file.adminNotes && (
                            <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                              <p className="text-sm text-blue-300">
                                <strong className="text-blue-400">Admin Notu:</strong> {file.adminNotes}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <motion.div 
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r ${statusInfo.color} border`}
                          whileHover={{ scale: 1.05 }}
                        >
                          {getStatusIcon(file.status)}
                          <span className="text-sm font-medium">
                            {statusInfo.text}
                          </span>
                        </motion.div>
                        
                        <div className="flex items-center gap-1">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => downloadFile(file._id, file.originalName)}
                            className="p-3 text-orange-400 hover:bg-orange-500/20 rounded-xl transition-all duration-300"
                            title="İndir"
                          >
                            <Download className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => startEditing(file)}
                            className="p-3 text-blue-400 hover:bg-blue-500/20 rounded-xl transition-all duration-300"
                            title="Düzenle"
                          >
                            <Edit className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => deleteFile(file._id)}
                            className="p-3 text-red-400 hover:bg-red-500/20 rounded-xl transition-all duration-300"
                            title="Sil"
                          >
                            <Trash2 className="w-5 h-5" />
                          </motion.button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Düzenleme Formu */}
                    <AnimatePresence>
                      {editingFile === file._id && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-6 p-6 bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-600/50"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">
                                Durum
                              </label>
                              <select
                                value={editData.status}
                                onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                              >
                                <option value="pending">Beklemede</option>
                                <option value="processing">İşleniyor</option>
                                <option value="ready">Hazır</option>
                                <option value="completed">Tamamlandı</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">
                                Fiyat (TL)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={editData.price}
                                onChange={(e) => setEditData({ ...editData, price: parseFloat(e.target.value) || 0 })}
                                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                              />
                            </div>
                            
                            <div className="flex items-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editData.isPaid}
                                  onChange={(e) => setEditData({ ...editData, isPaid: e.target.checked })}
                                  className="sr-only peer"
                                />
                                <div className="w-14 h-7 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-orange-500 peer-checked:to-red-500"></div>
                                <span className="ml-3 text-sm font-medium text-gray-300">Ödendi</span>
                              </label>
                            </div>
                          </div>
                          
                          <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Admin Notu
                            </label>
                            <textarea
                              value={editData.adminNotes}
                              onChange={(e) => setEditData({ ...editData, adminNotes: e.target.value })}
                              placeholder="Admin notu..."
                              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                              rows="2"
                            />
                          </div>
                          
                          <div className="mt-6 flex justify-end gap-3">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={cancelEdit}
                              className="px-6 py-3 bg-gray-600/50 hover:bg-gray-500/50 text-gray-200 rounded-xl font-medium transition-all duration-300"
                            >
                              İptal
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={saveEdit}
                              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-orange-500/20"
                            >
                              Kaydet
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default PhotocopyTab;
