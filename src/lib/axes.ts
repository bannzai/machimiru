import type { MultiPolygon, Polygon } from "geojson";
import { municipalityBoundaryCode } from "./boundaries";
import {
  computeChildcareScores,
  formatPercent,
  hasMedicalCopayment,
  hasMedicalIncomeLimit,
  waitingChildrenRate,
} from "./childcareScore";
import { distanceKilometers, geometryAreaSquareKilometers, geometryCenter } from "./geometry";
import {
  type FacilitiesFile,
  type FacilityKind,
  type Municipality,
  type OpenPoiPlacesFile,
  facilityKindNames,
} from "./tokyoData/schema";

/**
 * 条件の判定器。区市町村ごとの値と、値の良い向きを決める。
 * - point (点): 施設が近いか。`public/data/tokyo/facilities.geojson` の facilityKind の施設が、区市町村の面積 1 km² あたり何件あるか (多いほど良い)
 * - openPoi (点): 施設が近いか。OpenPOI API を searchKeywords で検索した結果 (`public/data/tokyo/openpoi/<条件の識別子>.geojson`) で、point と同じ値を求める
 * - area (面): 区市町村の統計。`public/data/tokyo/municipalities.json` の区市町村の値と、高い方が良いか低い方が良いか
 */
export type ConditionEvaluator =
  | { type: "point"; facilityKind: FacilityKind }
  | {
      type: "openPoi";
      /** OpenPOI API の `/v1/search` の q に渡す検索語。スペースでつないで渡し、どれかに当たる施設を探す。 */
      searchKeywords: readonly string[];
      /** 根拠の文に出す施設の呼び名。 */
      placeName: string;
    }
  | {
      type: "area";
      /** 値が高い方が条件に合うか (higher)、低い方が合うか (lower)。 */
      betterDirection: "higher" | "lower";
      /** municipalities のそれぞれの値を、municipalities と同じ順で返す。値を求める指標が欠損している区市町村は null。 */
      values: (municipalities: readonly Municipality[]) => (number | null)[];
      /** municipality の値の根拠を画面に出す文。values が null を返す区市町村では呼ばない。 */
      describe: (municipality: Municipality) => string;
    };

/** 軸の条件 1 件 (例: 子育ての軸の「小児科が近い」)。 */
export type AxisCondition = {
  /** 条件の識別子。判定の API の応答と、チャットのチェックボックスの状態が使う。 */
  id: string;
  /** 画面に出す条件の名前。 */
  name: string;
  /** 文章の判定で Jev に渡す、この条件を求める文の説明 (Jev の精度が最も高い英語で書く)。 */
  classifierDescription: string;
  /** API キーの無い環境の辞書による判定で、この条件を求める文に含まれる語。 */
  keywords: readonly string[];
  /** 判定の根拠の限界など、画面で条件に添える注記。 */
  note?: string;
  evaluator: ConditionEvaluator;
};

/** 軸 1 件 (例: 子育て)。軸の段階は、軸の条件のうち使う条件の段階を合わせて決める。 */
export type Axis = {
  /** 軸の識別子。 */
  id: string;
  /** 画面に出す軸の名前。タブと街 × 軸の表の見出しになる。 */
  name: string;
  /** 文章の判定で Jev に渡す、この軸の話題の説明 (英語)。 */
  classifierDescription: string;
  /** 辞書による判定で、この軸の話題の文に含まれる語。条件のどれにも当たらない文がこの語を含む時は、軸のすべての条件を使う。 */
  keywords: readonly string[];
  conditions: readonly AxisCondition[];
};

/**
 * 判定できる軸の一覧 (registry)。軸・条件を足す時はここに 1 件足す。チャットの判定の選択肢・地図の塗り分け・一覧・
 * 街 × 軸の表・区市町村のページは、この一覧から作る。足し方は documents/PROJECT.md「軸と条件」。
 */
