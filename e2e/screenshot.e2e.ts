import { expect, test } from "@playwright/test";

// 撮影するページ。画面を追加・変更した時はここに足し、CI の artifact (screenshots) で目視確認する。
// トップページ (地図) は操作を伴うため areaMap.e2e.ts で撮る
const pages = [
  { name: "terms", path: "/terms/", heading: "利用規約" },
  { name: "privacy", path: "/privacy/", heading: "プライバシーポリシー" },
];

for (const { name, path, heading } of pages) {
  test(`${name} を表示して撮影する`, async ({ page }, testInfo) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.screenshot({ path: `tmp/screenshots/${testInfo.project.name}-${name}.png`, fullPage: true });
  });
}
