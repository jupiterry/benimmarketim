import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { HelmetProvider } from "react-helmet-async";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import CategoryLandingPage from "./pages/CategoryLandingPage";

export function renderSeoPage(url, category) {
  const context = {};
  const body = renderToString(
    <HelmetProvider context={context}>
      <StaticRouter location={url}>
        <Navbar />
        {category ? <CategoryLandingPage category={category} /> : <HomePage />}
        <Footer />
      </StaticRouter>
    </HelmetProvider>,
  );
  const { helmet } = context;
  return { body, head: [helmet.title, helmet.meta, helmet.link, helmet.script].map((part) => part.toString()).join("\n") };
}