export const axes = [
  {
    id: "childcare",
    name: "子育て",
    classifierDescription: "Raising children: daycare, pediatric clinics, child-raising support",
    // 「子ども」は「2 歳の子どもがいて」のような家族の状況の文にも出て希望と見分けられないため、語に入れない
    keywords: ["子育て", "育児"],
    conditions: [
      {
        id: "pediatricsNearby",
        name: "小児科が近い",
        classifierDescription: "a pediatric clinic (小児科) close to home",
        keywords: ["小児科"],
        evaluator: { type: "point", facilityKind: "pediatrics" },
      },
      {
        id: "nurseryAvailability",
        name: "保育園に入りやすい",
        classifierDescription: "a daycare / nursery school (保育園・保育所) that is easy to get into or close to home",
        keywords: ["保育", "こども園", "待機児童"],
        note: "保育園ごとの空き状況のデータは無いため、区市町村の待機児童数 ÷ 保育所等の申込者数で代わりに判定しています",
        evaluator: {
          type: "area",
          betterDirection: "lower",
          values: (municipalities) =>
            municipalities.map(({ childcare }) => (childcare === null ? null : waitingChildrenRate(childcare))),
          describe: ({ childcare }) =>
            childcare === null
              ? ""
              : `待機児童 ${childcare.waitingChildrenCount} 人 ÷ 申込者 ${childcare.applicantCount} 人 = ${formatPercent(waitingChildrenRate(childcare))} (利用児童 ${childcare.enrolledCount} 人)`,
        },
      },
      {
        id: "childcareSupport",
        name: "子育て支援が手厚い",
        classifierDescription:
          "generous child-raising support from the local government, such as subsidies, children's medical expense support, or many support programs",
        keywords: ["支援", "助成", "手当", "医療費"],
        evaluator: {
          type: "area",
          betterDirection: "higher",
          // 総合の評価 (childcareScore.ts) の医療費の 2 つの点と制度の件数の点の合計 (60 点満点) を使い、同じ指標の重みを二重に定義しない
          values: (municipalities) =>
            computeChildcareScores(municipalities).map(({ points: { medicalCopayment, medicalIncomeLimit, programs } }) =>
              medicalCopayment === null || medicalIncomeLimit === null || programs === null
                ? null
                : medicalCopayment + medicalIncomeLimit + programs,
            ),
          describe: ({ medicalSubsidy, programCount }) =>
            medicalSubsidy === null
              ? ""
              : `医療費の自己負担${hasMedicalCopayment(medicalSubsidy) ? "あり" : "なし"}・所得制限${hasMedicalIncomeLimit(medicalSubsidy) ? "あり" : "なし"}・制度 ${programCount} 件`,
        },
      },
    ],
  },
  {
    id: "coworking",
    name: "コワーキング",
    classifierDescription: "Places to work outside the home: coworking spaces, shared offices, places for remote work",
    keywords: ["仕事場", "ワークスペース"],
    conditions: [
      {
        id: "coworkingNearby",
        name: "コワーキングが近い",
        classifierDescription:
          "a coworking space or shared office (コワーキングスペース・シェアオフィス) close to home, or a place nearby where one can do remote work",
        keywords: ["コワーキング", "シェアオフィス", "リモートワーク", "テレワーク"],
        note: "OpenPOI API で検索語に当たった施設の数で判定しています 名前や分類に検索語を含まない施設は数えていません",
        // 検索語の選び方と実測の件数は documents/PROJECT.md「コワーキングの検索語」
        evaluator: {
          type: "openPoi",
          searchKeywords: ["coworking", "コワーキング", "シェアオフィス"],
          placeName: "コワーキング・シェアオフィス",
        },
      },
    ],
  },
] as const satisfies readonly Axis[];

/** 軸の識別子。 */
export type AxisId = (typeof axes)[number]["id"];

/** 条件の識別子。 */
export type ConditionId = (typeof axes)[number]["conditions"][number]["id"];

/** すべての軸の条件の識別子 (registry の順)。 */
export const conditionIds = axes.flatMap((axis) => axis.conditions.map((condition) => condition.id)) as [
  ConditionId,
  ...ConditionId[],
];

/** 区市町村 1 件の、条件 1 件の値と、その根拠の文。 */
export type ConditionValue = {
  /**
   * 段階を決める値。向きは条件の判定器の betterDirection (点と OpenPOI API の判定器は多いほど良い)。
   * OpenPOI API の判定器で施設が 0 件の区市町村は、最も近い施設までの距離 (km) を負にした値。
   */
  value: number;
  /** 値の根拠を画面に出す文。 */
  detail: string;
};

/** 条件ごと・区市町村 (全国地方公共団体コード) ごとの値。データが無い区市町村は null。 */
export type ConditionValues = Record<ConditionId, Record<string, ConditionValue | null>>;

/**
 * すべての条件の、municipalities のそれぞれの値を返す。点の判定器は、facilitiesFile の施設の件数を
 * municipalityBoundaries (区市町村の境界の `code` → 形) から求めた面積で割る。境界が無い区市町村は null にする。
 * OpenPOI API の判定器は openPoiPlacesFiles (条件の識別子 → 検索結果) の施設で同じ値を求め、施設が 0 件の区市町村は
 * 区市町村の中心から最も近い施設までの距離 (km) を負にした値にする (1 件以上の区市町村より下で、近いほど上になる)。
 * 検索結果のファイルが無いか施設が 1 件も無い条件は、すべて null にする。
 */
