import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Seat bands. Deliberately distinguishable without relying on hue alone —
        // the party pages pair every band colour with a text label.
        safe: { bg: "#dcfce7", border: "#16a34a", text: "#14532d" },
        borderline: { bg: "#fef3c7", border: "#d97706", text: "#78350f" },
        out: { bg: "#f1f5f9", border: "#cbd5e1", text: "#475569" },
      },
      fontFamily: {
        sans: ["Assistant", "Rubik", "Arial Hebrew", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
