import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  UserRound,
} from "lucide-react";
import { useUserStore } from "../stores/useUserStore";
import "../styles/landing.css";

const stores = [
  {
    id: "apple",
    name: "App Store",
    hint: "iPhone için indirin",
    url: "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr",
  },
  {
    id: "google",
    name: "Google Play",
    hint: "Android için indirin",
    url: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app",
  },
];

const steps = [
  {
    icon: Download,
    title: "Uygulamayı indir.",
    description: "Telefonuna uygun mağazayı seç, Benim Marketim’i indir.",
  },
  {
    icon: UserRound,
    title: "Hesabınla giriş yap.",
    description:
      "Web’de oluşturduğun hesabı uygulamada da kullan. Henüz üye değilsen kolayca kayıt ol.",
  },
  {
    icon: ShoppingBag,
    title: "Alışverişe başla.",
    description:
      "İhtiyaçlarını keşfet, sepetini oluştur ve siparişini uygulamadan tamamla.",
  },
];

const questions = [
  {
    title: "Web sitesinden sipariş verebilir miyim?",
    answer:
      "Alışveriş ve sipariş işlemleri yalnızca Benim Marketim mobil uygulamasında yapılır. Web sitemizden hesap oluşturabilir, giriş yapabilir ve profil bilgilerini yönetebilirsin.",
  },
  {
    title: "Mevcut hesabımı uygulamada kullanabilir miyim?",
    answer:
      "Evet. Web’de kullandığın e-posta adresi ve şifrenle mobil uygulamaya da giriş yapabilirsin. Yeniden hesap oluşturmana gerek yok.",
  },
  {
    title: "Uygulamayı nereden indirebilirim?",
    answer:
      "iPhone için App Store, Android telefonlar için Google Play butonunu kullanabilirsin. Butonlar seni doğrudan Benim Marketim’in mağaza sayfasına götürür.",
  },
];

const StoreIcon = ({ type }) =>
  type === "apple" ? (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83ZM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#46c9f3" d="M3 2.2v19.6L13.3 12Z" />
      <path fill="#57d58c" d="m3 2.2 13.2 7.5-2.9 2.3Z" />
      <path fill="#ffd466" d="m16.2 9.7 3.5 2c.3.2.3.4 0 .6l-3.5 2-2.9-2.3Z" />
      <path fill="#ff7f87" d="M3 21.8 16.2 14.3 13.3 12Z" />
    </svg>
  );

