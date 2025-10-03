import { motion } from "framer-motion";
import { ShoppingCart, Heart, Star, Clock, Shield, Truck } from "lucide-react";

const Footer = () => {
    return (
        <footer className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-t border-emerald-500/20 mt-auto overflow-hidden">
            {/* Arka Plan Efektleri */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/10 via-teal-900/10 to-emerald-900/10"></div>
            <div className="absolute top-0 left-1/4 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-24 h-24 bg-teal-500/10 rounded-full blur-3xl"></div>
            
            <div className="relative container mx-auto px-4 py-12">
                {/* Ana İçerik */}
                <motion.div 
                    className="text-center mb-8"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    {/* Logo ve Başlık */}
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full flex items-center justify-center shadow-2xl">
                            <ShoppingCart className="w-6 h-6 text-white" />
                        </div>
                        <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-green-400 bg-clip-text text-transparent">
                            Benim Marketim
                        </h2>
                    </div>

                    {/* Özellikler */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <motion.div 
                            className="flex items-center justify-center gap-3 p-4 bg-gray-800/50 rounded-xl border border-emerald-500/20 backdrop-blur-sm"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                        >
                            <Truck className="w-6 h-6 text-emerald-400" />
                            <div className="text-left">
                                <h3 className="text-white font-semibold">Hızlı Teslimat</h3>
                                <p className="text-gray-400 text-sm">45 dakika içinde</p>
                            </div>
                        </motion.div>

                        <motion.div 
                            className="flex items-center justify-center gap-3 p-4 bg-gray-800/50 rounded-xl border border-teal-500/20 backdrop-blur-sm"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                        >
                            <Shield className="w-6 h-6 text-teal-400" />
                            <div className="text-left">
                                <h3 className="text-white font-semibold">Güvenli Alışveriş</h3>
                                <p className="text-gray-400 text-sm">%100 güvenli ödeme</p>
                            </div>
                        </motion.div>

                        <motion.div 
                            className="flex items-center justify-center gap-3 p-4 bg-gray-800/50 rounded-xl border border-green-500/20 backdrop-blur-sm"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                        >
                            <Star className="w-6 h-6 text-green-400" />
                            <div className="text-left">
                                <h3 className="text-white font-semibold">Kaliteli Ürünler</h3>
                                <p className="text-gray-400 text-sm">Seçilmiş markalar</p>
                            </div>
                        </motion.div>
                    </div>

                    {/* Slogan */}
                    <motion.p 
                        className="text-lg text-emerald-100 mb-6 font-medium"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.8 }}
                    >
                        🛒 Taze ürünler, hızlı teslimat, kaliteli hizmet! ✨
                    </motion.p>
                </motion.div>

                {/* Alt Bilgiler */}
                <motion.div 
                    className="border-t border-gray-700/50 pt-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 1 }}
                >
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        {/* Telif Hakkı */}
                        <p className="text-gray-400 text-sm text-center md:text-left">
                    Ürün fiyatlarına KDV bedeli dahildir. © 2025 Benim Marketim. Tüm hakları saklıdır.
                </p>

                        {/* Geliştirici Bilgisi */}
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500">Made with</span>
                            <Heart className="w-4 h-4 text-red-400 animate-pulse" />
                            <span className="text-gray-500">by</span>
                            <span className="text-emerald-400 font-semibold">jupiterry</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </footer>
    );
};

export default Footer;
