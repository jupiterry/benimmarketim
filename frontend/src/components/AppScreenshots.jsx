import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Görseller frontend/public/app-ekranlari içinde durur (600×1298, telefon ekranı oranı).
// Yeni ekran eklemek için aynı orandaki görseli klasöre koyup buraya bir satır eklemek yeterli.
const screenshots = [
  {
    src: "/app-ekranlari/ana-sayfa.webp",
    alt: "Benim Marketim uygulamasının ana sayfası: arama, kampanya görseli ve kategoriler",
  },
  {
    src: "/app-ekranlari/kategori.webp",
    alt: "Kategori ekranı: ürün kartları, fiyatlar ve sepete ekleme düğmeleri",
  },
  {
    src: "/app-ekranlari/urun-detayi.webp",
    alt: "Ürün detayı ekranı: ürün görseli, fiyat ve sepete ekle düğmesi",
  },
  {
    src: "/app-ekranlari/favoriler.webp",
    alt: "Favorilerim ekranı: kaydedilen ürünler",
  },
  {
    src: "/app-ekranlari/sepet.webp",
    alt: "Sepet ekranı: ürünler, kupon ve siparişi tamamla düğmesi",
  },
  {
    src: "/app-ekranlari/hesabim.webp",
    alt: "Hesabım ekranı: siparişler, favoriler, destek ve mağaza bilgileri",
  },
];

// Otomatik kaydırma: her adımda bir kart ilerler, sona gelince geri yöne döner.
const AUTOPLAY_INTERVAL_MS = 3200;
// Kullanıcı elle kaydırdıktan sonra otomatik kaydırmanın bekleyeceği süre.
const AUTOPLAY_RESUME_DELAY_MS = 6000;

export default function AppScreenshots() {
  const trackRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const directionRef = useRef(1);
  const pauseRef = useRef({ hover: false, focus: false, offscreen: true, until: 0 });

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const start = track.scrollLeft <= 4;
    const end = track.scrollLeft >= max - 4;
    setEdges((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    updateEdges();
    track.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      track.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [updateEdges]);

  // Bir kart + aradaki boşluk kadar kaydırır; hizalamayı scroll-snap tamamlar.
  const scrollByCard = useCallback((direction) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("li");
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  }, []);

  const holdAutoplay = useCallback(() => {
    pauseRef.current.until = Date.now() + AUTOPLAY_RESUME_DELAY_MS;
  }, []);

  // Görseller kendiliğinden sağa, sona gelince sola kayar. Fare üstündeyken,
  // klavye odağı şeritteyken, bölüm ekranda değilken, sekme arka plandayken
  // ve "hareketi azalt" tercihi açıkken durur.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const pause = pauseRef.current;

    let observer;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        ([entry]) => {
          pause.offscreen = !entry.isIntersecting;
        },
        { threshold: 0.35 }
      );
      observer.observe(track);
    } else {
      pause.offscreen = false;
    }

    const onEnter = () => { pause.hover = true; };
    const onLeave = () => { pause.hover = false; };
    const onFocusIn = () => { pause.focus = true; };
    const onFocusOut = () => { pause.focus = false; };
    track.addEventListener("pointerenter", onEnter);
    track.addEventListener("pointerleave", onLeave);
    track.addEventListener("focusin", onFocusIn);
    track.addEventListener("focusout", onFocusOut);
    // Dokunma, tekerlek veya sürükleme ile elle kaydırma otomatik akışı bir süre bekletir.
    track.addEventListener("pointerdown", holdAutoplay, { passive: true });
    track.addEventListener("wheel", holdAutoplay, { passive: true });
    track.addEventListener("touchstart", holdAutoplay, { passive: true });

    const timer = window.setInterval(() => {
      if (
        reduceMotion?.matches ||
        document.hidden ||
        pause.hover ||
        pause.focus ||
        pause.offscreen ||
        Date.now() < pause.until
      ) {
        return;
      }
      const max = track.scrollWidth - track.clientWidth;
      if (max <= 4) return; // Tüm kartlar zaten görünüyor.
      if (track.scrollLeft >= max - 4) directionRef.current = -1;
      else if (track.scrollLeft <= 4) directionRef.current = 1;
      scrollByCard(directionRef.current);
    }, AUTOPLAY_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
      track.removeEventListener("pointerenter", onEnter);
      track.removeEventListener("pointerleave", onLeave);
      track.removeEventListener("focusin", onFocusIn);
      track.removeEventListener("focusout", onFocusOut);
      track.removeEventListener("pointerdown", holdAutoplay);
      track.removeEventListener("wheel", holdAutoplay);
      track.removeEventListener("touchstart", holdAutoplay);
    };
  }, [holdAutoplay, scrollByCard]);

  const handleNavClick = (direction) => {
    holdAutoplay();
    directionRef.current = direction;
    scrollByCard(direction);
  };

  return (
    <section
      className="landing-shots"
      id="uygulama-ekranlari"
      aria-labelledby="landing-shots-title"
    >
      <div className="landing-shell landing-shots-head">
        <div>
          <span className="landing-eyebrow">UYGULAMADAN GÖRÜNTÜLER</span>
          <h2 id="landing-shots-title">
            Önce bir göz at.
            <br />
            <span>Sonra cebine indir.</span>
          </h2>
        </div>
        <div className="landing-shots-nav">
          <button
            type="button"
            onClick={() => handleNavClick(-1)}
            disabled={edges.start}
            aria-label="Önceki ekran görüntüleri"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => handleNavClick(1)}
            disabled={edges.end}
            aria-label="Sonraki ekran görüntüleri"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ul
        className="landing-shots-track"
        ref={trackRef}
        tabIndex={0}
        aria-label="Uygulama ekran görüntüleri, yatay kaydırılabilir"
      >
        {screenshots.map(({ src, alt }) => (
          <li key={src}>
            <img
              src={src}
              alt={alt}
              width="600"
              height="1298"
              loading="lazy"
              decoding="async"
              draggable="false"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
