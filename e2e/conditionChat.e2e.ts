import { expect, test } from "@playwright/test";
import { logBrowserErrors, moveMap, tapMapCenter, waitForMapIdle } from "./map";

// 文章の判定は playwright.config.ts の webServer.env で辞書による固定の判定にしている。
// issue の例文に、registry に無い軸 (医療・健康) の要望の文を足したもの
const conditionText =
  "2 歳の子どもがいて、保育園と小児科が近く、新宿まで 30 分以内、家賃は 15 万円まで、鍼灸の評判が良い場所が近い";
const expectedAxisRequests = [
  { axisName: "通勤", text: "新宿まで 30 分以内" },
  { axisName: "予算", text: "家賃は 15 万円まで" },
  { axisName: "医療・健康", text: "鍼灸の評判が良い場所が近い" },
];

// 街の選択・文章の判定・タブの切り替え・区市町村のページへの移動を順に確かめるため、1 つのテストにする
test("文章を軸と条件に分け、軸のタブで選んだ街をくらべる", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const screenshotPath = (name: string) => `tmp/screenshots/${testInfo.project.name}-${name}.png`;
  const selectedAreaItems = page.getByRole("list", { name: /選択中のエリア/ }).getByRole("listitem");
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
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^三鷹市/]);

  // 文章を入れると、軸と条件に分かれる。registry にある条件はチェックが付き、無い軸は判定できない条件として出る
  await page.getByLabel("条件を足す 言い直す").fill(conditionText);
  await page.getByRole("button", { name: "軸に分ける" }).click();
  await expect(page.getByText("4 つの軸に分けました")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "小児科が近い" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "保育園に入りやすい" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "子育て支援が手厚い" })).not.toBeChecked();
  const unsupportedItems = page.getByRole("list", { name: "判定できない条件" }).getByRole("listitem");
  await expect(unsupportedItems).toHaveText(
    expectedAxisRequests.map(({ axisName, text }) => new RegExp(`^${axisName} ${text}この軸はまだ判定できません`)),
  );
  await scrollToTop(page.getByRole("heading", { level: 2, name: "探している暮らしを文章で入れる" }));
  await page.screenshot({ path: screenshotPath("condition-chat-classified") });

  // 判定できない条件は、軸の追加のリクエストとしてこのブラウザの localStorage に残る
  await expect(page.getByRole("list", { name: "リクエスト済みの条件" }).getByRole("listitem")).toHaveText(
    expectedAxisRequests.map(({ axisName, text }) => `${axisName} ${text}`),
  );
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("machimiru.axisRequests.v1") ?? "null"))).toEqual(
    expectedAxisRequests,
  );
  await scrollToTop(page.getByRole("heading", { level: 3, name: "リクエスト済みの条件" }));
  await page.screenshot({ path: screenshotPath("condition-chat-unsupported") });

  // まとめのタブ: 地図の塗り分けと、選んだ街 × 軸の表
  await expect(page.getByRole("tab")).toHaveText(["まとめ", "子育て"]);
  await expect(page.getByRole("tab", { name: "まとめ" })).toHaveAttribute("aria-selected", "true");
  await waitForMapIdle(page);
  // 表は globals.css で display: block にしており、ブラウザによっては表の role が外れるため、要素とキャプションで探す
  const matrix = page.locator("table", { has: page.locator("caption", { hasText: "選んだ街 2 合う順" }) });
  await expect(matrix.locator("thead th")).toHaveText(["街", "まとめ", "子育て"]);
  await expect(matrix.locator("tbody tr")).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath("axis-summary-map") });
  await scrollToTop(comparisonHeading);
  await page.screenshot({ path: screenshotPath("axis-summary-matrix") });

  // 子育てのタブ: 条件ごとの段階と根拠。条件を足すと地図の塗り分けが変わる
  await page.getByRole("tab", { name: "子育て" }).click();
  await expect(page.getByRole("tab", { name: "子育て" })).toHaveAttribute("aria-selected", "true");
  const childcareItems = page.getByRole("list", { name: "選んだ街を子育てで見ると" }).getByRole("listitem");
  await expect(page.getByRole("list", { name: "新宿区の条件ごとの段階" }).getByRole("listitem")).toHaveText([
    /^小児科が近い: (合う|やや合う|あまり|合わない)小児科 \d+ 件/,
    /^保育園に入りやすい: (合う|やや合う|あまり|合わない)待機児童 \d+ 人/,
  ]);
  await expect(page.getByText("保育園に入りやすい: 保育園ごとの空き状況のデータは無いため")).toBeVisible();
  await expect(childcareItems.filter({ has: page.getByRole("link", { name: "三鷹市" }) })).toBeVisible();
  await page.getByRole("checkbox", { name: "子育て支援が手厚い" }).check();
  await expect(page.getByRole("list", { name: "新宿区の条件ごとの段階" }).getByRole("listitem")).toHaveCount(3);
  await waitForMapIdle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath("axis-childcare-map") });
  await scrollToTop(comparisonHeading);
  await page.screenshot({ path: screenshotPath("axis-childcare-list") });

  // 街の詳細 (区市町村のページ) に軸ごとの段階が出る
  await page.getByRole("list", { name: "選んだ街を子育てで見ると" }).getByRole("link", { name: "新宿区" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "新宿区の子育ての指標と制度" })).toBeVisible();
  const axisFitTable = page.locator("table", { has: page.locator("caption", { hasText: "軸と条件ごとの段階" }) });
  await expect(axisFitTable.locator("tbody th")).toHaveText(["子育て", "小児科が近い", "保育園に入りやすい", "子育て支援が手厚い"]);
  await scrollToTop(page.getByRole("heading", { level: 2, name: "軸ごとの合う度合い" }));
  await page.screenshot({ path: screenshotPath("municipality-axis-fit") });
});
