import { configDefaults, defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["brand/*", "audio/*.mp3", "stories/*.json"],
      manifest: {
        name: "白噪音與睡眠",
        short_name: "夜眠",
        description: "8 種自然音效 · 多軌混音 · 故事模式 · 睡眠計時",
        lang: "zh-Hant",
        start_url: ".",
        display: "standalone",
        background_color: "#f3ead4",
        theme_color: "#f3ead4",
        orientation: "portrait",
        icons: [
          { src: "brand/favicon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "brand/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "brand/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "brand/icon-192-maskable.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "brand/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "brand/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /\/audio\/.*\.mp3$/,
            handler: "CacheFirst",
            options: {
              cacheName: "audio-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/stories\/.*\.json$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "stories-cache" },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Stryker 變異測試的沙盒會複製一份 tests/，不能被一般的 vitest 執行掃到
    exclude: [...configDefaults.exclude, ".stryker-tmp/**"],
  },
});
