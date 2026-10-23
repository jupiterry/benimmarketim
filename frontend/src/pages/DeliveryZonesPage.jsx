import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { MapPin, Truck, Smartphone, Info, RefreshCw, ArrowUpRight } from "lucide-react";
import LegalLayout from "../components/LegalLayout";
import axios from "../lib/axios";
import { useSettingsStore } from "../stores/useSettingsStore";
import { deliveryZonesPage, siteUrl } from "../data/seo";
import { appStores } from "../data/company";

const sections = [
  { id: "acik-bolgeler", label: "Açık teslimat bölgeleri" },
  { id: "nasil-calisir", label: "Teslimat nasıl çalışır?" },
];

const TYPE_LABELS = { yurt: "Yurt", mahalle: "Mahalle", koy: "Köy" };

const lira = (value) => `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;
const isAmount = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

// Bir bölgenin müşteriye gösterilen satırları; yalnızca panelde girilen değerler yazılır.
const zoneLines = (zone, { freeEverywhere, generalMinimum }) => {
  const fee = Number(zone.deliveryFee) || 0;
  const free = freeEverywhere || zone.isFree === true || fee === 0;
  const lines = [];
  if (!free && isAmount(zone.freeDeliveryThreshold)) {
    lines.push(`${lira(zone.freeDeliveryThreshold)} ve üstü siparişlerde ücretsiz`);
  }
  const minimum = isAmount(zone.minimumOrderAmount) ? Number(zone.minimumOrderAmount) : (isAmount(generalMinimum) ? Number(generalMinimum) : null);
  if (minimum !== null) lines.push(minimum > 0 ? `Minimum sepet ${lira(minimum)}` : "Minimum sepet tutarı yok");
  if (zone.etaText) lines.push(`Tahmini teslimat: ${zone.etaText}`);
  return { free, fee, lines };
};

/**
 * Teslimat bölgeleri: GET /api/delivery/zones'tan açık bölgeleri listeler.
 * initialData (yalnızca ön oluşturmada): { zones, freeDeliveryEverywhere } — tarayıcıda liste yine canlı alınır.
 */
const DeliveryZonesPage = ({ initialData = null }) => {
  const storeMinimum = useSettingsStore((state) => state.settings?.minimumOrderAmount);
  // Bölgede minimum girilmemişse genel minimum geçerlidir. Ön oluşturmada (sunucu) mağaza ayarı
  // henüz yüklenmediği için yalnızca betiğin getirdiği değer kullanılır; tahmin yazılmaz.
  const generalMinimum = typeof window === "undefined" ? (initialData?.generalMinimum ?? null) : storeMinimum;
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState(initialData ? "ready" : "loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { data: body } = await axios.get("/delivery/zones");
      setData({ zones: Array.isArray(body?.zones) ? body.zones : [], freeDeliveryEverywhere: Boolean(body?.freeDeliveryEverywhere) });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const zones = data?.zones || [];
  const freeEverywhere = Boolean(data?.freeDeliveryEverywhere);
  const canonical = `${siteUrl}${deliveryZonesPage.path}`;

  return (
    <>
      <Helmet>
        <title>{deliveryZonesPage.title}</title>
        <meta name="description" content={deliveryZonesPage.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={deliveryZonesPage.title} />
        <meta property="og:description" content={deliveryZonesPage.description} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:title" content={deliveryZonesPage.title} />
        <meta name="twitter:description" content={deliveryZonesPage.description} />
      </Helmet>

      <LegalLayout
        title="Teslimat bölgeleri"
        subtitle="Devrek, Zonguldak"
        description="Siparişlerini aşağıda listelenen bölgelerde kapına kadar getiriyoruz. Bölgeler, teslimat ücretleri ve minimum sepet tutarları güncel olarak burada görünür."
        icon={MapPin}
        toc={sections}
        docs={false}
      >
        <section id="acik-bolgeler" className="legal-section" aria-busy={status === "loading"}>
          <div className="legal-section-head">
            <MapPin className="legal-icon" aria-hidden="true" />
            <h2>Açık teslimat bölgeleri</h2>
          </div>

          {freeEverywhere && status !== "error" && (
            <div className="legal-card legal-card--row" style={{ marginBottom: 12 }}>
              <Truck className="legal-icon" aria-hidden="true" />
              <p className="legal-strong">Şu anda tüm teslimat bölgelerinde teslimat ücretsiz.</p>
            </div>
          )}

          {status === "loading" && !zones.length && (
            <div className="legal-grid" role="status">
              {[0, 1].map((key) => (
                <div key={key} className="legal-card">
                  <p className="legal-text legal-text--sm">Güncel bölge listesi yükleniyor…</p>
                </div>
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="legal-card">
              <p className="legal-text">Bölge listesi şu anda yüklenemedi. Açık bölgeleri Benim Marketim uygulamasında da görebilirsin.</p>
              <button type="button" className="legal-btn legal-btn--ghost" style={{ marginTop: 12 }} onClick={load}>
                <RefreshCw aria-hidden="true" />
                Tekrar dene
              </button>
            </div>
          )}

          {status === "ready" && !zones.length && (
            <div className="legal-card">
              <p className="legal-text">Şu anda açık teslimat bölgesi bulunmuyor. Bölgeler açıldığında bu sayfada ve uygulamada görünür.</p>
            </div>
          )}

          {zones.length > 0 && status !== "error" && (
            <ul className="legal-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {zones.map((zone) => {
                const { free, fee, lines } = zoneLines(zone, { freeEverywhere, generalMinimum });
                return (
                  <li key={zone.id || zone._id || zone.name} className="legal-card">
                    <div className="legal-card-head">
                      <MapPin aria-hidden="true" />
                      <h3 className="legal-card-title">{zone.name}</h3>
                    </div>
                    {TYPE_LABELS[zone.type] && <p className="legal-text legal-text--sm">{TYPE_LABELS[zone.type]}</p>}
                    <p className="legal-strong" style={{ marginTop: 8 }}>
                      {free ? "Ücretsiz teslimat" : `Teslimat ücreti ${lira(fee)}`}
                    </p>
                    {lines.length > 0 && (
                      <div className="legal-stack legal-stack--tight" style={{ marginTop: 8 }}>
                        {lines.map((line) => (
                          <div key={line} className="legal-item">
                            <div className="legal-dot" aria-hidden="true"></div>
                            <p className="legal-text legal-text--sm">{line}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="nasil-calisir" className="legal-section legal-section--note">
          <div className="legal-section-head">
            <Info className="legal-icon" aria-hidden="true" />
            <h2>Teslimat nasıl çalışır?</h2>
          </div>
          <div className="legal-stack legal-stack--tight">
            <div className="legal-item">
              <div className="legal-dot" aria-hidden="true"></div>
              <p className="legal-text">Siparişler yalnızca Benim Marketim mobil uygulamasından verilir; teslimat bölgeni uygulamada seçersin.</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot" aria-hidden="true"></div>
              <p className="legal-text">Teslimat ücreti bölgeye göre değişebilir. Ücret varsa, siparişi onaylamadan önce uygulamada sepet özetinde gösterilir.</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot" aria-hidden="true"></div>
              <p className="legal-text">Teslimat süresi yoğunluğa, hava ve yol durumuna göre değişebilir. Bir bölge geçici olarak kapanırsa uygulamada nedeniyle birlikte gösterilir.</p>
            </div>
            <div className="legal-item">
              <div className="legal-dot" aria-hidden="true"></div>
              <p className="legal-text">
                Bölgen listede yoksa henüz oraya teslimat yapamıyoruz. Talebini <Link className="legal-link" to="/contact">iletişim sayfasından</Link> bize iletebilirsin.
              </p>
            </div>
          </div>
          <div className="legal-grid legal-text--top">
            {appStores.map((store) => (
              <a key={store.id} className="legal-btn" href={store.url} target="_blank" rel="noopener noreferrer">
                <Smartphone aria-hidden="true" />
                {store.name}
                <ArrowUpRight aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      </LegalLayout>
    </>
  );
};

export default DeliveryZonesPage;
