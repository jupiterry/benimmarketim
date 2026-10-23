import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { HelmetProvider } from "react-helmet-async";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import DeliveryZonesPage from "./DeliveryZonesPage";

// Ön oluşturma (scripts/prerender-seo.mjs) için Teslimat bölgeleri sayfasının ilk HTML'i.
// initialData: derleme anında GET /api/delivery/zones'tan alınabildiyse bölgeler; alınamadıysa null
// (sayfa "yükleniyor" metniyle çıkar, tarayıcıda liste canlı yüklenir).
export function renderDeliveryZonesSeo(url, initialData = null) {
  const context = {};
  const body = renderToString(
    <HelmetProvider context={context}>
      <StaticRouter location={url}>
        <Navbar />
        <DeliveryZonesPage initialData={initialData} />
        <Footer />
      </StaticRouter>
    </HelmetProvider>,
  );
  const { helmet } = context;
  return { body, head: [helmet.title, helmet.meta, helmet.link, helmet.script].map((part) => part.toString()).join("\n") };
}
