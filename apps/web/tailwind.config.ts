import type { Config } from "tailwindcss";

const config: Config = {
  // dark mode is default (data-theme="dark"), light mode is the override
  darkMode: ["selector", '[data-theme="dark"]'],

  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      colors: {
        // ── Surfaces ─────────────────────────────────────────
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        subtle: "var(--bg-subtle)",

        // ── Text ─────────────────────────────────────────────
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",

        // ── Accents ──────────────────────────────────────────
        accent: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          dim: "var(--accent-dim)",
          glow: "var(--accent-glow)",
        },
        teal: {
          DEFAULT: "var(--teal)",
          hover: "var(--teal-hover)",
          dim: "var(--teal-dim)",
        },
        ai: {
          DEFAULT: "var(--ai-primary)",
          dim: "var(--ai-dim)",
          glow: "var(--ai-glow)",
        },

        // ── Lorcan brand ──────────────────────────────────────
        lorcan: {
          DEFAULT: "var(--lorcan-teal)",
          dark: "var(--lorcan-dark)",
        },

        // ── Brand palette (sidebar + auth panel) ─────────────
        brand: {
          950: "#020D0D",
          900: "#061212",
          800: "#0A1A1A",
          750: "#0D2424",
          700: "#147878",
          600: "#1A8A8A",
          500: "#1A9494",
          400: "#78AAAE",
          300: "#9EC4C7",
          200: "#B8D8DA",
          100: "#D9ECED",
          50: "#F0F8F8",
        },

        // ── Top-level aliases so border-default/glass/default work ──
        default: "var(--border-default)",
        glass: "var(--border-glass)",

        // ── Borders ───────────────────────────────────────────
        border: {
          DEFAULT: "var(--border-default)",
          subtle: "var(--border-subtle)",
          accent: "var(--border-accent)",
          glass: "var(--border-glass)",
        },

        // ── Semantic ──────────────────────────────────────────
        success: "var(--state-success)",
        warning: "var(--state-warning)",
        error: "var(--state-error)",
      },

      // ── Fonts ─────────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["GeistMono", "JetBrains Mono", "monospace"],
      },

      // ── Border radius ─────────────────────────────────────────
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.625rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },

      // ── Box shadows ───────────────────────────────────────────
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)",
        "card-hover":
          "0 8px 24px rgba(14,165,233,0.15), 0 0 0 1px rgba(14,165,233,0.15)",
        "glow-sm": "0 0 12px var(--accent-glow)",
        glow: "0 0 24px var(--accent-glow)",
        "glow-lg": "0 0 48px var(--accent-glow)",
        "glow-teal": "0 0 32px rgba(20,184,166,0.5), 0 0 60px rgba(20,184,166,0.2)",
        "glow-ai": "0 0 24px var(--ai-glow)",
        glass:
          "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
      },

      // ── Animations ────────────────────────────────────────────
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "bounce-soft": {
          "0%, 100%": {
            transform: "translateY(0)",
            animationTimingFunction: "cubic-bezier(0.8,0,1,1)",
          },
          "50%": {
            transform: "translateY(-6px)",
            animationTimingFunction: "cubic-bezier(0,0,0.2,1)",
          },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--accent-glow)" },
          "50%": { boxShadow: "0 0 24px 4px var(--accent-glow)" },
        },
        "word-reveal": {
          "0%": { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0%)" },
        },
        "gradient-shift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },

      animation: {
        float: "float 4s ease-in-out infinite",
        "bounce-soft": "bounce-soft 2s ease-in-out infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.4,0,0.2,1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        shimmer: "shimmer 1.5s infinite linear",
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
        "gradient-shift": "gradient-shift 15s ease infinite",
        "scale-in": "scale-in 0.25s cubic-bezier(0.4,0,0.2,1)",
        "slide-right": "slide-right 0.3s cubic-bezier(0.4,0,0.2,1)",
      },

      // ── Backdrop blur ─────────────────────────────────────────
      backdropBlur: {
        xs: "2px",
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
