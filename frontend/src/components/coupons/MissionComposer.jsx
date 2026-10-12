import { useMemo, useState } from "react";
import { AlertTriangle, Info, CalendarDays, Repeat, ShoppingBag, FileText, Gift, Check, Minus, Plus } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import FormDrawer, { Section } from "./FormDrawer";
import { DAY_MS, money, toLocalInput, formatShortDateTime, formatDuration } from "./couponUtils";
import { RuleIcon } from "./RuleIcon";

const freshMissionForm = () => ({
  id: null,
  title: "",
  description: "",
  targetOrders: 3,
  minOrderAmount: 300,
  rewardAmount: 50,
  rewardMinimumOrderAmount: 0,
  rewardValidityDays: 14,
  startsAt: toLocalInput(new Date()),
  endsAt: toLocalInput(new Date(Date.now() + 30 * DAY_MS)),
  isActive: true
});

const missionFormFrom = (mission) => ({
  id: mission._id || null,
  title: mission.title,
  description: mission.description || "",
  targetOrders: mission.targetOrders,
  minOrderAmount: mission.minOrderAmount || 0,
  rewardAmount: mission.rewardAmount,
  rewardMinimumOrderAmount: mission.rewardMinimumOrderAmount || 0,
  rewardValidityDays: mission.rewardValidityDays || 14,
  startsAt: toLocalInput(mission.startsAt),
  endsAt: toLocalInput(mission.endsAt),
  isActive: mission.isActive
});

const endOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59);
};

const TEMPLATES = [
  {
    key: "weekly", icon: Repeat, title: "Haftalık sadakat", hint: "7 günde 2 sipariş → ₺25",
    apply: () => ({ title: "Haftanın görevi", description: "Bu hafta 2 sipariş ver, ₺25 kupon kazan", targetOrders: 2, minOrderAmount: 150, rewardAmount: 25, rewardValidityDays: 7, startsAt: toLocalInput(Date.now()), endsAt: toLocalInput(Date.now() + 7 * DAY_MS) })
  },
  {
    key: "monthly", icon: CalendarDays, title: "Aylık görev", hint: "Ay sonuna kadar 5 sipariş → ₺75",
    apply: () => ({ title: `${new Date().toLocaleDateString("tr-TR", { month: "long" })} görevi`, description: "Bu ay 5 sipariş ver, ₺75 kupon kazan", targetOrders: 5, minOrderAmount: 200, rewardAmount: 75, rewardValidityDays: 14, startsAt: toLocalInput(Date.now()), endsAt: toLocalInput(endOfMonth()) })
  },
  {
    key: "big", icon: ShoppingBag, title: "Büyük sepet", hint: "2 × ₺500 sipariş → ₺60",
    apply: () => ({ title: "Büyük sepet görevi", description: "₺500 üzeri 2 sipariş ver, ₺60 kupon kazan", targetOrders: 2, minOrderAmount: 500, rewardAmount: 60, rewardMinimumOrderAmount: 300, rewardValidityDays: 14, startsAt: toLocalInput(Date.now()), endsAt: toLocalInput(Date.now() + 30 * DAY_MS) })
  }
];

/**
 * Sipariş görevi formu. Gönderilen alanlar önceki formla aynıdır
 * (POST /missions/admin, id varsa günceller).
 */
