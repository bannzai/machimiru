import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/** 区市町村の境界の属性。 */
export type MunicipalityProperties = {
  /** 全国地方公共団体コードの上 5 桁 (検査数字を除く。例: 新宿区は 13104)。 */
  code: string;
  /** 区市町村名 (例: 新宿区)。 */
  name: string;
};

/** 町丁 (e-Stat の小地域) の境界の属性。 */
export type TownProperties = {
  /** 町丁の識別子。都道府県 2 桁 + 市区町村 3 桁 + 町丁 6 桁 (e-Stat の PREF・CITY・S_AREA)。同じ名前の小地域を 1 つにまとめた町丁では、まとめた小地域のうち最初の 1 つの値。 */
  code: string;
  /** 町丁が属する区市町村の `MunicipalityProperties.code`。 */
  municipalityCode: string;
  /** 町丁名 (例: 西新宿二丁目)。 */
  name: string;
};

/** 境界データの提供元とライセンス。境界データのファイルに GeoJSON の foreign member `source` として入っている。 */
export type BoundarySource = {
  /** データの名前。 */
  name: string;
  /** 提供元。 */
  provider: string;
  /** ライセンス・利用条件の名前。 */
  license: string;
  /** ライセンス・利用条件のページ。 */
  licenseUrl: string;
  /** データの紹介ページ。 */
  pageUrl: string;
  /** 生成スクリプトが取得したファイルの URL。 */
  downloadUrl: string;
  /** 提供元が求める出典表示の文言の HTML。 */
  attribution: string;
  /** 取得日 (YYYY-MM-DD)。 */
  retrievedAt: string;
};

/** 境界データのファイル (public/data/boundaries/*.geojson) の中身。生成は scripts/generate-boundaries.ts、形式は documents/PROJECT.md「境界データ」。 */
export type BoundaryFeatureCollection<Properties> = FeatureCollection<Polygon | MultiPolygon, Properties> & {
  source: BoundarySource;
};

/** 島しょ部を除いた東京都 (西端の奥多摩町から東端の江戸川区まで) が収まる範囲。[[西端の経度, 南端の緯度], [東端の経度, 北端の緯度]]。 */
export const tokyoMainlandBounds: [[number, number], [number, number]] = [
  [138.94, 35.5],
  [139.93, 35.9],
];

/** 東京都の区市町村の境界データの URL。 */
export const municipalityBoundaryUrl = "/data/boundaries/tokyo-municipalities.geojson";

/** 東京都の町丁の境界データの URL。 */
export const townBoundaryUrl = "/data/boundaries/tokyo-towns.geojson";

/** 全国地方公共団体コード (6 桁。子育てデータの区市町村のキー) から、区市町村の境界の `MunicipalityProperties.code` (検査数字を除いた 5 桁) を返す。 */
export function municipalityBoundaryCode(localGovernmentCode: string): string {
  return localGovernmentCode.slice(0, 5);
}
