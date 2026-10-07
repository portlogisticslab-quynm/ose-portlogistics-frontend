// Generates static, SEO-ready HTML after `vite build`:
//   dist/index.html            (vi)       dist/en/index.html            (en)
//   dist/apps/<slug>/index.html (vi)      dist/en/apps/<slug>/index.html (en)
// plus sitemap.xml and robots.txt. Each page carries its own <title>, description,
// canonical, hreflang, Open Graph / Twitter tags and JSON-LD, so links posted on
// Facebook, LinkedIn or Zalo show a proper preview card.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const SITE = (process.env.VITE_SITE_URL || process.env.SITE_URL || "https://portlogistics.ose.vn").replace(/\/$/, "");

const ssr = await import(pathToFileURL(resolve(root, "dist-ssr/entry-server.js")).href);
const template = readFileSync(resolve(dist, "index.html"), "utf-8");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pathFor = (lang, slug) => `${lang === "en" ? "/en" : ""}${slug ? `/apps/${slug}` : ""}/`;

function page(lang, slug) {
  const meta = ssr.pageMeta(lang, slug);
  const url = SITE + pathFor(lang, slug);
  const alt = (l) => SITE + pathFor(l, slug);
  const head = [
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="vi" href="${alt("vi")}" />`,
    `<link rel="alternate" hreflang="en" href="${alt("en")}" />`,
    `<link rel="alternate" hreflang="x-default" href="${alt("vi")}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Port &amp; Logistics AI" />`,
    `<meta property="og:locale" content="${lang === "vi" ? "vi_VN" : "en_US"}" />`,
    `<meta property="og:locale:alternate" content="${lang === "vi" ? "en_US" : "vi_VN"}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE}/og-image.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Port &amp; Logistics AI" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${SITE}/og-image.png" />`,
    slug ? "" : `<script type="application/ld+json">${ssr.jsonLd(lang, SITE)}</script>`,
  ].filter(Boolean).join("\n    ");

  return template
    // function replacers: rendered HTML may contain "$" sequences
    .replace('<html lang="vi">', () => `<html lang="${lang}">`)
    .replace(/<title>.*?<\/title>/s, () => `<title>${esc(meta.title)}</title>`)
    .replace("<!--head-meta-->", () => head)
    .replace("<!--app-html-->", () => ssr.render(lang));
}

function write(rel, html) {
  const file = resolve(dist, rel.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const slugs = ssr.appSlugs();
const urls = [];
for (const lang of ["vi", "en"]) {
  for (const slug of [undefined, ...slugs]) {
    const p = pathFor(lang, slug);
    write(p, page(lang, slug));
    urls.push(p);
  }
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(resolve(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><priority>${u === "/" ? "1.0" : u === "/en/" ? "0.9" : "0.6"}</priority></url>`).join("\n") +
  `\n</urlset>\n`);
writeFileSync(resolve(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${SITE}/sitemap.xml\n`);

rmSync(resolve(root, "dist-ssr"), { recursive: true, force: true });
console.log(`prerender: ${urls.length} pages, sitemap.xml, robots.txt -> ${SITE}`);
