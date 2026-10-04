/**
 * 東京都 62 区市町村の子育てに関するデータ (指標・制度一覧・施設) を、公開データから生成して `public/data/tokyo/` に書き出す。
 *
 * 実行: `make data-tokyo` (手順と出典は `documents/PROJECT.md`「東京都の子育てデータの生成」)。
 * 取得したファイルは `tmp/data-cache/` に置き、2 回目以降はそれを使う。同じ入力からは同じ出力になる (冪等)。
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import { getDocumentProxy } from "unpdf";
import {
  facilitiesFileSchema,
  municipalitiesFileSchema,
  programsFileSchema,
  type DataSource,
} from "../../../src/lib/tokyoData/schema";
import { tokyoDataSources } from "../../../src/lib/tokyoData/sources";
import {
  type MunicipalityKey,
  compareCodeUnits,
  csvRecords,
  indexByMunicipalityName,
  medicalFacilityFeatures,
  parseChildcareSheet,
  parseCsv,
  parseMedicalSubsidyLine,
  parseRegistry,
  welfareFacilityFeatures,
} from "./parse";

const cacheDirectory = path.join(process.cwd(), "tmp", "data-cache");
const outputDirectory = path.join(process.cwd(), "public", "data", "tokyo");
const prefectureName = "東京都";
const prefectureCode = "13";
const tokyoMunicipalityCount = 62;

/** URL のファイルを `tmp/data-cache/` から読む。無ければ取得して置く。 */
async function download(url: string): Promise<Uint8Array> {
  const cachePath = path.join(cacheDirectory, decodeURIComponent(new URL(url).pathname).replaceAll("/", "_"));
  try {
    return new Uint8Array(await readFile(cachePath));
  } catch {
    // 一部の提供元は既定の User-Agent を拒否するため、ブラウザと同じ形の値を送る
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (machimiru data generator)" } });
    if (!response.ok) throw new Error(`${url} を取得できない: ${response.status}`);
    const body = new Uint8Array(await response.arrayBuffer());
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cachePath, body);
    return body;
  }
}

/** zip の中の、名前が `suffix` で終わるファイルを文字列で返す。 */
function unzipText(zip: Uint8Array, suffix: string): string {
  const entry = Object.entries(unzipSync(zip)).find(([name]) => name.endsWith(suffix));
  if (entry === undefined) throw new Error(`zip に ${suffix} が無い`);
  return strFromU8(entry[1]);
}

/** PDF の各ページの文字を、同じ高さのものを 1 行にまとめ、左から順に `|` でつないだ行の配列にする。 */
async function pdfLines(pdf: Uint8Array): Promise<string[]> {
  const document = await getDocumentProxy(pdf);
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const item of (await (await document.getPage(pageNumber)).getTextContent()).items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      const y = Math.round(item.transform[5]);
      rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4], text: item.str.trim() }]);
    }
    for (const [, items] of [...rows].sort(([a], [b]) => b - a)) {
      lines.push(items.sort((a, b) => a.x - b.x).map((item) => item.text).join("|"));
    }
  }
  return lines;
}

