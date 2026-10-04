import { z } from "zod";
import {
  type FacilityKind,
  type ProgramCategoryCode,
  childcareSchema,
  facilityFeatureSchema,
  medicalSubsidySchema,
  programCategoryNames,
  programSchema,
  programUrlSchema,
} from "../../../src/lib/tokyoData/schema";

/** 生成スクリプトの中で区市町村を照合するための、全国地方公共団体コードと名称の対。 */
export type MunicipalityKey = { code: string; name: string };

/**
 * 文字列を UTF-16 のコード単位の順で比べる。`localeCompare` と違い実行環境のロケールに依存しないため、
 * どの環境で生成しても同じ並びになる。
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 区市町村名を、出典ごとの表記ゆれ (「青ケ島村」と「青ヶ島村」、末尾のタブ) を吸収した照合用の文字列にする。
 */
export function normalizeMunicipalityName(name: string): string {
  return name.trim().replaceAll("ヶ", "ケ");
}

/**
 * 名称で照合する出典の行を、区市町村の全国地方公共団体コードに対応づける。
 * 照合できない行・同じ区市町村の重複行があれば例外にする (照合の失敗を欠損に見せないため)。
 */
export function indexByMunicipalityName<T>(
  municipalities: MunicipalityKey[],
  rows: { name: string; value: T }[],
): Map<string, T> {
  const codeByName = new Map(municipalities.map((m) => [normalizeMunicipalityName(m.name), m.code]));
  const byCode = new Map<string, T>();
  for (const row of rows) {
    const code = codeByName.get(normalizeMunicipalityName(row.name));
    if (code === undefined) throw new Error(`区市町村名を照合できない: ${row.name}`);
    if (byCode.has(code)) throw new Error(`同じ区市町村の行が重複している: ${row.name}`);
    byCode.set(code, row.value);
  }
  return byCode;
}

/** 子育て支援制度レジストリ JSON の 1 行のうち、生成に使う項目 (レジストリ README「6. JSONデータ定義」)。 */
const registryRowSchema = z.object({
  institutionName: z.object({ canonicalName: z.string(), shortName: z.string().nullish() }),
  summary: z.string().nullish(),
  target: z.object({ targetPersons: z.string().nullish() }),
  localGovernmentLink: z.object({ uri: z.string().nullish() }),
  area: z.object({ areaCode: z.string() }),
  basicInformation: z.object({ psid: z.string() }),
  tag: z.object({ categoryCode: z.array(z.string()).nullish() }),
});

/** 子育て支援制度レジストリの制度 1 件と、その制度の区市町村。 */
export type RegistryProgram = { municipality: MunicipalityKey; program: z.infer<typeof programSchema> };

/**
 * 子育て支援制度レジストリ JSON (配列) を制度の一覧にする。
 * 一覧に無いカテゴリーコード (元データの誤り) は捨てて `unknownCategories` に、http(s) の URL として読めない制度のページの値は
 * null にして `unusableUrls` に返す。
 */
export function parseRegistry(json: unknown): {
  programs: RegistryProgram[];
  unknownCategories: string[];
  unusableUrls: string[];
} {
  const unknownCategories: string[] = [];
  const unusableUrls: string[] = [];
  const programs = z
    .array(registryRowSchema)
    .parse(json)
    .map((row) => {
      const [code, name] = row.area.areaCode.split(";");
      const url = blankToNull(row.localGovernmentLink.uri);
      const usableUrl = url === null ? null : firstProgramUrl(url);
      if (url !== null && usableUrl === null) unusableUrls.push(`${row.basicInformation.psid}: ${url}`);
      return {
        municipality: { code: code.trim(), name: name.trim() },
        program: {
          psid: row.basicInformation.psid,
          name: row.institutionName.canonicalName.trim(),
          shortName: blankToNull(row.institutionName.shortName),
          summary: blankToNull(row.summary),
          targetPersons: blankToNull(row.target.targetPersons),
          categories: normalizeCategoryCodes(row.tag.categoryCode ?? []).filter((category): category is ProgramCategoryCode => {
            if (category in programCategoryNames) return true;
            unknownCategories.push(`${row.basicInformation.psid}: ${category}`);
            return false;
          }),
          url: usableUrl,
        },
      };
    });
  return { programs, unknownCategories, unusableUrls };
}

/**
 * レジストリの制度のページの値から、画面にリンクとして出せる http(s) の URL を 1 つ取り出す。読めなければ null を返す。
 * 元データには、改行で 2 つの URL を並べた値 (八王子市) と、URL の途中に改行が入った値 (台東区) があるため、
 * 次の URL の前の空白で分けて先頭だけを使い、残った空白を除く。
 */
export function firstProgramUrl(value: string): string | null {
  const parsed = programUrlSchema.safeParse(value.split(/\s+(?=https?:\/\/)/)[0].replace(/\s+/g, ""));
  return parsed.success ? parsed.data : null;
}

