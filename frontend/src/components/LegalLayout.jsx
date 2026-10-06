import { NavLink, Link } from "react-router-dom";
import { ArrowRight, List } from "lucide-react";
import "../styles/legal.css";

// Sözleşme ve politika sayfalarının ortak iskeleti: başlık, belgeler arası geçiş ve içindekiler.
const LEGAL_DOCUMENTS = [
  { to: "/kvkk", label: "KVKK Aydınlatma" },
  { to: "/privacy", label: "Gizlilik" },
  { to: "/terms", label: "Kullanım Şartları" },
  { to: "/distance-sales", label: "Mesafeli Satış" },
  { to: "/return-policy", label: "İade ve Değişim" },
  { to: "/cookies", label: "Çerezler" },
];

// docs: belgeler arası geçiş çubuğu, help: sayfa sonundaki iletişim kutusu (bilgi sayfalarında kapatılabilir)
export default function LegalLayout({ title, subtitle, description, icon: Icon, toc = [], docs = true, help = true, children }) {
  const contents = (
    <ol className="legal-toc-list">
      {toc.map((item, index) => (
        <li key={item.id}>
          <a href={`#${item.id}`}>
            <span className="legal-toc-no">{String(index + 1).padStart(2, "0")}</span>
            {item.label}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="legal">
      <header className="legal-hero">
        <div className="legal-shell">
          <p className="legal-eyebrow">
            {Icon && <Icon aria-hidden="true" />}
            {subtitle}
          </p>
          <h1>{title}</h1>
          <p className="legal-lead">{description}</p>
          {docs && (
            <nav className="legal-docs" aria-label="Sözleşmeler ve politikalar">
              {LEGAL_DOCUMENTS.map((doc) => (
                <NavLink key={doc.to} to={doc.to} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
                  {doc.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>

      <div className={`legal-shell legal-body${toc.length > 1 ? "" : " legal-body--single"}`}>
        {toc.length > 1 && (
          <>
            <aside className="legal-toc" aria-label="Bu sayfada">
              <p className="legal-toc-title">Bu sayfada</p>
              {contents}
            </aside>
            <details className="legal-toc-mobile">
              <summary>
                <List aria-hidden="true" />
                Bu sayfada
              </summary>
              {contents}
            </details>
          </>
        )}
        <main className="legal-content">
          {children}
          {help && (
            <div className="legal-help">
              <div>
                <strong>Aklınıza takılan bir şey mi var?</strong>
                <p>Bu metinle ilgili sorularınız için bize yazabilirsiniz.</p>
              </div>
              <Link to="/contact">
                İletişime geç
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
