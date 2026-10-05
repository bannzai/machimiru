import { describe, expect, it } from "vitest";
import {
  type ConditionValue,
  axes,
  axisFitLevel,
  combineFitLevels,
  computeConditionFitLevels,
  computeConditionValues,
  conditionIds,
  fitLevels,
  fitLevelsOfValues,
  summaryFitLevel,
} from "./axes";
import {
  readConditionValues,
  readFacilitiesFile,
  readMunicipalitiesFile,
  readMunicipalityBoundaries,
} from "./tokyoData/load";
import type { FacilitiesFile, Municipality, OpenPoiPlacesFile } from "./tokyoData/schema";

/** 値 value を持ち、根拠の文に値をそのまま書いた ConditionValue を返す。 */
function conditionValue(value: number): ConditionValue {
  return { value, detail: String(value) };
}

describe("fitLevelsOfValues", () => {
  it("より良い値の区市町村の割合で 4 段階に分ける (高い方が良い)", () => {
    const values = Object.fromEntries([8, 7, 6, 5, 4, 3, 2, 1].map((value) => [String(value), conditionValue(value)]));
    expect(fitLevelsOfValues(values, "higher")).toEqual({ 8: 3, 7: 3, 6: 2, 5: 2, 4: 1, 3: 1, 2: 0, 1: 0 });
  });

  it("低い方が良い条件は、値の小さい区市町村を合うにする", () => {
    const values = Object.fromEntries([1, 2, 3, 4].map((value) => [String(value), conditionValue(value)]));
    expect(fitLevelsOfValues(values, "lower")).toEqual({ 1: 3, 2: 2, 3: 1, 4: 0 });
  });

  it("同じ値の区市町村は同じ段階にする (待機児童のいない区市町村がそろって合うになる)", () => {
    const values = Object.fromEntries([0, 0, 0, 0, 0.01, 0.02].map((value, index) => [String(index), conditionValue(value)]));
    expect(fitLevelsOfValues(values, "lower")).toEqual({ 0: 3, 1: 3, 2: 3, 3: 3, 4: 1, 5: 0 });
  });

  it("値の無い区市町村はデータなし (null) にし、段階を決める母数に入れない", () => {
    expect(fitLevelsOfValues({ a: conditionValue(2), b: null, c: conditionValue(1) }, "higher")).toEqual({
      a: 3,
      b: null,
      c: 1,
    });
  });
});

describe("combineFitLevels", () => {
  it.each([
    [[3, 3], 3],
    [[3, 0], 2],
    [[3, 2, 0], 2],
    [[1, 0], 1],
    [[0, 0, 1], 0],
  ] as const)("%j の平均を四捨五入して %i にする", (levels, expected) => {
    expect(combineFitLevels(levels)).toBe(expected);
  });

  it("データなしは除いて合わせ、すべてデータなしなら null", () => {
    expect(combineFitLevels([null, 2])).toBe(2);
    expect(combineFitLevels([null, null])).toBeNull();
    expect(combineFitLevels([])).toBeNull();
  });
});

