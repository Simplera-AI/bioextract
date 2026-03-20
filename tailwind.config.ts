import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-figtree)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50:  "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
          950: "#042f2e",
        },
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "200% center" },
          "100%": { backgroundPosition: "-200% center" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          from: { opacity: "0", transform: "translateX(-6px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        blobFloat: {
          "0%, 100%": { transform: "translate(0px, 0px) scale(1)" },
          "33%":      { transform: "translate(30px, -50px) scale(1.1)" },
          "66%":      { transform: "translate(-20px, 20px) scale(0.9)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.7", boxShadow: "0 0 20px 4px rgba(20,184,166,0.3)" },
          "50%":      { opacity: "1",   boxShadow: "0 0 50px 16px rgba(20,184,166,0.6)" },
        },
        orbBreath: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%":      { transform: "scale(1.1)", opacity: "1" },
        },
      },
      animation: {
        shimmer:       "shimmer 1.8s ease-in-out infinite",
        "fade-in":     "fadeIn 0.25s ease-out",
        "slide-in":    "slideIn 0.2s ease-out",
        "blob-float":  "blobFloat 8s ease-in-out infinite",
        "blob-float2": "blobFloat 11s ease-in-out infinite reverse",
        "blob-float3": "blobFloat 14s ease-in-out infinite 2s",
        "glow-pulse":  "glowPulse 2.5s ease-in-out infinite",
        "orb-breath":  "orbBreath 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
