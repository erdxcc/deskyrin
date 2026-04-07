/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0B0B0F",
        panel: "#111217",
        line: "rgba(255, 255, 255, 0.08)",
        primary: "#E5E7EB",
        secondary: "#9CA3AF",
        muted: "#6B7280",
      },
      fontFamily: {
        sans: ["Lexend", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "body-lg": ["1.125rem", { lineHeight: "1.75", letterSpacing: "-0.01em" }],
        body: ["1rem", { lineHeight: "1.65", letterSpacing: "-0.008em" }],
      },
      letterSpacing: {
        brand: "0.2em",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(139, 92, 246, 0.35), 0 0 60px -20px rgba(59, 130, 246, 0.2)",
        "glow-sm": "0 0 24px -8px rgba(139, 92, 246, 0.25)",
        lift: "0 20px 50px -20px rgba(0, 0, 0, 0.55)",
        innerGlow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        shimmer:
          "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(32px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up":
          "fade-up 1.95s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fade-in 1.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        shimmer: "shimmer 2s infinite",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
