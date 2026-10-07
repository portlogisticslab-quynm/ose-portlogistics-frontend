/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./admin/index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep harbour navy — hero, footer, primary text
        ink: { DEFAULT: "#0B1F33", 950: "#06121F", 900: "#0B1F33", 800: "#12304D", 700: "#1C4469", 600: "#2A5B87" },
        // Safety orange of quay cranes — single accent, used sparingly
        signal: { DEFAULT: "#F26A1B", 600: "#D9570C", 100: "#FDE9DC" },
        // Sonar / data cyan — charts, focus, live states
        sonar: { DEFAULT: "#17A9BF", 300: "#7FD8E6", 100: "#DDF4F8" },
        paper: "#F4F6F8",
        line: "#DDE3EA",
        mute: "#5B6B7C",
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      maxWidth: { page: "76rem" },
      boxShadow: {
        card: "0 1px 0 rgba(11,31,51,.04), 0 1px 3px rgba(11,31,51,.06)",
        lift: "0 10px 30px -12px rgba(11,31,51,.25)",
      },
      keyframes: {
        sweep: { "0%": { strokeDashoffset: "0" }, "100%": { strokeDashoffset: "-200" } },
        blink: { "0%,100%": { opacity: ".25" }, "50%": { opacity: "1" } },
      },
      animation: {
        sweep: "sweep 9s linear infinite",
        blink: "blink 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