export function computeConditionValues({
  municipalities,
  facilitiesFile,
  openPoiPlacesFiles,
  municipalityBoundaries,
}: {
  municipalities: readonly Municipality[];
  facilitiesFile: FacilitiesFile;
  openPoiPlacesFiles: ReadonlyMap<string, OpenPoiPlacesFile>;
  municipalityBoundaries: ReadonlyMap<string, Polygon | MultiPolygon>;
}): ConditionValues {
  return Object.fromEntries(
    axes.flatMap((axis) =>
      axis.conditions.map((condition): [ConditionId, Record<string, ConditionValue | null>] => {
        const { evaluator } = condition;
        if (evaluator.type === "openPoi") {
          const places = openPoiPlacesFiles.get(condition.id)?.features ?? [];
          const placeCounts = Map.groupBy(places, ({ properties }) => properties.municipalityCode);
          return [
            condition.id,
            Object.fromEntries(
              municipalities.map(({ code }) => {
                const boundary = municipalityBoundaries.get(municipalityBoundaryCode(code));
                if (boundary === undefined || places.length === 0) {
                  return [code, null];
                }
                const placeCount = placeCounts.get(code)?.length ?? 0;
                if (placeCount === 0) {
                  const center = geometryCenter(boundary);
                  const nearestDistance = Math.min(
                    ...places.map(({ geometry }) => distanceKilometers(center, geometry.coordinates)),
                  );
                  return [
                    code,
                    {
                      value: -nearestDistance,
                      detail: `${evaluator.placeName} 0 件 (区市町村の中心から最も近い施設まで ${nearestDistance.toFixed(1)} km)`,
                    },
                  ];
                }
                const placesPerSquareKilometer = placeCount / geometryAreaSquareKilometers(boundary);
                return [
                  code,
                  {
                    value: placesPerSquareKilometer,
                    detail: `${evaluator.placeName} ${placeCount} 件 (面積 1 km² あたり ${placesPerSquareKilometer.toFixed(2)} 件)`,
                  },
                ];
              }),
            ),
          ];
        }
        if (evaluator.type === "point") {
          const facilityCounts = new Map<string, number>();
          for (const { properties } of facilitiesFile.features) {
            if (properties.kind === evaluator.facilityKind) {
              facilityCounts.set(properties.municipalityCode, (facilityCounts.get(properties.municipalityCode) ?? 0) + 1);
            }
          }
          return [
            condition.id,
            Object.fromEntries(
              municipalities.map(({ code }) => {
                const boundary = municipalityBoundaries.get(municipalityBoundaryCode(code));
                if (boundary === undefined) {
                  return [code, null];
                }
                const facilityCount = facilityCounts.get(code) ?? 0;
                const areaSquareKilometers = geometryAreaSquareKilometers(boundary);
                return [
                  code,
                  {
                    value: facilityCount / areaSquareKilometers,
                    detail: `${facilityKindNames[evaluator.facilityKind]} ${facilityCount} 件 (面積 1 km² あたり ${(facilityCount / areaSquareKilometers).toFixed(2)} 件)`,
                  },
                ];
              }),
            ),
          ];
        }
        const values = evaluator.values(municipalities);
        return [
          condition.id,
          Object.fromEntries(
            municipalities.map((municipality, index) => {
              const value = values[index];
              return [municipality.code, value === null ? null : { value, detail: evaluator.describe(municipality) }];
            }),
          ),
        ];
      }),
    ),
  ) as ConditionValues;
}

/** 区市町村が条件・軸に合う度合いの段階。3 が最も合う。 */
export type FitLevel = 0 | 1 | 2 | 3;

/** 段階ごとの表示名と色。合う順。色はデザインのモック (documents/design/mockups/compare.html) の 4 段の色。 */
export const fitLevels = [
  { level: 3, label: "合う", color: "#1F6B55" },
  { level: 2, label: "やや合う", color: "#5FA58B" },
  { level: 1, label: "あまり", color: "#A9CDBD" },
  { level: 0, label: "合わない", color: "#DCE9E2" },
] as const satisfies readonly { level: FitLevel; label: string; color: string }[];

/** データが無く段階を決められない区市町村の表示名。 */
export const missingFitLabel = "データなし";

/** データが無く段階を決められない区市町村の色。どの段階の緑とも見分けられる灰色にする (総合の評価の「評価なし」と同じ)。 */
export const missingFitColor = "#9ca3af";

/** 段階 level の表示名。null (データなし) は missingFitLabel。 */
export function fitLevelLabel(level: FitLevel | null): string {
  return level === null ? missingFitLabel : fitLevels.find((fitLevel) => fitLevel.level === level)!.label;
}

