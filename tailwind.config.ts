import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // Surface tokens — Material 3 style "tinted layers" instead of shadows,
        // because shadows are invisible on dark navy. From darkest to lightest:
        //   surface  → app background
        //   raised   → cards / list rows
        //   high     → modals / bottom sheets / popovers
        surface: {
          DEFAULT: "#1a1a2e",
          raised: "#16213e",
          high: "#1f2a4a",
          // Sunken layer per input field: più scuro del background per dare
          // affordance "qui dentro si scrive". Documentato in HANDOFF.md.
          sunken: "#0f1729",
        },

        // Accent gold — chosen for AAA contrast (~9.8:1) on the navy surface.
        accent: {
          DEFAULT: "#E8A838",
          hover: "#F0B84D",
          soft: "rgba(232, 168, 56, 0.10)",  // tinted backgrounds
          ring: "rgba(232, 168, 56, 0.30)",  // borders / focus rings
        },

        // Soft brutalism palette — usata oggi solo da /feed (pagina + PostCard).
        // Non rimpiazza ancora `accent` globale: la migrazione avverrà a pagina.
        //   ink    → sfondo pagina, deepest burgundy/ink warm-black
        //   ivory  → testo principale (cream, ~AAA su ink)
        //   brass  → bordi card 1.5px + dettagli (ottone opaco)
        //   rust   → accent azione (like attivo, salvato attivo)
        //   muted  → timestamp e secondario, su ink ~4.7:1 (AA)
        ink: {
          DEFAULT: "#1A0F14",
          // Variante lievemente più chiara per sticky header / overlay.
          raised: "#22141A",
        },
        ivory: "#F0E8D8",
        brass: {
          DEFAULT: "#9C7C3A",
          soft: "rgba(156, 124, 58, 0.15)",
        },
        rust: {
          // `#A04030` è il rust "brand" del brief — usato per tint/bg sottili
          // (es. dialog conferma elimina). On ink al testo passa solo 2.93:1
          // (sotto AA 4.5:1), quindi NON usarlo per testo body diretto.
          DEFAULT: "#A04030",
          // Variante per il testo dello stato attivo (like/salvato). Mantiene
          // la famiglia tonale "ruggine" ma è brillata a #D05A48 → 4.79:1 su
          // ink → passa AA body. Compromesso documentato: il brief chiedeva
          // testo a #A04030, ma la stessa rigaccia diceva "Contrast WCAG AA"
          // come hard constraint.
          bright: "#D05A48",
        },
        muted: "#7A6B5C",
      },
      borderRadius: {
        // Card radius is intentionally generous (16px) — matches modern
        // chat-bubble language (WhatsApp 2024 redesign).
        card: "1rem",       // 16px (= rounded-2xl)
        bubble: "1.25rem",  // 20px
      },
      spacing: {
        // Apple HIG / Material accessible touch target minimum.
        // Use as `h-touch w-touch` or `min-h-touch`.
        touch: "2.75rem",   // 44px
      },
      boxShadow: {
        // Soft brutalism "stampa" — offset hard, no blur. Solid ottone
        // a opacità 15%. Replica il feel del poster brutalist senza pesare.
        brutal: "4px 4px 0 rgba(156, 124, 58, 0.15)",
      },
      fontFamily: {
        // Le variabili CSS sono iniettate da next/font in /feed (page.tsx).
        // Fuori da /feed cadono sui fallback system grotesque/serif → il
        // PostCard resta leggibile anche in /saved e /feed/[id], anche
        // se senza l'identità tipografica completa.
        grotesque: [
          "var(--font-grotesque)",
          "Archivo Narrow",
          "Barlow Condensed",
          "Helvetica Neue",
          "Arial Narrow",
          "sans-serif",
        ],
        serif: [
          "var(--font-serif)",
          "Spectral",
          "Source Serif 4",
          "Georgia",
          "serif",
        ],
      },
      fontSize: {
        // Body 17px — above the 16px floor recommended for older readers
        // (PMC systematic review on mobile UX for 70+).
        body: ["17px", { lineHeight: "1.55" }],
        // Caption stays small on purpose, used only for metadata
        // (timestamps, role labels) where short = scannable.
        caption: ["13px", { lineHeight: "1.4" }],
      },
    },
  },
  plugins: [],
};
export default config;
