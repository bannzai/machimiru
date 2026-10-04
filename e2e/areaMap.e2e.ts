import { expect, type Page, test } from "@playwright/test";

// runner から OpenFreeMap のタイルと町丁の境界データ (4 MB) を取得して描き終えるまでの待ち時間。
// 既定の 5 秒では足りないため長くする
const mapIdleTimeoutMs = 60_000;

/** 地図が境界データを描き終えて止まるまで待つ。 */
async function waitForMapIdle(page: Page) {
  await expect(page.locator('[data-map-state="idle"]')).toBeAttached({ timeout: mapIdleTimeoutMs });
}

/** URL の表示位置 (#ズーム/緯度/経度) を mapHash に変えて地図を動かし、描き終えるまで待つ。 */
async function moveMap(page: Page, mapHash: string) {
  await page.evaluate((hash) => {
    document.querySelector("[data-map-state]")?.setAttribute("data-map-state", "moving");
    location.hash = hash;
  }, mapHash);
  await waitForMapIdle(page);
}

// 選択・ズーム・再読み込みの後の状態を順に確かめるため、localStorage を引き継ぐ 1 つのテストにする
test("地図でエリアを選び、再読み込みしても選択が残る", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const screenshotPath = (name: string) => `tmp/screenshots/${testInfo.project.name}-${name}.png`;
  const mapCanvas = page.locator(".maplibregl-canvas");
  const selectedAreaItems = page.getByRole("list", { name: /選択中のエリア/ }).getByRole("listitem");

  // 地図の表示
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "machimiru" })).toBeVisible();
  await waitForMapIdle(page);
  await expect(page.getByText("選択の単位: 区市町村")).toBeVisible();
  await expect(page.getByText("国土数値情報（行政区域データ）")).toBeVisible();
  await page.screenshot({ path: screenshotPath("top"), fullPage: true });

  // 区市町村の選択と複数選択 (地図の中心が新宿区役所、渋谷区役所の付近になる位置でタップする)
  await moveMap(page, "#11/35.6938/139.7035");
  await mapCanvas.click();
  await expect(selectedAreaItems).toHaveText([/^新宿区/]);
  await moveMap(page, "#11/35.6620/139.7038");
  await mapCanvas.click();
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/]);
  await page.screenshot({ path: screenshotPath("top-municipalities-selected"), fullPage: true });

  // ズーム後の町丁の選択 (地図の中心が東京都庁 = 西新宿二丁目になる位置)
  await moveMap(page, "#14/35.6895/139.6917");
  await expect(page.getByText("選択の単位: 町丁")).toBeVisible();
  await expect(page.getByText("政府統計の総合窓口(e-Stat)")).toBeVisible();
  await mapCanvas.click();
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/, /^新宿区 西新宿二丁目/]);
  await page.screenshot({ path: screenshotPath("top-town-selected"), fullPage: true });

  // 再読み込み後の選択の保持
  await page.reload();
  await waitForMapIdle(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/, /^新宿区 西新宿二丁目/]);
  await page.screenshot({ path: screenshotPath("top-reloaded"), fullPage: true });
});
