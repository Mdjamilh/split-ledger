import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.API_PORT ?? "47311";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 47310,
    strictPort: true,
    // The API runs separately in development; same-origin /api keeps cookies simple.
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  css: {
    modules: { localsConvention: "camelCaseOnly" },
  },
  build: {
    sourcemap: true,
  },
});
