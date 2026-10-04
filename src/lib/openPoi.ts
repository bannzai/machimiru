import { z } from "zod";
import type { BoundingBox } from "./geometry";

/** OpenPOI API の施設の検索のエンドポイント。仕様は https://api.openpoiapi.com/openapi.json の `/v1/search`。 */
export const openPoiSearchEndpoint = "https://api.openpoiapi.com/v1/search";

/**
 * OpenPOI API の出典・ライセンスのページ。結果を出す画面で「OpenPOI API」の文字からこのページへリンクする
 * ( https://docs.openpoiapi.com/ の FAQ「出典表示には何が必要ですか」。`.claude/rules/external-data-attribution.md`)。
 */
export const openPoiAttributionUrl = "https://openpoiapi.com/attribution.html";

// API が 1 回で返す件数の上限 (openapi.json の limit の maximum)。区市町村 1 つの範囲で「公園」のような多い語を探しても
// 取りこぼしを減らすため、上限まで取る
/** 1 回の検索で取る件数。 */
export const openPoiSearchLimit = 200;

/**
 * OpenPOI API の施設 1 件 (openapi.json の `Facility`)。画面で使う項目だけを検査し、ほかの項目もそのまま残す。
 * 1 件は 1 件の営業許可・届出、または Overture Maps の場所 1 件を表す。
 */
export const openPoiFacilitySchema = z.looseObject({
  /** 施設名。 */
  name: z.string(),
  /** 市区町村 (正規化済み)。提供元に無い時は空文字。 */
  city: z.string(),
  /** 所在地。提供元に無い時は空文字。 */
  address: z.string(),
  /** 緯度 (WGS84)。座標の無い施設は空文字。 */
  lat: z.union([z.number(), z.string()]),
  /** 経度 (WGS84)。座標の無い施設は空文字。 */
  lng: z.union([z.number(), z.string()]),
  /** 出所元のライセンスの一覧。 */
  licenses: z.array(z.string()),
  /** 出所元の帰属表示。結果を保存する時はレコードと一緒に保存する。 */
  attributions: z.array(z.string()),
});

/** OpenPOI API の施設 1 件。 */
export type OpenPoiFacility = z.infer<typeof openPoiFacilitySchema>;

/** 座標のある OpenPOI API の施設 1 件。地図にピンを立てられる。 */
export type LocatedOpenPoiFacility = OpenPoiFacility & { lat: number; lng: number };

/** OpenPOI API の `/v1/search` の応答 (openapi.json の `SearchResponse`)。 */
export const openPoiSearchResponseSchema = z.object({
  /** 返した件数。 */
  count: z.int().nonnegative(),
  results: z.array(openPoiFacilitySchema),
});

/** keyword を boundingBox の範囲で検索する `/v1/search` の URL を返す。 */
export function openPoiSearchUrl(keyword: string, boundingBox: BoundingBox): string {
  const url = new URL(openPoiSearchEndpoint);
  url.searchParams.set("q", keyword);
  // 地図を世界規模まで縮小すると表示範囲の経度が ±180 を超え、API が範囲外として 400 を返すため、経度・緯度の範囲に収める
  const [west, south, east, north] = boundingBox;
  const clampedBoundingBox = [
    Math.max(west, -180),
    Math.max(south, -90),
    Math.min(east, 180),
    Math.min(north, 90),
  ];
  // 小数 5 桁 (約 1 m) で足りる。地図の表示範囲の値をそのまま渡すと桁が長くなり、指数表記になると API が 400 を返す
  url.searchParams.set("bbox", clampedBoundingBox.map((degree) => degree.toFixed(5)).join(","));
  url.searchParams.set("limit", String(openPoiSearchLimit));
  return url.toString();
}

/**
 * OpenPOI API で keyword を boundingBox の範囲で検索する。座標の無い施設は地図に出せないため除く。
 * 件数が上限に達した (範囲の中にまだ施設がある見込みがある) かを `isTruncated` で返す。
 * HTTP のエラーと形式の合わない応答は例外にする。
 */
export async function searchOpenPoi(
  keyword: string,
  boundingBox: BoundingBox,
): Promise<{ facilities: LocatedOpenPoiFacility[]; isTruncated: boolean }> {
  const response = await fetch(openPoiSearchUrl(keyword, boundingBox));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const parsedResponse = openPoiSearchResponseSchema.safeParse(await response.json());
  // 検査の詳細 (zod の長い JSON) は画面のエラー表示に出すには長いため、短い文言にする
  if (!parsedResponse.success) {
    throw new Error("応答の形式が想定と違います");
  }
  const { count, results } = parsedResponse.data;
  return { facilities: results.filter(isLocatedOpenPoiFacility), isTruncated: count >= openPoiSearchLimit };
}

/** facility が座標を持つかを返す。座標の無い施設は lat・lng が空文字になる (openapi.json の `Facility`)。 */
function isLocatedOpenPoiFacility(facility: OpenPoiFacility): facility is LocatedOpenPoiFacility {
  return typeof facility.lat === "number" && typeof facility.lng === "number";
}
