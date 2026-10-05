import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type BoundaryFeatureCollection, type MunicipalityProperties, municipalityBoundaryCode } from "../boundaries";
import {
  facilitiesFileSchema,
  facilityKindSchema,
  localGovernmentCheckDigit,
  municipalitiesFileSchema,
  municipalityIndicatorFieldSchema,
  programsFileSchema,
} from "./schema";

const dataDirectory = path.join(process.cwd(), "public", "data", "tokyo");
const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(path.join(dataDirectory, relativePath), "utf8"));

const { sources: municipalitySources, municipalities } = municipalitiesFileSchema.parse(readJson("municipalities.json"));
const municipalityCodes = municipalities.map((municipality) => municipality.code);

describe("localGovernmentCheckDigit", () => {
  it.each([
    // 総務省「全国地方公共団体コード仕様」の算出例
    ["16201", 9],
    ["13101", 6],
    // 余り数字が 0 のとき 1 (新宿区 131041)、1 のとき 0 (渋谷区 131130)
    ["13104", 1],
    ["13113", 0],
  ])("%s の検査数字は %i", (code5, checkDigit) => {
    expect(localGovernmentCheckDigit(code5)).toBe(checkDigit);
  });
});

describe("public/data/tokyo/municipalities.json", () => {
  it("東京都 62 区市町村が全国地方公共団体コードの順に 1 行ずつある", () => {
    expect(municipalityCodes).toHaveLength(62);
    expect(new Set(municipalityCodes).size).toBe(62);
    expect(municipalityCodes).toEqual([...municipalityCodes].sort());
    expect(municipalityCodes.every((code) => code.startsWith("13"))).toBe(true);
  });

  it("値が null の指標には欠損の理由があり、理由のある指標は null になっている", () => {
    for (const municipality of municipalities) {
      const nullFields = municipalityIndicatorFieldSchema.options.filter((field) => municipality[field] === null);
      expect(municipality.missing.map((missing) => missing.field).sort(), municipality.name).toEqual(nullFields.sort());
    }
  });

  it("保育所等の利用状況と医療費助成は 62 区市町村すべてで取れている", () => {
    // 現在の出典は 2 つとも 62 区市町村すべての行を持つ (2026-10-04 に確認)。PDF の行の組み立てがずれて
    // 照合から漏れても欠損として通ってしまうため、出典に行が無くなった時はこのテストを直してから欠損として扱う
    expect(municipalities.filter((municipality) => municipality.childcare === null).map(({ name }) => name)).toEqual([]);
    expect(municipalities.filter((municipality) => municipality.medicalSubsidy === null).map(({ name }) => name)).toEqual([]);
  });

  it("指標の出典がファイルの sources にある", () => {
    const sourceIds = new Set(municipalitySources.map((source) => source.id));
    for (const municipality of municipalities) {
      for (const indicator of [municipality.childcare, municipality.medicalSubsidy]) {
        if (indicator !== null) expect(sourceIds.has(indicator.sourceId), indicator.sourceId).toBe(true);
      }
    }
  });

  it("区市町村の境界データと 1 対 1 で対応する (地図の色分けが区市町村コードで引ける)", () => {
    const boundaryCodes = (
      JSON.parse(
        readFileSync(path.join(process.cwd(), "public", "data", "boundaries", "tokyo-municipalities.geojson"), "utf8"),
      ) as BoundaryFeatureCollection<MunicipalityProperties>
    ).features.map((feature) => feature.properties.code);
    expect(municipalityCodes.map(municipalityBoundaryCode).sort()).toEqual([...boundaryCodes].sort());
  });

  it("公表値と一致する (照合のずれで別の区市町村の値が入っていない)", () => {
    const byName = new Map(municipalities.map((municipality) => [municipality.name, municipality]));
    // 東京都「都内の保育サービスの状況について」(令和8年4月1日) の表4 と同じ待機児童数
    expect(byName.get("世田谷区")?.childcare?.waitingChildrenCount).toBe(166);
    expect(byName.get("北区")?.childcare?.waitingChildrenCount).toBe(103);
    expect(byName.get("大田区")?.childcare?.waitingChildrenCount).toBe(48);
    // こども医療費助成の所得制限がある 4 市と、通院の一部自己負担がある 18 自治体 (documents/PROJECT.md「実装の前提になる調査結果」)
    expect(
      municipalities.filter((municipality) => municipality.medicalSubsidy?.outpatientHasIncomeLimit).map(({ name }) => name),
    ).toEqual(["東村山市", "狛江市", "東久留米市", "羽村市"]);
    expect(municipalities.filter((municipality) => municipality.medicalSubsidy?.outpatientHasCopayment)).toHaveLength(18);
    expect(byName.get("青ヶ島村")?.medicalSubsidy?.outpatientHasCopayment).toBe(true);
  });
});

describe("public/data/tokyo/programs/*.json", () => {
  it.each(municipalities)("$name ($code) の制度一覧がある", ({ code, programCount }) => {
    const file = programsFileSchema.parse(readJson(`programs/${code}.json`));
    expect(file.municipalityCode).toBe(code);
    expect(file.programs).toHaveLength(programCount);
    expect(new Set(file.programs.map((program) => program.psid)).size).toBe(programCount);
    const sourceIds = new Set(file.sources.map((source) => source.id));
    expect(file.programs.every((program) => sourceIds.has(program.sourceId))).toBe(true);
  });
});

describe("public/data/tokyo/facilities.geojson", () => {
  const { sources, features } = facilitiesFileSchema.parse(readJson("facilities.geojson"));

  it("すべての種類の施設があり、区市町村コードは 62 区市町村のどれか", () => {
    expect(new Set(features.map((feature) => feature.properties.kind))).toEqual(new Set(facilityKindSchema.options));
    const codes = new Set(municipalityCodes);
    expect(features.every((feature) => codes.has(feature.properties.municipalityCode))).toBe(true);
  });

  it("同じ施設・同じ種類の重複が無い", () => {
    const keys = features.map((feature) => `${feature.properties.kind}:${feature.properties.facilityId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("施設の出典がファイルの sources にある", () => {
    const sourceIds = new Set(sources.map((source) => source.id));
    expect(features.every((feature) => sourceIds.has(feature.properties.sourceId))).toBe(true);
  });
});
