import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// 撮影するページ。画面を追加・変更した時はここに足し、CI の artifact (screenshots) で目視確認する。
// トップページ (地図) は操作を伴うため areaMap.e2e.ts で撮る
const pages = [
  { name: "sources", path: "/sources/", heading: "データの出典" },
  { name: "terms", path: "/terms/", heading: "利用規約" },
  { name: "privacy", path: "/privacy/", heading: "プライバシーポリシー" },
];

for (const { name, path, heading } of pages) {
  test(`${name} を表示して撮影する`, async ({ page }, testInfo) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    // モバイル幅の縦に長いページ (出典ページ) を端末の画素密度のまま全体で撮ると、Chromium が撮れる高さを超えて
    // 途中から先頭が繰り返し写る (CI の実測) ため、CSS の 1px を 1 画素にして撮る
    await page.screenshot({
      path: `tmp/screenshots/${testInfo.project.name}-${name}.png`,
      fullPage: true,
      scale: "css",
    });
  });
}

// OGP 画像はページではないため撮影せず、og:image の URL から取得したファイルをそのまま artifact に残して目視する
test("OGP 画像を 1200 × 630 の PNG で配信する", async ({ page, request }, testInfo) => {
  await page.goto("/");
  const imageUrl = new URL((await page.locator('meta[property="og:image"]').getAttribute("content")) ?? "");
  // og:image は公開 URL (SITE_URL) の絶対 URL のため、パスだけを使ってテスト中のサーバーから取る
  const response = await request.get(`${imageUrl.pathname}${imageUrl.search}`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
  const image = await response.body();
  // PNG の IHDR チャンクの幅と高さ (先頭から 16 バイト目と 20 バイト目の 4 バイト)
  expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([1200, 630]);
  // page.screenshot と違い writeFile は保存先のディレクトリを作らないため、このテストだけを実行しても書けるよう先に作る
  await mkdir("tmp/screenshots", { recursive: true });
  await writeFile(`tmp/screenshots/${testInfo.project.name}-og-image.png`, image);
});
