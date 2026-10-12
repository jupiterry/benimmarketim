import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Zap, Percent, DollarSign, Check, RefreshCw, Search, Sparkles, Moon, CalendarDays,
  ShoppingBag, Smartphone, FileText, AlertTriangle, Info, Copy
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import {
  DAY_LABELS, DELIVERY_LABELS, CHANNEL_LABELS, DAY_MS, money, formatDate, describeRules
} from "./couponUtils";
import { RuleIcon } from "./RuleIcon";

const EMPTY_FORM = {
  code: "",
  description: "",
  discountType: "percentage",
  discountPercentage: 10,
  discountAmount: 0,
  minimumOrderAmount: 0,
  maximumDiscount: null,
  usageLimit: null,
  userUsageLimit: 1,
  expirationDate: "",
  newUsersOnly: false,
  firstOrderOnly: false,
  newUserDays: 30,
  applicableCategories: [],
  applicableProducts: [],
  validDays: [],
  startTime: "",
  endTime: "",
  deliveryPoints: [],
  channels: []
};

const dateIn = (days) => new Date(Date.now() + days * DAY_MS).toISOString().split("T")[0];

const randomSuffix = (length = 3) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < length; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
};

// Hazır başlangıç şablonları (yalnız form alanlarını doldurur)
const TEMPLATES = [
  {
    key: "welcome",
    icon: Sparkles,
    title: "Hoş geldin",
    hint: "İlk siparişe %20",
    apply: () => ({
      code: `HOSGELDIN${randomSuffix(2)}`,
      description: "Yeni üyelere ilk sipariş indirimi",
      discountType: "percentage",
      discountPercentage: 20,
      maximumDiscount: 75,
      firstOrderOnly: true,
      newUsersOnly: true,
      newUserDays: 30,
      userUsageLimit: 1,
      expirationDate: dateIn(30)
    })
  },
  {
    key: "weekend",
    icon: CalendarDays,
    title: "Hafta sonu",
    hint: "Cmt–Paz ₺50",
    apply: () => ({
      code: `HAFTASONU${randomSuffix(2)}`,
      description: "Hafta sonu siparişlerine özel indirim",
      discountType: "fixed",
      discountAmount: 50,
      minimumOrderAmount: 300,
      validDays: [6, 0],
      userUsageLimit: 2,
      expirationDate: dateIn(14)
    })
  },
  {
    key: "night",
    icon: Moon,
    title: "Gece",
    hint: "22:00–02:00 %15",
    apply: () => ({
      code: `GECE${randomSuffix(3)}`,
      description: "Gece siparişlerine indirim",
      discountType: "percentage",
      discountPercentage: 15,
      maximumDiscount: 60,
      startTime: "22:00",
      endTime: "02:00",
      userUsageLimit: 3,
      expirationDate: dateIn(30)
    })
  },
  {
    key: "basket",
    icon: ShoppingBag,
    title: "Sepeti büyüt",
    hint: "₺500 üzeri ₺75",
    apply: () => ({
      code: `SEPET${randomSuffix(3)}`,
      description: "Büyük sepetlere ek indirim",
      discountType: "fixed",
      discountAmount: 75,
      minimumOrderAmount: 500,
      userUsageLimit: 1,
      expirationDate: dateIn(21)
    })
  },
  {
    key: "app",
    icon: Smartphone,
    title: "Uygulamaya özel",
    hint: "Mobilde %10",
    apply: () => ({
      code: `MOBIL${randomSuffix(3)}`,
      description: "Mobil uygulamadan verilen siparişlere",
      discountType: "percentage",
      discountPercentage: 10,
      maximumDiscount: 50,
      channels: ["android", "ios"],
      userUsageLimit: 1,
      expirationDate: dateIn(30)
    })
  }
];

