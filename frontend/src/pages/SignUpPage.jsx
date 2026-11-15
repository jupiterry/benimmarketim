// Kayıt sayfası. Hesap web'den açılır, sipariş mobil uygulamadan verilir. Davet kodu ?ref= ile gelebilir.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Eye, EyeOff, Gift, Loader, Lock, Mail, Phone, User, X } from "lucide-react";
import AuthLayout, { AuthField } from "../components/AuthLayout";
import { PHONE_PATTERN, useUserStore } from "../stores/useUserStore";
import axios from "../lib/axios";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_ORDER = ["name", "phone", "email", "password", "confirmPassword"];

/** Alan kuralları (sunucudaki kurallarla aynı: ad ve soyad en az ikişer harf, telefon 05XXXXXXXXX, şifre en az 6) */
const validate = (form) => {
  const errors = {};
  const words = form.name.trim().split(/\s+/).filter(Boolean);
  if (!form.name.trim()) errors.name = "Adınızı ve soyadınızı yazın.";
  else if (words.length < 2 || words.some((word) => word.length < 2)) errors.name = "Adınızı ve soyadınızı birlikte yazın (örn. Ahmet Yılmaz).";
  if (!form.phone) errors.phone = "Telefon numaranızı yazın.";
  else if (!PHONE_PATTERN.test(form.phone)) errors.phone = "Telefon 05 ile başlayan 11 haneli numara olmalı.";
  if (!form.email.trim()) errors.email = "E-posta adresinizi yazın.";
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "E-posta adresi ornek@eposta.com biçiminde olmalı.";
  if (!form.password) errors.password = "Bir şifre belirleyin.";
  else if (form.password.length < 6) errors.password = "Şifre en az 6 karakter olmalı.";
  if (!form.confirmPassword) errors.confirmPassword = "Şifrenizi bir kez daha yazın.";
  else if (form.password !== form.confirmPassword) errors.confirmPassword = "Şifreler aynı değil.";
  return errors;
};