/** 段階 level の色。null (データなし) は missingFitColor。 */
export function fitLevelColor(level: FitLevel | null): string {
  return level === null ? missingFitColor : fitLevels.find((fitLevel) => fitLevel.level === level)!.color;
}

/**
 * 区市町村ごとの値 valuesByMunicipality を、betterDirection の向きで、データのある区市町村の中の順位の四分位で 4 段階に分けて返す
 * (決め方は documents/PROJECT.md「段階の決め方」)。値が null の区市町村は null (データなし)。
 */
export function fitLevelsOfValues(
  valuesByMunicipality: Readonly<Record<string, ConditionValue | null>>,
  betterDirection: "higher" | "lower",
): Record<string, FitLevel | null> {
  const values = Object.values(valuesByMunicipality).flatMap((conditionValue) =>
    conditionValue === null ? [] : [conditionValue.value],
  );
  return Object.fromEntries(
    Object.entries(valuesByMunicipality).map(([code, conditionValue]) => {
      if (conditionValue === null) {
        return [code, null];
      }
      const betterRatio =
        values.filter((value) => (betterDirection === "higher" ? value > conditionValue.value : value < conditionValue.value))
          .length / values.length;
      return [code, betterRatio < 0.25 ? 3 : betterRatio < 0.5 ? 2 : betterRatio < 0.75 ? 1 : 0];
    }),
  );
}

/**
 * 複数の段階 levels を 1 つに合わせる。データのある段階の平均を四捨五入する。すべてデータなし (null) か空の時は null。
 * 軸の段階 (軸の条件を合わせる) と、まとめの段階 (軸を合わせる) に使う。
 */
export function combineFitLevels(levels: readonly (FitLevel | null)[]): FitLevel | null {
  const knownLevels = levels.filter((level) => level !== null);
  return knownLevels.length === 0
    ? null
    : (Math.round(knownLevels.reduce<number>((sum, level) => sum + level, 0) / knownLevels.length) as FitLevel);
}

/** 条件 conditionId の判定器の値の良い向き。点と OpenPOI API の判定器は、面積あたりの施設が多いほど近いため higher。 */
function betterDirectionOfCondition(conditionId: ConditionId): "higher" | "lower" {
  const { evaluator } = conditionById(conditionId);
  return evaluator.type === "area" ? evaluator.betterDirection : "higher";
}

/** conditionId の条件の定義。 */
export function conditionById(conditionId: ConditionId): (typeof axes)[number]["conditions"][number] {
  return axes.flatMap((axis) => axis.conditions).find((condition) => condition.id === conditionId)!;
}

/** 条件ごと・区市町村ごとの段階。 */
export type ConditionFitLevels = Record<ConditionId, Record<string, FitLevel | null>>;

/** conditionValues のすべての条件を、東京都の区市町村の中の順位で段階に分ける。 */
export function computeConditionFitLevels(conditionValues: ConditionValues): ConditionFitLevels {
  return Object.fromEntries(
    conditionIds.map((conditionId) => [
      conditionId,
      fitLevelsOfValues(conditionValues[conditionId], betterDirectionOfCondition(conditionId)),
    ]),
  ) as ConditionFitLevels;
}

/** activeConditionIds (使う条件) を 1 つ以上持つ軸 (registry の順)。 */
export function activeAxes(activeConditionIds: readonly ConditionId[]) {
  return axes.filter((axis) => axis.conditions.some((condition) => activeConditionIds.includes(condition.id)));
}

/** 区市町村 municipalityCode の軸 axisId の段階。軸の条件のうち activeConditionIds にあるものの段階を合わせる。 */
export function axisFitLevel(
  conditionFitLevels: ConditionFitLevels,
  activeConditionIds: readonly ConditionId[],
  axisId: AxisId,
  municipalityCode: string,
): FitLevel | null {
  return combineFitLevels(
    axes
      .find((axis) => axis.id === axisId)!
      .conditions.filter((condition) => activeConditionIds.includes(condition.id))
      .map((condition) => conditionFitLevels[condition.id][municipalityCode] ?? null),
  );
}

/** 区市町村 municipalityCode のまとめの段階。activeConditionIds を持つ軸それぞれの段階を、軸ごとに同じ重みで合わせる。 */
export function summaryFitLevel(
  conditionFitLevels: ConditionFitLevels,
  activeConditionIds: readonly ConditionId[],
  municipalityCode: string,
): FitLevel | null {
  return combineFitLevels(
    activeAxes(activeConditionIds).map((axis) =>
      axisFitLevel(conditionFitLevels, activeConditionIds, axis.id, municipalityCode),
    ),
  );
}
