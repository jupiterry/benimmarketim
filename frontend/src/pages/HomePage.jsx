import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Apple,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useUserStore } from "../stores/useUserStore";

const highlights = [
  {
    icon: Clock3,
    title: "Hızlı ve pratik",
    description: "Ürünleri keşfedin, sepetinizi hazırlayın ve siparişinizi mobil uygulamadan tamamlayın.",
  },
  {
    icon: ShieldCheck,
    title: "Güvenli üyelik",
    description: "Web üzerinden hesabınızı oluşturabilir, giriş yapabilir ve profil bilgilerinizi yönetebilirsiniz.",
  },
  {
    icon: MapPin,
    title: "Marketiniz cebinizde",
    description: "Benim Marketim alışveriş deneyimi artık tamamen mobil uygulamada sizi bekliyor.",
  },
];

const StoreButton = ({ type }) => {
  const isApple = type === "apple";
  const Icon = isApple ? Apple : Smartphone;

  return (
    <button
      type="button"
      className="group flex min-w-[210px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-white/10"
      aria-label={`${isApple ? "App Store" : "Google Play"} indirme bağlantısı yakında`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-950">
        <Icon className="h-6 w-6" />
      </span>
      <span>
        <span className="block text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
          {isApple ? "App Store" : "Google Play"}
        </span>
        <span className="mt-0.5 block font-semibold text-white">Çok yakında</span>
      </span>
    </button>
  );
};

const HomePage = () => {
  const { user } = useUserStore();

  return (
    <main className="relative overflow-hidden pt-20">
      <section className="relative isolate min-h-[calc(100vh-5rem)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.22),transparent_32%),radial-gradient(circle_at_85%_25%,rgba(20,184,166,0.16),transparent_28%),linear-gradient(180deg,#071019_0%,#0b111b_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-14 px-5 py-16 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-300">
              <Sparkles className="h-4 w-4" />
              Benim Marketim artık mobilde
            </div>

            <h1 className="text-4xl font-black leading-[1.08] text-white sm:text-5xl md:text-6xl xl:text-7xl">
              Alışverişe devam etmek için
              <span className="block bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">
                mobil uygulamamızı indirin.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-gray-300 sm:text-lg">
              Web sitemiz artık Benim Marketim&apos;i tanımak ve üyeliğinizi yönetmek için burada.
              Ürün keşfi, sepet ve sipariş işlemleri mobil uygulamamız üzerinden devam ediyor.
            </p>

            <div className="mt-9 flex flex-wrap gap-4" id="uygulamayi-indir">
              <StoreButton type="apple" />
              <StoreButton type="google" />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {user ? (
                <Link
                  to="/profile"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
                >
                  Hesabımı yönet
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/signup"
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
                  >
                    Ücretsiz hesap oluştur
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/login"
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
                  >
                    Giriş yap
                  </Link>
                </>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94, x: 24 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative mx-auto w-full max-w-xl"
          >
            <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-emerald-500/20 to-teal-400/5 blur-3xl" />
            <div className="relative rounded-[2.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6">
              <div className="rounded-[2rem] border border-white/10 bg-gray-950/80 p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-300">Benim Marketim</p>
                    <h2 className="mt-1 text-2xl font-bold text-white">Cebindeki market</h2>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/20">
                    <Smartphone className="h-7 w-7 text-white" />
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  {["Ürünleri uygulamada keşfet", "Sepetini mobilde oluştur", "Siparişini uygulamadan tamamla"].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                      <CheckCircle2 className="h-5 w-5 flex-none text-emerald-400" />
                      <span className="text-sm font-medium text-gray-200">{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-7 rounded-2xl bg-gradient-to-r from-emerald-500/15 to-teal-500/10 p-5">
                  <div className="flex items-center gap-3 text-emerald-200">
                    <Download className="h-5 w-5" />
                    <span className="font-semibold">Uygulama mağazası bağlantıları yakında eklenecek.</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-white/5 bg-gray-950/60 py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Yeni deneyim</p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Web üyelik için, alışveriş mobil uygulamada.</h2>
            <p className="mt-4 leading-7 text-gray-400">
              Hesabınızı web üzerinden oluşturun veya yönetin; alışveriş yapmak istediğinizde mobil uygulamaya geçin.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, description }, index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: index * 0.08 }}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
                <p className="mt-3 leading-7 text-gray-400">{description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
