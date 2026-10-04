import path from "node:path";
import { defineConfig } from "vitest/config";

// src/app の sitemap.ts・robots.ts を tsconfig.json の paths (@/*) のままテストから読み込むため、同じ別名を付ける
export default defineConfig({
  resolve: { alias: { "@": path.join(import.meta.dirname, "src") } },
});
