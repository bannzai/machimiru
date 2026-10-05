/**
 * 軸の registry (`src/lib/axes.ts`) の OpenPOI API の判定器を持つ条件ごとに、東京都 62 区市町村の中で検索語に当たる施設を
 * OpenPOI API で検索し、`public/data/tokyo/openpoi/<条件の識別子>.geojson` に書き出す。
 *
 * 実行: `make data-openpoi` (手順は `documents/PROJECT.md`「OpenPOI API の検索結果の生成」)。
 * OpenPOI API のデータが同じなら同じ出力になる (取得日を除く)。API のデータは更新されるため、実行した日によって件数が変わる。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { registryConditions } from "../../../src/lib/axes";
import type { BoundaryFeatureCollection, MunicipalityProperties } from "../../../src/lib/boundaries";
import { type BoundingBox, boundingBoxOfGeometry, isPointInGeometry } from "../../../src/lib/geometry";
import {
  type LocatedOpenPoiFacility,
  openPoiAttributionUrl,
  openPoiSearchEndpoint,
  searchOpenPoi,
} from "../../../src/lib/openPoi";
import {
  type OpenPoiPlacesFile,
  localGovernmentCheckDigit,
  openPoiPlacesFileSchema,
} from "../../../src/lib/tokyoData/schema";
import { compareCodeUnits } from "../tokyo/parse";

const outputDirectory = path.join(process.cwd(), "public", "data", "tokyo", "openpoi");
const municipalityBoundaryPath = path.join(process.cwd(), "public", "data", "boundaries", "tokyo-municipalities.geojson");

// 件数が上限に達した範囲を 4 つに分けて探し直す回数の上限。8 回分けると 256 分の 1 の幅になり、本土で最も広い八王子市の範囲
// (経度 0.27 度・約 24 km) は約 100 m、島々を囲む小笠原村の範囲 (経度 17.9 度) でも経度 0.07 度 (大半は海) になる。
// そこに上限 (200 件) を超える施設が重なることは無いため、超えた時はデータか API の異常として止める
const maxSplitDepth = 8;

/**
 * keyword を boundingBox の範囲で検索し、座標のある施設をすべて返す。件数が API の上限に達した時は、範囲を 4 つに分けて探し直す。
 * 分けた範囲の辺の上の施設は重複して返ることがある。
 */
async function searchAllInBoundingBox(
  keyword: string,
  boundingBox: BoundingBox,
  depth = 0,
): Promise<LocatedOpenPoiFacility[]> {
  const { facilities, isTruncated } = await searchOpenPoi(keyword, boundingBox);
  if (!isTruncated) {
    return facilities;
  }
  if (depth >= maxSplitDepth) {
    throw new Error(`${boundingBox.join(",")} の「${keyword}」が、範囲を ${maxSplitDepth} 回分けても上限の件数を超える`);
  }
  const [west, south, east, north] = boundingBox;
  const middleLongitude = (west + east) / 2;
  const middleLatitude = (south + north) / 2;
  const quarters: BoundingBox[] = [
    [west, south, middleLongitude, middleLatitude],
    [middleLongitude, south, east, middleLatitude],
    [west, middleLatitude, middleLongitude, north],
    [middleLongitude, middleLatitude, east, north],
  ];
  const results: LocatedOpenPoiFacility[] = [];
  for (const quarter of quarters) {
    results.push(...(await searchAllInBoundingBox(keyword, quarter, depth + 1)));
  }
  return results;
}

/** searchKeywords をスペースでつないで東京都の区市町村ごとに検索し、区市町村の境界の中の施設を OpenPoiPlacesFile にして返す。 */
async function searchTokyoPlaces(
  searchKeywords: readonly string[],
  municipalities: BoundaryFeatureCollection<MunicipalityProperties>,
): Promise<OpenPoiPlacesFile> {
  const keyword = searchKeywords.join(" ");
  // 同じ施設が、隣の区市町村の範囲の検索や分けた範囲の辺の上で重複して返るため、名前と座標で 1 件にする (応答に施設の識別子が無い)。
  // 名前と座標が同じで出所元の違うレコードの出典を落とさないよう、licenses と attributions は合わせて持つ
  const featuresByKey = new Map<string, OpenPoiPlacesFile["features"][number]>();
  for (const { properties, geometry } of municipalities.features) {
    const facilities = await searchAllInBoundingBox(keyword, boundingBoxOfGeometry(geometry));
    const insideFacilities = facilities.filter((facility) => isPointInGeometry([facility.lng, facility.lat], geometry));
    for (const facility of insideFacilities) {
      const key = `${facility.name}\t${facility.lng}\t${facility.lat}`;
      const sameFeature = featuresByKey.get(key);
      featuresByKey.set(key, {
        type: "Feature",
        geometry: { type: "Point", coordinates: [facility.lng, facility.lat] },
        properties: {
          name: facility.name,
          municipalityCode: `${properties.code}${localGovernmentCheckDigit(properties.code)}`,
          licenses: [...new Set([...(sameFeature?.properties.licenses ?? []), ...facility.licenses])],
          attributions: [...new Set([...(sameFeature?.properties.attributions ?? []), ...facility.attributions])],
        },
      });
    }
    console.warn(`${properties.name}: 範囲の中 ${insideFacilities.length} 件 (検索結果 ${facilities.length} 件)`);
  }
  return openPoiPlacesFileSchema.parse({
    type: "FeatureCollection",
    source: {
      endpoint: openPoiSearchEndpoint,
      keywords: [...searchKeywords],
      retrievedOn: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()),
      attributionUrl: openPoiAttributionUrl,
    },
    // 実行環境のロケールで並びが変わらないよう、localeCompare ではなく文字コードの順で比べる
    features: [...featuresByKey.values()].sort(
      (a, b) =>
        compareCodeUnits(a.properties.municipalityCode, b.properties.municipalityCode) ||
        compareCodeUnits(a.properties.name, b.properties.name) ||
        a.geometry.coordinates[0] - b.geometry.coordinates[0] ||
        a.geometry.coordinates[1] - b.geometry.coordinates[1],
    ),
  } satisfies OpenPoiPlacesFile);
}

async function main(): Promise<void> {
  const municipalities: BoundaryFeatureCollection<MunicipalityProperties> = JSON.parse(
    await readFile(municipalityBoundaryPath, "utf8"),
  );
  for (const condition of registryConditions) {
    const { evaluator } = condition;
    if (evaluator.type !== "openPoi") {
      continue;
    }
    const placesFile = await searchTokyoPlaces(evaluator.searchKeywords, municipalities);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `${condition.id}.geojson`), `${JSON.stringify(placesFile, null, 2)}\n`);
    console.warn(`${condition.id}: ${placesFile.features.length} 件を書き出した`);
  }
}

await main();