const fromCoupon = (coupon) => ({
  code: coupon.code || "",
  description: coupon.description || "",
  discountType: coupon.discountType || "percentage",
  discountPercentage: coupon.discountPercentage || 10,
  discountAmount: coupon.discountAmount || 0,
  minimumOrderAmount: coupon.minimumOrderAmount || 0,
  maximumDiscount: coupon.maximumDiscount || null,
  usageLimit: coupon.usageLimit || null,
  userUsageLimit: coupon.userUsageLimit || 1,
  expirationDate: coupon.expirationDate ? new Date(coupon.expirationDate).toISOString().split("T")[0] : "",
  newUsersOnly: coupon.newUsersOnly || false,
  firstOrderOnly: coupon.firstOrderOnly || false,
  newUserDays: coupon.newUserDays || 30,
  applicableCategories: coupon.applicableCategories || [],
  applicableProducts: (coupon.applicableProducts || []).map(String),
  validDays: coupon.validDays || [],
  startTime: coupon.startTime || "",
  endTime: coupon.endTime || "",
  deliveryPoints: coupon.deliveryPoints || [],
  channels: coupon.channels || []
});

const Section = ({ title, hint, children }) => (
  <section className="cpn-cmp-section">
    <header>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
    </header>
    <div className="cpn-cmp-section-body">{children}</div>
  </section>
);

/**
 * Kupon oluşturma / düzenleme çekmecesi.
 * mode: "create" | "edit" | "duplicate"; kaydetme yükü önceki formla aynıdır.
 */