/**
 * レジストリのタグのコードの表記ゆれ (カテゴリーの `"002，003"` の全角読点・`"027 "` の末尾空白、対象者タグの `"86"` の 2 桁) を
 * 3 桁のコードの並びにそろえる。生成はカテゴリーにだけ使うが、同じ表記ゆれが入り得るため 2 桁も扱う。
 */
export function normalizeCategoryCodes(values: string[]): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => value.split(/[,，、]/))
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => (/^\d{1,2}$/.test(part) ? part.padStart(3, "0") : part)),
    ),
  ];
}

function blankToNull(value: string | null | undefined): string | null {
  return value === null || value === undefined || value.trim() === "" ? null : value.trim();
}

/** 保育所等関連状況取りまとめ「申込者の状況」シートの、区市町村名の列と値の列の位置 (令和8年4月1日版の見出しで確認)。 */
const childcareColumns = { prefecture: 2, municipality: 3, applicants: 4, enrolledFirst: 5, enrolledLast: 11, waiting: 15 };

/**
 * 保育所等関連状況取りまとめ「申込者の状況」シートから、指定した都道府県の区市町村の行を取り出す。
 * 見出しの位置が想定と違う場合は例外にする (版の違いで列がずれたまま数値を取らないため)。
 */
export function parseChildcareSheet(
  rows: unknown[][],
  prefecture: string,
): { name: string; value: Omit<z.infer<typeof childcareSchema>, "sourceId"> }[] {
  const header = rows.find((row) => row[childcareColumns.prefecture] === "都道府県");
  if (
    header === undefined ||
    header[childcareColumns.municipality] !== "市区町村" ||
    header[childcareColumns.applicants] !== "申込者数" ||
    header[childcareColumns.enrolledFirst] !== "保育所を利用している者" ||
    header[childcareColumns.enrolledLast] !== "地方単独事業を利用している者" ||
    header[childcareColumns.waiting] !== "待機児童"
  ) {
    throw new Error("申込者の状況シートの見出しが想定と違う");
  }
  return rows
    .filter((row) => row[childcareColumns.prefecture] === prefecture)
    .map((row) => ({
      name: String(row[childcareColumns.municipality]),
      value: {
        applicantCount: z.int().parse(row[childcareColumns.applicants]),
        enrolledCount: row
          .slice(childcareColumns.enrolledFirst, childcareColumns.enrolledLast + 1)
          .reduce<number>((sum, count) => sum + z.int().parse(count), 0),
        waitingChildrenCount: z.int().parse(row[childcareColumns.waiting]),
      },
    }));
}

/**
 * 「こども医療費に対する助成の実施状況調査（市区町村用）」の 1 行 (セルを `|` でつないだ文字列) を読む。
 * 指定した都道府県の行でなければ null を返す。対象年齢が「N歳年度末」以外の形なら例外にする。
 */
export function parseMedicalSubsidyLine(
  line: string,
  prefecture: string,
): { name: string; value: Omit<z.infer<typeof medicalSubsidySchema>, "sourceId"> } | null {
  const cells = line.split("|");
  if (cells[0] !== prefecture) return null;
  const [, , name, outpatientAge, inpatientAge, outpatientIncome, inpatientIncome, outpatientCopay, inpatientCopay] = cells;
  if (cells.length !== 9) throw new Error(`列の数が想定と違う: ${line}`);
  return {
    name,
    value: {
      outpatientMaxAgeAtFiscalYearEnd: parseAgeAtFiscalYearEnd(outpatientAge),
      inpatientMaxAgeAtFiscalYearEnd: parseAgeAtFiscalYearEnd(inpatientAge),
      outpatientHasIncomeLimit: parseYesNo(outpatientIncome),
      inpatientHasIncomeLimit: parseYesNo(inpatientIncome),
      outpatientHasCopayment: parseYesNo(outpatientCopay),
      inpatientHasCopayment: parseYesNo(inpatientCopay),
    },
  };
}

function parseAgeAtFiscalYearEnd(cell: string): number {
  const match = /^(\d+)歳年度末$/.exec(cell);
  if (match === null) throw new Error(`対象年齢を読めない: ${cell}`);
  return Number(match[1]);
}

function parseYesNo(cell: string): boolean {
  if (cell === "有") return true;
  if (cell === "無") return false;
  throw new Error(`有無を読めない: ${cell}`);
}

/**
 * CSV (RFC 4180。ダブルクオートで囲んだ値の中のカンマ・ダブルクオートを扱う) を行の配列にする。先頭の BOM は捨てる。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** CSV の行の配列を、1 行目の見出しをキーにしたオブジェクトの配列にする。 */
export function csvRecords(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  // 末尾の空欄を省いた行でも、CSV の空欄と同じ扱い (空文字) にそろえるため
  return body.map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])));
}

