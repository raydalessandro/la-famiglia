import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Lora wired through next/font/google in app/layout.tsx — used
        // for "La Famiglia" wordmark + page-title serif italic. Falls
        // back to Georgia (Tailwind default serif) if the variable is
        // unavailable, so SSR before font load doesn't crash.
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // Surface tokens — Material 3 style "tinted layers" instead of shadows,
        // because shadows are invisible on dark backgrounds. From darkest to
        // lightest:
        //   surface  → app background
        //   raised   → cards / list rows
        //   high     → modals / bottom sheets / popovers
        // NOTE: feed (`/feed`, `/feed/[id]`) overrides these with the cocoa
        //       palette below (`cocoa.*`, `cream`, `copper`). The legacy
        //       navy surface is preserved here because the rest of the app
        //       (chat, tasks, albums…) still depends on it; the cocoa
        //       migration is feed-only in this iteration.
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

        // Dark Warm Coffee palette — feed visual identity (PostCard + feed
        // pages). Mood: espresso bar serale, vinile sul giradischi. The
        // navy felt "tech monoschermo"; cocoa gives "casa". Contrast
        // verified vs WCAG AA on /feed:
        //   cream  on cocoa     → ~13.6:1   ✓ AA body & AAA large
        //   warm   on cocoa     → ~5.8:1    ✓ AA body
        //   copper on cocoa     → ~4.7:1    ✓ AA body (just above 4.5)
        //                                     SAFE as link / hover state.
        //   terracotta on cocoa → ~4.5:1    ✓ AA at the threshold,
        //                                     used for the active heart
        //                                     (icon, 24px → large-text rule
        //                                     also applies).
        //   copper on cocoa-raised (#2A2118) → ~4.4:1 — borderline AA,
        //                                     OK as accent on 16px+ but
        //                                     keep body text in cream.
        cocoa: {
          DEFAULT: "#1F1814",        // page bg
          raised: "#2A2118",         // post cards / raised sections
          border: "#3A2F26",         // 1px hairline on raised surfaces
        },
        cream: "#F5EBE0",            // primary text (warm, non-glaring)
        warm: "#A89B8E",              // secondary text / timestamp / count-row
        copper: {
          DEFAULT: "#D08B5C",         // links, hover, bookmark-active
          hover: "#DC9D72",
        },
        terracotta: "#E8654E",        // like-active fill + stroke
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
