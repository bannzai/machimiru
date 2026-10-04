import { describe, expect, it } from "vitest";
import {
  csvRecords,
  indexByMunicipalityName,
  medicalFacilityFeatures,
  normalizeCategoryCodes,
  normalizeMunicipalityName,
  parseChildcareSheet,
  parseCsv,
  parseMedicalSubsidyLine,
  parseRegistry,
  welfareFacilityFeatures,
} from "./parse";

const municipalities = [
  { code: "131016", name: "千代田区" },
  { code: "134023", name: "青ヶ島村" },
];

describe("normalizeMunicipalityName", () => {
  it("出典ごとの「ケ」「ヶ」の違いと前後の空白を吸収する", () => {
    expect(normalizeMunicipalityName("青ケ島村")).toBe(normalizeMunicipalityName("青ヶ島村"));
    expect(normalizeMunicipalityName("檜原村\t")).toBe("檜原村");
  });
});

describe("indexByMunicipalityName", () => {
  it("名称の行を全国地方公共団体コードに対応づける", () => {
    expect(indexByMunicipalityName(municipalities, [{ name: "青ケ島村", value: 1 }])).toEqual(new Map([["134023", 1]]));
  });

  it("照合できない名称は欠損にせず例外にする", () => {
    expect(() => indexByMunicipalityName(municipalities, [{ name: "存在しない市", value: 1 }])).toThrow("照合できない");
  });

  it("同じ区市町村の行が 2 つあれば例外にする", () => {
    expect(() =>
      indexByMunicipalityName(municipalities, [
        { name: "千代田区", value: 1 },
        { name: "千代田区", value: 2 },
      ]),
    ).toThrow("重複");
  });
});

describe("normalizeCategoryCodes", () => {
  it("全角読点・末尾の空白・2 桁のコードを 3 桁のコードの並びにそろえる", () => {
    expect(normalizeCategoryCodes(["002，003", "027 ", "86", "002", ""])).toEqual(["002", "003", "027", "086"]);
  });
});

describe("parseRegistry", () => {
  const row = {
    institutionName: { canonicalName: "児童手当", shortName: "" },
    summary: "概要",
    target: { targetPersons: "中学生までの子を養育する人" },
    localGovernmentLink: { uri: "https://www.city.chiyoda.lg.jp/" },
    area: { areaCode: "131016;千代田区" },
    basicInformation: { psid: "psid3.0+3000020131016+1+UM1" },
    tag: { categoryCode: ["003", "087"] },
  };

  it("制度と区市町村を取り出し、一覧に無いカテゴリーコードを捨てて報告する", () => {
    expect(parseRegistry([row])).toEqual({
      programs: [
        {
          municipality: { code: "131016", name: "千代田区" },
          program: {
            psid: "psid3.0+3000020131016+1+UM1",
            name: "児童手当",
            shortName: null,
            summary: "概要",
            targetPersons: "中学生までの子を養育する人",
            categories: ["003"],
            url: "https://www.city.chiyoda.lg.jp/",
          },
        },
      ],
      unknownCategories: ["psid3.0+3000020131016+1+UM1: 087"],
    });
  });
});

describe("parseChildcareSheet", () => {
  const header = [null, null, "都道府県", "市区町村", "申込者数", "保育所を利用している者", "b", "c", "d", "e", "f", "地方単独事業を利用している者", "g", "h", "i", "待機児童"];

  it("指定した都道府県の行の申込者数・利用児童数の合計・待機児童数を返す", () => {
    expect(
      parseChildcareSheet(
        [
          header,
          ["北海道札幌市", 1, "北海道", "札幌市", 10, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 3],
          ["東京都千代田区", 2, "東京都", "千代田区", 100, 50, 10, 5, 4, 3, 2, 1, 0, 0, 0, 7],
        ],
        "東京都",
      ),
    ).toEqual([{ name: "千代田区", value: { applicantCount: 100, enrolledCount: 75, waitingChildrenCount: 7 } }]);
  });

  it("見出しの位置が想定と違えば例外にする", () => {
    expect(() => parseChildcareSheet([header.map((cell) => (cell === "待機児童" ? "その他" : cell))], "東京都")).toThrow(
      "見出し",
    );
  });
});

