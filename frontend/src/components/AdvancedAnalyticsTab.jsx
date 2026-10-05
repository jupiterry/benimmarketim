import { useState, useEffect } from "react";
import {
  Activity, RefreshCw, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

// Stat Card Component
const StatCard = ({ label, value, change, prefix = "", suffix = "" }) => (
  <div className="ui-stat">
    <span className="ui-stat-label">{label}</span>
    <span className="ui-stat-value">{prefix}{typeof value === 'number' ? value.toLocaleString('tr-TR') : value}{suffix}</span>
    {change != null && (
      <span className={`ui-badge ${change >= 0 ? 'ui-badge--ok' : 'ui-badge--danger'}`} style={{ alignSelf: "flex-start" }}>
        {change >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
        {Math.abs(change).toFixed(1)}%
      </span>
    )}
  </div>
);

// Hourly Chart Component
const HourlyChart = ({ data }) => {
  const maxOrders = Math.max(...data.map(d => d.orders), 1);
  
  return (
    <section className="ui-card">
      <div className="ui-card-header">
        <h3 className="ui-title">Saatlik Sipariş Dağılımı</h3>
      </div>
      <div className="ui-card-body">
        <div className="ui-bars" style={{ height: 160 }}>
          {Array.from({ length: 24 }, (_, hour) => {
            const hourData = data.find(d => d.hour === hour) || { orders: 0 };
            const height = (hourData.orders / maxOrders) * 100;
            return (
              <div key={hour} className="ui-bar-col" tabIndex={0}>
                <div className="ui-bar-track">
                  <div
                    className="ui-bar"
                    data-empty={hourData.orders > 0 ? undefined : "true"}
                    style={{ height: `${height}%` }}
                  />
                  <div className="ui-bar-tip">
                    <strong>{hourData.orders} sipariş</strong>
                    <span>{String(hour).padStart(2, "0")}:00</span>
                  </div>
                </div>
                <span className="ui-bar-label">{hour}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// Category Breakdown Component
const CategoryBreakdown = ({ data }) => {
  const sortedData = [...data].sort((a, b) => b.percentage - a.percentage).slice(0, 7);
  
  return (
    <section className="ui-card">
      <div className="ui-card-header">
        <h3 className="ui-title">Kategori Dağılımı</h3>
      </div>
      <div className="ui-card-body ui-stack ui-stack--sm">
        {sortedData.map((cat, idx) => (
          <div key={cat.name || idx}>
            <div className="ui-between ui-text-sm" style={{ marginBottom: 4 }}>
              <span style={{ textTransform: "capitalize" }}>{cat.name || 'Diğer'}</span>
              <span className="ui-strong ui-num">{cat.percentage}%</span>
            </div>
            <div className="ui-progress">
              <div style={{ width: `${cat.percentage}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// Top Products Component
const TopProducts = ({ data }) => (
  <section className="ui-card">
    <div className="ui-card-header">
      <h3 className="ui-title">En Çok Satan Ürünler</h3>
    </div>
    <div className="ui-card-body ui-stack ui-stack--sm">
      {data.slice(0, 5).map((product, idx) => (
        <div key={product._id || idx} className="ui-row">
          <span className="ui-rank">{idx + 1}</span>
          <div className="ui-grow">
            <p className="ui-list-title ui-truncate">{product.name || 'İsimsiz Ürün'}</p>
            <p className="ui-list-sub">{product.totalSales} adet satıldı</p>
          </div>
          <span className="orders-amount">₺{product.revenue?.toFixed(0)}</span>
        </div>
      ))}
    </div>
  </section>
);

// Order Status Component
const OrderStatusBreakdown = ({ data }) => {
  const statusTones = {
    'Hazırlanıyor': 'warn',
    'Yolda': 'info',
    'Teslim Edildi': 'ok',
    'İptal Edildi': 'danger',
  };
  
  return (
    <section className="ui-card">
      <div className="ui-card-header">
        <h3 className="ui-title">Sipariş Durumları</h3>
      </div>
      <div className="ui-card-body ui-grid-2" style={{ gap: 10 }}>
        {data.map((status) => (
          <div key={status.status} className="ui-stat" style={{ boxShadow: "none" }}>
            <span className="ui-stat-label">
              <span className={`ui-dot ${statusTones[status.status] ? `ui-dot--${statusTones[status.status]}` : ''}`} />
              {status.status}
            </span>
            <span className="ui-stat-value">{status.count}</span>
            <span className="ui-text-xs ui-muted">%{status.percentage || 0}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

// Main Component
const AdvancedAnalyticsTab = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('week');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/analytics?timeRange=${timeRange}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error("Analytics error:", error);
      toast.error("Analitik verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="ui-loading">
        <div className="ui-loader" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="ui-card ui-empty">
        <Activity />
        <p>Analitik verileri yüklenemedi</p>
        <button onClick={fetchAnalytics} className="ui-btn ui-btn--primary" style={{ marginTop: 8 }}>
          Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div className="ui-page">
      {/* Header */}
      <header className="app-pagehead">
        <div>
          <h1>Satış analizi</h1>
          <p>Satış verilerinizden mağazanızın büyümesine uzanan net bir bakış.</p>
        </div>
        <div className="ui-cluster">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            aria-label="Dönem"
            className="ui-field ui-field--auto"
          >
            <option value="week">Son 7 Gün</option>
            <option value="month">Son 30 Gün</option>
            <option value="year">Son 1 Yıl</option>
          </select>
          <button
            onClick={fetchAnalytics}
            className="ui-btn"
            style={{ minHeight: 38 }}
          >
            <RefreshCw />
            Yenile
          </button>
        </div>
      </header>

      {/* Key Metrics */}
      <div className="ui-stats">
        <div className="ui-stat"><span className="ui-stat-label">Seçili dönem net satış</span><strong className="ui-stat-value">₺{Number(analytics.periodRevenue || 0).toLocaleString('tr-TR')}</strong><span className="ui-text-xs ui-muted">Önceki dönem: ₺{Number(analytics.previousPeriodRevenue || 0).toLocaleString('tr-TR')}{analytics.revenueChange != null ? ` · ${analytics.revenueChange > 0 ? '+' : ''}${analytics.revenueChange}%` : ' · Karşılaştırma için önceki dönem satışı yok'}</span></div>
        <div className="ui-stat"><span className="ui-stat-label">Sipariş</span><strong className="ui-stat-value">{analytics.periodOrders || 0}</strong><span className="ui-text-xs ui-muted">İptaller hariç</span></div>
        <div className="ui-stat"><span className="ui-stat-label">İptal</span><strong className="ui-stat-value">{analytics.cancelledCount || 0} · ₺{Number(analytics.cancelledAmount || 0).toLocaleString('tr-TR')}</strong><span className="ui-text-xs ui-muted">İade kaydı tutulmadığı için iade oranı hesaplanmıyor</span></div>
        <div className="ui-stat"><span className="ui-stat-label">Kupon etkisi</span><strong className="ui-stat-value">{analytics.couponOrders || 0} sipariş</strong><span className="ui-text-xs ui-muted">₺{Number(analytics.couponDiscount || 0).toLocaleString('tr-TR')} indirim</span></div>
      </div>
      <div className="ui-stats">
        <StatCard
          label="Seçili Dönem Satışı"
          value={analytics.periodRevenue?.toFixed(0)}
          prefix="₺"
          change={analytics.revenueChange}
        />
        <StatCard
          label="Ortalama Sipariş"
          value={analytics.averageOrderValue?.toFixed(0)}
          prefix="₺"
        />
        <StatCard
          label="Dönüşüm Oranı"
          value={analytics.conversionRate?.toFixed(1)}
          suffix="%"
        />
        <StatCard
          label="Müşteri Sadakati"
          value={analytics.customerRetention?.toFixed(1)}
          suffix="%"
        />
      </div>

      {/* Charts Grid */}
      <div className="ui-grid-2" style={{ gap: 16 }}>
        {/* Hourly Distribution */}
        <HourlyChart data={analytics.hourlyData || []} />
        
        {/* Category Breakdown */}
        <CategoryBreakdown data={analytics.categoryBreakdown || []} />
      </div>

      {/* Bottom Section */}
      <div className="ui-grid-2" style={{ gap: 16 }}>
        {/* Top Products */}
        <TopProducts data={analytics.popularProducts || []} />
        
        {/* Order Status */}
        <OrderStatusBreakdown data={analytics.orderStatusBreakdown || []} />
      </div>

      {/* Daily Sales Chart */}
      {analytics.salesByDay && analytics.salesByDay.length > 0 && (
        <section className="ui-card">
          <div className="ui-card-header">
            <h3 className="ui-title">Günlük Satış Trendi</h3>
            <div className="ui-text-sm ui-muted ui-num">
              Toplam: ₺{analytics.salesByDay.reduce((sum, d) => sum + d.amount, 0).toLocaleString('tr-TR')}
            </div>
          </div>
          
          {/* Chart Container */}
          <div className="ui-card-body ui-chart">
            {/* Y-axis labels */}
            <div className="ui-chart-axis">
              <span>₺{Math.max(...analytics.salesByDay.map(d => d.amount)).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
              <span>₺{(Math.max(...analytics.salesByDay.map(d => d.amount)) / 2).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
              <span>₺0</span>
            </div>
            
            {/* Bars Container */}
            <div className="ui-bars" style={{ height: 220 }}>
              {analytics.salesByDay.map((day, idx) => {
                const maxAmount = Math.max(...analytics.salesByDay.map(d => d.amount));
                const heightPercent = maxAmount > 0 ? (day.amount / maxAmount) * 100 : 0;
                
                return (
                  <div key={day.date || idx} className="ui-bar-col" tabIndex={0}>
                    {/* Bar */}
                    <div className="ui-bar-track">
                      <div
                        className="ui-bar"
                        data-empty={day.amount > 0 ? undefined : "true"}
                        style={{ height: `${Math.max(heightPercent, 2)}%` }}
                      />
                      
                      {/* Tooltip */}
                      <div className="ui-bar-tip">
                        <strong>₺{day.amount.toLocaleString('tr-TR')}</strong>
                        <span>{new Date(day.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                      </div>
                    </div>
                    
                    {/* Date Label */}
                    <span className="ui-bar-label">
                      {new Date(day.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdvancedAnalyticsTab;
