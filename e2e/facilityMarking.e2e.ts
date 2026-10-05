import { expect, type Page, test } from "@playwright/test";
import { logBrowserErrors, moveMap, waitForMapIdle } from "./map";

// OpenPOI API は SLA が無く結果も日々変わるため、撮影では実際の応答を保存したもの (2026-10-05 に三鷹駅周辺で取得) を返す。
// 該当なしと失敗の表示を確かめる語は、それぞれ 0 件の応答と 503 を返す
const openPoiFixtures: Record<string, string> = {
  公園: "e2e/fixtures/openpoi/park.json",
  スーパー: "e2e/fixtures/openpoi/supermarket.json",
};
// 子育て施設のデータ (2.5 MB) を取得して検査し終えるまでの待ち時間。GPU の無い runner で既定の 5 秒を超え得るため長くする
const facilitiesLoadTimeoutMs = 30_000;
const keywordWithoutResults = "該当なしの確認";
const keywordWithFailure = "失敗の確認";

/** keywordText をキーワードの欄に入れて追加する。 */
async function addKeyword(page: Page, keywordText: string) {
  await page.getByLabel("キーワード", { exact: true }).fill(keywordText);
  await page.getByRole("button", { name: "追加" }).click();
}

/** ページの先頭まで戻して地図を画面に入れる (モバイル幅では地図の下にパネルがある)。 */
async function scrollToMap(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
}

test("キーワードと子育て施設の種類でピンを重ねる", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const screenshotPath = (name: string) => `tmp/screenshots/${testInfo.project.name}-${name}.png`;
  logBrowserErrors(page);
  await page.route(
    (url) => url.origin === "https://api.openpoiapi.com" && url.pathname === "/v1/search",
    (route) => {
      const keyword = new URL(route.request().url()).searchParams.get("q") ?? "";
      // ブラウザから別のオリジンへの fetch のため、本物の API と同じく CORS を許可するヘッダーを付ける
      const headers = { "access-control-allow-origin": "*" };
      if (keyword in openPoiFixtures) {
        return route.fulfill({ path: openPoiFixtures[keyword], headers });
      }
      if (keyword === keywordWithoutResults) {
        return route.fulfill({ json: { count: 0, results: [] }, headers });
      }
      return route.fulfill({ status: 503, json: { message: "Service Unavailable" }, headers });
    },
  );

  // 三鷹駅の周辺 (保存した OpenPOI API の応答の範囲がモバイル幅の地図にも収まるズーム)
  await page.goto("/");
  await waitForMapIdle(page);
  await moveMap(page, "#14/35.7027/139.5606");
  await expect(page.getByText("地図に表示している範囲を探します")).toBeVisible();

  // キーワード 2 つを順に入れて、色の違うピンを重ねる
  await addKeyword(page, "公園");
  await expect(page.getByRole("heading", { name: /^「公園」 \([1-9]\d* 件\)$/ })).toBeVisible();
  await waitForMapIdle(page);
  await addKeyword(page, "スーパー");
  await expect(page.getByRole("heading", { name: /^「スーパー」 \([1-9]\d* 件\)$/ })).toBeVisible();
  await waitForMapIdle(page);
  // 街をくらべるタブにもコワーキングの条件の OpenPOI API の出典があるため、施設の欄の中で探す
  await expect(
    page.getByRole("region", { name: "施設を地図に出す" }).getByRole("link", { name: "OpenPOI API" }),
  ).toHaveAttribute(
    "href",
    "https://openpoiapi.com/attribution.html",
  );
  await scrollToMap(page);
  await page.screenshot({ path: screenshotPath("facility-keywords") });
  await page.getByText("キーワードの候補の出典").scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath("facility-keywords-list") });

  // 子育て施設の種類を選ぶ
  // チャットの条件のチェックボックス (「小児科が近い」) と見分けるため、名前を完全一致で探す
  await page.getByRole("checkbox", { name: "小児科", exact: true }).check();
  await page.getByRole("checkbox", { name: "保育所", exact: true }).check();
  await expect(page.getByRole("heading", { name: /^小児科 \(\d+ 件\)$/ })).toBeVisible({ timeout: facilitiesLoadTimeoutMs });
  await expect(page.getByRole("heading", { name: /^保育所 \(\d+ 件\)$/ })).toBeVisible({ timeout: facilitiesLoadTimeoutMs });
  await waitForMapIdle(page);
  await expect(page.getByText("「医療情報ネットのオープンデータ」（厚生労働省）")).toBeVisible();
  await expect(page.getByText("「国土数値情報（福祉施設データ）」（国土交通省）")).toBeVisible();
  await scrollToMap(page);
  await page.screenshot({ path: screenshotPath("facility-childcare") });
  await page.getByText("子育て施設の出典").scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath("facility-childcare-list") });

  // OpenPOI API の 0 件と失敗を画面に出す
  await addKeyword(page, keywordWithoutResults);
  await expect(page.getByRole("status").filter({ hasText: `この範囲に「${keywordWithoutResults}」は見つかりませんでした` })).toBeVisible();
  await addKeyword(page, keywordWithFailure);
  const failureAlert = page.getByRole("alert").filter({ hasText: `「${keywordWithFailure}」の検索に失敗しました (HTTP 503)` });
  await expect(failureAlert).toBeVisible();
  await failureAlert.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath("facility-keyword-errors") });

  // 一覧に最初に出さなかった候補を広げて出す
  const parkList = page.getByRole("list", { name: "「公園」の候補" });
  const parkListItemCount = Number(
    (await page.getByRole("heading", { name: /^「公園」/ }).textContent())?.match(/\((\d+) 件\)/)?.[1],
  );
  await page.getByRole("listitem").filter({ has: parkList }).getByRole("button", { name: /^残りの \d+ 件を表示$/ }).click();
  await expect(parkList.getByRole("listitem")).toHaveCount(parkListItemCount);
});
