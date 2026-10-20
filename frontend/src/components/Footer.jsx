import { Home, LogIn, User, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserStore } from "../stores/useUserStore";

// Alt menü bağlantı grupları — yollar App.jsx rotalarıyla birebir aynıdır.
const linkGroups = [
  {
    title: "Kurumsal",
    links: [
      { to: "/about", label: "Hakkımızda" },
      { to: "/contact", label: "İletişim" },
      { to: "/faq", label: "SSS" },
    ],
  },
  {
    title: "Yasal",
    links: [
      { to: "/privacy", label: "Gizlilik Politikası" },
      { to: "/kvkk", label: "KVKK Aydınlatma" },
      { to: "/terms", label: "Kullanım Koşulları" },
      { to: "/distance-sales", label: "Mesafeli Satış" },
      { to: "/return-policy", label: "İade Politikası" },
      { to: "/cookies", label: "Çerez Politikası" },
    ],
  },
  {
    title: "Hesap",
    links: [
      { to: "/profile", label: "Profilim" },
      { to: "/referral", label: "Arkadaşını Davet Et" },
      { to: "/hesap-silme", label: "Hesabımı Sil" },
    ],
  },
];

const footerLinkClass = "text-sm text-gray-400 transition hover:text-white";

const Footer = () => {
  const { user } = useUserStore();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/10 bg-[#062f28]">
      <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="max-w-md">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white">
                <img src="/maskot-yuz.webp" alt="" width="40" height="40" loading="lazy" className="h-full w-full object-cover" />
              </span>
              <div>
                <img src="/logo-yazi-beyaz.webp" alt="Benim Marketim" width="720" height="260" loading="lazy" style={{ display: "block", height: 36, width: "auto" }} />
                <p className="text-sm text-gray-400">Alışveriş artık mobil uygulamada.</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-500">
              Web sitesi üyelik, giriş ve hesap yönetimi için hizmet vermeye devam eder.
            </p>

            <nav className="mt-5 flex flex-wrap gap-2" aria-label="Alt menü">
              <Link to="/" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white">
                <Home className="h-4 w-4" /> Ana Sayfa
              </Link>
              {user ? (
                <Link to="/profile" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white">
                  <User className="h-4 w-4" /> Hesabım / Profil
                </Link>
              ) : (
                <>
                  <Link to="/login" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white">
                    <LogIn className="h-4 w-4" /> Giriş Yap
                  </Link>
                  <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white">
                    <UserPlus className="h-4 w-4" /> Kayıt Ol
                  </Link>
                </>
              )}
            </nav>
          </div>

          {linkGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">{group.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={footerLinkClass}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/5 pt-6 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <span>© {currentYear} Benim Marketim. Tüm hakları saklıdır.</span>
          <Link to="/kvkk-basvuru" className="text-gray-500 transition hover:text-gray-300">KVKK başvuru formu</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
