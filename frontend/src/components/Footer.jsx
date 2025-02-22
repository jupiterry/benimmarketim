const Footer = () => {
    return (
        <footer className="bg-gray-800 border-t border-gray-700 mt-auto py-4">
            <div className="container mx-auto px-4 text-center">
                {/* Telif hakkı */}
                <p className="text-gray-400 text-sm">
                    © 2025 Benim Marketim. Tüm hakları saklıdır.
                </p>
                {/* Slogan */}
                <p className="text-xs text-gray-500 mt-1">
                    🛒 Taze ürünler, hızlı teslimat, kaliteli hizmet!
                </p>
                {/* 🔥 Sadece "with Jupiterry" yazısı (link kaldırıldı) */}
                <p className="text-xs text-gray-500 mt-2">
                    with{" "}
                    <span className="text-emerald-400">jupiterry</span>  {/* 🔥 Link kaldırıldı */}
                </p>
            </div>
        </footer>
    );
};

export default Footer;
