import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Power, Save, Target, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const freshForm = () => {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 86400000);
  return {
    title: "Topluluk indirimi",
    description: "Talep bırakanlara özel fırsat",
    targetCount: 30,
    discountPercentage: 5,
    minimumOrderAmount: 0,
    rewardValidityDays: 14,
    orderRequirement: "delivered",
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    isActive: true,
  };
};

const requirementLabels = {
  none: "Sipariş şartı yok",
  any: "En az 1 sipariş",
  delivered: "En az 1 teslim edilmiş sipariş",
};

const CouponRequestCampaignPanel = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(freshForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const { confirm } = useConfirm();

  const load = async () => {
    try {
      const { data } = await axios.get("/coupon-requests/admin");
      setCampaigns(data.campaigns || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Talep kampanyaları yüklenemedi");
    }
  };

  useEffect(() => { load(); }, []);

  const activeCampaign = useMemo(() => campaigns.find((item) => item.isActive), [campaigns]);

  const editCampaign = (campaign) => {
    setForm({
      _id: campaign._id,
      title: campaign.title,
      description: campaign.description,
      targetCount: campaign.targetCount,
      discountPercentage: campaign.discountPercentage,
      minimumOrderAmount: campaign.minimumOrderAmount || 0,
      rewardValidityDays: campaign.rewardValidityDays || 14,
      orderRequirement: campaign.orderRequirement || "delivered",
      startsAt: toLocalInput(campaign.startsAt),
      endsAt: toLocalInput(campaign.endsAt),
      isActive: campaign.isActive,
    });
    window.setTimeout(() => document.getElementById("coupon-request-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      };
      const { data } = await axios.post("/coupon-requests/admin", payload);
      toast.success(data.campaign?.isActive ? "Kampanya yayına alındı" : "Kampanya kaydedildi");
      setForm(freshForm());
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Kampanya kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const deactivateCampaign = async (campaign) => {
    try {
      await axios.post("/coupon-requests/admin", {
        ...campaign,
        isActive: false,
        startsAt: new Date(campaign.startsAt).toISOString(),
        endsAt: new Date(campaign.endsAt).toISOString(),
      });
      toast.success("Kampanya pasife alındı");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Kampanya pasife alınamadı");
    }
  };

  const activateCampaign = async (campaign) => {
    try {
      await axios.post("/coupon-requests/admin", {
        ...campaign,
        isActive: true,
        startsAt: new Date(campaign.startsAt).toISOString(),
        endsAt: new Date(campaign.endsAt).toISOString(),
      });
      toast.success("Kampanya yeniden yayına alındı");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Kampanya yayına alınamadı");
    }
  };

  const deleteCampaign = async (campaign) => {
    const confirmed = await confirm({
      title: "Kampanyayı Sil",
      message: `"${campaign.title}" kampanyasını silmek istediğinize emin misiniz?`,
      confirmText: "Evet, Sil",
      cancelText: "İptal",
      type: "danger",
    });
    if (!confirmed) return;

    try {
      await axios.delete(`/coupon-requests/admin/${campaign._id}`);
      toast.success("Kampanya silindi");
      if (expandedId === campaign._id) setExpandedId(null);
      if (form._id === campaign._id) setForm(freshForm());
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Kampanya silinemedi");
    }
  };

  return (
    <section className="ui-card" style={{ overflow: "hidden" }}>
      <div className="ui-card-header">
        <div>
          <h3 className="ui-title">Kupon İstek Kampanyası</h3>
          <p className="ui-subtitle">Şartı, hedefi ve ödülü belirle; hedef dolunca kişisel kuponlar otomatik dağıtılsın.</p>
        </div>
        {activeCampaign && (
          <span className="ui-badge ui-badge--ok">
            Aktif: {activeCampaign.weightedCount}/{activeCampaign.targetCount} puan
          </span>
        )}
      </div>

      <form id="coupon-request-form" onSubmit={save} className="ui-card-body ui-grid-4">
        <label className="ui-label" style={{ gridColumn: "span 2", marginBottom: 0 }}>Kampanya adı
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ gridColumn: "span 2", marginBottom: 0 }}>Kullanıcıya gösterilecek açıklama
          <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Hedef puan
          <input required min="1" type="number" value={form.targetCount} onChange={(e) => setForm({ ...form, targetCount: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>İndirim oranı (%)
          <input required min="1" max="100" type="number" value={form.discountPercentage} onChange={(e) => setForm({ ...form, discountPercentage: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Minimum sepet (₺)
          <input min="0" type="number" value={form.minimumOrderAmount} onChange={(e) => setForm({ ...form, minimumOrderAmount: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Kupon geçerliliği (gün)
          <input required min="1" max="365" type="number" value={form.rewardValidityDays} onChange={(e) => setForm({ ...form, rewardValidityDays: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Katılım şartı
          <select value={form.orderRequirement} onChange={(e) => setForm({ ...form, orderRequirement: e.target.value })} className="ui-field" style={{ marginTop: 6 }}>
            <option value="delivered">En az 1 teslim edilmiş sipariş</option>
            <option value="any">En az 1 sipariş</option>
            <option value="none">Sipariş şartı yok</option>
          </select>
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Başlangıç
          <input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-label" style={{ marginBottom: 0 }}>Bitiş
          <input required type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="ui-field" style={{ marginTop: 6 }} />
        </label>
        <label className="ui-check" style={{ alignSelf: "end", minHeight: 38 }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Kaydedince yayına al
        </label>
        <button disabled={saving} className="ui-btn ui-btn--primary ui-span-all" style={{ minHeight: 38, justifySelf: "start" }}>
          <Save /> {saving ? "Kaydediliyor..." : form._id ? "Kampanyayı güncelle" : "Kampanyayı oluştur"}
        </button>
      </form>

      <div className="ui-card-body ui-stack ui-stack--sm" style={{ borderTop: "1px solid var(--ui-line)" }}>
        {campaigns.map((campaign) => {
          const progress = Math.min(100, Math.round((campaign.weightedCount / campaign.targetCount) * 100));
          const open = expandedId === campaign._id;
          return (
            <div key={campaign._id} className="order-detail-box" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
              <div className="ui-between" style={{ padding: 14 }}>
                <div className="ui-grow" style={{ flexBasis: 260 }}>
                  <div className="ui-cluster" style={{ gap: 8 }}>
                    <strong className="ui-list-title">{campaign.title}</strong>
                    <span className={`ui-badge ${campaign.rewardIssued ? "ui-badge--info" : campaign.isActive ? "ui-badge--ok" : ""}`}>{campaign.rewardIssued ? "Ödül dağıtıldı" : campaign.isActive ? "Aktif" : "Pasif"}</span>
                  </div>
                  <div className="ui-progress" style={{ marginTop: 8 }}><div style={{ width: `${progress}%` }} /></div>
                  <p className="ui-list-sub" style={{ marginTop: 6 }}>{campaign.requestCount} kişi · {campaign.weightedCount}/{campaign.targetCount} puan · %{campaign.discountPercentage} · {requirementLabels[campaign.orderRequirement]}</p>
                </div>
                <div className="ui-cluster" style={{ gap: 6 }}>
                  <button type="button" onClick={() => editCampaign(campaign)} className="ui-btn ui-btn--sm">Düzenle</button>
                  {campaign.isActive && (
                    <button type="button" onClick={() => deactivateCampaign(campaign)} className="ui-btn ui-btn--sm ui-btn--warn"><Power /> Pasife al</button>
                  )}
                  {!campaign.isActive && !campaign.rewardIssued && (
                    <button type="button" onClick={() => activateCampaign(campaign)} className="ui-btn ui-btn--sm ui-btn--primary"><Power /> Yayına al</button>
                  )}
                  <button type="button" onClick={() => setExpandedId(open ? null : campaign._id)} aria-expanded={open} className="ui-btn ui-btn--sm"><Users /> Katılımcılar {open ? <ChevronUp /> : <ChevronDown />}</button>
                  <button type="button" onClick={() => deleteCampaign(campaign)} className="ui-btn ui-btn--sm ui-btn--danger"><Trash2 /> Sil</button>
                </div>
              </div>
              {open && (
                <div className="ui-scroll-x" style={{ borderTop: "1px solid var(--ui-line)" }}>
                  <table className="ui-table" style={{ minWidth: 640 }}>
                    <thead><tr><th>Kullanıcı</th><th>Talep tarihi</th><th>Puan</th><th>Sipariş</th><th>Teslim</th></tr></thead>
                    <tbody>{campaign.requesters?.length ? campaign.requesters.map((item, index) => (
                      <tr key={item.user?._id || index}>
                        <td><div className="ui-strong">{item.user?.name || "Silinmiş kullanıcı"}</div><div className="ui-list-sub">{item.user?.email || "-"}</div></td>
                        <td>{new Date(item.requestedAt).toLocaleString("tr-TR")}</td><td className="ui-strong">{item.weight}</td><td>{item.totalOrders}</td><td>{item.deliveredOrders}</td>
                      </tr>
                    )) : <tr><td colSpan="5" className="ui-muted" style={{ textAlign: "center" }}>Henüz talep yok</td></tr>}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!campaigns.length && <div className="ui-empty" style={{ padding: "24px 12px" }}><Target />Henüz kampanya oluşturulmadı.</div>}
      </div>
    </section>
  );
};

export default CouponRequestCampaignPanel;