/** JSON を 2 スペースのインデントと末尾の改行つきで書く。 */
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const registry = parseRegistry(
    JSON.parse(strFromU8(await download(tokyoDataSources.kosodateRegistry.fileUrls[0]))),
  );
  for (const unknown of registry.unknownCategories) console.warn(`一覧に無いカテゴリーコードを捨てた: ${unknown}`);
  for (const unusable of registry.unusableUrls) console.warn(`http(s) の URL として読めないため捨てた: ${unusable}`);

  const municipalities: MunicipalityKey[] = [
    ...new Map(
      registry.programs
        .map(({ municipality }) => municipality)
        .filter((municipality) => municipality.code.slice(2, 5) !== "000")
        .map((municipality) => [municipality.code, municipality]),
    ).values(),
  ].sort((a, b) => compareCodeUnits(a.code, b.code));
  console.warn(
    `区市町村ではなく都道府県 (東京都) が実施する制度は区市町村のファイルに入れない: ${registry.programs.filter(({ municipality }) => municipality.code.slice(2, 5) === "000").length} 件`,
  );
  if (municipalities.length !== tokyoMunicipalityCount) {
    throw new Error(`区市町村の数が ${tokyoMunicipalityCount} ではない: ${municipalities.length}`);
  }
  const codeByCode5 = new Map(municipalities.map((municipality) => [municipality.code.slice(0, 5), municipality.code]));
  const municipalityCodeOf = (code5: string): string => {
    const code = codeByCode5.get(code5);
    if (code === undefined) throw new Error(`団体コードを照合できない: ${code5}`);
    return code;
  };

  const childcareSheets = await readXlsxFile(Buffer.from(await download(tokyoDataSources.childcareStatus.fileUrls[0])));
  const childcareSheet = childcareSheets.find(({ sheet }) => sheet === "申込者の状況");
  if (childcareSheet === undefined) throw new Error("申込者の状況シートが無い");
  const childcareByCode = indexByMunicipalityName(
    municipalities,
    parseChildcareSheet(childcareSheet.data, prefectureName),
  );

  const medicalSubsidyByCode = indexByMunicipalityName(
    municipalities,
    (await pdfLines(await download(tokyoDataSources.medicalSubsidy.fileUrls[0])))
      .map((line) => parseMedicalSubsidyLine(line, prefectureName))
      .filter((row) => row !== null),
  );

  const programsByCode = Map.groupBy(registry.programs, ({ municipality }) => municipality.code);
  const usageRateMissingReason =
    "区市町村別の保育サービスの利用率を出す東京都「都内の保育サービスの状況について」は、東京都公式ホームページのサイトポリシーが私的使用・引用以外の複製・転用を認めず、オープンデータのライセンスが付いていないため使わない。就学前児童人口の区市町村別の値を持つオープンデータを確認できていないため、計算もしていない";

  // 途中の取得・照合の失敗で新旧のファイルが混ざらないよう、すべて組み立てて検査してから書き出す
  const municipalitiesFile = municipalitiesFileSchema.parse({
      sources: [tokyoDataSources.childcareStatus, tokyoDataSources.medicalSubsidy, tokyoDataSources.kosodateRegistry],
      municipalities: municipalities.map(({ code, name }) => {
        const childcare = childcareByCode.get(code);
        const medicalSubsidy = medicalSubsidyByCode.get(code);
        return {
          code,
          name,
          childcare: childcare === undefined ? null : { sourceId: tokyoDataSources.childcareStatus.id, ...childcare },
          childcareUsageRate: null,
          medicalSubsidy:
            medicalSubsidy === undefined ? null : { sourceId: tokyoDataSources.medicalSubsidy.id, ...medicalSubsidy },
          programCount: programsByCode.get(code)?.length ?? 0,
          missing: [
            ...(childcare === undefined
              ? [{ field: "childcare", reason: `${tokyoDataSources.childcareStatus.title} にこの区市町村の行が無い` }]
              : []),
            { field: "childcareUsageRate", reason: usageRateMissingReason },
            ...(medicalSubsidy === undefined
              ? [{ field: "medicalSubsidy", reason: `${tokyoDataSources.medicalSubsidy.title} にこの区市町村の行が無い` }]
              : []),
          ],
        };
      }),
  });

  const programsFiles = municipalities.map(({ code }) =>
    programsFileSchema.parse({
      sources: [tokyoDataSources.kosodateRegistry],
      municipalityCode: code,
      programs: (programsByCode.get(code) ?? [])
        .map(({ program }) => ({ sourceId: tokyoDataSources.kosodateRegistry.id, ...program }))
        .sort((a, b) => compareCodeUnits(a.psid, b.psid)),
    }),
  );

  const medicalFiles = await Promise.all(
    tokyoDataSources.medicalFacilities.fileUrls.map(async (url) =>
      csvRecords(parseCsv(unzipText(await download(url), ".csv"))),
    ),
  );
  const [hospitalFacilities, hospitalSpecialities, clinicFacilities, clinicSpecialities] = medicalFiles;
  const medical = [
    medicalFacilityFeatures(hospitalFacilities, hospitalSpecialities, prefectureCode, municipalityCodeOf, tokyoDataSources.medicalFacilities.id),
    medicalFacilityFeatures(clinicFacilities, clinicSpecialities, prefectureCode, municipalityCodeOf, tokyoDataSources.medicalFacilities.id),
  ];
  for (const skipped of medical.flatMap((result) => result.skipped)) console.warn(`座標が無いため除いた: ${skipped}`);
  const welfare = welfareFacilityFeatures(
    JSON.parse(unzipText(await download(tokyoDataSources.welfareFacilities.fileUrls[0]), ".geojson")),
    municipalityCodeOf,
    tokyoDataSources.welfareFacilities.id,
  );
  const facilities = facilitiesFileSchema.parse({
    type: "FeatureCollection",
    sources: [tokyoDataSources.medicalFacilities, tokyoDataSources.welfareFacilities] satisfies DataSource[],
    features: [...medical.flatMap((result) => result.features), ...welfare].sort(
      (a, b) =>
        compareCodeUnits(a.properties.kind, b.properties.kind) ||
        compareCodeUnits(a.properties.municipalityCode, b.properties.municipalityCode) ||
        compareCodeUnits(a.properties.facilityId, b.properties.facilityId),
    ),
  });

  await writeJson(path.join(outputDirectory, "municipalities.json"), municipalitiesFile);
  // 区市町村が減った時に古いファイルを残さないため、毎回作り直す
  await rm(path.join(outputDirectory, "programs"), { recursive: true, force: true });
  for (const programsFile of programsFiles) {
    await writeJson(path.join(outputDirectory, "programs", `${programsFile.municipalityCode}.json`), programsFile);
  }
  // 差分を読みやすくするため、Feature を 1 行に 1 件で書く
  await writeFile(
    path.join(outputDirectory, "facilities.geojson"),
    `{"type":"FeatureCollection","sources":${JSON.stringify(facilities.sources)},"features":[\n${facilities.features
      .map((feature) => JSON.stringify(feature))
      .join(",\n")}\n]}\n`,
  );

  console.log(
    `区市町村 ${municipalities.length} 件 / 制度 ${municipalities.reduce((sum, { code }) => sum + (programsByCode.get(code)?.length ?? 0), 0)} 件 / 施設 ${facilities.features.length} 件を ${path.relative(process.cwd(), outputDirectory)} に書いた`,
  );
}

await main();
