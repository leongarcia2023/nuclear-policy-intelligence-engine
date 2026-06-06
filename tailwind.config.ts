import type { Config } from "tailwindcss";

// Operator-precision palette: cool slate base, restrained signal accents.
// Restraint is the brief — no decorative gradients, no overclaiming color.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        desk: {
          bg: "#0b0f14",
          panel: "#11171f",
          line: "#1e2630",
          text: "#c9d4df",
          muted: "#7d8a99",
        },
        signal: {
          // Reserved, deliberate accents — used sparingly to mark state.
          indirect: "#d9a441", // amber: "keyword search would miss this"
          help: "#4f9d69", // green: helps nuclear economics
          hurt: "#c0566a", // muted red: hurts
          high: "#5b8fb9", // steel blue: high materiality
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
