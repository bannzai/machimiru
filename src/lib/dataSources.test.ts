import { describe, expect, it } from "vitest";
import { renderDataSourceTable } from "./dataSources";

describe("renderDataSourceTable", () => {
  it("documents/PROJECT.md の出典の表を、提供元と出典表示の文言つきの HTML の表にする", async () => {
    const html = await renderDataSourceTable();
    expect(html).toContain("<table>");
    expect(html).toContain("OpenFreeMap © OpenMapTiles Data from OpenStreetMap");
    expect(html).toContain("国土数値情報（行政区域データ）");
    expect(html).toContain("政府統計の総合窓口(e-Stat)");
    expect(html).toContain('<a href="https://docs.openpoiapi.com/">');
  });

  it("表の前の、表を更新する人に向けた説明を出さない", async () => {
    expect(await renderDataSourceTable()).not.toContain("外部データを足す時は");
  });
});