describe("parseMedicalSubsidyLine", () => {
  it("指定した都道府県の行を読む", () => {
    expect(parseMedicalSubsidyLine("東京都|36|東村山市|18歳年度末|18歳年度末|有|有|有|無", "東京都")).toEqual({
      name: "東村山市",
      value: {
        outpatientMaxAgeAtFiscalYearEnd: 18,
        inpatientMaxAgeAtFiscalYearEnd: 18,
        outpatientHasIncomeLimit: true,
        inpatientHasIncomeLimit: true,
        outpatientHasCopayment: true,
        inpatientHasCopayment: false,
      },
    });
  });

  it("他の都道府県の行と見出しの行は null を返す", () => {
    expect(parseMedicalSubsidyLine("北海道|1|札幌市|18歳年度末|18歳年度末|有|有|有|有", "東京都")).toBeNull();
    expect(parseMedicalSubsidyLine("都道府県名|市区町村名", "東京都")).toBeNull();
  });

  it("対象年齢・有無を読めない行は例外にする", () => {
    expect(() => parseMedicalSubsidyLine("東京都|1|千代田区|就学前|18歳年度末|無|無|無|無", "東京都")).toThrow("対象年齢");
    expect(() => parseMedicalSubsidyLine("東京都|1|千代田区|18歳年度末|18歳年度末|一部|無|無|無", "東京都")).toThrow("有無");
  });
});

describe("parseCsv", () => {
  it("BOM・CRLF・クオート内のカンマとダブルクオートを扱う", () => {
    expect(csvRecords(parseCsv('﻿"ID","名称"\r\n"1","a,""b"""\r\n'))).toEqual([{ ID: "1", 名称: 'a,"b"' }]);
  });
});

describe("medicalFacilityFeatures", () => {
  const facility = (id: string, latitude: string, longitude: string) => ({
    ID: id,
    正式名称: `施設${id}`,
    都道府県コード: "13",
    市区町村コード: "101",
    所在地: "東京都千代田区",
    "所在地座標（緯度）": latitude,
    "所在地座標（経度）": longitude,
  });

  it("小児科と産婦人科を持つ医療機関は種類ごとに 1 件ずつにし、座標が 0.0 の施設は除く", () => {
    const { features, skipped } = medicalFacilityFeatures(
      [facility("1", "35.69", "139.75"), facility("2", "0.0", "0.0")],
      [
        { ID: "1", 診療科目コード: "03001" },
        { ID: "1", 診療科目コード: "04001" },
        { ID: "1", 診療科目コード: "01001" },
        { ID: "2", 診療科目コード: "03001" },
      ],
      "13",
      () => "131016",
      "medical",
    );
    expect(features.map((feature) => feature.properties.kind)).toEqual(["pediatrics", "obstetrics"]);
    expect(skipped).toEqual(["2 施設2"]);
  });
});

describe("welfareFacilityFeatures", () => {
  it("保育所と認定こども園だけを取り出し、位置正確度を残す", () => {
    const feature = (code: string) => ({
      properties: {
        P14_001: "東京都",
        P14_002: "千代田区",
        P14_003: "13101",
        P14_004: "神田1-1",
        P14_007: code,
        P14_008: `施設${code}`,
        P14_010: 2,
      },
      geometry: { coordinates: [139.77, 35.69] },
    });
    expect(
      welfareFacilityFeatures({ features: [feature("050401"), feature("050402"), feature("991007")] }, () => "131016", "welfare").map(
        ({ properties }) => [properties.kind, properties.address, properties.positionAccuracy],
      ),
    ).toEqual([
      ["nursery", "東京都千代田区神田1-1", 2],
      ["certifiedChildcareCenter", "東京都千代田区神田1-1", 2],
    ]);
  });
});
