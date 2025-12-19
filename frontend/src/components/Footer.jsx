import { motion } from "framer-motion";
import { 
  ShoppingCart, Heart, Star, Clock, Shield, Truck, 
  Phone, Mail, MapPin, Instagram, Facebook, Twitter,
  ChevronRight, Sparkles, Zap, Gift
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

const Footer = () => {
    const [email, setEmail] = useState("");
    const currentYear = new Date().getFullYear();

    const handleNewsletterSubmit = (e) => {
        e.preventDefault();
        if (email) {
            // Newsletter kayıt işlemi
            console.log("Newsletter kaydı:", email);
            setEmail("");
        }
    };

    const features = [
        { icon: Truck, title: "Hızlı Teslimat", desc: "45 dakika içinde", color: "from-emerald-500 to-teal-500" },
        { icon: Shield, title: "Güvenli Alışveriş", desc: "%100 güvenli", color: "from-blue-500 to-indigo-500" },
        { icon: Star, title: "Kaliteli Ürünler", desc: "Seçilmiş markalar", color: "from-amber-500 to-orange-500" },
        { icon: Gift, title: "Özel Fırsatlar", desc: "Sürekli indirimler", color: "from-pink-500 to-rose-500" }
    ];

    const quickLinks = [
        { to: "/", label: "Ana Sayfa" },
        { to: "/categories", label: "Kategoriler" },
        { to: "/cart", label: "Sepetim" },
        { to: "/siparislerim", label: "Siparişlerim" }
    ];

    const legalLinks = [
        { to: "/privacy", label: "Gizlilik Politikası" },
        { to: "/terms", label: "Kullanım Şartları" },
        { to: "/distance-sales", label: "Mesafeli Satış" },
        { to: "/return-policy", label: "İade Koşulları" },
        { to: "/kvkk", label: "KVKK" }
    ];

    const helpLinks = [
        { to: "/contact", label: "İletişim" },
        { to: "/about", label: "Hakkımızda" },
        { to: "/faq", label: "SSS" },
        { to: "/cookies", label: "Çerez Politikası" }
    ];

    return (
        <footer className="relative bg-gradient-to-br from-gray-900 via-[#0a0f1a] to-gray-900 border-t border-emerald-500/20 mt-auto overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-emerald-500/3 to-teal-500/3 rounded-full blur-3xl"></div>
            </div>
            
            <div className="relative container mx-auto px-4 py-12">
                {/* Features Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                    {features.map((feature, index) => (
                        <motion.div 
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="group relative overflow-hidden bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all duration-300"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
                            <div className="relative flex items-center gap-3">
                                <div className={`p-2 rounded-xl bg-gradient-to-br ${feature.color}`}>
                                    <feature.icon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold text-sm">{feature.title}</h3>
                                    <p className="text-gray-400 text-xs">{feature.desc}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Main Footer Content */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
                    {/* Brand Section */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="lg:col-span-1"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <ShoppingCart className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Benim Marketim</h2>
                                <p className="text-emerald-400 text-xs">Online Alışveriş</p>
                            </div>
                        </div>
                        <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                            Taze ürünler, hızlı teslimat ve kaliteli hizmet. Alışverişin en kolay hali!
                        </p>
                        
                        {/* Social Media */}
                        <div className="flex items-center gap-2">
                            <a href="#" className="p-2 bg-white/5 hover:bg-gradient-to-br hover:from-pink-500 hover:to-rose-500 rounded-xl text-gray-400 hover:text-white transition-all duration-300">
                                <Instagram className="w-5 h-5" />
                            </a>
                            <a href="#" className="p-2 bg-white/5 hover:bg-gradient-to-br hover:from-blue-500 hover:to-blue-600 rounded-xl text-gray-400 hover:text-white transition-all duration-300">
                                <Facebook className="w-5 h-5" />
                            </a>
                            <a href="#" className="p-2 bg-white/5 hover:bg-gradient-to-br hover:from-sky-400 hover:to-blue-500 rounded-xl text-gray-400 hover:text-white transition-all duration-300">
                                <Twitter className="w-5 h-5" />
                            </a>
                        </div>
                    </motion.div>

                    {/* Quick Links */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                    >
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-emerald-400" />
                            Hızlı Linkler
                        </h3>
                        <ul className="space-y-2">
                            {quickLinks.map((link, i) => (
                                <li key={i}>
                                    <Link 
                                        to={link.to}
                                        className="text-gray-400 hover:text-emerald-400 text-sm flex items-center gap-2 group transition-colors"
                                    >
                                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 -ml-3 group-hover:ml-0 transition-all" />
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* Help & Legal Links */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-blue-400" />
                            Yardım & Yasal
                        </h3>
                        <ul className="space-y-2">
                            {[...helpLinks, ...legalLinks].slice(0, 6).map((link, i) => (
                                <li key={i}>
                                    <Link 
                                        to={link.to}
                                        className="text-gray-400 hover:text-blue-400 text-sm flex items-center gap-2 group transition-colors"
                                    >
                                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 -ml-3 group-hover:ml-0 transition-all" />
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* Contact & App */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                    >
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-teal-400" />
                            İletişim
                        </h3>
                        <ul className="space-y-3 mb-6">
                            <li className="flex items-center gap-2 text-gray-400 text-sm">
                                <MapPin className="w-4 h-4 text-emerald-400" />
                                Devrek, Zonguldak
                            </li>
                            <li className="flex items-center gap-2 text-gray-400 text-sm">
                                <Phone className="w-4 h-4 text-emerald-400" />
                                +90 (XXX) XXX XX XX
                            </li>
                            <li className="flex items-center gap-2 text-gray-400 text-sm">
                                <Mail className="w-4 h-4 text-emerald-400" />
                                info@benimmarketim.com
                            </li>
                        </ul>

                        {/* App Download Badges */}
                        <div className="flex flex-col gap-2">
                            <a 
                                href="https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app" 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-xl px-3 py-2 border border-white/10 transition-all group"
                            >
                                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-400">İndir</p>
                                    <p className="text-white text-sm font-medium">Google Play</p>
                                </div>
                            </a>
                            <a 
                                href="https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr" 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-xl px-3 py-2 border border-white/10 transition-all group"
                            >
                                <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-400">İndir</p>
                                    <p className="text-white text-sm font-medium">App Store</p>
                                </div>
                            </a>
                        </div>
                    </motion.div>
                </div>

                {/* Bottom Bar */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="border-t border-white/10 pt-6"
                >
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-gray-500 text-sm text-center md:text-left">
                            Ürün fiyatlarına KDV bedeli dahildir. © {currentYear} Benim Marketim. Tüm hakları saklıdır.
                        </p>
                        
                        {/* Delete Account & Developer */}
                        <div className="flex items-center gap-4">
                            <Link 
                                to="/hesap-silme" 
                                className="text-red-400/60 hover:text-red-400 text-xs transition-colors"
                            >
                                Hesap Silme
                            </Link>
                            <div className="w-px h-4 bg-gray-700"></div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">Made with</span>
                                <Heart className="w-4 h-4 text-red-400 animate-pulse" />
                                <span className="text-gray-500">by</span>
                                <span className="text-emerald-400 font-semibold">jupiterry</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </footer>
    );
};

export default Footer;
