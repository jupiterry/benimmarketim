import { useState, useEffect } from "react";
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
        return <Clock />;
      case 'processing':
        return <RefreshCw />;
      case 'ready':
        return <FileCheck />;
      case 'completed':
        return <CheckCircle />;
      default:
        return <AlertCircle />;
    }
  };

  // Durum metni ve rengi
  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return { text: "Beklemede", color: "ui-badge--warn" };
      case 'processing':
        return { text: "İşleniyor", color: "ui-badge--info" };
      case 'ready':
        return { text: "Hazır", color: "ui-badge--brand" };
      case 'completed':
        return { text: "Tamamlandı", color: "ui-badge--ok" };
      default:
        return { text: "Bilinmiyor", color: "" };
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
  const StatCard = ({ title, value, tone }) => (
    <div className="ui-stat">
      <span className="ui-stat-label">
        {tone && <span className={`ui-dot ui-dot--${tone}`} />}
        {title}
      </span>
      <span className="ui-stat-value">{value}</span>
    </div>
  );

  return (
    <div className="ui-page">
      {/* Başlık */}
      <header className="app-pagehead">
        <div>
          <h1>Fotokopi</h1>
          <p>Fotokopi taleplerini ve dosyalarını buradan yönetin.</p>
        </div>
      </header>

      {/* İstatistikler */}
      <div className="ui-stats">
        <StatCard
          title="Toplam Dosya"
          value={stats.totalFiles || 0}
        />
        <StatCard
          title="Beklemede"
          value={stats.pendingFiles || 0}
          tone="warn"
        />
        <StatCard
          title="Tamamlanan"
          value={stats.completedFiles || 0}
          tone="ok"
        />
        <StatCard
          title="Bugün"
          value={stats.todayFiles || 0}
        />
      </div>

      {/* Dosya Listesi */}
      <section className="ui-card" style={{ overflow: "hidden" }}>
        {/* Filtreler */}
        <div className="ui-card-body photocopy-filters" style={{ borderBottom: "1px solid var(--ui-line)" }}>
          <div>
            <label className="ui-label" htmlFor="photocopy-search">
              Arama
            </label>
            <div className="ui-search">
              <Search />
              <input
                id="photocopy-search"
                type="text"
                placeholder="Dosya adı, kullanıcı..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ui-field"
              />
            </div>
          </div>

          <div>
            <label className="ui-label" htmlFor="photocopy-status">
              Durum
            </label>
            <select
              id="photocopy-status"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="ui-field"
            >
              <option value="">Tümü</option>
              <option value="pending">Beklemede</option>
              <option value="processing">İşleniyor</option>
              <option value="ready">Hazır</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </div>
          
          <div>
            <label className="ui-label" htmlFor="photocopy-from">
              Başlangıç Tarihi
            </label>
            <input
              id="photocopy-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="ui-field"
            />
          </div>
          
          <div>
            <label className="ui-label" htmlFor="photocopy-to">
              Bitiş Tarihi
            </label>
            <input
              id="photocopy-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="ui-field"
            />
          </div>
          
          <button
            onClick={() => {
              setFilters({ status: "", user: "", dateFrom: "", dateTo: "" });
              setSearchTerm("");
            }}
            className="ui-btn ui-btn--ghost"
            style={{ minHeight: 38, alignSelf: "end" }}
          >
            <X />
            Temizle
          </button>
        </div>

        <div className="ui-list-head" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Fotokopi Dosyaları</span>
          <span className="ui-num">{filteredFiles.length} dosya</span>
        </div>

        {loading ? (
          <div className="ui-loading">
            <div className="ui-loader"></div>
            <p>Dosyalar yükleniyor...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="ui-empty">
            <FileText />
            <h4 className="ui-title">Dosya Bulunamadı</h4>
            <p>
              Henüz fotokopi dosyası yüklenmemiş veya filtrelere uygun dosya yok
            </p>
          </div>
        ) : (
          <div>
            {filteredFiles.map((file) => {
              const statusInfo = getStatusInfo(file.status);
              return (
                <div key={file._id} className="photocopy-item">
                  <div className="ui-between" style={{ alignItems: "flex-start" }}>
                    <div className="products-product ui-grow" style={{ alignItems: "flex-start", flexBasis: 320 }}>
                      <div className="ui-thumb">
                        <FileText size={20} />
                      </div>
                      <div className="ui-grow">
                        <p className="ui-list-title ui-wrap-anywhere">
                          {file.originalName}
                        </p>
                        <div className="ui-cluster" style={{ gap: 6, marginTop: 6 }}>
                          <span className="ui-badge">
                            {formatFileSize(file.fileSize)}
                          </span>
                          <span className="ui-badge">
                            <Copy />
                            {file.copies} kopya
                          </span>
                          <span className="ui-badge">
                            <Palette />
                            {file.color === 'color' ? 'Renkli' : 'Siyah-Beyaz'}
                          </span>
                          <span className="ui-badge">
                            {file.paperSize}
                          </span>
                        </div>
                        <div className="ui-cluster" style={{ gap: "2px 14px", marginTop: 8 }}>
                          <span className="orders-meta">
                            <User />
                            <span>{file.user?.name} ({file.user?.email})</span>
                          </span>
                          <span className="orders-meta">
                            <Calendar />
                            <span>{new Date(file.createdAt).toLocaleString('tr-TR')}</span>
                          </span>
                        </div>
                        {file.notes && (
                          <p className="ui-text-sm ui-wrap-anywhere" style={{ marginTop: 8 }}>
                            <strong className="ui-strong">Not:</strong> {file.notes}
                          </p>
                        )}
                        {file.adminNotes && (
                          <p className="ui-text-sm ui-wrap-anywhere" style={{ marginTop: 4, color: "var(--ui-info-ink)" }}>
                            <strong>Admin Notu:</strong> {file.adminNotes}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="ui-cluster">
                      <span className={`ui-badge ${statusInfo.color}`}>
                        {getStatusIcon(file.status)}
                        {statusInfo.text}
                      </span>
                      
                      <div className="products-actions">
                        <button
                          onClick={() => downloadFile(file._id, file.originalName)}
                          className="ui-icon-btn"
                          title="İndir"
                          aria-label="İndir"
                        >
                          <Download />
                        </button>
                        <button
                          onClick={() => startEditing(file)}
                          className="ui-icon-btn"
                          title="Düzenle"
                          aria-label="Düzenle"
                        >
                          <Edit />
                        </button>
                        <button
                          onClick={() => deleteFile(file._id)}
                          className="ui-icon-btn ui-icon-btn--danger"
                          title="Sil"
                          aria-label="Sil"
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Düzenleme Formu */}
                  {editingFile === file._id && (
                    <div className="order-detail-box" style={{ marginTop: 14, background: "var(--ui-surface-2)" }}>
                      <div className="ui-grid-3">
                        <div>
                          <label className="ui-label" htmlFor={`photocopy-edit-status-${file._id}`}>
                            Durum
                          </label>
                          <select
                            id={`photocopy-edit-status-${file._id}`}
                            value={editData.status}
                            onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                            className="ui-field"
                          >
                            <option value="pending">Beklemede</option>
                            <option value="processing">İşleniyor</option>
                            <option value="ready">Hazır</option>
                            <option value="completed">Tamamlandı</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="ui-label" htmlFor={`photocopy-edit-price-${file._id}`}>
                            Fiyat (TL)
                          </label>
                          <input
                            id={`photocopy-edit-price-${file._id}`}
                            type="number"
                            step="0.01"
                            value={editData.price}
                            onChange={(e) => setEditData({ ...editData, price: parseFloat(e.target.value) || 0 })}
                            className="ui-field"
                          />
                        </div>
                        
                        <label className="ui-check" style={{ alignSelf: "end", minHeight: 38 }}>
                          <input
                            type="checkbox"
                            checked={editData.isPaid}
                            onChange={(e) => setEditData({ ...editData, isPaid: e.target.checked })}
                          />
                          Ödendi
                        </label>
                      </div>
                      
                      <div>
                        <label className="ui-label" htmlFor={`photocopy-edit-notes-${file._id}`}>
                          Admin Notu
                        </label>
                        <textarea
                          id={`photocopy-edit-notes-${file._id}`}
                          value={editData.adminNotes}
                          onChange={(e) => setEditData({ ...editData, adminNotes: e.target.value })}
                          placeholder="Admin notu..."
                          className="ui-field"
                          rows="2"
                        />
                      </div>
                      
                      <div className="ui-cluster" style={{ justifyContent: "flex-end" }}>
                        <button
                          onClick={cancelEdit}
                          className="ui-btn"
                        >
                          İptal
                        </button>
                        <button
                          onClick={saveEdit}
                          className="ui-btn ui-btn--primary"
                        >
                          Kaydet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default PhotocopyTab;
