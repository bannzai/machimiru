import { expect, test } from "@playwright/test";
import { logBrowserErrors, moveMap, tapMapCenter, waitForMapIdle } from "./map";

// 文章の判定は playwright.config.ts の webServer.env で辞書による固定の判定にしている。
// issue の例文に、registry に無い軸 (医療・健康) の要望の文と、コワーキングの軸の文を足したもの
const conditionText =
  "2 歳の子どもがいて、保育園と小児科が近く、新宿まで 30 分以内、家賃は 15 万円まで、鍼灸の評判が良い場所が近い、コワーキングが近い";
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
  const chatButton = page.getByRole("button", { name: "文章で条件を入れる" });
  const chatPanel = page.getByRole("dialog", { name: "探している暮らしを文章で入れる" });
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

  // チャットは地図の右のパネルには無く、右下のボタンで開く。初回はボタンの横に入口の吹き出しが出る
  await expect(page.locator(".area-panel").getByLabel("条件を足す 言い直す")).toHaveCount(0);
  await expect(chatPanel).toBeHidden();
  await expect(page.locator(".condition-chat-hint")).toHaveText(/^文章で条件を入れる/);
  await chatButton.click();
  await expect(chatPanel).toBeVisible();
  await expect(page.locator(".condition-chat-hint")).toHaveCount(0);

  // 文章を入れると、軸と条件に分かれる。registry にある条件はチェックが付き、無い軸は判定できない条件として出る
  await page.getByLabel("条件を足す 言い直す").fill(conditionText);
  await page.getByRole("button", { name: "軸に分ける" }).click();
  await expect(page.getByText("5 つの軸に分けました")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "小児科が近い" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "保育園に入りやすい" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "子育て支援が手厚い" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "コワーキングが近い" })).toBeChecked();
  const unsupportedItems = page.getByRole("list", { name: "判定できない条件" }).getByRole("listitem");
  await expect(unsupportedItems).toHaveText(
    expectedAxisRequests.map(({ axisName, text }) => new RegExp(`^${axisName} ${text}この軸はまだ判定できません`)),
  );
  await expect(chatPanel).toBeVisible();
  // 開いたままのパネルと、分けた条件で塗り直した地図を一緒に撮るため、塗り直しを待つ
  await waitForMapIdle(page);
  await page.screenshot({ path: screenshotPath("condition-chat-classified") });

  // 判定できない条件は、軸の追加のリクエストとしてこのブラウザの localStorage に残る
  await expect(page.getByRole("list", { name: "リクエスト済みの条件" }).getByRole("listitem")).toHaveText(
    expectedAxisRequests.map(({ axisName, text }) => `${axisName} ${text}`),
  );
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("machimiru.axisRequests.v1") ?? "null"))).toEqual(
    expectedAxisRequests,
  );
  // リクエストを、agent に軸の追加を頼む文としてクリップボードへコピーできる
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "軸の追加の依頼文をコピー" }).click();
  await expect(page.getByText("コピーしました")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    [
      "documents/add-axis.md の手順で、次の軸の追加リクエストを軸にして",
      ...expectedAxisRequests.map(({ axisName, text }) => `- 軸の候補名: ${axisName} / 条件の文: ${text}`),
    ].join("\n"),
  );
  await scrollToTop(page.getByRole("heading", { level: 3, name: "リクエスト済みの条件" }));
  await page.screenshot({ path: screenshotPath("condition-chat-unsupported") });

  // 閉じるボタンで閉じると、ボタンに使っている条件の数が出る
  await chatPanel.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(chatPanel).toBeHidden();
  await expect(page.locator(".condition-chat-badge")).toHaveText("3");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath("condition-chat-closed") });

  // 開き直しても入力した文章と判定の結果が残る。Esc キーで閉じると、キーボードの操作の位置が入口のボタンへ戻る
  await chatButton.click();
  await expect(page.getByLabel("条件を足す 言い直す")).toHaveValue(conditionText);
  await expect(page.getByText("5 つの軸に分けました")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "コワーキングが近い" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(chatPanel).toBeHidden();
  await expect(chatButton).toBeFocused();

  // パネルの外側の地図をタップすると、閉じるだけで、タップした位置のエリアの選択を変えない
  await chatButton.click();
  await expect(chatPanel).toBeVisible();
  const mapBox = await page.locator(".maplibregl-canvas").boundingBox();
  if (mapBox === null) {
    throw new Error("地図の位置を取得できません");
  }
  // パネルはモバイル幅で画面の下 6 割、PC 幅で地図の右に出るため、どちらの幅でもパネルに隠れない地図の上端の近くをタップする
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + 40);
  await expect(chatPanel).toBeHidden();
  await expect(selectedAreaItems).toHaveText([/^新宿区/, /^三鷹市/]);

  // まとめのタブ: 地図の塗り分けと、選んだ街 × 軸の表
  await expect(page.getByRole("tab")).toHaveText(["まとめ", "子育て", "コワーキング"]);
  await expect(page.getByRole("tab", { name: "まとめ" })).toHaveAttribute("aria-selected", "true");
  await waitForMapIdle(page);
  // 表は globals.css で display: block にしており、ブラウザによっては表の role が外れるため、要素とキャプションで探す
  const matrix = page.locator("table", { has: page.locator("caption", { hasText: "選んだ街 2 合う順" }) });
  await expect(matrix.locator("thead th")).toHaveText(["街", "まとめ", "子育て", "コワーキング"]);
  await expect(matrix.locator("tbody tr")).toHaveCount(2);
  // 区市町村ごとの塗り分けを見渡せるよう、23 区と多摩の東部が入るズームにする
  await moveMap(page, "#10/35.69/139.6");
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
  // パネルを開いたまま条件を足すと、一覧と地図の塗り分けがその場で変わる
  await page.evaluate(() => window.scrollTo(0, 0));
  await chatButton.click();
  await page.getByRole("checkbox", { name: "子育て支援が手厚い" }).check();
  await expect(page.getByRole("list", { name: "新宿区の条件ごとの段階" }).getByRole("listitem")).toHaveCount(3);
  await waitForMapIdle(page);
  await page.screenshot({ path: screenshotPath("axis-childcare-map") });
  await chatPanel.getByRole("button", { name: "閉じる", exact: true }).click();
  await scrollToTop(comparisonHeading);
  await page.screenshot({ path: screenshotPath("axis-childcare-list") });

  // コワーキングのタブ: OpenPOI API の検索結果の施設の数で決めた段階と根拠、出典
  await page.getByRole("tab", { name: "コワーキング" }).click();
  await expect(page.getByRole("tab", { name: "コワーキング" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("list", { name: "新宿区の条件ごとの段階" }).getByRole("listitem")).toHaveText([
    /^コワーキングが近い: (合う|やや合う|あまり|合わない)コワーキング・シェアオフィス \d+ 件/,
  ]);
  await expect(page.getByText("コワーキングが近いの施設の出典:")).toBeVisible();
  await expect(page.getByRole("link", { name: "OpenPOI API" }).first()).toHaveAttribute(
    "href",
    "https://openpoiapi.com/attribution.html",
  );
  await waitForMapIdle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath("axis-coworking-map") });
  await scrollToTop(comparisonHeading);
  await page.screenshot({ path: screenshotPath("axis-coworking-list") });

  // 街の詳細 (区市町村のページ) に軸ごとの段階が出る
  await page.getByRole("list", { name: "選んだ街をコワーキングで見ると" }).getByRole("link", { name: "新宿区" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "新宿区の子育ての指標と制度" })).toBeVisible();
  const axisFitTable = page.locator("table", { has: page.locator("caption", { hasText: "軸と条件ごとの段階" }) });
  await expect(axisFitTable.locator("tbody th")).toHaveText([
    "子育て",
    "小児科が近い",
    "保育園に入りやすい",
    "子育て支援が手厚い",
    "治安",
    "犯罪率が低い",
    "コワーキング",
    "コワーキングが近い",
  ]);
  await expect(page.getByText(/^コワーキングが近いの施設の出典: OpenPOI API の検索結果/)).toBeVisible();
  await scrollToTop(page.getByRole("heading", { level: 2, name: "軸ごとの合う度合い" }));
  await page.screenshot({ path: screenshotPath("municipality-axis-fit") });
});
