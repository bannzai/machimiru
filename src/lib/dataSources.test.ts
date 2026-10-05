import { describe, expect, it } from "vitest";
import { renderDataSources } from "./dataSources";

describe("renderDataSources", () => {
  it("documents/PROJECT.md の出典の表を、データごとの見出しと、提供元・出典表示の文言の定義リストにする", async () => {
    const html = await renderDataSources();
    expect(html).toContain("<h2>ベース地図</h2>");
    expect(html).toContain("<dt>提供元・入手先</dt>");
    expect(html).toContain("<dt>ライセンス・出典表示の文言</dt>");
    expect(html).toContain("OpenFreeMap © OpenMapTiles Data from OpenStreetMap");
    expect(html).toContain("国土数値情報（行政区域データ）");
    expect(html).toContain("政府統計の総合窓口(e-Stat)");
    expect(html).toContain('<a href="https://docs.openpoiapi.com/">');
  });

  it("表の区切りの行と、表の前の表を更新する人に向けた説明を出さない", async () => {
    const html = await renderDataSources();
    expect(html).not.toContain("---");
    expect(html).not.toContain("外部データを足す時は");
  });
});