const CouponComposer = ({ mode, coupon, existingCodes, onClose, onSaved }) => {
  const isEdit = mode === "edit";
  const initial = useMemo(() => {
    if (coupon) {
      const base = fromCoupon(coupon);
      if (mode === "duplicate") {
        base.code = "";
        const exp = new Date(coupon.expirationDate).getTime();
        if (!Number.isFinite(exp) || exp < Date.now()) base.expirationDate = dateIn(30);
      }
      return base;
    }
    return { ...EMPTY_FORM, expirationDate: dateIn(30) };
  }, [coupon, mode]);

  const [formData, setFormData] = useState(initial);
  const [template, setTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const codeRef = useRef(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    axios.get("/products?limit=5000")
      .then(({ data }) => setProductOptions(data.products || []))
      .catch(() => setProductOptions([]))
      .finally(() => setProductsLoaded(true));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => codeRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const dirty = JSON.stringify(formData) !== JSON.stringify(initial);

  const requestClose = async () => {
    if (dirty && !saving) {
      const ok = await confirm({
        title: "Değişiklikler kaydedilmedi",
        message: "Formdan çıkarsanız yaptığınız değişiklikler kaybolur.",
        confirmText: "Çık",
        cancelText: "Forma dön",
        type: "warning"
      });
      if (!ok) return;
    }
    onClose();
  };

  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const set = (patch) => setFormData((prev) => ({ ...prev, ...patch }));

  const toggleArrayValue = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((item) => item !== value)
        : [...prev[field], value]
    }));
  };

  const applyTemplate = (tpl) => {
    setTemplate(tpl.key);
    setFormData({ ...EMPTY_FORM, expirationDate: dateIn(30), ...tpl.apply() });
  };

  const generateRandomCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    set({ code });
  };

  // Anlık denetimler
  const isPercent = formData.discountType === "percentage";
  const codeTaken =
    formData.code &&
    existingCodes.has(formData.code.trim().toUpperCase()) &&
    !(isEdit && coupon?.code === formData.code.trim().toUpperCase());
  const errors = {};
  if (codeTaken) errors.code = "Bu kod başka bir kuponda kullanılıyor.";
  if (isPercent && Number(formData.discountPercentage) > 100) errors.value = "Yüzde 100'den büyük olamaz.";
  if (Number.isNaN(isPercent ? formData.discountPercentage : formData.discountAmount)) errors.value = "Bir değer girin.";
  const warnings = [];
  if (formData.expirationDate && new Date(`${formData.expirationDate}T23:59:59`).getTime() < Date.now()) {
    warnings.push("Son kullanma tarihi geçmiş; kupon kaydedilse de kullanılamaz.");
  }
  if (Boolean(formData.startTime) !== Boolean(formData.endTime)) {
    warnings.push("Saat aralığı için başlangıç ve bitişin ikisini de girin.");
  }
  if (!isPercent && formData.minimumOrderAmount > 0 && formData.discountAmount >= formData.minimumOrderAmount) {
    warnings.push("Sabit indirim, minimum sipariş tutarına eşit veya büyük.");
  }
  const hasErrors = Object.keys(errors).length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (hasErrors) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        maximumDiscount: formData.maximumDiscount || null,
        usageLimit: formData.usageLimit || null
      };
      if (isEdit) {
        await axios.put(`/coupons/${coupon._id}`, payload);
        toast.success("Kupon güncellendi!");
      } else {
        await axios.post("/coupons", payload);
        toast.success("Kupon oluşturuldu!");
      }
      onSaved(payload.code);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const productNameById = useMemo(
    () => new Map(productOptions.map((p) => [String(p._id), p.name])),
    [productOptions]
  );

  const categoryOptions = useMemo(() => {
    const set = new Set(productOptions.map((p) => p.category).filter(Boolean));
    formData.applicableCategories.forEach((c) => set.add(c));
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [productOptions, formData.applicableCategories]);

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLocaleLowerCase("tr-TR");
    const list = q
      ? productOptions.filter((p) => `${p.name || ""} ${p.category || ""}`.toLocaleLowerCase("tr-TR").includes(q))
      : productOptions;
    return list.slice(0, 60);
  }, [productOptions, productQuery]);

  const previewValue = isPercent ? `%${formData.discountPercentage || 0}` : money(formData.discountAmount);
  const rules = describeRules({ ...formData, applicableProducts: formData.applicableProducts });
  const title = isEdit ? "Kuponu düzenle" : mode === "duplicate" ? "Kopyadan yeni kupon" : "Yeni kupon";

  return (
    <div className="ui-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <aside className="ui-drawer cpn-cmp" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ui-drawer-head">
          <div className="cpn-cmp-title">
            <h2>{title}</h2>
            <p>{isEdit ? `${coupon.code} · değişiklikler kaydedildiği anda geçerli olur` : "Boş bırakılan kapsam alanları her yerde geçerlidir"}</p>
          </div>
          <button type="button" onClick={requestClose} className="ui-icon-btn" aria-label="Kapat"><X /></button>
        </div>

        <form onSubmit={handleSubmit} className="ui-drawer-form">
          <div className="cpn-cmp-grid">
            <div className="cpn-cmp-form">
              {mode === "create" && (
                <div className="cpn-templates" role="group" aria-label="Hazır şablonlar">
                  <span className="ui-overline">Hızlı başlangıç</span>
                  <div className="cpn-templates-row">
                    {TEMPLATES.map((tpl) => {
                      const Icon = tpl.icon;
                      return (
                        <button key={tpl.key} type="button" className="cpn-template" aria-pressed={template === tpl.key} onClick={() => applyTemplate(tpl)}>
                          <Icon />
                          <strong>{tpl.title}</strong>
                          <small>{tpl.hint}</small>
                        </button>
                      );
                    })}
                    <button type="button" className="cpn-template" aria-pressed={template === null && !dirty} onClick={() => { setTemplate(null); setFormData(initial); }}>
                      <FileText />
                      <strong>Boş</strong>
                      <small>Sıfırdan</small>
                    </button>
                  </div>
                </div>
              )}

              <Section title="Kod ve açıklama">
                <div>
                  <label className="ui-label" htmlFor="cpn-code">Kupon kodu</label>
                  <div className="cpn-code-row">
                    <input
                      id="cpn-code"
                      ref={codeRef}
                      type="text"
                      value={formData.code}
                      onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                      className="ui-field ui-mono"
                      aria-invalid={Boolean(errors.code)}
                      required
                      placeholder="INDIRIM20"
                      maxLength={32}
                    />
                    <button type="button" onClick={generateRandomCode} className="ui-btn" title="Rastgele kod üret">
                      <Zap />Üret
                    </button>
                  </div>
                  {errors.code && <p className="cpn-error">{errors.code}</p>}
                </div>
                <div>
                  <label className="ui-label" htmlFor="cpn-desc">Açıklama <span className="cpn-optional">müşteri görür</span></label>
                  <input id="cpn-desc" type="text" value={formData.description} onChange={(e) => set({ description: e.target.value })}
                    className="ui-field" placeholder="Yaz indirimi kuponu" maxLength={120} />
                </div>
              </Section>

              <Section title="İndirim">
                <div className="cpn-type-cards" role="radiogroup" aria-label="İndirim türü">
                  <button type="button" role="radio" aria-checked={isPercent} className="cpn-type-card" onClick={() => set({ discountType: "percentage" })}>
                    <Percent />
                    <span><strong>Yüzde</strong><small>Sepet tutarının belli bir oranı</small></span>
                  </button>
                  <button type="button" role="radio" aria-checked={!isPercent} className="cpn-type-card" onClick={() => set({ discountType: "fixed" })}>
                    <DollarSign />
                    <span><strong>Sabit tutar</strong><small>Sepetten belli bir tutar düşer</small></span>
                  </button>
                </div>
                <div className="cpn-cmp-cols">
                  <div>
                    <label className="ui-label" htmlFor="cpn-value">{isPercent ? "İndirim yüzdesi" : "İndirim tutarı"}</label>
                    <div className="cpn-affix">
                      <span>{isPercent ? "%" : "₺"}</span>
                      <input id="cpn-value" type="number"
                        value={isPercent ? formData.discountPercentage : formData.discountAmount}
                        onChange={(e) => set({ [isPercent ? "discountPercentage" : "discountAmount"]: parseFloat(e.target.value) })}
                        className="ui-field" min="0" max={isPercent ? 100 : undefined} step="any" required
                        aria-invalid={Boolean(errors.value)} />
                    </div>
                    {errors.value && <p className="cpn-error">{errors.value}</p>}
                  </div>
                  {isPercent && (
                    <div>
                      <label className="ui-label" htmlFor="cpn-max">En fazla indirim</label>
                      <div className="cpn-affix">
                        <span>₺</span>
                        <input id="cpn-max" type="number" value={formData.maximumDiscount || ""}
                          onChange={(e) => set({ maximumDiscount: e.target.value ? parseFloat(e.target.value) : null })}
                          className="ui-field" placeholder="Sınırsız" min="0" step="any" />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="ui-label" htmlFor="cpn-min">Minimum sipariş</label>
                    <div className="cpn-affix">
                      <span>₺</span>
                      <input id="cpn-min" type="number" value={formData.minimumOrderAmount}
                        onChange={(e) => set({ minimumOrderAmount: parseFloat(e.target.value) })}
                        className="ui-field" min="0" step="any" />
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Süre ve limitler">
                <div className="cpn-cmp-cols">
                  <div>
                    <label className="ui-label" htmlFor="cpn-exp">Son kullanma tarihi</label>
                    <input id="cpn-exp" type="date" value={formData.expirationDate}
                      onChange={(e) => set({ expirationDate: e.target.value })} className="ui-field" required />
                    <div className="cpn-quick">
                      {[7, 14, 30, 90].map((d) => (
                        <button key={d} type="button" onClick={() => set({ expirationDate: dateIn(d) })}
                          aria-pressed={formData.expirationDate === dateIn(d)}>{d} gün</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="cpn-limit">Toplam kullanım limiti</label>
                    <input id="cpn-limit" type="number" value={formData.usageLimit || ""}
                      onChange={(e) => set({ usageLimit: e.target.value ? parseInt(e.target.value) : null })}
                      className="ui-field" placeholder="Sınırsız" min="1" />
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="cpn-user-limit">Kişi başı limit</label>
                    <input id="cpn-user-limit" type="number" min="1" value={formData.userUsageLimit}
                      onChange={(e) => set({ userUsageLimit: Number(e.target.value) || 1 })} className="ui-field" />
                  </div>
                </div>
              </Section>

              <Section title="Kimler kullanabilir?">
                <div className="cpn-switch-list">
                  <button type="button" className="cpn-switch-row" aria-pressed={formData.firstOrderOnly}
                    onClick={() => set({ firstOrderOnly: !formData.firstOrderOnly })}>
                    <span><strong>Yalnız ilk sipariş</strong><small>Daha önce sipariş vermiş müşteriler kullanamaz</small></span>
                    <span className="ui-toggle" aria-hidden="true"><i /></span>
                  </button>
                  <button type="button" className="cpn-switch-row" aria-pressed={formData.newUsersOnly}
                    onClick={() => set({ newUsersOnly: !formData.newUsersOnly })}>
                    <span><strong>Yalnız yeni üyeler</strong><small>Belirli gün içinde kayıt olanlar</small></span>
                    <span className="ui-toggle" aria-hidden="true"><i /></span>
                  </button>
                  {formData.newUsersOnly && (
                    <div className="cpn-switch-extra">
                      <label className="ui-label" htmlFor="cpn-new-days">Üyelik süresi (gün)</label>
                      <input id="cpn-new-days" type="number" min="1" value={formData.newUserDays}
                        onChange={(e) => set({ newUserDays: Number(e.target.value) || 30 })} className="ui-field" />
                    </div>
                  )}
                </div>
                <div className="cpn-cmp-cols">
                  <div>
                    <span className="ui-label">Kanallar</span>
                    <div className="ui-chips cpn-wrap">
                      {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                        <button key={value} type="button" aria-pressed={formData.channels.includes(value)}
                          onClick={() => toggleArrayValue("channels", value)}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="ui-label">Teslimat noktaları</span>
                    <div className="ui-chips cpn-wrap">
                      {Object.entries(DELIVERY_LABELS).map(([value, label]) => (
                        <button key={value} type="button" aria-pressed={formData.deliveryPoints.includes(value)}
                          onClick={() => toggleArrayValue("deliveryPoints", value)}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Ne zaman geçerli?" hint="Gün seçilmezse her gün, saat girilmezse gün boyu geçerlidir.">
                <div className="ui-chips cpn-wrap" role="group" aria-label="Geçerli günler">
                  {DAY_LABELS.map(([label, day]) => (
                    <button key={day} type="button" onClick={() => toggleArrayValue("validDays", day)}
                      aria-pressed={formData.validDays.includes(day)}>{label}</button>
                  ))}
                </div>
                <div className="cpn-cmp-cols">
                  <div>
                    <label className="ui-label" htmlFor="cpn-start">Başlangıç saati</label>
                    <input id="cpn-start" type="time" value={formData.startTime} onChange={(e) => set({ startTime: e.target.value })} className="ui-field" />
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="cpn-end">Bitiş saati</label>
                    <input id="cpn-end" type="time" value={formData.endTime} onChange={(e) => set({ endTime: e.target.value })} className="ui-field" />
                  </div>
                </div>
              </Section>

              <Section title="Hangi ürünlerde?" hint="Kategori veya ürün seçilmezse tüm sepette geçerlidir.">
                <div>
                  <span className="ui-label">Kategoriler</span>
                  {categoryOptions.length ? (
                    <div className="ui-chips cpn-wrap cpn-cats">
                      {categoryOptions.map((cat) => (
                        <button key={cat} type="button" aria-pressed={formData.applicableCategories.includes(cat)}
                          onClick={() => toggleArrayValue("applicableCategories", cat)}>{cat}</button>
                      ))}
                    </div>
                  ) : (
                    <p className="ui-hint">{productsLoaded ? "Kategori bulunamadı." : "Kategoriler yükleniyor..."}</p>
                  )}
                </div>
                <div>
                  <span className="ui-label">
                    Ürünler {formData.applicableProducts.length > 0 && <span className="cpn-optional">{formData.applicableProducts.length} seçili</span>}
                  </span>
                  {formData.applicableProducts.length > 0 && (
                    <div className="cpn-selected">
                      {formData.applicableProducts.map((id) => (
                        <span key={id} className="ui-badge ui-badge--brand">
                          {productNameById.get(id) || `#${id.slice(-6)}`}
                          <button type="button" onClick={() => toggleArrayValue("applicableProducts", id)} aria-label="Ürünü kaldır"><X /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="cpn-picker">
                    <div className="ui-search">
                      <Search />
                      <input type="search" value={productQuery} onChange={(e) => setProductQuery(e.target.value)}
                        placeholder="Ürün veya kategori ara..." aria-label="Ürün ara" className="ui-field" />
                    </div>
                    <div className="cpn-picker-list" role="group" aria-label="Ürünler">
                      {visibleProducts.length === 0 ? (
                        <p className="ui-hint">{productsLoaded ? "Eşleşen ürün yok." : "Ürünler yükleniyor..."}</p>
                      ) : visibleProducts.map((product) => (
                        <label key={product._id} className="ui-check cpn-picker-item">
                          <input type="checkbox" checked={formData.applicableProducts.includes(String(product._id))}
                            onChange={() => toggleArrayValue("applicableProducts", String(product._id))} />
                          <span className="ui-truncate">{product.name}</span>
                          <small>{product.category}</small>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            {/* Canlı önizleme */}
            <aside className="cpn-cmp-preview" aria-label="Önizleme">
              <div className="cpn-cmp-preview-inner">
                <span className="ui-overline">Müşteri böyle görecek</span>
                <div className="cpn-phone-ticket">
                  <div className="cpn-phone-ticket-left">
                    <strong>{previewValue}</strong>
                    <span>{isPercent ? "indirim" : "indirim"}</span>
                  </div>
                  <div className="cpn-phone-ticket-right">
                    <span className="cpn-phone-ticket-desc">{formData.description || "Kupon açıklaması"}</span>
                    <span className="cpn-phone-ticket-code"><Copy />{formData.code || "KUPONKODU"}</span>
                    <span className="cpn-phone-ticket-meta">
                      {formData.minimumOrderAmount > 0 ? `${money(formData.minimumOrderAmount)} üzeri · ` : ""}
                      Son gün {formData.expirationDate ? formatDate(`${formData.expirationDate}T12:00:00`) : "-"}
                    </span>
                  </div>
                </div>

                <span className="ui-overline">Kural özeti</span>
                <ul className="cpn-rules">
                  {rules.map((r) => (
                    <li key={r.key}><RuleIcon name={r.icon} />{r.text}</li>
                  ))}
                </ul>

                {(warnings.length > 0 || hasErrors) && (
                  <div className="cpn-checks">
                    {Object.values(errors).map((msg) => (
                      <p key={msg} data-tone="danger"><AlertTriangle />{msg}</p>
                    ))}
                    {warnings.map((msg) => (
                      <p key={msg} data-tone="warn"><Info />{msg}</p>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="ui-drawer-foot cpn-cmp-foot">
            <span className="cpn-cmp-foot-note">{dirty ? "Kaydedilmemiş değişiklikler var" : isEdit ? "Değişiklik yok" : ""}</span>
            <button type="button" onClick={requestClose} className="ui-btn">İptal</button>
            <button type="submit" disabled={saving || hasErrors} className="ui-btn ui-btn--primary">
              {saving ? <RefreshCw className="ui-spin" /> : <Check />}
              {isEdit ? "Değişiklikleri kaydet" : "Kuponu oluştur"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
};

export default CouponComposer;
