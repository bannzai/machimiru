import type { MultiPolygon, Polygon, Position } from "geojson";
import { type BoundingBox, isPointInBoundingBox, isPointInGeometry, unionBoundingBox } from "./geometry";
import { type LocatedOpenPoiFacility, searchOpenPoi } from "./openPoi";
import type { FacilityKind } from "./tokyoData/schema";

/** 施設を探す範囲 1 つ。選択中のエリア 1 つ、またはエリアを選んでいない時の地図の表示範囲。 */
export type SearchRange = {
  /** 範囲を囲む矩形。OpenPOI API に bbox として渡す。 */
  boundingBox: BoundingBox;
  /** 範囲の形。地図の表示範囲では矩形そのものが範囲のため null。 */
  geometry: Polygon | MultiPolygon | null;
};

/** point ([経度, 緯度]) が ranges のどれかの中にあるかを返す。 */
export function isPointInSearchRanges(point: Position, ranges: readonly SearchRange[]): boolean {
  return ranges.some(
    (range) =>
      isPointInBoundingBox(point, range.boundingBox) && (range.geometry === null || isPointInGeometry(point, range.geometry)),
  );
}

// 区市町村を見比べる使い方で同時に選ぶのは数個と見込む。町丁をまとめて選んだ時に、キーワードの数 × エリアの数の
// リクエストを、全利用者で共有する OpenPOI API の上限 (定常 200 req/s。 https://docs.openpoiapi.com/ のレート制限) へ送らないため
/** キーワード 1 つの検索で、エリアごとにリクエストを分ける最大のエリアの数。超える時は全エリアを囲む 1 つの矩形で検索する。 */
export const maxSearchRequestsPerKeyword = 6;

/**
 * OpenPOI API で keyword を ranges の範囲で検索し、ranges の中の施設を返す。
 * 複数の範囲で同じ施設 (名前と座標が同じ) が見つかった時は 1 件にする。どれかの検索が失敗した時は例外にする。
 */
export async function searchFacilitiesInRanges(
  keyword: string,
  ranges: readonly SearchRange[],
): Promise<{ facilities: LocatedOpenPoiFacility[]; isTruncated: boolean }> {
  const searchResults = await Promise.all(
    (ranges.length <= maxSearchRequestsPerKeyword
      ? ranges.map((range) => range.boundingBox)
      : [unionBoundingBox(ranges.map((range) => range.boundingBox))]
    ).map((boundingBox) => searchOpenPoi(keyword, boundingBox)),
  );
  const facilitiesByKey = new Map(
    searchResults
      .flatMap((searchResult) => searchResult.facilities)
      .filter((facility) => isPointInSearchRanges([facility.lng, facility.lat], ranges))
      .map((facility) => [`${facility.name}\n${facility.lng}\n${facility.lat}`, facility] as const),
  );
  return {
    facilities: [...facilitiesByKey.values()],
    isTruncated: searchResults.some((searchResult) => searchResult.isTruncated),
  };
}

// 違いが見分けやすい色相から選び、エリアの塗り (青 #2563eb・橙 #ea580c) と子育て施設の色 (facilityKindPinColors) を避ける。
// 数はキーワードを同時に重ねられる上限になり、6 個を超えると色を見分けにくくなるため 6 にする
/** キーワードのピンの色。追加した順に、使っていない色を割り当てる。 */
export const keywordPinColors = ["#7c3aed", "#d97706", "#0284c7", "#92400e", "#334155", "#84cc16"] as const;

/** 地図にピンで重ねるキーワード 1 つ。 */
export type FacilityKeyword = {
  /** 入力されたキーワード (前後の空白を除いたもの)。 */
  keyword: string;
  /** ピンの色 (`keywordPinColors` のどれか)。 */
  color: string;
};

/**
 * keywords に keywordText を足した新しい配列を返す。色は `keywordPinColors` のうち使っていない最初の色にする。
 * 前後の空白を除いて空の時・追加済みの時・色が残っていない時は keywords をそのまま返す。
 */
export function addFacilityKeyword(keywords: readonly FacilityKeyword[], keywordText: string): readonly FacilityKeyword[] {
  const keyword = keywordText.trim();
  const color = keywordPinColors.find((pinColor) => !keywords.some((facilityKeyword) => facilityKeyword.color === pinColor));
  if (keyword === "" || !color || keywords.some((facilityKeyword) => facilityKeyword.keyword === keyword)) {
    return keywords;
  }
  return [...keywords, { keyword, color }];
}

/** 子育て施設の種類ごとのピンの色。キーワードの色 (keywordPinColors) とエリアの塗りの色を避ける。 */
export const facilityKindPinColors: Record<FacilityKind, string> = {
  pediatrics: "#dc2626",
  obstetrics: "#c026d3",
  nursery: "#16a34a",
  certifiedChildcareCenter: "#0d9488",
};
