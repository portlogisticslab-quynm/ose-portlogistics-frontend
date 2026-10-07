import { useEffect, useState } from "react";
import type { Lang } from "../lib/types";
import { homePath, t, type Key } from "../lib/i18n";
import { IconClose, IconMenu, IconShield, Logo } from "./Icons";

const NAV: Array<[string, Key]> = [
  ["software", "nav.software"],
  ["guides", "nav.guides"],
  ["demo", "nav.demo"],
  ["courses", "nav.courses"],
  ["about", "nav.about"],
];

export default function Header({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const other: Lang = lang === "vi" ? "en" : "vi";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? "bg-ink-950/95 backdrop-blur border-b border-white/10" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-4 sm:px-6">
        <a href={homePath(lang)} className="flex items-center gap-2.5 text-white" aria-label="Port & Logistics AI">
          <Logo size={32} />
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight">Port &amp; Logistics AI</span>
            <span className="block font-mono text-[10.5px] uppercase tracking-[.14em] text-sonar-300">portlogistics.vn</span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map(([id, key]) => (
            <a key={id} href={`#${id}`} className="rounded-md px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white">
              {t(lang, key)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href={homePath(other)} hrefLang={other} lang={other}
            className="rounded-md border border-white/20 px-2.5 py-1.5 font-mono text-xs font-medium text-white/90 transition hover:border-white/50 hover:text-white"
            title={t(lang, "nav.lang")}>
            {other.toUpperCase()}
          </a>
          <a href="/admin/" rel="nofollow"
            className="hidden items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20 sm:inline-flex">
            <IconShield size={16} /> {t(lang, "nav.admin")}
          </a>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav"
            className="rounded-md p-2 text-white hover:bg-white/10 lg:hidden" aria-label={t(lang, "nav.menu")}>
            {open ? <IconClose size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-white/10 px-4 pb-4 lg:hidden" aria-label="Mobile">
          {NAV.map(([id, key]) => (
            <a key={id} href={`#${id}`} onClick={() => setOpen(false)}
              className="block border-b border-white/5 py-3 text-base text-white/90">
              {t(lang, key)}
            </a>
          ))}
          <a href="/admin/" rel="nofollow" className="mt-3 inline-flex items-center gap-2 text-sm text-sonar-300">
            <IconShield size={16} /> {t(lang, "nav.admin")}
          </a>
        </nav>
      )}
    </header>
  );
}
