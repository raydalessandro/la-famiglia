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
