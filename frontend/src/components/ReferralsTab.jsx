import { useState, useEffect } from "react";
import {
  Gift, Share2, Copy, RefreshCw, AlertTriangle, Link2
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";

// Stat Card Component
const StatCard = ({ title, value, subtext }) => (
  <div className="ui-stat">
    <span className="ui-stat-label">{title}</span>
    <span className="ui-stat-value">{value}</span>
    {subtext && <span className="ui-hint">{subtext}</span>}
  </div>
);

// Referral User Card - Zincir sistemine uygun
const ReferralChainCard = ({ referral }) => {
  const isCodeActive = referral.isActive && referral.successfulReferrals < (referral.maxReferrals || 1);
  
  const getStatusBadge = () => {
    if (!referral.isActive) {
      return { text: "Kod Kullanıldı", color: "ui-badge" };
    }
    if (referral.successfulReferrals >= (referral.maxReferrals || 1)) {
      return { text: "Limit Doldu", color: "ui-badge ui-badge--warn" };
    }
    return { text: "Aktif", color: "ui-badge ui-badge--ok" };
  };

  const getInvitedStatus = (status) => {
    switch (status) {
      case "rewarded": return { text: "Ödül Verildi", color: "ui-badge ui-badge--ok" };
      case "completed": return { text: "Sipariş Verdi", color: "ui-badge ui-badge--info" };
      default: return { text: "Bekliyor", color: "ui-badge ui-badge--warn" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="ui-card ui-card-body ui-stack ui-stack--sm">
      {/* Header */}
      <div className="ui-between">
        <div className="ui-cluster ui-grow">
          <div className="ui-avatar">
            {referral.referrer?.name?.charAt(0) || "?"}
          </div>
          <div className="ui-grow">
            <p className="ui-list-title ui-truncate">{referral.referrer?.name || "Bilinmeyen"}</p>
            <p className="ui-list-sub ui-truncate">{referral.referrer?.email}</p>
          </div>
        </div>
        <span className={statusBadge.color}>
          {statusBadge.text}
        </span>
      </div>

      {/* Referral Code */}
      <div className="ui-code referral-code">
        <Link2 />
        <code className="ui-mono ui-grow">{referral.referralCode}</code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(referral.referralCode);
            toast.success("Kod kopyalandı!");
          }}
          className="ui-icon-btn ui-icon-btn--sm"
          aria-label="Kodu kopyala"
          title="Kodu kopyala"
        >
          <Copy />
        </button>
      </div>

      {/* Stats Row */}
      <div className="referral-nums">
        <div>
          <p className="ui-strong ui-num">{referral.totalReferrals || 0}</p>
          <p className="ui-hint">Davet</p>
        </div>
        <div>
          <p className="ui-strong ui-num">{referral.successfulReferrals || 0}</p>
          <p className="ui-hint">Başarılı</p>
        </div>
        <div>
          <p className="ui-strong ui-num">{referral.maxReferrals || 1}</p>
          <p className="ui-hint">Limit</p>
        </div>
      </div>

      {/* Invited Users */}
      {referral.referredUsers?.length > 0 && (
        <div className="referral-invited ui-stack ui-stack--sm">
          <p className="ui-overline">Davet Edilen</p>
          {referral.referredUsers.map((ref, idx) => {
            const invitedStatus = getInvitedStatus(ref.status);
            return (
              <div key={idx} className="ui-between">
                <span className="ui-text-sm ui-truncate">{ref.user?.name || "Kullanıcı"}</span>
                <span className={invitedStatus.color}>
                  {invitedStatus.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Main Component
const ReferralsTab = () => {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, active, used

  useEffect(() => {
    fetchReferralStats();
  }, []);

  const fetchReferralStats = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/referrals/stats");
      setStats(response.data.stats);
      setReferrals(response.data.referrals || []);
    } catch (error) {
      console.error("Referral istatistikleri yüklenirken hata:", error);
      toast.error("Referral verileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const getFilteredReferrals = () => {
    switch (filter) {
      case "active":
        return referrals.filter(r => r.isActive && r.successfulReferrals < (r.maxReferrals || 1));
      case "used":
        return referrals.filter(r => !r.isActive || r.successfulReferrals >= (r.maxReferrals || 1));
      default:
        return referrals;
    }
  };

  if (loading) {
    return (
      <div className="ui-loading">
        <div className="ui-loader"></div>
      </div>
    );
  }

  const filteredReferrals = getFilteredReferrals();
  const activeCount = referrals.filter(r => r.isActive && r.successfulReferrals < (r.maxReferrals || 1)).length;
  const usedCount = referrals.filter(r => !r.isActive || r.successfulReferrals >= (r.maxReferrals || 1)).length;

  return (
    <div className="ui-page">
      {/* Header */}
      <header className="app-pagehead">
        <div>
          <h1>Davet sistemi</h1>
          <p>Davetleri, kazanılan ödülleri ve müşteri bağlantılarını inceleyin.</p>
        </div>
        <button
          onClick={fetchReferralStats}
          className="ui-btn"
        >
          <RefreshCw />
          Yenile
        </button>
      </header>

      {/* Chain System Explanation */}
      <div className="ui-card">
        <div className="ui-card-header">
          <h3 className="ui-title">
            <Share2 />
            Zincir Büyüme Sistemi
          </h3>
        </div>
        <div className="ui-card-body ui-stack">
          {/* Warning */}
          <div className="ui-note">
            <AlertTriangle />
            <div>
              <p className="ui-note-label">Tek Seferlik Davet Hakkı</p>
              <p className="ui-note-body">
                Her kullanıcı <strong>sadece 1 kişiyi</strong> başarılı şekilde davet edebilir.
                Başarılı davet sonrası kod devre dışı olur. Davet edilen kişi kendi kodunu kullanabilir.
              </p>
            </div>
          </div>

          <div className="ui-grid-4">
            {[
              { step: 1, title: "Kod Paylaş", desc: "Kullanıcı kendi kodunu paylaşır" },
              { step: 2, title: "Kayıt Ol", desc: "Arkadaşı %5 hoş geldin kuponu kazanır" },
              { step: 3, title: "İlk Sipariş", desc: "Arkadaşı ilk siparişini verir" },
              { step: 4, title: "Zincir", desc: "Davet eden %5 kupon alır, kodu kapanır" }
            ].map((item) => (
              <div key={item.step} className="ui-cluster" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <span className="ui-rank">{item.step}</span>
                <div>
                  <p className="ui-strong ui-text-sm">{item.title}</p>
                  <p className="ui-hint">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="ui-stats">
        <StatCard 
          title="Toplam Kullanıcı" 
          value={referrals.length} 
        />
        <StatCard 
          title="Başarılı Zincir" 
          value={stats?.totalSuccessful || 0} 
          subtext="Tamamlanan davetler"
        />
        <StatCard 
          title="Dönüşüm Oranı" 
          value={`%${stats?.totalReferrals ? Math.round((stats.totalSuccessful / stats.totalReferrals) * 100) : 0}`} 
        />
        <StatCard 
          title="Verilen Kupon" 
          value={(stats?.totalSuccessful || 0) * 2} 
          subtext="Hoş geldin + Teşekkür"
        />
      </div>

      {/* Filter Tabs */}
      <div><div className="ui-segmented" style={{ display: "inline-flex" }}>
        <button
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
        >
          Tümü ({referrals.length})
        </button>
        <button
          onClick={() => setFilter("active")}
          aria-pressed={filter === "active"}
        >
          Aktif ({activeCount})
        </button>
        <button
          onClick={() => setFilter("used")}
          aria-pressed={filter === "used"}
        >
          Kullanılmış ({usedCount})
        </button>
      </div></div>

      {/* Referral Cards Grid */}
      <div className="ui-grid-3">
        {filteredReferrals.map((referral) => (
          <ReferralChainCard key={referral._id} referral={referral} />
        ))}
      </div>

      {filteredReferrals.length === 0 && (
        <div className="ui-card ui-empty">
          <Gift />
          <h3 className="ui-title">Bu filtrede sonuç yok</h3>
          <p>Farklı bir filtre deneyin</p>
        </div>
      )}
    </div>
  );
};

export default ReferralsTab;