const SignUpPage = () => {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", confirmPassword: "" });
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralValid, setReferralValid] = useState(null);
  const [referralMessage, setReferralMessage] = useState("");
  const [checkingReferral, setCheckingReferral] = useState(false);

  const { signup, loading } = useUserStore();
  const referralTimerRef = useRef(null);
  const referralRequestRef = useRef(0);

  // Davet kodu kontrolü (yalnızca en son istek dikkate alınır)
  const checkReferralCode = useCallback(async (code) => {
    if (!code || code.length < 4) {
      setReferralValid(null);
      setReferralMessage("");
      return;
    }
    const requestId = ++referralRequestRef.current;
    setCheckingReferral(true);
    try {
      const response = await axios.get(`/referrals/check/${encodeURIComponent(code)}`);
      if (requestId !== referralRequestRef.current) return;
      if (response.data.success) {
        setReferralValid(true);
        setReferralMessage(response.data.message || `${response.data.referrerName} sizi davet etti.`);
      } else {
        setReferralValid(false);
        setReferralMessage(response.data.message || "Bu davet kodu geçerli değil.");
      }
    } catch (error) {
      if (requestId !== referralRequestRef.current) return;
      setReferralValid(false);
      // Sunucu nedenini söylüyorsa (ör. davet hakkı dolmuş) onu göster
      setReferralMessage(error.response?.status === 404 || !error.response?.data?.message
        ? "Bu davet kodu geçerli değil."
        : error.response.data.message);
    } finally {
      if (requestId === referralRequestRef.current) setCheckingReferral(false);
    }
  }, []);

  // Davet bağlantısından gelen kod (?ref=)
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      const code = refCode.toUpperCase().slice(0, 12);
      setReferralCode(code);
      checkReferralCode(code);
    }
  }, [searchParams, checkReferralCode]);

  useEffect(() => () => clearTimeout(referralTimerRef.current), []);

  const handleReferralCodeChange = (e) => {
    const code = e.target.value.toUpperCase().replace(/\s+/g, "");
    setReferralCode(code);
    setReferralValid(null);
    setReferralMessage("");
    referralRequestRef.current += 1; // süren kontrolün sonucu yok sayılır
    setCheckingReferral(false);
    // 400 ms gecikmeli kontrol: her tuşta istek atılmaz
    clearTimeout(referralTimerRef.current);
    if (code.length >= 6) referralTimerRef.current = setTimeout(() => checkReferralCode(code), 400);
  };

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const touch = (field) => setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  const errors = validate(form);
  // Hata, alan terk edildikten ya da form gönderilmeye çalışıldıktan sonra gösterilir
  const shown = (field) => ((submitted || touched[field]) ? errors[field] : undefined);
  const invalid = (field) => (shown(field) ? "true" : undefined);
  const describedBy = (field) => (shown(field) ? `signup-${field}-msg` : undefined);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    setSubmitted(true);
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (first) {
      document.getElementById(`signup-${first}`)?.focus();
      return;
    }
    signup({
      ...form,
      name: form.name.trim().replace(/\s+/g, " "),
      email: form.email.trim(),
      referralCode: referralValid ? referralCode : undefined,
    });
  };

  const passwordOk = form.password.length >= 6;
  const confirmOk = passwordOk && form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const referralPending = Boolean(referralCode) && referralValid === null;

  return (
    <AuthLayout
      eyebrow="Ücretsiz üyelik"
      title="Bir dakikada"
      accent="hesap açın"
      lead="Hesabınızı buradan oluşturun, siparişinizi mobil uygulamadan verin."
      points={[
        "Üyelik ücretsiz; ödeme kapıda, nakit ya da kartla",
        "Devrek’te teslimat: bölgeler ve ücretler sitede yazar",
        "Davet koduyla ilk siparişinize indirim",
      ]}
    >
      <div className="auth-card-head">
        <h2>Hesap oluşturun</h2>
        <p>Bilgileriniz yalnızca siparişleriniz için kullanılır.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField id="signup-name" label="Ad soyad" error={shown("name")}>
          <div className="auth-control">
            <User aria-hidden="true" />
            <input
              id="signup-name"
              className="auth-input"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              placeholder="Ahmet Yılmaz"
              maxLength={60}
              value={form.name}
              aria-invalid={invalid("name")}
              aria-describedby={describedBy("name")}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => touch("name")}
            />
          </div>
        </AuthField>

        <div className="auth-row">
          <AuthField id="signup-phone" label="Telefon" error={shown("phone")}>
            <div className="auth-control">
              <Phone aria-hidden="true" />
              <input
                id="signup-phone"
                className="auth-input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="05XXXXXXXXX"
                maxLength={11}
                value={form.phone}
                aria-invalid={invalid("phone")}
                aria-describedby={describedBy("phone")}
                onChange={(e) => set("phone", e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
                onBlur={() => touch("phone")}
              />
            </div>
          </AuthField>

          <AuthField id="signup-email" label="E-posta" error={shown("email")}>
            <div className="auth-control">
              <Mail aria-hidden="true" />
              <input
                id="signup-email"
                className="auth-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ornek@eposta.com"
                value={form.email}
                aria-invalid={invalid("email")}
                aria-describedby={describedBy("email")}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => touch("email")}
              />
            </div>
          </AuthField>
        </div>

        <div className="auth-row">
          <AuthField id="signup-password" label="Şifre" error={shown("password")} hint="En az 6 karakter" hintTone={passwordOk ? "ok" : undefined}>
            <div className="auth-control auth-control--toggle">
              <Lock aria-hidden="true" />
              <input
                id="signup-password"
                className="auth-input"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Şifreniz"
                value={form.password}
                data-ok={passwordOk ? "true" : undefined}
                aria-invalid={invalid("password")}
                aria-describedby="signup-password-msg"
                onChange={(e) => set("password", e.target.value)}
                onBlur={() => touch("password")}
              />
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Şifreleri gizle" : "Şifreleri göster"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
          </AuthField>

          <AuthField id="signup-confirmPassword" label="Şifre tekrar" error={shown("confirmPassword")} hint={confirmOk ? "Şifreler aynı" : undefined} hintTone="ok">
            <div className="auth-control">
              <Lock aria-hidden="true" />
              <input
                id="signup-confirmPassword"
                className="auth-input"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Şifreniz"
                value={form.confirmPassword}
                data-ok={confirmOk ? "true" : undefined}
                aria-invalid={invalid("confirmPassword")}
                aria-describedby={shown("confirmPassword") || confirmOk ? "signup-confirmPassword-msg" : undefined}
                onChange={(e) => set("confirmPassword", e.target.value)}
                onBlur={() => touch("confirmPassword")}
              />
            </div>
          </AuthField>
        </div>

        <AuthField
          id="signup-referral"
          label="Davet kodu"
          optional
          error={referralValid === false ? referralMessage : undefined}
          hint={referralValid === true ? referralMessage : "Arkadaşınızdan aldığınız kodu yazın; ilk siparişinizde indirim kazanırsınız."}
          hintTone={referralValid === true ? "ok" : undefined}
        >
          <div className="auth-control auth-control--toggle">
            <Gift aria-hidden="true" />
            <input
              id="signup-referral"
              className="auth-input"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="REF123ABC"
              maxLength={12}
              value={referralCode}
              data-ok={referralValid === true ? "true" : undefined}
              aria-invalid={referralValid === false ? "true" : undefined}
              aria-describedby="signup-referral-msg"
              onChange={handleReferralCodeChange}
            />
            <span className="auth-status" data-tone={referralValid === true ? "ok" : referralValid === false ? "bad" : undefined} aria-hidden="true">
              {checkingReferral ? <Loader className="auth-spin" /> : referralValid === true ? <Check /> : referralValid === false ? <X /> : null}
            </span>
          </div>
        </AuthField>

        <button type="submit" className="auth-submit" disabled={loading || checkingReferral}>
          {loading
            ? <><Loader className="auth-spin" aria-hidden="true" />Hesabınız oluşturuluyor…</>
            : <>Kayıt ol<ArrowRight aria-hidden="true" /></>}
        </button>
        {referralPending && !checkingReferral && referralCode.length < 6 && (
          <p className="auth-hint">Davet kodu en az 6 karakterdir; eksik kod kayda eklenmez.</p>
        )}
      </form>

      <div className="auth-foot">
        <span>Zaten hesabınız var mı? <Link to="/login">Giriş yapın</Link></span>
        <small>
          Kayıt olarak <Link to="/terms">Kullanım koşullarını</Link> ve <Link to="/kvkk">KVKK aydınlatma metnini</Link> okuduğunuzu kabul edersiniz.
        </small>
      </div>
    </AuthLayout>
  );
};

export default SignUpPage;
