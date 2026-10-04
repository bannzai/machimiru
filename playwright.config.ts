import { defineConfig, devices } from "@playwright/test";

// 画面の確認を GitHub Actions の runner 上で行うための設定 (AGENTS.md「検証方法」)。
// vitest が拾う *.test.ts / *.spec.ts と混ざらないよう、Playwright のファイルは *.e2e.ts にする
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "tmp/playwright",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // make build-web の成果物を配信して開く (dev サーバのコンパイル待ちで撮影が不安定になるのを避ける)
  webServer: {
    command: "npm run start -- -H 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
  },
});
