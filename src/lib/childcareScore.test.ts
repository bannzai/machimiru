import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  childcareScoreClasses,
  childcareScoreColor,
  computeChildcareScores,
  missingChildcareScoreColor,
} from "./childcareScore";
import { type Municipality, municipalitiesFileSchema } from "./tokyoData/schema";

/** 待機児童がいない・医療費の自己負担と所得制限が無い区市町村の指標に、overrides を上書きしたものを返す。 */
function municipality(overrides: Partial<Municipality>): Municipality {
  return {
    code: "131041",
    name: "新宿区",
    childcare: { sourceId: "childcare", applicantCount: 1000, enrolledCount: 1000, waitingChildrenCount: 0 },
    childcareUsageRate: null,
    medicalSubsidy: {
      sourceId: "medical",
      outpatientMaxAgeAtFiscalYearEnd: 18,
      inpatientMaxAgeAtFiscalYearEnd: 18,
      outpatientHasIncomeLimit: false,
      inpatientHasIncomeLimit: false,
      outpatientHasCopayment: false,
      inpatientHasCopayment: false,
    },
    programCount: 100,
    missing: [{ field: "childcareUsageRate", reason: "使える出典が無い" }],
    ...overrides,
  };
}

describe("computeChildcareScores", () => {
  it("待機児童がいない・医療費の自己負担と所得制限が無い・制度が最多の区市町村は 100 点", () => {
    const [score] = computeChildcareScores([municipality({})]);
    expect(score).toEqual({
      municipalityCode: "131041",
      points: { nurseryAvailability: 40, medicalCopayment: 15, medicalIncomeLimit: 15, programs: 30 },
      total: 100,
      rank: 1,
    });
  });

  it("保育の点は待機児童の割合に比例して下がり、2% 以上で 0 点になる", () => {
    const scores = computeChildcareScores(
      [0, 5, 10, 20, 50].map((waitingChildrenCount, index) =>
        municipality({
          code: String(index),
          childcare: { sourceId: "childcare", applicantCount: 1000, enrolledCount: 900, waitingChildrenCount },
        }),
      ),
    );
    expect(scores.map((score) => score.points.nurseryAvailability)).toEqual([
      40,
      expect.closeTo(30),
      expect.closeTo(20),
      0,
      0,
    ]);
  });

  it("申込者がいない区市町村は待機児童もいないため保育の点は満点", () => {
    const [score] = computeChildcareScores([
      municipality({ childcare: { sourceId: "childcare", applicantCount: 0, enrolledCount: 0, waitingChildrenCount: 0 } }),
    ]);
    expect(score.points.nurseryAvailability).toBe(40);
  });

  it("医療費は通院・入院のどちらかに自己負担・所得制限があれば、その項目を 0 点にする", () => {
    const base = municipality({}).medicalSubsidy!;
    const scores = computeChildcareScores([
      municipality({ medicalSubsidy: { ...base, outpatientHasCopayment: true } }),
      municipality({ medicalSubsidy: { ...base, inpatientHasCopayment: true } }),
      municipality({ medicalSubsidy: { ...base, outpatientHasIncomeLimit: true } }),
      municipality({ medicalSubsidy: { ...base, inpatientHasIncomeLimit: true, outpatientHasCopayment: true } }),
    ]);
    expect(scores.map(({ points }) => [points.medicalCopayment, points.medicalIncomeLimit])).toEqual([
      [0, 15],
      [0, 15],
      [15, 0],
      [0, 0],
    ]);
  });

  it("制度の点は渡した区市町村の中の最多の件数を満点にした比", () => {
    const scores = computeChildcareScores([200, 100, 50].map((programCount) => municipality({ programCount })));
    expect(scores.map((score) => score.points.programs)).toEqual([30, 15, 7.5]);
  });

  it("合計点は四捨五入した整数で、同点は同じ順位", () => {
    const scores = computeChildcareScores([
      municipality({ code: "a", programCount: 200 }),
      municipality({ code: "b", programCount: 199 }),
      municipality({ code: "c", programCount: 100 }),
    ]);
    // 199 件は 29.85 点で、合計 99.85 点が 100 点に丸まる
    expect(scores.map(({ total, rank }) => [total, rank])).toEqual([
      [100, 1],
      [100, 1],
      [85, 3],
    ]);
  });

  it("根拠の指標が欠損している区市町村は、合計点と順位を null にして 0 点として並べない", () => {
    const scores = computeChildcareScores([
      municipality({ code: "a", programCount: 10 }),
      municipality({
        code: "b",
        childcare: null,
        missing: [
          { field: "childcare", reason: "出典に行が無い" },
          { field: "childcareUsageRate", reason: "使える出典が無い" },
        ],
      }),
      municipality({ code: "c", medicalSubsidy: null }),
    ]);
    expect(scores[0]).toMatchObject({ total: 73, rank: 1 });
    expect(scores[1]).toMatchObject({ points: { nurseryAvailability: null }, total: null, rank: null });
    expect(scores[2]).toMatchObject({ points: { medicalCopayment: null, medicalIncomeLimit: null }, total: null, rank: null });
  });

  it("保育サービスの利用率の欠損は合計点に影響しない (62 区市町村すべてで欠損しているため合成に使わない)", () => {
    const [withRate, withoutRate] = computeChildcareScores([
      municipality({ code: "a", childcareUsageRate: 0.5, missing: [] }),
      municipality({ code: "b" }),
    ]);
    expect(withRate.total).toBe(withoutRate.total);
  });

  it("東京都 62 区市町村の実データで、街ごとに点数の差が出て、評価できない区市町村が無い", () => {
    const { municipalities } = municipalitiesFileSchema.parse(
      JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "tokyo", "municipalities.json"), "utf8")),
    );
    const scores = computeChildcareScores(municipalities);
    const totals = scores.map((score) => score.total);
    expect(totals).not.toContain(null);
    // 色分けのすべての区分に区市町村が入る (区分の境目の根拠は childcareScoreClasses のコメント)
    expect(new Set(totals.map((total) => childcareScoreColor(total)))).toEqual(
      new Set(childcareScoreClasses.map((scoreClass) => scoreClass.color)),
    );
  });
});

describe("childcareScoreColor", () => {
  it.each([
    [100, "#006d2c"],
    [90, "#006d2c"],
    [89, "#31a354"],
    [60, "#a1d99b"],
    [59, "#d9f0d3"],
    [0, "#d9f0d3"],
  ])("%i 点は %s", (total, color) => {
    expect(childcareScoreColor(total)).toBe(color);
  });

  it("評価できない区市町村は点数の区分と違う色", () => {
    expect(childcareScoreColor(null)).toBe(missingChildcareScoreColor);
    expect(childcareScoreClasses.map((scoreClass) => scoreClass.color)).not.toContain(missingChildcareScoreColor);
  });
});
