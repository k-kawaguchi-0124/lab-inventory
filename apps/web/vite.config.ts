import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(value?: string) {
  if (!value || value.trim() === "" || value === "/") return "/";
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const appBase = normalizeBasePath(process.env.VITE_APP_BASE);

export default defineConfig({
  base: appBase,
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