const MissionComposer = ({ mission, onClose, onSaved }) => {
  const isEdit = Boolean(mission?._id);
  const initial = useMemo(() => (mission ? missionFormFrom(mission) : freshMissionForm()), [mission]);
  const [form, setForm] = useState(initial);
  const [template, setTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const target = Number(form.targetOrders);
  const minOrder = Number(form.minOrderAmount || 0);
  const reward = Number(form.rewardAmount);
  const rewardMin = Number(form.rewardMinimumOrderAmount || 0);
  const startMs = new Date(form.startsAt).getTime();
  const endMs = new Date(form.endsAt).getTime();

  // Arka uçtaki doğrulamayla aynı kurallar
  const errors = [];
  if (form.title.trim().length < 3) errors.push("Görev adı en az 3 karakter olmalı.");
  if (!Number.isInteger(target) || target < 1 || target > 50) errors.push("Sipariş sayısı 1–50 arasında tam sayı olmalı.");
  if (!(reward >= 1 && reward <= 10000)) errors.push("Ödül 1–10.000 ₺ arasında olmalı.");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) errors.push("Başlangıç ve bitiş tarihi girin.");
  else if (endMs <= startMs) errors.push("Bitiş tarihi başlangıçtan sonra olmalı.");

  const warnings = [];
  if (Number.isFinite(endMs) && endMs <= Date.now() && form.isActive) warnings.push("Bitiş tarihi geçmiş; görev yayında görünse de müşteriler göremez.");
  if (Number.isFinite(startMs) && startMs > Date.now() && form.isActive) warnings.push(`Görev ${formatShortDateTime(form.startsAt)} tarihinde başlar.`);
  if (rewardMin > 0 && reward >= rewardMin) warnings.push("Kupon tutarı, kuponun minimum sepet tutarına eşit veya büyük.");
  if (minOrder > 0 && target > 0 && reward > minOrder * target * 0.3) warnings.push("Ödül, istenen toplam sipariş tutarının %30'undan fazla.");

  const applyTemplate = (tpl) => {
    setTemplate(tpl.key);
    setForm({ ...freshMissionForm(), ...tpl.apply() });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (errors.length) return;
    setSaving(true);
    try {
      const { data } = await axios.post("/missions/admin", {
        ...form,
        targetOrders: Number(form.targetOrders),
        minOrderAmount: Number(form.minOrderAmount || 0),
        rewardAmount: Number(form.rewardAmount),
        rewardMinimumOrderAmount: Number(form.rewardMinimumOrderAmount || 0),
        rewardValidityDays: Number(form.rewardValidityDays),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString()
      });
      toast.success(data.mission?.isActive ? "Görev yayında" : "Görev kaydedildi");
      onSaved(data.mission);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Görev kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const stepTarget = (delta) => set({ targetOrders: Math.min(50, Math.max(1, (Number(form.targetOrders) || 0) + delta)) });
  const setDuration = (days) => {
    const base = Number.isFinite(startMs) ? startMs : Date.now();
    set({ endsAt: toLocalInput(base + days * DAY_MS) });
  };
  const durationText = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? formatDuration(endMs - startMs) : "-";
  const dots = Math.min(Math.max(target || 0, 1), 10);

  const rules = [
    { key: "orders", icon: "bag", text: `${target || "?"} teslim edilmiş sipariş${minOrder > 0 ? `, her biri en az ${money(minOrder)}` : ""}` },
    { key: "reward", icon: "gift", text: `Tamamlayan müşteriye ${money(reward)} kupon otomatik tanımlanır` },
    { key: "min", icon: "cart", text: rewardMin > 0 ? `Kupon ${money(rewardMin)} ve üzeri sepette geçerli` : "Kuponda alt sepet tutarı yok" },
    { key: "valid", icon: "calendar", text: `Kupon ${form.rewardValidityDays || "?"} gün geçerli; her müşteri görevi bir kez tamamlar` },
    { key: "time", icon: "clock", text: `${formatShortDateTime(form.startsAt)} – ${formatShortDateTime(form.endsAt)} (${durationText})` }
  ];

  const preview = (
    <>
      <span className="ui-overline">Müşteri böyle görecek</span>
      <div className="msn-preview-card">
        <div className="msn-preview-head">
          <strong>{form.title || "Görev adı"}</strong>
          <span className="msn-preview-reward"><Gift />{money(reward)}</span>
        </div>
        <span className="msn-preview-desc">{form.description || `${target || "?"} sipariş ver, ${money(reward)} kupon kazan`}</span>
        <div className="msn-dots" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => <i key={i} data-done={i === 0}>{i === 0 ? <Check /> : i + 1}</i>)}
          {target > 10 && <span>+{target - 10}</span>}
        </div>
        <span className="msn-preview-meta">1 / {target || "?"} sipariş · bitişe {durationText}</span>
      </div>
      <span className="ui-overline">Kural özeti</span>
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
      title={isEdit ? "Görevi düzenle" : mission ? "Kopyadan yeni görev" : "Yeni sipariş görevi"}
      subtitle={isEdit ? `${mission.completionCount || 0} kişi tamamladı · kurallar değişirse yalnız yeni tamamlamalar etkilenir` : "Belirlenen sayıda sipariş veren müşteriye kupon otomatik tanımlanır"}
      dirty={dirty}
      saving={saving}
      submitDisabled={errors.length > 0}
      submitLabel={isEdit ? "Değişiklikleri kaydet" : form.isActive ? "Oluştur ve yayına al" : "Taslak olarak kaydet"}
      onSubmit={submit}
      onClose={onClose}
      preview={preview}
    >
      {!mission && (
        <div className="cpn-templates" role="group" aria-label="Hazır şablonlar">
          <span className="ui-overline">Hızlı başlangıç</span>
          <div className="cpn-templates-row">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button key={tpl.key} type="button" className="cpn-template" aria-pressed={template === tpl.key} onClick={() => applyTemplate(tpl)}>
                  <Icon /><strong>{tpl.title}</strong><small>{tpl.hint}</small>
                </button>
              );
            })}
            <button type="button" className="cpn-template" aria-pressed={template === null && !dirty} onClick={() => { setTemplate(null); setForm(initial); }}>
              <FileText /><strong>Boş</strong><small>Sıfırdan</small>
            </button>
          </div>
        </div>
      )}

      <Section title="Görev" hint="Başlık ve açıklama müşterilere gösterilir.">
        <div>
          <label className="ui-label" htmlFor="msn-title">Görev adı <span className="cpn-optional">{form.title.length}/60</span></label>
          <input id="msn-title" required minLength={3} maxLength={60} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ekim görevi" className="ui-field" />
        </div>
        <div>
          <label className="ui-label" htmlFor="msn-desc">Açıklama <span className="cpn-optional">{form.description.length}/160</span></label>
          <input id="msn-desc" maxLength={160} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Bu ay 3 sipariş ver, kuponu kap" className="ui-field" />
        </div>
      </Section>

      <Section title="Kural" hint="Yalnız teslim edilmiş siparişler sayılır.">
        <div className="cpn-cmp-cols">
          <div>
            <label className="ui-label" htmlFor="msn-target">Sipariş sayısı</label>
            <div className="msn-stepper">
              <button type="button" onClick={() => stepTarget(-1)} aria-label="Azalt"><Minus /></button>
              <input id="msn-target" required min="1" max="50" step="1" type="number" value={form.targetOrders} onChange={(e) => set({ targetOrders: e.target.value })} className="ui-field" />
              <button type="button" onClick={() => stepTarget(1)} aria-label="Artır"><Plus /></button>
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="msn-min">Sipariş başına en az</label>
            <div className="cpn-affix">
              <span>₺</span>
              <input id="msn-min" min="0" type="number" value={form.minOrderAmount} onChange={(e) => set({ minOrderAmount: e.target.value })} className="ui-field" />
            </div>
            <div className="cpn-quick">
              {[0, 150, 300, 500].map((n) => (
                <button key={n} type="button" aria-pressed={minOrder === n} onClick={() => set({ minOrderAmount: n })}>{n ? money(n) : "Yok"}</button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Ödül" hint="Görevi tamamlayan müşteriye tek kullanımlık sabit tutarlı kupon tanımlanır.">
        <div className="cpn-cmp-cols">
          <div>
            <label className="ui-label" htmlFor="msn-reward">Kupon tutarı</label>
            <div className="cpn-affix">
              <span>₺</span>
              <input id="msn-reward" required min="1" type="number" value={form.rewardAmount} onChange={(e) => set({ rewardAmount: e.target.value })} className="ui-field" />
            </div>
            <div className="cpn-quick">
              {[25, 50, 75, 100].map((n) => (
                <button key={n} type="button" aria-pressed={reward === n} onClick={() => set({ rewardAmount: n })}>{money(n)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="msn-rmin">Kupon için min. sepet</label>
            <div className="cpn-affix">
              <span>₺</span>
              <input id="msn-rmin" min="0" type="number" value={form.rewardMinimumOrderAmount} onChange={(e) => set({ rewardMinimumOrderAmount: e.target.value })} className="ui-field" />
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="msn-valid">Kupon geçerliliği (gün)</label>
            <input id="msn-valid" required min="1" max="365" step="1" type="number" value={form.rewardValidityDays} onChange={(e) => set({ rewardValidityDays: e.target.value })} className="ui-field" />
            <div className="cpn-quick">
              {[7, 14, 30].map((n) => (
                <button key={n} type="button" aria-pressed={Number(form.rewardValidityDays) === n} onClick={() => set({ rewardValidityDays: n })}>{n} gün</button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Zaman" hint="Siparişler bu aralıkta sayılır.">
        <div className="cpn-cmp-cols">
          <div>
            <label className="ui-label" htmlFor="msn-start">Başlangıç</label>
            <input id="msn-start" required type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className="ui-field" />
            <div className="cpn-quick">
              <button type="button" onClick={() => set({ startsAt: toLocalInput(Date.now()) })}>Şimdi</button>
            </div>
          </div>
          <div>
            <label className="ui-label" htmlFor="msn-end">Bitiş</label>
            <input id="msn-end" required type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className="ui-field" />
            <div className="cpn-quick">
              {[7, 14, 30].map((d) => <button key={d} type="button" onClick={() => setDuration(d)}>{d} gün</button>)}
              <button type="button" onClick={() => set({ endsAt: toLocalInput(endOfMonth()) })}>Ay sonu</button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Yayın">
        <div className="cpn-switch-list">
          <button type="button" className="cpn-switch-row" aria-pressed={form.isActive} onClick={() => set({ isActive: !form.isActive })}>
            <span>
              <strong>Kaydedince yayına al</strong>
              <small>Birden fazla görev aynı anda yayında olabilir</small>
            </span>
            <span className="ui-toggle" aria-hidden="true"><i /></span>
          </button>
        </div>
      </Section>
    </FormDrawer>
  );
};

export default MissionComposer;
