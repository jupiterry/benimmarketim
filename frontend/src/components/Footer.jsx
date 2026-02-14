import { motion } from "framer-motion";
import {
    ShoppingCart, Heart, Star, Shield, Truck,
    Phone, Mail, MapPin, Instagram, Facebook, Twitter,
    ChevronRight, Sparkles, Gift, Send,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

const Footer = () => {
    const [email, setEmail] = useState("");
    const currentYear = new Date().getFullYear();

    const handleNewsletterSubmit = (e) => {
        e.preventDefault();
        if (email) {
            console.log("Newsletter kaydı:", email);
            setEmail("");
        }
    };

    const features = [
        { icon: Truck, title: "Hızlı Teslimat", desc: "45 dk içinde" },
        { icon: Shield, title: "Güvenli Ödeme", desc: "%100 koruma" },
        { icon: Star, title: "Kaliteli Ürünler", desc: "Seçilmiş markalar" },
        { icon: Gift, title: "Özel Fırsatlar", desc: "Sürekli indirimler" },
    ];

    const quickLinks = [
        { to: "/", label: "Ana Sayfa" },
        { to: "/categories", label: "Kategoriler" },
        { to: "/cart", label: "Sepetim" },
        { to: "/siparislerim", label: "Siparişlerim" },
    ];

    const helpLinks = [
        { to: "/contact", label: "İletişim" },
        { to: "/about", label: "Hakkımızda" },
        { to: "/faq", label: "SSS" },
        { to: "/privacy", label: "Gizlilik Politikası" },
        { to: "/terms", label: "Kullanım Şartları" },
        { to: "/kvkk", label: "KVKK" },
    ];

    return (
        <footer className="relative mt-auto">
            {/* ═══════════════════════════════════════════════
          §1  FEATURE STRIP — Floating Glass Bar
      ═══════════════════════════════════════════════ */}
            <div className="relative z-10 container mx-auto px-4 -mb-7">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-gray-800/40 backdrop-blur-md rounded-2xl border border-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                >
                    <div className="grid grid-cols-2 md:grid-cols-4">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className={`flex items-center gap-3 px-5 py-4 ${index < features.length - 1 ? "md:border-r border-white/[0.04]" : ""
                                    } ${index < 2 ? "border-b md:border-b-0 border-white/[0.04]" : ""}`}
                            >
                                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex-shrink-0">
                                    <feature.icon className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-white font-semibold text-xs">{feature.title}</h3>
                                    <p className="text-gray-500 text-[10px]">{feature.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* ═══════════════════════════════════════════════
          §2  MAIN FOOTER AREA
      ═══════════════════════════════════════════════ */}
            <div className="bg-gradient-to-t from-gray-900 to-gray-900/90 border-t border-white/[0.06]">
                {/* Subtle decorative glow */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-emerald-500/[0.03] rounded-full blur-3xl pointer-events-none" />

                <div className="relative container mx-auto px-4 pt-16 pb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

                        {/* ── Col 1: Brand ── */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                        >
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.25)]">
                                    <ShoppingCart className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white tracking-tight">Benim Marketim</h2>
                                    <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-semibold">Online Alışveriş</p>
                                </div>
                            </div>
                            <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-xs">
                                Taze ürünler, hızlı teslimat ve kaliteli hizmet. Alışverişin en kolay hali.
                            </p>

                            {/* Social Media — Glowing Circles */}
                            <div className="flex items-center gap-2">
                                {[
                                    { icon: Instagram, href: "#", color: "hover:border-pink-500/40 hover:text-pink-400 hover:shadow-[0_0_12px_rgba(236,72,153,0.2)]" },
                                    { icon: Facebook, href: "#", color: "hover:border-blue-500/40 hover:text-blue-400 hover:shadow-[0_0_12px_rgba(59,130,246,0.2)]" },
                                    { icon: Twitter, href: "#", color: "hover:border-sky-400/40 hover:text-sky-400 hover:shadow-[0_0_12px_rgba(56,189,248,0.2)]" },
                                ].map(({ icon: Icon, href, color }, i) => (
                                    <a
                                        key={i}
                                        href={href}
                                        className={`w-9 h-9 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-600 transition-all duration-300 ${color}`}
                                    >
                                        <Icon className="w-4 h-4" />
                                    </a>
                                ))}
                            </div>
                        </motion.div>

                        {/* ── Col 2: Hızlı Linkler ── */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.05 }}
                        >
                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-5">Hızlı Linkler</h3>
                            <ul className="space-y-2.5">
                                {quickLinks.map((link, i) => (
                                    <li key={i}>
                                        <Link
                                            to={link.to}
                                            className="text-gray-500 hover:text-emerald-400 text-sm flex items-center gap-2 group transition-all duration-200 hover:translate-x-1"
                                        >
                                            <ChevronRight className="w-3 h-3 text-emerald-500/0 group-hover:text-emerald-400 transition-all" />
                                            <span>{link.label}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>

                        {/* ── Col 3: Yardım ── */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                        >
                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-5">Yardım & Yasal</h3>
                            <ul className="space-y-2.5">
                                {helpLinks.map((link, i) => (
                                    <li key={i}>
                                        <Link
                                            to={link.to}
                                            className="text-gray-500 hover:text-teal-400 text-sm flex items-center gap-2 group transition-all duration-200 hover:translate-x-1"
                                        >
                                            <ChevronRight className="w-3 h-3 text-teal-500/0 group-hover:text-teal-400 transition-all" />
                                            <span>{link.label}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>

                        {/* ── Col 4: Newsletter + App ── */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.15 }}
                        >
                            {/* Newsletter */}
                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-5">Bülten</h3>
                            <p className="text-gray-600 text-xs mb-3">Kampanya ve fırsatlardan haberdar ol.</p>
                            <form onSubmit={handleNewsletterSubmit} className="relative mb-8">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="E-posta adresiniz"
                                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-full pl-4 pr-24 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/30 focus:shadow-[0_0_15px_rgba(16,185,129,0.08)] transition-all"
                                />
                                <button
                                    type="submit"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold rounded-full hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex items-center gap-1"
                                >
                                    <Send className="w-3 h-3" />
                                    Abone Ol
                                </button>
                            </form>

                            {/* App Download — Glass Buttons */}
                            <div className="space-y-2">
                                <a
                                    href="https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl px-3.5 py-2.5 border border-white/[0.06] hover:border-emerald-500/20 transition-all duration-300 group"
                                >
                                    <div className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/15 rounded-lg flex items-center justify-center">
                                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-gray-600 uppercase tracking-wider">İndir</p>
                                        <p className="text-white text-xs font-semibold">Google Play</p>
                                    </div>
                                </a>
                                <a
                                    href="https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl px-3.5 py-2.5 border border-white/[0.06] hover:border-gray-400/20 transition-all duration-300 group"
                                >
                                    <div className="w-7 h-7 bg-white/[0.04] border border-white/[0.08] rounded-lg flex items-center justify-center">
                                        <svg className="w-3.5 h-3.5 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-gray-600 uppercase tracking-wider">İndir</p>
                                        <p className="text-white text-xs font-semibold">App Store</p>
                                    </div>
                                </a>
                            </div>
                        </motion.div>
                    </div>

                    {/* ═══════════════════════════════════════════════
              §3  BOTTOM BAR
          ═══════════════════════════════════════════════ */}
                    <div className="border-t border-white/[0.04] pt-6">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                            <p className="text-gray-600 text-xs text-center md:text-left">
                                Ürün fiyatlarına KDV dahildir. © {currentYear} Benim Marketim. Tüm hakları saklıdır.
                            </p>
                            <div className="flex items-center gap-3">
                                <Link
                                    to="/hesap-silme"
                                    className="text-gray-700 hover:text-rose-400 text-[10px] transition-colors"
                                >
                                    Hesap Silme
                                </Link>
                                <div className="w-px h-3 bg-white/[0.06]" />
                                <div className="flex items-center gap-1.5 text-xs">
                                    <span className="text-gray-600">Made with</span>
                                    <Heart className="w-3 h-3 text-rose-400 animate-pulse" fill="currentColor" />
                                    <span className="text-gray-600">by</span>
                                    <span className="text-cyan-400 font-bold drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">jupiterry</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
