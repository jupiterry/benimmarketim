/* global Intl */
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Clock, Search, Shuffle, X } from "lucide-react";
import axios from "../../lib/axios";
import "../../styles/push-library.css";

const AUDIENCE_LABELS = { all: "Tüm müşteriler", cart: "Sepeti dolu", active30: "Düzenli müşteri", inactive30: "30 gündür yok", noOrder: "Hiç sipariş yok" };
const PAGE = 9;

// İstanbul saatine göre anın etiketleri
const momentTags = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false, weekday: "short" })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const day = parts.weekday;
  const tags = new Set();
  if (hour >= 5 && hour < 11) tags.add("morning");
  else if (hour >= 11 && hour < 14) tags.add("noon");
  else if (hour >= 14 && hour < 17) tags.add("afternoon");
  else if (hour >= 17 && hour < 22) tags.add("evening");
  else tags.add("night");
  if (day === "Sat" || day === "Sun") tags.add("weekend");
  else tags.add("weekday");
  if (day === "Mon") tags.add("monday");
  if (day === "Fri") tags.add("friday");
  return tags;
};

// Basit tohumlu karıştırma
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const fold = (s) => String(s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/** Bir temadan (ya da filtrelenmiş başlık/mesajlardan) benzersiz bildirim çiftleri üretir */
const buildPairs = (themes, { query, seed, exclude, count }) => {
  const q = fold(query.trim());
  const pools = themes.map((theme) => {
    if (!q) return { theme, titles: theme.titles, bodies: theme.bodies };
    const titles = theme.titles.filter((t) => fold(t).includes(q));
    const bodies = theme.bodies.filter((b) => fold(b).includes(q));
    const labelHit = fold(theme.label).includes(q) || theme.keywords.some((k) => fold(k).includes(q));
    if (!titles.length && !bodies.length && !labelHit) return null;
    return { theme, titles: titles.length ? titles : theme.titles, bodies: bodies.length ? bodies : theme.bodies };
  }).filter(Boolean);
  const random = seeded(seed);
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < count && pools.length && guard < count * 40) {
    guard += 1;
    const pool = pools[out.length % pools.length];
    const title = pool.titles[Math.floor(random() * pool.titles.length)];
    const body = pool.bodies[Math.floor(random() * pool.bodies.length)];
    const key = `${title}|${body}`;
    if (seen.has(key) || exclude.has(title)) continue;
    seen.add(key);
    out.push({ key, title, body, theme: pool.theme });
  }
  return { pairs: out, total: pools.reduce((sum, p) => sum + p.titles.length * p.bodies.length, 0) };
};

/**
 * Hazır bildirim kütüphanesi: anın temasına uygun öneriler, tema filtreleri ve arama.
 * Bir karta dokununca başlık, mesaj, açılacak ekran ve önerilen kitle forma dolar.
 */
export default function PushLibrary({ onPick, sentTitles = [] }) {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState("");
  const [themeId, setThemeId] = useState("now");
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));

  useEffect(() => {
    axios.get("/notifications/broadcasts/library")
      .then(({ data }) => setLibrary(data))
      .catch(() => setError("Bildirim kütüphanesi yüklenemedi"));
  }, []);

  const tags = useMemo(() => momentTags(), []);
  const themes = useMemo(() => library?.themes || [], [library]);
  const nowThemes = useMemo(() => {
    const timed = themes.filter((t) => t.times.some((tag) => tags.has(tag)));
    const evergreen = themes.filter((t) => t.times.includes("any") && !timed.includes(t));
    return [...timed, ...evergreen.slice(0, 4)];
  }, [themes, tags]);
  const exclude = useMemo(() => new Set(sentTitles), [sentTitles]);

  const activeThemes = query.trim()
    ? themes
    : themeId === "now" ? nowThemes : themes.filter((t) => t.id === themeId);
  const { pairs, total } = useMemo(
    () => buildPairs(activeThemes, { query, seed, exclude, count: PAGE }),
    [activeThemes, query, seed, exclude],
  );

  if (error) return <p className="ui-banner ui-banner--danger">{error}</p>;
  if (!library) return <div className="plib-skeleton">{[0, 1, 2].map((i) => <div key={i} className="ui-skeleton" />)}</div>;

  return (
    <section className="ui-panel plib" aria-labelledby="plib-title">
      <div className="plib-head">
        <span className="plib-badge"><BookOpen /></span>
        <div>
          <h2 id="plib-title">Hazır bildirim kütüphanesi</h2>
          <p>{library.size.toLocaleString("tr-TR")} hazır bildirim · {themes.length} tema. Birine dokun, forma dolsun; göndermeden önce düzenleyebilirsin.</p>
        </div>
      </div>

      <div className="plib-toolbar">
        <div className="ui-search plib-search">
          <Search aria-hidden="true" />
          <input className="ui-field" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Ara: kahve, sınav, yağmur, sepet…" aria-label="Kütüphanede ara" />
        </div>
        <button type="button" className="ui-btn" onClick={() => setSeed((s) => s + 7919)} title="Başka öneriler göster">
          <Shuffle />Karıştır
        </button>
      </div>

      <div className="plib-themes" role="group" aria-label="Temalar">
        <button type="button" aria-pressed={themeId === "now" && !query} onClick={() => { setThemeId("now"); setQuery(""); }}>
          <Clock />Şu an için
        </button>
        {themes.map((theme) => (
          <button key={theme.id} type="button" aria-pressed={themeId === theme.id && !query} onClick={() => { setThemeId(theme.id); setQuery(""); }}>
            <span aria-hidden="true">{theme.emoji}</span>{theme.label}
          </button>
        ))}
        {query && <button type="button" className="plib-clear" onClick={() => setQuery("")}><X />Aramayı temizle</button>}
      </div>

      {pairs.length === 0 ? (
        <p className="ui-muted ui-text-sm">Bu aramaya uyan hazır bildirim yok. Yapay zekâya anlatmayı dene.</p>
      ) : (
        <>
          <div className="plib-grid">
            {pairs.map((pair) => (
              <button key={pair.key} type="button" className="plib-card" onClick={() => onPick(pair)}>
                <span className="plib-card-theme">{pair.theme.emoji} {pair.theme.label}</span>
                <strong>{pair.title}</strong>
                <span className="plib-card-body">{pair.body}</span>
                <span className="plib-card-meta">{AUDIENCE_LABELS[pair.theme.audience] || "Tüm müşteriler"}</span>
              </button>
            ))}
          </div>
          <p className="plib-foot">
            Bu seçimde {total.toLocaleString("tr-TR")} bildirim var · daha önce gönderilen başlıklar gösterilmez
          </p>
        </>
      )}
    </section>
  );
}
