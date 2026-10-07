// Build-time renderer used by scripts/prerender.mjs (vite build --ssr).
import { renderToString } from "react-dom/server";
import App from "./App";
import seed from "./data/catalog.fallback.json";
import { pick, seedToCatalog, stats } from "./lib/catalog";
import type { Lang, Seed } from "./lib/types";

export const catalog = seedToCatalog(seed as Seed);

export function render(lang: Lang): string {
  return renderToString(<App lang={lang} initial={catalog} />);
}

export function pageMeta(lang: Lang, appSlug?: string) {
  const s = stats(catalog);
  const base = lang === "vi"
    ? {
        title: "Port & Logistics AI — Phần mềm AI cho cảng biển và logistics",
        description: `Nền tảng số thực hành logistics và vận hành cảng biển với công cụ AI và mô phỏng hệ thống: ${s.apps} ứng dụng web miễn phí, tài liệu hướng dẫn, clip demo và khoá học.`,
      }
    : {
        title: "Port & Logistics AI — AI software for seaports and logistics",
        description: `A digital platform for hands-on logistics and seaport operations practice with AI tools and system simulation: ${s.apps} free web apps, user guides, demo clips and courses.`,
      };
  if (!appSlug) return base;
  for (const g of catalog.groups) {
    const a = g.apps.find((x) => x.slug === appSlug);
    if (a) {
      return {
        title: `${a.name} | Port & Logistics AI`,
        description: `${pick(a, "desc", lang).replace(/\.$/, "")} — ${pick(g, "name", lang)}. ${lang === "vi" ? "Miễn phí trên" : "Free at"} ${a.host}.`,
      };
    }
  }
  return base;
}

export function appSlugs(): string[] {
  return catalog.groups.flatMap((g) => g.apps.map((a) => a.slug));
}

export function jsonLd(lang: Lang, siteUrl: string): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite", "@id": `${siteUrl}/#website`, url: `${siteUrl}/`, name: "Port & Logistics AI",
        inLanguage: lang === "vi" ? "vi-VN" : "en",
      },
      {
        "@type": "Person", "@id": `${siteUrl}/#author`, name: "Nguyen Minh Quy",
        sameAs: catalog.links.map((l) => l.url),
      },
      {
        "@type": "ItemList", name: lang === "vi" ? "Danh mục phần mềm" : "Software catalogue",
        itemListElement: catalog.groups.flatMap((g) => g.apps).map((a, i) => ({
          "@type": "ListItem", position: i + 1,
          item: {
            "@type": "SoftwareApplication", name: a.name, url: a.url, applicationCategory: "BusinessApplication",
            operatingSystem: "Web", description: pick(a, "desc", lang),
            offers: { "@type": "Offer", price: "0", priceCurrency: "VND" },
            author: { "@id": `${siteUrl}/#author` },
          },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
