import type { Polygon } from "geojson";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type FacilityKeyword,
  type SearchRange,
  addFacilityKeyword,
  isPointInSearchRanges,
  keywordPinColors,
  maxSearchRequestsPerKeyword,
  searchFacilitiesInRanges,
} from "./facilityMarking";

/** 経度 west〜east・緯度 south〜north の矩形の Polygon を返す。 */
function rectangle(west: number, south: number, east: number, north: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

// 経度 0〜2・緯度 0〜2 を囲む矩形のうち、左下の三角形だけを範囲にしたエリア
const triangleArea: SearchRange = {
  boundingBox: [0, 0, 2, 2],
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [0, 2],
        [0, 0],
      ],
    ],
  },
};

/** OpenPOI API の施設 1 件を返す。 */
function openPoiFacility(name: string, lng: number, lat: number) {
  return { name, city: "", address: "", lat, lng, licenses: ["CDLA-Permissive-2.0"], attributions: ["Overture Maps Foundation"] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPointInSearchRanges", () => {
  it("形のある範囲は形の中だけを含める", () => {
    expect(isPointInSearchRanges([0.5, 0.5], [triangleArea])).toBe(true);
    expect(isPointInSearchRanges([1.5, 1.5], [triangleArea])).toBe(false);
  });

  it("地図の表示範囲 (形が null) は矩形の中を含める", () => {
    expect(isPointInSearchRanges([1.5, 1.5], [{ boundingBox: [0, 0, 2, 2], geometry: null }])).toBe(true);
  });

  it("範囲が無い時は何も含めない", () => {
    expect(isPointInSearchRanges([0.5, 0.5], [])).toBe(false);
  });
});

describe("searchFacilitiesInRanges", () => {
  it("エリアごとに検索し、エリアの形の外の施設を除き、重なりで同じ施設を 1 件にする", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        count: 3,
        results: [openPoiFacility("中", 0.5, 0.5), openPoiFacility("矩形の中で三角形の外", 1.5, 1.5), openPoiFacility("中", 0.5, 0.5)],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { facilities, isTruncated } = await searchFacilitiesInRanges("公園", [
      triangleArea,
      { boundingBox: [0, 0, 1, 1], geometry: rectangle(0, 0, 1, 1) },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(facilities.map((facility) => facility.name)).toEqual(["中"]);
    expect(isTruncated).toBe(false);
  });

  it("エリアが多い時は全エリアを囲む 1 つの矩形で検索する", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ count: 0, results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await searchFacilitiesInRanges(
      "公園",
      Array.from({ length: maxSearchRequestsPerKeyword + 1 }, (_, index) => ({
        boundingBox: [index, 0, index + 1, 1] as [number, number, number, number],
        geometry: rectangle(index, 0, index + 1, 1),
      })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("bbox")).toBe(
      `0.00000,0.00000,${(maxSearchRequestsPerKeyword + 1).toFixed(5)},1.00000`,
    );
  });

  it("どれかの検索が失敗した時は例外にする", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("", { status: 503 })));
    await expect(searchFacilitiesInRanges("公園", [triangleArea])).rejects.toThrow("HTTP 503");
  });
});

describe("addFacilityKeyword", () => {
  it("前後の空白を除いて、使っていない最初の色で足す", () => {
    expect(addFacilityKeyword([], "  公園 ")).toEqual([{ keyword: "公園", color: keywordPinColors[0] }]);
  });

  it("外したキーワードの色を次のキーワードに使う", () => {
    const keywords: FacilityKeyword[] = [{ keyword: "スーパー", color: keywordPinColors[1] }];
    expect(addFacilityKeyword(keywords, "公園")).toEqual([...keywords, { keyword: "公園", color: keywordPinColors[0] }]);
  });

  const unchangedCases: [string, FacilityKeyword[], string][] = [
    ["空", [], " "],
    ["追加済み", [{ keyword: "公園", color: keywordPinColors[0] }], "公園"],
    ["色が残っていない", keywordPinColors.map((color, index) => ({ keyword: `キーワード${index}`, color })), "公園"],
  ];
  it.each(unchangedCases)("%sの時は足さない", (_, keywords, keywordText) => {
    expect(addFacilityKeyword(keywords, keywordText)).toBe(keywords);
  });
});