describe("computeConditionValues", () => {
  const municipality = (code: string, overrides: Partial<Municipality>): Municipality => ({
    code,
    name: code,
    childcare: { sourceId: "childcare", applicantCount: 1000, enrolledCount: 990, waitingChildrenCount: 10 },
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
    programCount: 10,
    missing: [],
    ...overrides,
  });
  const facility = (municipalityCode: string, kind: "pediatrics" | "nursery"): FacilitiesFile["features"][number] => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [139.7, 35.7] },
    properties: { sourceId: "s", facilityId: `${municipalityCode}-${kind}`, kind, name: "n", address: "a", municipalityCode, positionAccuracy: null },
  });
  // 経度 1 度・緯度 1 度の赤道付近の正方形 (約 12,364 km²)
  const square = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  };

  // 経度 1〜2 度・緯度 0〜1 度の、square の東隣の正方形
  const eastSquare = {
    type: "Polygon" as const,
    coordinates: [
      [
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 0],
      ],
    ],
  };
  const openPoiPlace = (municipalityCode: string, coordinates: [number, number]): OpenPoiPlacesFile["features"][number] => ({
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: { name: "n", municipalityCode, licenses: ["CDLA-Permissive-2.0"], attributions: ["Overture Maps Foundation"] },
  });

  const values = computeConditionValues({
    municipalities: [
      municipality("131016", { programCount: 20 }),
      municipality("131024", { childcare: null, medicalSubsidy: null }),
      municipality("131032", {}),
    ],
    facilitiesFile: {
      type: "FeatureCollection",
      sources: [],
      features: [facility("131016", "pediatrics"), facility("131016", "nursery"), facility("131024", "pediatrics")],
    } as unknown as FacilitiesFile,
    openPoiPlacesFiles: new Map([
      [
        "coworkingNearby",
        {
          type: "FeatureCollection",
          source: {
            endpoint: "https://api.openpoiapi.com/v1/search",
            keywords: ["coworking"],
            retrievedOn: "2026-10-05",
            attributionUrl: "https://openpoiapi.com/attribution.html",
          },
          // square の 2 件と、eastSquare の中心 (経度 1.5 度・緯度 0.5 度) から経度 0.5 度西の 1 件 (square の東端)
          features: [openPoiPlace("131016", [0.2, 0.5]), openPoiPlace("131016", [1, 0.5])],
        } satisfies OpenPoiPlacesFile,
      ],
    ]),
    municipalityBoundaries: new Map([
      ["13101", square],
      ["13103", eastSquare],
    ]),
  });

  it("点の判定器は、施設の種類の件数を区市町村の面積で割る。境界の無い区市町村は null", () => {
    expect(values.pediatricsNearby["131016"]?.value).toBeCloseTo(1 / 12364, 6);
    expect(values.pediatricsNearby["131016"]?.detail).toMatch(/^小児科 1 件 \(面積 1 km² あたり 0\.00 件\)$/);
    expect(values.pediatricsNearby["131024"]).toBeNull();
  });

  it("OpenPOI API の判定器は、検索結果の施設の件数を区市町村の面積で割る。境界の無い区市町村は null", () => {
    expect(values.coworkingNearby["131016"]?.value).toBeCloseTo(2 / 12364, 6);
    expect(values.coworkingNearby["131016"]?.detail).toBe("コワーキング・シェアオフィス 2 件 (面積 1 km² あたり 0.00 件)");
    expect(values.coworkingNearby["131024"]).toBeNull();
  });

  it("OpenPOI API の判定器で施設が 0 件の区市町村は、中心から最も近い施設までの距離 (km) を負にした値にする", () => {
    // 赤道付近の経度 0.5 度 (地球の半径 6371.0088 km の円周の 720 分の 1)
    const distance = (2 * Math.PI * 6371.0088) / 720;
    expect(values.coworkingNearby["131032"]?.value).toBeCloseTo(-distance, 1);
    expect(values.coworkingNearby["131032"]?.detail).toBe(
      `コワーキング・シェアオフィス 0 件 (区市町村の中心から最も近い施設まで ${distance.toFixed(1)} km)`,
    );
  });

  it("保育園に入りやすいは待機児童の割合 (低いほど良い)。保育所等のデータが無い区市町村は null", () => {
    expect(values.nurseryAvailability["131016"]?.value).toBeCloseTo(0.01);
    expect(values.nurseryAvailability["131024"]).toBeNull();
  });

  it("子育て支援が手厚いは、総合の評価の医療費の 2 つと制度の件数の点の合計。医療費助成のデータが無い区市町村は null", () => {
    // 医療費の自己負担・所得制限が無く (15 + 15 点)、制度の件数が最多 (30 点)
    expect(values.childcareSupport["131016"]?.value).toBe(60);
    expect(values.childcareSupport["131024"]).toBeNull();
  });
});

describe("axisFitLevel・summaryFitLevel", () => {
  const conditionFitLevels = {
    pediatricsNearby: { a: 3, b: 0 },
    nurseryAvailability: { a: 1, b: null },
    childcareSupport: { a: 3, b: null },
    coworkingNearby: { a: null, b: null },
  } as const;

  it("軸の段階は、使う条件の段階だけを合わせる", () => {
    expect(axisFitLevel(conditionFitLevels, conditionIds, "childcare", "a")).toBe(2);
    expect(axisFitLevel(conditionFitLevels, ["pediatricsNearby", "childcareSupport"], "childcare", "a")).toBe(3);
    expect(axisFitLevel(conditionFitLevels, ["nurseryAvailability"], "childcare", "b")).toBeNull();
  });

  it("まとめの段階は、使う条件を持つ軸の段階を合わせる。使う条件が無ければ null", () => {
    expect(summaryFitLevel(conditionFitLevels, conditionIds, "b")).toBe(0);
    expect(summaryFitLevel(conditionFitLevels, [], "a")).toBeNull();
  });
});

describe("東京都の 62 区市町村での段階", () => {
  const { municipalities } = readMunicipalitiesFile();
  const conditionFitLevels = computeConditionFitLevels(readConditionValues(municipalities));

  it.each(conditionIds)("%s は 62 区市町村すべてに値があり、4 段階のすべてに区市町村が入る", (conditionId) => {
    const levels = Object.values(conditionFitLevels[conditionId]);
    expect(levels).toHaveLength(62);
    expect(levels).not.toContain(null);
    for (const { level } of fitLevels) {
      expect(levels, `段階 ${level}`).toContain(level);
    }
  });

  it("registry の軸と条件の識別子が重ならない", () => {
    expect(new Set(axes.map((axis) => axis.id)).size).toBe(axes.length);
    expect(new Set(conditionIds).size).toBe(conditionIds.length);
  });

  it("施設の件数は facilities.geojson の区市町村コードと境界データから求める", () => {
    const pediatricsCount = readFacilitiesFile().features.filter(
      ({ properties }) => properties.municipalityCode === "131041" && properties.kind === "pediatrics",
    ).length;
    expect(pediatricsCount).toBeGreaterThan(0);
    expect(readMunicipalityBoundaries().features.some((feature) => feature.properties.code === "13104")).toBe(true);
  });
});