/**
 * 医療情報ネットの診療科目コードと、施設の種類の対応 (医療情報ネット_オープンデータ定義書の診療科目コード)。
 * 出産できる施設を探す用途のため産科 (04002) を産婦人科に含め、婦人科 (04003) と生殖医療 (04004) は含めない。
 */
export const medicalDepartmentKinds: Record<string, FacilityKind> = {
  "03001": "pediatrics",
  "04001": "obstetrics",
  "04002": "obstetrics",
};

/** 生成する施設 1 件 (GeoJSON の Feature)。 */
type FacilityFeature = z.infer<typeof facilityFeatureSchema>;

/**
 * 医療情報ネットの施設票と診療科・診療時間票から、指定した都道府県の小児科・産婦人科・産科の施設を取り出す。
 * 1 つの医療機関が小児科と産婦人科の両方を持つ場合は、種類ごとに 1 件ずつ返す。座標の無い施設は除き、`skipped` に返す。
 */
export function medicalFacilityFeatures(
  facilities: Record<string, string>[],
  specialities: Record<string, string>[],
  prefectureCode: string,
  municipalityCodeOf: (code5: string) => string,
  sourceId: string,
): { features: FacilityFeature[]; skipped: string[] } {
  const kindsById = new Map<string, Set<FacilityKind>>();
  for (const speciality of specialities) {
    const kind = medicalDepartmentKinds[speciality["診療科目コード"]];
    if (kind === undefined) continue;
    kindsById.set(speciality["ID"], (kindsById.get(speciality["ID"]) ?? new Set()).add(kind));
  }
  const skipped: string[] = [];
  const features = facilities
    .filter((facility) => facility["都道府県コード"] === prefectureCode && kindsById.has(facility["ID"]))
    .flatMap((facility) => {
      // 座標が未登録の施設は空欄か 0.0 になっている (2026年6月1日時点のデータで確認)
      if (!Number(facility["所在地座標（緯度）"]) || !Number(facility["所在地座標（経度）"])) {
        skipped.push(`${facility["ID"]} ${facility["正式名称"]}`);
        return [];
      }
      return [...(kindsById.get(facility["ID"]) ?? [])].map((kind) =>
        facilityFeatureSchema.parse({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [Number(facility["所在地座標（経度）"]), Number(facility["所在地座標（緯度）"])],
          },
          properties: {
            sourceId,
            facilityId: facility["ID"],
            kind,
            name: facility["正式名称"],
            address: facility["所在地"],
            municipalityCode: municipalityCodeOf(`${facility["都道府県コード"]}${facility["市区町村コード"]}`),
            positionAccuracy: null,
          },
        }),
      );
    });
  return { features, skipped };
}

/** 国土数値情報 福祉施設 P14 の福祉施設小分類コードと、施設の種類の対応 (福祉施設小分類コード表)。 */
export const welfareFacilityKinds: Record<string, FacilityKind> = {
  "050401": "nursery",
  "050402": "certifiedChildcareCenter",
  "050403": "certifiedChildcareCenter",
  "050404": "certifiedChildcareCenter",
  "050405": "certifiedChildcareCenter",
};

/** 国土数値情報 福祉施設 P14 の GeoJSON の Feature のうち、生成に使う項目。 */
const welfareFeatureSchema = z.object({
  properties: z.object({
    P14_001: z.string(),
    P14_002: z.string(),
    P14_003: z.string(),
    P14_004: z.string(),
    P14_007: z.string(),
    P14_008: z.string(),
    P14_010: z.int(),
  }),
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
});

/**
 * 国土数値情報 福祉施設 P14 の GeoJSON から、保育所と認定こども園を取り出す。
 * 識別子が提供されていないため、`facilityId` は行政区域コード・名称・所在地をつないだ値にする。
 */
export function welfareFacilityFeatures(
  geojson: { features: { properties: { P14_007: string } }[] },
  municipalityCodeOf: (code5: string) => string,
  sourceId: string,
): FacilityFeature[] {
  return geojson.features
    .filter((feature) => feature.properties.P14_007 in welfareFacilityKinds)
    .map((feature) => welfareFeatureSchema.parse(feature))
    .map(({ properties, geometry }) =>
      facilityFeatureSchema.parse({
        type: "Feature",
        geometry: { type: "Point", coordinates: geometry.coordinates },
        properties: {
          sourceId,
          facilityId: `${properties.P14_003}:${properties.P14_008}:${properties.P14_004}`,
          kind: welfareFacilityKinds[properties.P14_007],
          name: properties.P14_008,
          address: `${properties.P14_001}${properties.P14_002}${properties.P14_004}`,
          municipalityCode: municipalityCodeOf(properties.P14_003),
          positionAccuracy: properties.P14_010,
        },
      }),
    );
}
