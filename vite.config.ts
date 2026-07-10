import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { version } from "./package.json";

// Vite config tuned for Tauri dev: fixed port, don't watch the Rust tree.
export default defineConfig({
  plugins: [react()],
  // Embed the package version so the app can compare itself to GitHub releases.
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "safari15",
    minify: "esbuild",
    sourcemap: false,
  },
});
