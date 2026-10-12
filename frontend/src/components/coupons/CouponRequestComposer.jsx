import { useMemo, useState } from "react";
import { AlertTriangle, Info, Users, PackageCheck, ShoppingBag, UserCheck, Gift } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import FormDrawer, { Section } from "./FormDrawer";
import { DAY_MS, money, toLocalInput, formatShortDateTime, formatDuration } from "./couponUtils";
import { RuleIcon } from "./RuleIcon";

const REQUIREMENTS = [
  { value: "delivered", icon: PackageCheck, title: "Teslim edilmiş sipariş", hint: "En az 1 siparişi teslim edilmiş müşteriler" },
  { value: "any", icon: ShoppingBag, title: "Herhangi bir sipariş", hint: "En az 1 sipariş vermiş müşteriler" },
  { value: "none", icon: UserCheck, title: "Şart yok", hint: "Giriş yapan herkes katılabilir" }
];

const REQUIREMENT_TEXT = {
  delivered: "En az 1 teslim edilmiş siparişi olanlar katılabilir",
  any: "En az 1 siparişi olanlar katılabilir",
  none: "Giriş yapan herkes katılabilir"
};

const freshRequestForm = () => {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * DAY_MS);
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
    isActive: true
  };
};

const requestFormFrom = (campaign) => ({
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
  isActive: campaign.isActive
});

/**
 * Kupon isteği kampanyası formu. Gönderilen alanlar önceki formla aynıdır
 * (POST /coupon-requests/admin, _id varsa günceller).
 */
