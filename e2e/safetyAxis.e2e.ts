import { expect, test } from "@playwright/test";
import { logBrowserErrors, moveMap, tapMapCenter, waitForMapIdle } from "./map";

// 文章の判定は playwright.config.ts の webServer.env で辞書による固定の判定にしている。
// 街の選択・「治安が良い」の判定・治安のタブ・区市町村のページを順に確かめるため、1 つのテストにする
test("「治安が良い」を治安の軸に翻訳し、治安のタブで地図と選んだ街に段階を出す", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const screenshotPath = (name: string) => `tmp/screenshots/${testInfo.project.name}-${name}.png`;
  const comparisonHeading = page.getByRole("heading", { level: 2, name: "街をくらべる" });
  /** 要素を画面の上端に合わせる (モバイル幅では地図の下にパネルがあり、画面に見えている範囲だけを撮るため)。 */
  const scrollToTop = (locator: ReturnType<typeof page.locator>) =>
    locator.evaluate((element) => element.scrollIntoView({ block: "start" }));
  logBrowserErrors(page);

  // 新宿区と三鷹市を選ぶ (地図の中心が新宿区役所、三鷹市役所になる位置でタップする)
  await page.goto("/");
  await waitForMapIdle(page);
  await moveMap(page, "#11/35.6938/139.7035");
  await tapMapCenter(page);
  await moveMap(page, "#12/35.6836/139.5597");
  await tapMapCenter(page);
  await expect(page.getByRole("list", { name: /選択中のエリア/ }).getByRole("listitem")).toHaveText([
    /^新宿区/,
    /^三鷹市/,
  ]);

  // 「治安が良い」は治安の軸の話題の文として、軸のすべての条件 (犯罪率が低い) に翻訳される
  await page.getByLabel("条件を足す 言い直す").fill("治安が良い");
  await page.getByRole("button", { name: "軸に分ける" }).click();
  await expect(page.getByText("1 つの軸に分けました")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "犯罪率が低い" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "小児科が近い" })).not.toBeChecked();
  await expect(page.getByRole("list", { name: "判定できない条件" })).toHaveCount(0);

  // 治安のタブ: 地図の塗り分けと、選んだ街の犯罪率の段階と根拠
  await expect(page.getByRole("tab")).toHaveText(["まとめ", "治安"]);
  await page.getByRole("tab", { name: "治安" }).click();
  await expect(page.getByRole("tab", { name: "治安" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("list", { name: "新宿区の条件ごとの段階" }).getByRole("listitem")).toHaveText([
    /^犯罪率が低い: (合う|やや合う|あまり|合わない)刑法犯 [\d,]+ 件 ÷ 住民 [\d,]+ 人 = 1,000 人あたり [\d.]+ 件$/,
  ]);
  await expect(page.getByRole("list", { name: "三鷹市の条件ごとの段階" }).getByRole("listitem")).toHaveText([
    /^犯罪率が低い: (合う|やや合う|あまり|合わない)刑法犯/,
  ]);
  await expect(page.getByText("犯罪率が低い: 住民 1,000 人あたりの刑法犯の認知件数です")).toBeVisible();
  // 区市町村ごとの塗り分けを見渡せるよう、23 区と多摩の東部が入るズームにする
  await moveMap(page, "#10/35.69/139.6");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath("axis-safety-map") });
  await scrollToTop(comparisonHeading);
  await page.screenshot({ path: screenshotPath("axis-safety-list") });

  // 街の詳細 (区市町村のページ) に治安の軸の段階と根拠が出る
  await page.getByRole("list", { name: "選んだ街を治安で見ると" }).getByRole("link", { name: "新宿区" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "新宿区の子育ての指標と制度" })).toBeVisible();
  const axisFitTable = page.locator("table", { has: page.locator("caption", { hasText: "軸と条件ごとの段階" }) });
  await expect(axisFitTable.locator("tbody tr").filter({ hasText: "犯罪率が低い" })).toContainText(
    "刑法犯 6,977 件 ÷ 住民 352,717 人 = 1,000 人あたり 19.8 件",
  );
  await scrollToTop(page.getByRole("heading", { level: 2, name: "軸ごとの合う度合い" }));
  await page.screenshot({ path: screenshotPath("municipality-axis-fit-safety") });
});
