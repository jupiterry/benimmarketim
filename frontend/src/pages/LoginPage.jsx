// Giriş sayfası. Siparişler yalnızca mobil uygulamadan verilir; web hesabı hesap işlemleri içindir.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader, Lock, Mail } from "lucide-react";
import AuthLayout, { AuthField } from "../components/AuthLayout";
import { useUserStore } from "../stores/useUserStore";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const { login, loading } = useUserStore();

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = "E-posta adresinizi yazın.";
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = "E-posta adresi ornek@eposta.com biçiminde olmalı.";
    if (!password) next.password = "Şifrenizi yazın.";
    return next;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    const next = validate();
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      document.getElementById(`login-${first}`)?.focus();
      return;
    }
    login(email.trim(), password);
  };

  return (
    <AuthLayout
      eyebrow="Tekrar hoş geldiniz"
      title="Hesabınıza"
      accent="giriş yapın"
      lead="Siparişlerinizi mobil uygulamadan verirsiniz. Buradan hesabınıza ulaşabilirsiniz."
      points={[
        "Aynı hesapla uygulamada ve sitede oturum açarsınız",
        "Ödeme kapıda: nakit ya da kart",
        "Kuponlarınız ve davet kodunuz hesabınızda durur",
      ]}
    >
      <div className="auth-card-head">
        <h2>Giriş yapın</h2>
        <p>E-posta adresiniz ve şifrenizle devam edin.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField id="login-email" label="E-posta adresi" error={errors.email}>
          <div className="auth-control">
            <Mail aria-hidden="true" />
            <input
              id="login-email"
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ornek@eposta.com"
              value={email}
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "login-email-msg" : undefined}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((prev) => ({ ...prev, email: undefined })); }}
            />
          </div>
        </AuthField>

        <AuthField id="login-password" label="Şifre" error={errors.password}>
          <div className="auth-control auth-control--toggle">
            <Lock aria-hidden="true" />
            <input
              id="login-password"
              className="auth-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Şifreniz"
              value={password}
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "login-password-msg" : undefined}
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((prev) => ({ ...prev, password: undefined })); }}
            />
            <button
              type="button"
              className="auth-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
        </AuthField>

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading
            ? <><Loader className="auth-spin" aria-hidden="true" />Giriş yapılıyor…</>
            : <>Giriş yap<ArrowRight aria-hidden="true" /></>}
        </button>
      </form>

      <div className="auth-foot">
        <span>Hesabınız yok mu? <Link to="/signup">Ücretsiz kayıt olun</Link></span>
        <small>Şifrenizi mi unuttunuz? <Link to="/contact">Bize yazın</Link>, yenilemenize yardımcı olalım.</small>
      </div>
    </AuthLayout>
  );
};

export default LoginPage;
