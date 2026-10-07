import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/index.css";
import App from "./App";
import seed from "./data/catalog.fallback.json";
import { seedToCatalog } from "./lib/catalog";
import type { Lang, Seed } from "./lib/types";

// Language comes from the URL (/en/…), not only from <html lang>: the dev server and any
// fallback route serve the Vietnamese template for /en/ paths too.
const lang: Lang = /^\/en(\/|$)/.test(window.location.pathname) ? "en" : "vi";
const htmlLang = document.documentElement.lang;
document.documentElement.lang = lang;
const initial = seedToCatalog(seed as Seed);
const root = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <App lang={lang} initial={initial} />
  </StrictMode>
);

// Prerendered pages are hydrated; `npm run dev` (empty root) renders from scratch.
// If the server sent the other language's HTML (a fallback route), render fresh instead.
if (root.hasChildNodes() && htmlLang === lang) hydrateRoot(root, tree);
else { root.innerHTML = ""; createRoot(root).render(tree); }
