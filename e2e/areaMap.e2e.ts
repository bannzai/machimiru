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

/** 地図の中心のエリアをタップし、選択の塗りを描き終えるまで待つ。 */
async function tapMapCenter(page: Page) {
  await page.locator(".maplibregl-canvas").click();
  await waitForMapIdle(page);
}

// 選択・ズーム・再読み込みの後の状態を順に確かめるため、localStorage を引き継ぐ 1 つのテストにする
test("地図でエリアを選び、再読み込みしても選択が残る", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const screenshotPath = (name: string) => `tmp/screenshots/${testInfo.project.name}-${name}.png`;
  const selectedAreaItems = page.getByRole("list", { name: /選択中のエリア/ }).getByRole("listitem");
  const propertySearchLink = page.getByRole("link", { name: /SUUMO で賃貸物件を探す/ });
  // 新宿区・渋谷区・家賃 15 万円以下・50m² 以上の SUUMO の検索結果
  const expectedPropertySearchUrl =
    "https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ta=13&sc=13104&sc=13113&ct=15.0&mb=50";
  const boundaryAttributionLink = page.locator(".maplibregl-ctrl-attrib").getByRole("link", { name: /国土数値情報・e-Stat/ });
  // 地図 (WebGL・タイルの取得) の失敗は画面に出ないことがあるため、ブラウザのエラーを CI のログに出す
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`[browser ${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => console.log(`[browser pageerror] ${error.message}`));
  // fullPage で撮ると撮影のために画面の高さが変わり、地図 (画面の高さで大きさが決まる) の canvas が描き直しの前の
  // 空白のまま写る (PC 幅の読み込み直後で実測) ため、画面に見えている範囲だけを撮る

  // 地図の表示
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "machimiru" })).toBeVisible();
  await waitForMapIdle(page);
  await expect(page.getByText("選択の単位: 区市町村")).toBeVisible();
  await expect(boundaryAttributionLink).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("OpenStreetMap");
  await page.screenshot({ path: screenshotPath("top") });

  // 地図の下のサービスの紹介
  // scrollIntoViewIfNeeded は見出しが画面の端に少しでも見えていると動かさないため、見出しを画面の上端に合わせる
  for (const [heading, name] of [
    ["土地勘がなくても子育てしやすい街を比べる", "top-introduction"],
    ["サポート・お問い合わせ", "top-support"],
  ]) {
    await page.getByRole("heading", { level: 2, name: heading }).evaluate((element) => element.scrollIntoView());
    await page.screenshot({ path: screenshotPath(name) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  // 区市町村の選択と複数選択 (地図の中心が新宿区役所、渋谷区役所の付近になる位置でタップする)
  await moveMap(page, "#11/35.6938/139.7035");
  await tapMapCenter(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/]);
  await moveMap(page, "#11/35.6620/139.7038");
  await tapMapCenter(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/]);
  await page.screenshot({ path: screenshotPath("top-municipalities-selected") });

  // 物件の条件の選択と SUUMO の検索結果へのリンク (CI から SUUMO へ通信しないよう、リンクは開かない)
  await page.getByLabel("家賃の上限").selectOption("15");
  await page.getByLabel("広さの下限").selectOption("50");
  await expect(propertySearchLink).toHaveAttribute("href", expectedPropertySearchUrl);
  // モバイル幅では地図の下に一覧があり、画面に見えている範囲だけを撮るため、物件の欄まで動かしてから撮る
  await propertySearchLink.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath("top-property-search") });
  // 続く地図の操作と撮影を、ほかの手順と同じ画面の先頭から行う
  await page.evaluate(() => window.scrollTo(0, 0));

  // ズーム後の町丁の選択 (地図の中心が東京都庁 = 西新宿二丁目になる位置)
  await moveMap(page, "#14/35.6895/139.6917");
  await expect(page.getByText("選択の単位: 町丁")).toBeVisible();
  await tapMapCenter(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/, /^新宿区 西新宿二丁目/]);
  // 町丁は区市町村の単位で探すため、新宿区を重ねて渡さない
  await expect(propertySearchLink).toHaveAttribute("href", expectedPropertySearchUrl);
  await expect(page.getByText("町丁は区市町村の単位で探します")).toBeVisible();
  await page.screenshot({ path: screenshotPath("top-town-selected") });

  // 再読み込み後の選択と物件の条件の保持
  await page.reload();
  await waitForMapIdle(page);
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^渋谷区/, /^新宿区 西新宿二丁目/]);
  await expect(page.getByLabel("家賃の上限")).toHaveValue("15");
  await expect(page.getByLabel("広さの下限")).toHaveValue("50");
  await expect(propertySearchLink).toHaveAttribute("href", expectedPropertySearchUrl);
  await page.screenshot({ path: screenshotPath("top-reloaded") });

  // 地図の上の出典表示から出典ページへの移動
  await boundaryAttributionLink.click();
  await expect(page.getByRole("heading", { level: 1, name: "データの出典" })).toBeVisible();
  await expect(page.getByText("国土数値情報（行政区域データ）")).toBeVisible();
  await page.screenshot({ path: screenshotPath("sources-from-map") });
});