const StoreLinks = ({ light = false }) => (
  <div className={`landing-stores${light ? " landing-stores-light" : ""}`}>
    {stores.map((store) => (
      <a
        key={store.id}
        className="landing-store"
        href={store.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Benim Marketim’i ${store.name} üzerinden indir (yeni sekmede açılır)`}
      >
        <StoreIcon type={store.id} />
        <span>
          <small>{store.hint}</small>
          <strong>{store.name}</strong>
        </span>
        <ArrowUpRight className="landing-store-arrow" aria-hidden="true" />
      </a>
    ))}
  </div>
);

const HomePage = () => {
  const { user } = useUserStore();

  return (
    <main className="landing">
      <Helmet>
        <title>Benim Marketim | Marketin artık cebinde</title>
        <meta
          name="description"
          content="Benim Marketim ile alışverişe mobil uygulamada devam et. App Store veya Google Play’den indir; mevcut hesabınla giriş yap ya da web’den üye ol."
        />
      </Helmet>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-shell landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              <span className="landing-live-dot" /> DEVREK’İN MOBİL MARKETİ
            </span>
            <h1 id="landing-title">
              Bildiğin market.
              <br />
              <span>Şimdi cebinde.</span>
            </h1>
            <p className="landing-intro">
              Günün koşturmacasında alışverişe bir mola ver.
              <br className="landing-desktop-break" /> İhtiyaçların için Benim
              Marketim’i aç, gerisini bize bırak.
            </p>
            <p className="landing-download-prompt" id="uygulamayi-indir">
              Alışverişe devam etmek için mobil uygulamamızı indir.
            </p>
            <StoreLinks />
            <div className="landing-account-link">
              <ShieldCheck size={17} aria-hidden="true" />
              {user ? (
                <Link to="/profile">
                  Hesabını yönet <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <span>Hesabın hazır olsun.</span>{" "}
                  <Link to="/signup">
                    Ücretsiz kayıt ol{" "}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </>
              )}
            </div>
          </div>

          <div
            className="landing-visual"
            role="img"
            aria-label="Benim Marketim’i cebine taşı: telefon ve market alışverişi illüstrasyonu"
          >
            <div
              className="landing-orbit landing-orbit-one"
              aria-hidden="true"
            />
            <div
              className="landing-orbit landing-orbit-two"
              aria-hidden="true"
            />
            <span className="landing-visual-note" aria-hidden="true">
              HER GÜN, YANINDA.
            </span>
            <div className="landing-phone" aria-hidden="true">
              <div className="landing-phone-camera" />
              <div className="landing-phone-brand">
                <ShoppingBag size={19} /> benim marketim
              </div>
              <div className="landing-phone-copy">
                Bir uygulama.
                <br />
                <strong>Bir dolu kolaylık.</strong>
              </div>
              <img
                className="landing-basket"
                src="/food2.png"
                alt=""
                width="1024"
                height="1024"
                fetchPriority="high"
              />
              <div className="landing-phone-bottom">
                <span>Marketin hep yanında.</span>
                <ArrowUpRight size={22} />
              </div>
              <div className="landing-phone-home" />
            </div>
            <div
              className="landing-float landing-float-location"
              aria-hidden="true"
            >
              <span>
                <MapPin size={21} />
              </span>
              <div>
                <small>Uzağa gitmene gerek yok.</small>
                <strong>Devrek’te, kapında.</strong>
              </div>
            </div>
            <div className="landing-float landing-float-app" aria-hidden="true">
              <span>
                <Check size={20} />
              </span>
              <div>
                <strong>iOS & Android</strong>
                <small>Alışverişin yeni adresi.</small>
              </div>
            </div>
          </div>
        </div>
        <div className="landing-shell landing-hero-foot">
          <span>
            <Smartphone size={16} aria-hidden="true" /> Alışveriş uygulamada.
            Hesabın her yerde.
          </span>
          <a href="#nasil-calisir">
            Tanışalım <ArrowDown size={17} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section
        className="landing-how"
        id="nasil-calisir"
        aria-labelledby="landing-how-title"
      >
        <div className="landing-shell">
          <div className="landing-section-heading">
            <div>
              <span className="landing-eyebrow">
                KÜÇÜK BİR ADIM, BÜYÜK KOLAYLIK
              </span>
              <h2 id="landing-how-title">
                Alışverişin yeni yolu.
                <br />
                <span>Başlamak bu kadar kolay.</span>
              </h2>
            </div>
            <p>
              Yeni bir hesapla ya da mevcut üyeliğinle.
              <br />
              Benim Marketim’e geçmek sadece üç adım.
            </p>
          </div>
          <ol className="landing-steps">
            {steps.map(({ icon: Icon, title, description }, index) => (
              <li key={title}>
                <div className="landing-step-top">
                  <span>0{index + 1}</span>
                  <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="landing-membership"
        aria-labelledby="landing-member-title"
      >
        <div className="landing-shell landing-member-grid">
          <div className="landing-member-art" aria-hidden="true">
            <div className="landing-member-card">
              <div className="landing-member-card-top">
                <ShoppingBag size={24} />
                <span>BENİM MARKETİM</span>
              </div>
              <div className="landing-member-avatar">
                <UserRound size={34} strokeWidth={1.5} />
              </div>
              <strong>
                Bir hesap.
                <br />
                Her yerde senin.
              </strong>
              <div className="landing-member-card-bottom">
                <span>WEB + MOBİL</span>
                <ShieldCheck size={23} />
              </div>
            </div>
            <div className="landing-member-stamp">
              <Check size={16} /> Aynı hesapla devam et
            </div>
          </div>
          <div className="landing-member-copy">
            <span className="landing-eyebrow">ÜYELİĞİN SENİNLE</span>
            <h2 id="landing-member-title">
              Telefonun değişir.
              <br />
              <span>Hesabın seninle kalır.</span>
            </h2>
            <p>
              Hesabını web’den oluştur, uygulamada aynı e-posta ve şifreyle
              devam et. Zaten üyeysen yeni bir başlangıca gerek yok.
            </p>
            {user ? (
              <Link className="landing-primary-link" to="/profile">
                Hesabıma git <ArrowRight size={19} aria-hidden="true" />
              </Link>
            ) : (
              <div className="landing-member-actions">
                <Link className="landing-primary-link" to="/signup">
                  Hesap oluştur <ArrowRight size={19} aria-hidden="true" />
                </Link>
                <Link className="landing-secondary-link" to="/login">
                  Zaten üyeyim, giriş yap
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="landing-faq" aria-labelledby="landing-faq-title">
        <div className="landing-shell landing-faq-grid">
          <div>
            <span className="landing-eyebrow">AKLINDA KALMASIN</span>
            <h2 id="landing-faq-title">Merak ettiklerin.</h2>
            <p>Uygulamaya geçerken bilmen gerekenler.</p>
          </div>
          <div>
            {questions.map(({ title, answer }) => (
              <details key={title}>
                <summary>
                  {title}
                  <ChevronDown size={20} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="landing-final-title">
        <div className="landing-shell">
          <span className="landing-eyebrow">
            BENİM MARKETİM, BENİM CEBİMDE.
          </span>
          <h2 id="landing-final-title">
            Hadi, alışverişi
            <br />
            <span>kolaylaştıralım.</span>
          </h2>
          <p>Uygulamayı indir. İhtiyaçların için ilk adımı at.</p>
          <StoreLinks light />
        </div>
      </section>
    </main>
  );
};

export default HomePage;
