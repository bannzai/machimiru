import { readFileSync } from "node:fs";
import path from "node:path";
import { municipalitiesFileSchema, programsFileSchema } from "./schema";

/** 東京都の子育てデータ (`make data-tokyo` の生成物) を置くディレクトリ。 */
const tokyoDataDirectory = path.join(process.cwd(), "public", "data", "tokyo");

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
