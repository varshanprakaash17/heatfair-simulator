import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#F1F5F9",
          100: "#E2E8F0",
          200: "#C7D4E2",
          300: "#9DB1C7",
          400: "#6C89A6",
          500: "#4B6A89",
          600: "#365271",
          700: "#253F5C",
          800: "#17314D",
          900: "#0E2740",
          950: "#081B2E",
        },
        teal: {
          50: "#EDFCF8",
          100: "#D2F7ED",
          200: "#A8EEDD",
          300: "#71DFC8",
          400: "#38C8AE",
          500: "#14A88F",
          600: "#0C8774",
          700: "#0C6C5F",
          800: "#0D564D",
          900: "#0D4740",
        },
        heat: {
          50: "#FFF8EB",
          100: "#FEEDC7",
          200: "#FDD98A",
          300: "#FCC04D",
          400: "#F9A825",
          500: "#E8870A",
          600: "#C96A06",
          700: "#A04E09",
          800: "#833E0F",
          900: "#6E3410",
        },
        mist: {
          50: "#FBFCFE",
          100: "#F5F8FB",
          200: "#EDF2F7",
          300: "#E3EAF2",
        },
        ink: {
          DEFAULT: "#0F2338",
          soft: "#3B536B",
          muted: "#6B7F94",
        },
        line: "#E2E9F0",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.15rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,35,56,0.04), 0 12px 30px -18px rgba(15,35,56,0.18)",
        lift: "0 2px 6px rgba(15,35,56,0.05), 0 24px 60px -28px rgba(15,35,56,0.28)",
        glow: "0 0 0 1px rgba(20,168,143,0.18), 0 18px 40px -20px rgba(20,168,143,0.35)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.02)",
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(20,168,143,0.10), transparent 62%), radial-gradient(ellipse 60% 60% at 90% 10%, rgba(249,168,37,0.10), transparent 60%)",
        grid:
          "linear-gradient(to right, rgba(15,35,56,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,35,56,0.045) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        progress: {
          "0%": { transform: "translateX(-110%)" },
          "100%": { transform: "translateX(310%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 360ms ease-out both",
        "fade-in": "fade-in 250ms ease-out both",
        "pulse-soft": "pulseSoft 1.8s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
        progress: "progress 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
