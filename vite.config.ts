/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // vendors estáveis em chunks próprios: cache do navegador sobrevive a deploys do app
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("@supabase")) return "supabase";
          if (/node_modules\/(recharts|d3-|victory-vendor|decimal\.js-light)/.test(id)) return "charts";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/fd-api": {
        target: "https://api.football-data.org/v4",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fd-api/, ""),
      },
      "/sportsdb-api": {
        target: "https://www.thesportsdb.com/api/v1/json/3",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sportsdb-api/, ""),
      },
      "/lance-api": {
        target: "https://www.lance.com.br",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lance-api/, ""),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
