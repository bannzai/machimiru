import { expect, test } from "@playwright/test";
import { logBrowserErrors, moveMap, tapMapCenter, waitForMapIdle } from "./map";

// 地図での選択から区市町村のページへ移り、地図に戻って一覧から別の区市町村のページへ移る流れを順に確かめるため、1 つのテストにする
test("区市町村ごとの子育てのしやすさを地図と一覧で比べ、1 つの街の指標と制度にドリルダウンする", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const screenshotPath = (name: string) => `tmp/screenshots/${testInfo.project.name}-${name}.png`;
  const childcareScoreSection = page.getByRole("region", { name: "子育てのしやすさ (総合の評価)" });
  const rankingItems = page.getByRole("list", { name: "子育てのしやすさの順位" }).getByRole("listitem");
  logBrowserErrors(page);

  // 総合の評価の地図の色分けと一覧。地図は areaMap.e2e.ts と同じ理由で画面に見えている範囲だけを撮る
  await page.goto("/");
  await waitForMapIdle(page);
  await expect(childcareScoreSection.getByText("machimiru が独自に作ったもので、自治体の発信ではありません")).toBeVisible();
  await expect(rankingItems).toHaveCount(62);
  await expect(rankingItems.first()).toContainText(/^1 位/);
  await page.screenshot({ path: screenshotPath("childcare-score-map") });
  // モバイル幅では評価の見出しが画面の下端に来るだけで一覧が写らないため、見出しを画面の上端に合わせる
  await childcareScoreSection
    .getByRole("heading", { name: "子育てのしやすさ (総合の評価)" })
    .evaluate((heading) => heading.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: screenshotPath("childcare-score-ranking") });
  await rankingItems.last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath("childcare-score-ranking-bottom") });

  // 地図で区市町村を選ぶと、選択中のエリアに総合の評価と指標・制度のページへのリンクが出る (地図の中心が三鷹市役所になる位置)
  await moveMap(page, "#12/35.6836/139.5597");
  await tapMapCenter(page);
  const selectedAreaList = page.getByRole("list", { name: /選択中のエリア/ });
  await expect(selectedAreaList.getByRole("listitem")).toHaveText([/^三鷹市\d+ 点指標と制度/]);
  await selectedAreaList.evaluate((list) => list.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: screenshotPath("childcare-score-selected") });

  // 選んだ区市町村の指標の値と、分野ごとの子育て支援制度へのドリルダウン
  await selectedAreaList.getByRole("link", { name: "指標と制度" }).click();
  await expect(page).toHaveURL(/\/municipalities\/132047\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "三鷹市の子育ての指標と制度" })).toBeVisible();
  await expect(page.getByText("三鷹市の発信ではありません")).toBeVisible();
  // 表は globals.css で display: block にしており、ブラウザによっては表の role が外れるため、要素とキャプションで探す
  await expect(page.locator("table", { has: page.locator("caption", { hasText: "根拠の指標" }) }).locator("tr")).toHaveCount(5);
  // 保育サービスの利用率は 62 区市町村すべてで欠損しており、ほかの値と見分けられる表示になる
  await expect(page.locator("tr", { hasText: "保育サービスの利用率" })).toContainText("データなし");
  await page.screenshot({ path: screenshotPath("municipality-mitaka"), fullPage: true });
  const nurseryPrograms = page.locator("details", { has: page.locator("summary", { hasText: /^保育 \(\d+ 件\)$/ }) });
  // モバイル幅では fullPage の撮影の後にほかの要素がポインタを受ける位置にずれ、click がタイムアウトする (CI で実測) ため、
  // 要素に click のイベントを直接送って開く
  await nurseryPrograms.locator("summary").dispatchEvent("click");
  await expect(nurseryPrograms.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await nurseryPrograms.screenshot({ path: screenshotPath("municipality-mitaka-nursery-programs") });

  // 一覧からのドリルダウン (点数の低い区市町村で、街ごとの差を見る)
  await page.getByRole("link", { name: "地図に戻る" }).click();
  await rankingItems.getByRole("link", { name: "清瀬市" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "清瀬市の子育ての指標と制度" })).toBeVisible();
  await page.screenshot({ path: screenshotPath("municipality-kiyose") });
});