const CouponRequestComposer = ({ campaign, otherLive, onClose, onSaved }) => {
  const isEdit = Boolean(campaign?._id);
  const initial = useMemo(() => (campaign ? requestFormFrom(campaign) : freshRequestForm()), [campaign]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const startMs = new Date(form.startsAt).getTime();
  const endMs = new Date(form.endsAt).getTime();
  const errors = [];
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) errors.push("Başlangıç ve bitiş tarihi girin.");
  else if (endMs <= startMs) errors.push("Bitiş tarihi başlangıçtan sonra olmalı.");
  else if (form.isActive && endMs <= Date.now()) errors.push("Bitiş tarihi geçmiş bir kampanya yayına alınamaz.");
  if (campaign?.rewardIssued && form.isActive) errors.push("Ödülü dağıtılmış kampanya yeniden yayına alınamaz; yeni kampanya oluşturun.");
  const pct = Number(form.discountPercentage);
  if (!(pct >= 1 && pct <= 100)) errors.push("İndirim oranı 1–100 arasında olmalı.");
  if (!(Number(form.targetCount) >= 1)) errors.push("Hedef en az 1 puan olmalı.");

  const warnings = [];
  if (form.isActive && otherLive && otherLive._id !== campaign?._id) {
    warnings.push(`Yayındaki "${otherLive.title}" kampanyası otomatik olarak pasife alınacak.`);
  }
  if (form.isActive && Number.isFinite(startMs) && startMs > Date.now()) {
    warnings.push(`Kampanya ${formatShortDateTime(form.startsAt)} tarihinde müşterilere görünmeye başlar.`);
  }

  const setDuration = (days) => {
    const base = Number.isFinite(startMs) ? startMs : Date.now();
    set({ endsAt: toLocalInput(base + days * DAY_MS) });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (errors.length) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString()
      };
      const { data } = await axios.post("/coupon-requests/admin", payload);
      toast.success(data.campaign?.isActive ? "Kampanya yayına alındı" : "Kampanya kaydedildi");
      onSaved(data.campaign);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Kampanya kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const durationText = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? formatDuration(endMs - startMs) : "-";
  const rules = [
    { key: "goal", icon: "users", text: `Hedef ${form.targetCount || "?"} puan; davet ettiği arkadaşı olan kullanıcı 2 puan sayılır` },
    { key: "reward", icon: "gift", text: `Hedef dolunca katılan herkese %${form.discountPercentage || "?"} kişisel kupon` },
    { key: "min", icon: "cart", text: Number(form.minimumOrderAmount) > 0 ? `Kupon ${money(form.minimumOrderAmount)} ve üzeri sepette geçerli` : "Kuponda alt sepet tutarı yok" },
    { key: "valid", icon: "calendar", text: `Kupon ${form.rewardValidityDays || "?"} gün geçerli, tek kullanımlık` },
    { key: "req", icon: "sparkles", text: REQUIREMENT_TEXT[form.orderRequirement] },
    { key: "time", icon: "clock", text: `${formatShortDateTime(form.startsAt)} – ${formatShortDateTime(form.endsAt)} (${durationText})` }
  ];

  const preview = (
    <>
      <span className="ui-overline">Müşteri böyle görecek</span>
      <div className="cpg-preview-card">
        <div className="cpg-preview-top">
          <span className="cpg-preview-badge"><Gift />%{form.discountPercentage || 0} indirim</span>
          <strong>{form.title || "Kampanya adı"}</strong>
          <span>{form.description || "Açıklama"}</span>
        </div>
        <div className="cpg-preview-progress">
          <div className="cpg-preview-progress-bar"><i style={{ width: "8%" }} /></div>
          <span>0 / {form.targetCount || 0} puan · hedefe {form.targetCount || 0} puan kaldı</span>
        </div>
        <span className="cpg-preview-btn"><Users />Ben de istiyorum</span>
      </div>
      <span className="ui-overline">Nasıl işler?</span>
      <ul className="cpn-rules">{rules.map((r) => <li key={r.key}><RuleIcon name={r.icon} />{r.text}</li>)}</ul>
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="cpn-checks">
          {errors.map((m) => <p key={m} data-tone="danger"><AlertTriangle />{m}</p>)}
          {warnings.map((m) => <p key={m} data-tone="warn"><Info />{m}</p>)}
        </div>
      )}
    </>
  );

  return (
    <FormDrawer
      title={isEdit ? "Kampanyayı düzenle" : "Yeni kupon isteği kampanyası"}
      subtitle={isEdit ? `${campaign.requestCount || 0} katılımcı · değişiklikler kaydedildiği anda geçerli olur` : "Müşteriler talep bırakır, hedef dolunca herkese kişisel kupon tanımlanır"}
      dirty={dirty}
      saving={saving}
      submitDisabled={errors.length > 0}
      submitLabel={isEdit ? "Değişiklikleri kaydet" : form.isActive ? "Oluştur ve yayına al" : "Taslak olarak kaydet"}
      onSubmit={submit}
      onClose={onClose}
      preview={preview}
    >
      <Section title="Kampanya" hint="Başlık ve açıklama müşterilere gösterilir.">
        <div>
          <label className="ui-label" htmlFor="crq-title">Kampanya adı</label>
          <input id="crq-title" required value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} className="ui-field" />
        </div>
        <div>
          <label className="ui-label" htmlFor="crq-desc">Açıklama</label>
          <input id="crq-desc" required value={form.description} maxLength={160} onChange={(e) => set({ description: e.target.value })} className="ui-field" />
        </div>
      </Section>

      <Section title="Hedef ve ödül" hint="Her katılımcı 1 puan; daha önce arkadaş davet etmiş olanlar 2 puan sayılır.">
        <div className="cpn-cmp-cols">
          <div>
            <label className="ui-label" htmlFor="crq-target">Hedef puan</label>
            <input id="crq-target" required min="1" type="number" value={form.targetCount} onChange={(e) => set({ targetCount: e.target.value })} className="ui-field" />
            <div className="cpn-quick">
              {[10, 20, 30, 50, 100].map((n) => (
                <button key={n} type="button" aria-pressed={Number(form.targetCount) === n} onClick={() => set({ targetCount: n })}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="crq-pct">İndirim oranı</label>
            <div className="cpn-affix">
              <span>%</span>
              <input id="crq-pct" required min="1" max="100" type="number" value={form.discountPercentage} onChange={(e) => set({ discountPercentage: e.target.value })} className="ui-field" />
            </div>
            <div className="cpn-quick">
              {[5, 10, 15, 20].map((n) => (
                <button key={n} type="button" aria-pressed={Number(form.discountPercentage) === n} onClick={() => set({ discountPercentage: n })}>%{n}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="crq-min">Kupon için min. sepet</label>
            <div className="cpn-affix">
              <span>₺</span>
              <input id="crq-min" min="0" type="number" value={form.minimumOrderAmount} onChange={(e) => set({ minimumOrderAmount: e.target.value })} className="ui-field" />
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="crq-valid">Kupon geçerliliği (gün)</label>
            <input id="crq-valid" required min="1" max="365" type="number" value={form.rewardValidityDays} onChange={(e) => set({ rewardValidityDays: e.target.value })} className="ui-field" />
            <div className="cpn-quick">
              {[7, 14, 30].map((n) => (
                <button key={n} type="button" aria-pressed={Number(form.rewardValidityDays) === n} onClick={() => set({ rewardValidityDays: n })}>{n} gün</button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Kimler katılabilir?">
        <div className="cpn-type-cards cpg-req-cards" role="radiogroup" aria-label="Katılım şartı">
          {REQUIREMENTS.map((r) => {
            const Icon = r.icon;
            return (
              <button key={r.value} type="button" role="radio" aria-checked={form.orderRequirement === r.value}
                className="cpn-type-card" onClick={() => set({ orderRequirement: r.value })}>
                <Icon />
                <span><strong>{r.title}</strong><small>{r.hint}</small></span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Zaman" hint="Kampanya bu aralıkta müşterilere görünür.">
        <div className="cpn-cmp-cols">
          <div>
            <label className="ui-label" htmlFor="crq-start">Başlangıç</label>
            <input id="crq-start" required type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className="ui-field" />
            <div className="cpn-quick">
              <button type="button" onClick={() => set({ startsAt: toLocalInput(Date.now()) })}>Şimdi</button>
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="crq-end">Bitiş</label>
            <input id="crq-end" required type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className="ui-field" />
            <div className="cpn-quick">
              {[3, 7, 14, 30].map((d) => <button key={d} type="button" onClick={() => setDuration(d)}>{d} gün</button>)}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Yayın">
        <div className="cpn-switch-list">
          <button type="button" className="cpn-switch-row" aria-pressed={form.isActive} onClick={() => set({ isActive: !form.isActive })}>
            <span>
              <strong>Kaydedince yayına al</strong>
              <small>Aynı anda yalnız bir kampanya yayında olabilir</small>
            </span>
            <span className="ui-toggle" aria-hidden="true"><i /></span>
          </button>
        </div>
      </Section>
    </FormDrawer>
  );
};

export default CouponRequestComposer;
