import { expect, type Page } from "@playwright/test";

// runner から OpenFreeMap のタイルと町丁の境界データ (4 MB) を取得して描き終えるまでの待ち時間。
// 既定の 5 秒では足りないため長くする
const mapIdleTimeoutMs = 60_000;

/** 地図が境界データを描き終えて止まるまで待つ。 */
export async function waitForMapIdle(page: Page) {
  await expect(page.locator('[data-map-state="idle"]')).toBeAttached({ timeout: mapIdleTimeoutMs });
}

/** URL の表示位置 (#ズーム/緯度/経度) を mapHash に変えて地図を動かし、描き終えるまで待つ。 */
export async function moveMap(page: Page, mapHash: string) {
  await page.evaluate((hash) => {
    document.querySelector("[data-map-state]")?.setAttribute("data-map-state", "moving");
    location.hash = hash;
  }, mapHash);
  await waitForMapIdle(page);
}

/** 地図の中心のエリアをタップし、選択の塗りを描き終えるまで待つ。 */
export async function tapMapCenter(page: Page) {
  await page.locator(".maplibregl-canvas").click();
  await waitForMapIdle(page);
}

/** 地図 (WebGL・タイルの取得) の失敗は画面に出ないことがあるため、page のブラウザのエラーと警告を CI のログに出す。 */
export function logBrowserErrors(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`[browser ${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => console.log(`[browser pageerror] ${error.message}`));
}
