import { describe, expect, it } from "vitest";
import {
  emptyPropertySearchCondition,
  isSuumoSearchedByDistrict,
  parsePropertySearchCondition,
  rentUpperLimitManYenOptions,
  suumoSearchUrl,
} from "./propertySearch";

describe("suumoSearchUrl", () => {
  it("区市町村と家賃・広さの条件を SUUMO の検索結果 URL にする", () => {
    // 2026-10-05 に開いて三鷹市・新宿区の検索結果になった URL
    expect(
      suumoSearchUrl(["13204", "13104"], { rentUpperLimitManYen: 15, floorAreaLowerLimitSquareMeters: 50 }),
    ).toBe("https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ta=13&sc=13204&sc=13104&ct=15.0&mb=50");
  });

  it("条件を付けない時は ct と mb を付けない", () => {
    expect(suumoSearchUrl(["13204"], emptyPropertySearchCondition)).toBe(
      "https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ta=13&sc=13204",
    );
  });

  it("同じ区市町村は 1 回だけ渡す", () => {
    expect(suumoSearchUrl(["13104", "13113", "13104"], emptyPropertySearchCondition)).toBe(
      "https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ta=13&sc=13104&sc=13113",
    );
  });

  it("西多摩郡の町村は郡全体の 13300 にまとめる", () => {
    expect(suumoSearchUrl(["13308", "13204", "13303", "13305", "13307"], emptyPropertySearchCondition)).toBe(
      "https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ta=13&sc=13300&sc=13204",
    );
  });

  it("選べる家賃の上限はすべて小数 1 桁で渡す", () => {
    for (const rentUpperLimitManYen of rentUpperLimitManYenOptions) {
      expect(
        new URL(suumoSearchUrl(["13204"], { ...emptyPropertySearchCondition, rentUpperLimitManYen })).searchParams.get(
          "ct",
        ),
      ).toMatch(/^\d+\.0$/);
    }
  });
});

describe("isSuumoSearchedByDistrict", () => {
  it.each([
    ["13303", true],
    ["13305", true],
    ["13307", true],
    ["13308", true],
    ["13204", false],
    ["13361", false],
  ])("%s は %s", (municipalityCode, expected) => {
    expect(isSuumoSearchedByDistrict(municipalityCode)).toBe(expected);
  });
});

describe("parsePropertySearchCondition", () => {
  it("保存した条件を戻す", () => {
    const condition = { rentUpperLimitManYen: 15, floorAreaLowerLimitSquareMeters: 50 };
    expect(parsePropertySearchCondition(JSON.stringify(condition))).toEqual(condition);
  });

  it("選べる値に無い条件は付けない", () => {
    expect(
      parsePropertySearchCondition(JSON.stringify({ rentUpperLimitManYen: 15.5, floorAreaLowerLimitSquareMeters: 47 })),
    ).toEqual(emptyPropertySearchCondition);
  });

  it.each([
    ["保存していない", null],
    ["壊れた JSON", "{"],
    ["形式が違う", JSON.stringify({ rentUpperLimitManYen: "15", floorAreaLowerLimitSquareMeters: null })],
    ["項目が足りない", JSON.stringify({ rentUpperLimitManYen: 15 })],
  ])("%s時は条件を付けない状態にする", (_, storedText) => {
    expect(parsePropertySearchCondition(storedText)).toEqual(emptyPropertySearchCondition);
  });
});
