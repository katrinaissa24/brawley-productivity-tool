/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--c-bg) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        pop: "rgb(var(--c-pop) / <alpha-value>)",
        bord: "rgb(var(--c-border) / <alpha-value>)",
        bord2: "rgb(var(--c-border2) / <alpha-value>)",
        ink: "rgb(var(--c-text) / <alpha-value>)",
        ink2: "rgb(var(--c-text2) / <alpha-value>)",
        ink3: "rgb(var(--c-text3) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04)",
        cardHover: "0 2px 10px rgb(0 0 0 / 0.09)",
        pop: "0 10px 38px rgb(0 0 0 / 0.16), 0 2px 8px rgb(0 0 0 / 0.08)",
      },
      fontSize: {
        xxs: ["11px", "14px"],
      },
    },
  },
  plugins: [],
};
