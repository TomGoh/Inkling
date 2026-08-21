import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
  const host = process.env.TAURI_DEV_HOST || "127.0.0.1";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("mermaid")) return "vendor_mermaid";
            if (id.includes("katex")) return "vendor_katex";
            if (id.includes("@milkdown")) return "vendor_milkdown";
            if (id.includes("@codemirror") || id.includes("codemirror")) return "vendor_codemirror";
            if (id.includes("react") || id.includes("zustand")) return "vendor_framework";
          }
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` 与依赖目录，避免触及 inotify 上限
      ignored: ["**/src-tauri/**", "**/node_modules/**", "**/.pnpm-store/**"],
    },
  },
}));
