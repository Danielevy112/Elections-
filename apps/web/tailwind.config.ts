import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  // Hover styles only on devices with a real pointer; on touch screens they stick to
  // whatever row the finger touched when a scroll started.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        // Seat bands. Deliberately distinguishable without relying on hue alone —
        // the party pages pair every band colour with a text label.
        safe: { bg: "#dcfce7", border: "#16a34a", text: "#14532d" },
        borderline: { bg: "#fef3c7", border: "#d97706", text: "#78350f" },
        out: { bg: "#f1f5f9", border: "#cbd5e1", text: "#475569" },
        // Dark surface tokens sampled from the reference box-score screen.
        // Surface tokens sampled from the reference box-score screen (dark), with a light
        // counterpart. Values live in globals.css so the theme switch is one attribute.
        ink: {
          page: "rgb(var(--ink-page) / <alpha-value>)",
          card: "rgb(var(--ink-card) / <alpha-value>)",
          row: "rgb(var(--ink-row) / <alpha-value>)",
          pill: "rgb(var(--ink-pill) / <alpha-value>)",
          line: "rgb(var(--ink-line) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          dim: "rgb(var(--ink-dim) / <alpha-value>)",
          hero: "rgb(var(--ink-hero) / <alpha-value>)",
        },
        fg: "rgb(var(--fg) / <alpha-value>)",
        accent: "#2094fb",
        band: { in: "#3ddc84", edge: "#f5b83d", out: "#3a454b" },
      },
      fontFamily: {
        sans: ["Assistant", "Rubik", "Arial Hebrew", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
