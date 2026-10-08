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

export default function AppScreenshots() {
  const trackRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });

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
  const scrollByCard = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("li");
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
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
            onClick={() => scrollByCard(-1)}
            disabled={edges.start}
            aria-label="Önceki ekran görüntüleri"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
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
