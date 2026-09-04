import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Gift, Save, Target, Users } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";

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
      const { data } = await axios.post("/coupon-requests/admin", form);
      toast.success(data.campaign?.isActive ? "Kampanya yayına alındı" : "Kampanya kaydedildi");
      setForm(freshForm());
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Kampanya kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-950/70 to-slate-950/70 overflow-hidden">
      <div className="p-5 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/15"><Gift className="w-6 h-6 text-emerald-300" /></div>
          <div>
            <h3 className="text-lg font-bold text-white">Kupon İstek Kampanyası</h3>
            <p className="text-sm text-slate-400">Şartı, hedefi ve ödülü belirle; hedef dolunca kişisel kuponlar otomatik dağıtılsın.</p>
          </div>
        </div>
        {activeCampaign && (
          <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-sm font-semibold">
            Aktif: {activeCampaign.weightedCount}/{activeCampaign.targetCount} puan
          </div>
        )}
      </div>

      <form id="coupon-request-form" onSubmit={save} className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <label className="xl:col-span-2 text-sm text-slate-300">Kampanya adı
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="xl:col-span-2 text-sm text-slate-300">Kullanıcıya gösterilecek açıklama
          <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-slate-300">Hedef puan
          <input required min="1" type="number" value={form.targetCount} onChange={(e) => setForm({ ...form, targetCount: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-slate-300">İndirim oranı (%)
          <input required min="1" max="100" type="number" value={form.discountPercentage} onChange={(e) => setForm({ ...form, discountPercentage: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-slate-300">Minimum sepet (₺)
          <input min="0" type="number" value={form.minimumOrderAmount} onChange={(e) => setForm({ ...form, minimumOrderAmount: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-slate-300">Kupon geçerliliği (gün)
          <input required min="1" max="365" type="number" value={form.rewardValidityDays} onChange={(e) => setForm({ ...form, rewardValidityDays: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-slate-300">Katılım şartı
          <select value={form.orderRequirement} onChange={(e) => setForm({ ...form, orderRequirement: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white">
            <option value="delivered">En az 1 teslim edilmiş sipariş</option>
            <option value="any">En az 1 sipariş</option>
            <option value="none">Sipariş şartı yok</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">Başlangıç
          <input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-slate-300">Bitiş
          <input required type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="mt-2 w-full rounded-xl bg-slate-900/80 border border-white/10 px-4 py-3 text-white" />
        </label>
        <label className="flex items-center gap-3 rounded-xl bg-slate-900/60 border border-white/10 px-4 py-3 text-sm text-white cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-emerald-500 w-4 h-4" />
          Kaydedince yayına al
        </label>
        <button disabled={saving} className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-3 flex items-center justify-center gap-2">
          <Save className="w-4 h-4" /> {saving ? "Kaydediliyor..." : form._id ? "Kampanyayı güncelle" : "Kampanyayı oluştur"}
        </button>
      </form>

      <div className="px-5 pb-5 space-y-3">
        {campaigns.map((campaign) => {
          const progress = Math.min(100, Math.round((campaign.weightedCount / campaign.targetCount) * 100));
          const open = expandedId === campaign._id;
          return (
            <div key={campaign._id} className="rounded-xl bg-slate-900/70 border border-white/10 overflow-hidden">
              <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-white">{campaign.title}</strong>
                    <span className={`text-xs px-2 py-1 rounded-full ${campaign.rewardIssued ? "bg-violet-500/15 text-violet-300" : campaign.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>{campaign.rewardIssued ? "Ödül dağıtıldı" : campaign.isActive ? "Aktif" : "Pasif"}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${progress}%` }} /></div>
                  <p className="mt-2 text-xs text-slate-400">{campaign.requestCount} kişi · {campaign.weightedCount}/{campaign.targetCount} puan · %{campaign.discountPercentage} · {requirementLabels[campaign.orderRequirement]}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => editCampaign(campaign)} className="px-3 py-2 rounded-lg bg-blue-500/10 text-blue-300 text-sm">Düzenle</button>
                  <button type="button" onClick={() => setExpandedId(open ? null : campaign._id)} className="px-3 py-2 rounded-lg bg-white/5 text-slate-300 text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Katılımcılar {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
                </div>
              </div>
              {open && (
                <div className="border-t border-white/10 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-slate-500"><tr><th className="p-3 text-left">Kullanıcı</th><th className="p-3 text-left">Talep tarihi</th><th className="p-3">Puan</th><th className="p-3">Sipariş</th><th className="p-3">Teslim</th></tr></thead>
                    <tbody>{campaign.requesters?.length ? campaign.requesters.map((item, index) => (
                      <tr key={item.user?._id || index} className="border-t border-white/5 text-slate-300">
                        <td className="p-3"><div className="font-semibold text-white">{item.user?.name || "Silinmiş kullanıcı"}</div><div className="text-xs text-slate-500">{item.user?.email || "-"}</div></td>
                        <td className="p-3">{new Date(item.requestedAt).toLocaleString("tr-TR")}</td><td className="p-3 text-center font-bold text-emerald-300">{item.weight}</td><td className="p-3 text-center">{item.totalOrders}</td><td className="p-3 text-center">{item.deliveredOrders}</td>
                      </tr>
                    )) : <tr><td colSpan="5" className="p-6 text-center text-slate-500">Henüz talep yok</td></tr>}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!campaigns.length && <div className="py-8 text-center text-slate-500"><Target className="w-8 h-8 mx-auto mb-2" />Henüz kampanya oluşturulmadı.</div>}
      </div>
    </section>
  );
};

export default CouponRequestCampaignPanel;
