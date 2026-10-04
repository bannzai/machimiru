import { expect, test } from "@playwright/test";
import { logBrowserErrors, moveMap, tapMapCenter, waitForMapIdle } from "./map";

// 選択・ズーム・再読み込みの後の状態を順に確かめるため、localStorage を引き継ぐ 1 つのテストにする
test("地図でエリアを選び、再読み込みしても選択が残る", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const screenshotPath = (name: string) => `tmp/screenshots/${testInfo.project.name}-${name}.png`;
  const selectedAreaItems = page.getByRole("list", { name: /選択中のエリア/ }).getByRole("listitem");
  logBrowserErrors(page);
  // fullPage で撮ると撮影のために画面の高さが変わり、地図 (画面の高さで大きさが決まる) の canvas が描き直しの前の
  // 空白のまま写る (PC 幅の読み込み直後で実測) ため、画面に見えている範囲だけを撮る

  // 地図の表示
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "machimiru" })).toBeVisible();
  await waitForMapIdle(page);
  await expect(page.getByText("選択の単位: 区市町村")).toBeVisible();
  await expect(page.getByText("国土数値情報（行政区域データ）")).toBeVisible();
  await page.screenshot({ path: screenshotPath("top") });

  // 区市町村の選択と複数選択 (地図の中心が新宿区役所、渋谷区役所の付近になる位置でタップする)
  await moveMap(page, "#11/35.6938/139.7035");
  await tapMapCenter(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/]);
  await moveMap(page, "#11/35.6620/139.7038");
  await tapMapCenter(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/]);
  await page.screenshot({ path: screenshotPath("top-municipalities-selected") });

  // ズーム後の町丁の選択 (地図の中心が東京都庁 = 西新宿二丁目になる位置)
  await moveMap(page, "#14/35.6895/139.6917");
  await expect(page.getByText("選択の単位: 町丁")).toBeVisible();
  await expect(page.getByText("政府統計の総合窓口(e-Stat)")).toBeVisible();
  await tapMapCenter(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/, /^新宿区 西新宿二丁目/]);
  await page.screenshot({ path: screenshotPath("top-town-selected") });

  // 再読み込み後の選択の保持
  await page.reload();
  await waitForMapIdle(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/, /^新宿区 西新宿二丁目/]);
  await page.screenshot({ path: screenshotPath("top-reloaded") });
});
