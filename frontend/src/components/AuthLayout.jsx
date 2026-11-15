// Giriş ve kayıt sayfalarının ortak düzeni: solda tanıtım paneli (maskot, kısa bilgiler, uygulama
// bağlantıları), sağda form kartı. Dar ekranda form önce gelir. Stil: styles/auth.css
import { Check } from "lucide-react";
import { appStores } from "../data/company";
import "../styles/auth.css";

const STORE_LABELS = { apple: "App Store’dan indir", google: "Google Play’den indir" };

/** Etiket + alan + ipucu/hata. `error` varsa alan hatalı işaretlenir ve ekran okuyucuya duyurulur. */
export const AuthField = ({ id, label, optional, hint, hintTone, error, children }) => (
  <div className="auth-field">
    <label className="auth-label" htmlFor={id}>
      {label}
      {optional && <small>İsteğe bağlı</small>}
    </label>
    {children}
    {error
      ? <p className="auth-error" id={`${id}-msg`} role="alert">{error}</p>
      : hint && <p className="auth-hint" id={`${id}-msg`} data-tone={hintTone}>{hint}</p>}
  </div>
);

const AuthLayout = ({ eyebrow, title, accent, lead, points = [], children }) => (
  <main className="auth">
    <div className="auth-shell">
      <aside className="auth-aside" aria-label="Benim Marketim hakkında">
        <span className="auth-aside-eyebrow">{eyebrow}</span>
        <h1>{title} <span>{accent}</span></h1>
        <p className="auth-aside-lead">{lead}</p>
        <ul className="auth-points">
          {points.map((point) => (
            <li key={point}><Check aria-hidden="true" />{point}</li>
          ))}
        </ul>
        <div className="auth-stores">
          {appStores.map((store) => (
            <a key={store.id} className="auth-store" href={store.url} target="_blank" rel="noopener noreferrer">
              {STORE_LABELS[store.id] || store.name} ↗
            </a>
          ))}
        </div>
        <img className="auth-mascot" src="/maskot-560.webp" alt="" width="520" height="560" loading="lazy" decoding="async" />
      </aside>
      <section className="auth-card">{children}</section>
    </div>
  </main>
);

export default AuthLayout;
