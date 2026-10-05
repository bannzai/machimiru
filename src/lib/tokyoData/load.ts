import { readFileSync } from "node:fs";
import path from "node:path";
import { type ConditionValues, computeConditionValues } from "../axes";
import type { BoundaryFeatureCollection, MunicipalityProperties } from "../boundaries";
import { type Municipality, facilitiesFileSchema, municipalitiesFileSchema, programsFileSchema } from "./schema";

/** municipalities の軸の条件ごとの値を、施設と区市町村の境界のデータを読んで求める。ビルド時の静的な描画だけで呼ぶ。 */
export function readConditionValues(municipalities: readonly Municipality[]): ConditionValues {
  return computeConditionValues({
    municipalities,
    facilitiesFile: readFacilitiesFile(),
    municipalityBoundaries: new Map(
      readMunicipalityBoundaries().features.map((feature) => [feature.properties.code, feature.geometry] as const),
    ),
  });
}

/** 東京都の子育てデータ (`make data-tokyo` の生成物) を置くディレクトリ。 */
const tokyoDataDirectory = path.join(process.cwd(), "public", "data", "tokyo");

/** `public/data/tokyo/facilities.geojson` を読み、スキーマで検査して返す。ビルド時の静的な描画だけで呼ぶ。 */
export function readFacilitiesFile() {
  return facilitiesFileSchema.parse(JSON.parse(readFileSync(path.join(tokyoDataDirectory, "facilities.geojson"), "utf8")));
}

/** 区市町村の境界データ (`make boundaries` の生成物) を読んで返す。ビルド時の静的な描画だけで呼ぶ。 */
export function readMunicipalityBoundaries(): BoundaryFeatureCollection<MunicipalityProperties> {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "data", "boundaries", "tokyo-municipalities.geojson"), "utf8"),
  );
}

/** `public/data/tokyo/municipalities.json` を読み、スキーマで検査して返す。ファイルを読むため、ビルド時の静的な描画だけで呼ぶ。 */
export function readMunicipalitiesFile() {
  return municipalitiesFileSchema.parse(JSON.parse(readFileSync(path.join(tokyoDataDirectory, "municipalities.json"), "utf8")));
}

/** municipalityCode (全国地方公共団体コード) の区市町村の子育て支援制度の一覧を読み、スキーマで検査して返す。ビルド時の静的な描画だけで呼ぶ。 */
export function readProgramsFile(municipalityCode: string) {
  return programsFileSchema.parse(
    JSON.parse(readFileSync(path.join(tokyoDataDirectory, "programs", `${municipalityCode}.json`), "utf8")),
  );
}
