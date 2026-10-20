import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // Hedef öğe tembel yüklenen sayfada bir sonraki çizimde oluşur; bir tık bekle.
      const id = window.setTimeout(() => {
        let target = null;
        try {
          target = document.getElementById(decodeURIComponent(hash.slice(1)));
        } catch {
          target = null;
        }
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      }, 0);
      return () => window.clearTimeout(id);
    }

    window.scrollTo({
      top: 0,
      behavior: "instant" // Anlık kaydırma için
    });
    return undefined;
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
