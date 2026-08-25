import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const isTauriDev = !!process.env.TAURI_DEV_HOST;
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
    // 仅 Tauri 场景（TAURI_DEV_HOST 已设置）强制 HMR 走固定端口 1421；
    // 浏览器（E2E）场景下通过 CLI 覆盖 server.port（如 --port 3000）时，
    // HMR 自动跟随 server 端口，避免写死 1421 在系统保留端口段导致 WS 断连崩溃。
    hmr: isTauriDev
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : true,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` 与依赖目录，避免触及 inotify 上限
      ignored: ["**/src-tauri/**", "**/node_modules/**", "**/.pnpm-store/**"],
    },
  },
}));
