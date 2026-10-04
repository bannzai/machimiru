import type { Municipality } from "./tokyoData/schema";

/**
 * 子育てのしやすさの総合の評価の、根拠の指標ごとの満点 (合計 100 点)。
 * 評価は公開データから machimiru が独自に作るもので、計算方法は documents/PROJECT.md「街ごとの子育てのしやすさの評価」に書く。
 */
export const childcareScoreMaxPoints = {
  // 保育所に入れるかは引っ越した後に共働きを続けられるかを直接決め、入れない時の代わりが無いため、ほかの指標より重くする
  nurseryAvailability: 40,
  // 自己負担と所得制限は、子どもの通院・入院の支払いを決める同じ制度の 2 つの条件のため、同じ重さにする
  medicalCopayment: 15,
  medicalIncomeLimit: 15,
  // 制度の件数は支援の幅の目安になるが、制度レジストリへの登録の細かさにも左右されるため、保育の入りやすさより軽くする
  programs: 30,
} as const;

/** 総合の評価の根拠の指標の名前。 */
export type ChildcareScoreItem = keyof typeof childcareScoreMaxPoints;

/** 総合の評価の根拠の指標の表示名。 */
export const childcareScoreItemNames: Record<ChildcareScoreItem, string> = {
  nurseryAvailability: "保育所等の待機児童の割合",
  medicalCopayment: "子ども医療費の自己負担",
  medicalIncomeLimit: "子ども医療費の所得制限",
  programs: "子育て支援制度の件数",
};

// 令和 8 年 4 月 1 日の区部・市部 49 自治体で待機児童の割合が最も高い清瀬市 (2.05%) の水準を 0 点にし、区部・市部の中の差を点に出すため。
// 申込者が数十人の村では数人の待機児童で割合が大きくなり (三宅村 18.75%)、0 点にそろう。出典を新しい年度に替えた時は区部・市部の最大値を見て決め直す
/** 保育の入りやすさが 0 点になる待機児童の割合 (待機児童数 ÷ 申込者数)。これより低いほど比例して点が上がり、0% で満点になる。 */
export const zeroPointWaitingChildrenRate = 0.02;

/** 区市町村 1 件の子育てのしやすさの総合の評価。 */
export type ChildcareScore = {
  /** 評価した区市町村の全国地方公共団体コード (`Municipality.code`)。 */
  municipalityCode: string;
  /** 根拠の指標ごとの点数 (小数を含む)。指標が欠損している項目は null。 */
  points: Record<ChildcareScoreItem, number | null>;
  /** 合計点 (0〜100 の整数)。根拠の指標が 1 つでも欠損している時は、ほかの自治体と同じ物差しで比べられないため null。 */
  total: number | null;
  /** 合計点の高い順の順位 (同点は同じ順位)。total が null の時は null。 */
  rank: number | null;
};

/**
 * municipalities の総合の評価を、municipalities と同じ順で返す。
 * 制度の件数の点は municipalities の中の最多の件数を満点にするため、東京都の 62 区市町村をまとめて渡す。
 */
export function computeChildcareScores(municipalities: readonly Municipality[]): ChildcareScore[] {
  const maxProgramCount = Math.max(0, ...municipalities.map((municipality) => municipality.programCount));
  const unrankedScores = municipalities.map(({ code, childcare, medicalSubsidy, programCount }) => {
    const points: Record<ChildcareScoreItem, number | null> = {
      nurseryAvailability:
        childcare === null
          ? null
          : childcareScoreMaxPoints.nurseryAvailability *
            Math.max(0, 1 - waitingChildrenRate(childcare) / zeroPointWaitingChildrenRate),
      medicalCopayment:
        medicalSubsidy === null ? null : hasMedicalCopayment(medicalSubsidy) ? 0 : childcareScoreMaxPoints.medicalCopayment,
      medicalIncomeLimit:
        medicalSubsidy === null ? null : hasMedicalIncomeLimit(medicalSubsidy) ? 0 : childcareScoreMaxPoints.medicalIncomeLimit,
      programs: maxProgramCount === 0 ? 0 : (childcareScoreMaxPoints.programs * programCount) / maxProgramCount,
    };
    const pointValues = Object.values(points);
    return {
      municipalityCode: code,
      points,
      total: pointValues.includes(null) ? null : Math.round(pointValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)),
    };
  });
  return unrankedScores.map((score) => {
    const { total } = score;
    return {
      ...score,
      rank: total === null ? null : unrankedScores.filter((other) => other.total !== null && other.total > total).length + 1,
    };
  });
}

/** 保育所等の申込者に対する待機児童の割合 (0〜1) を返す。申込者がいない時は待機児童もいないため 0 を返す。 */
export function waitingChildrenRate(childcare: NonNullable<Municipality["childcare"]>): number {
  return childcare.applicantCount === 0 ? 0 : childcare.waitingChildrenCount / childcare.applicantCount;
}

/** 子ども医療費助成の通院・入院のどちらかに一部自己負担があるかを返す。 */
export function hasMedicalCopayment(medicalSubsidy: NonNullable<Municipality["medicalSubsidy"]>): boolean {
  return medicalSubsidy.outpatientHasCopayment || medicalSubsidy.inpatientHasCopayment;
}

/** 子ども医療費助成の通院・入院のどちらかに所得制限があるかを返す。 */
export function hasMedicalIncomeLimit(medicalSubsidy: NonNullable<Municipality["medicalSubsidy"]>): boolean {
  return medicalSubsidy.outpatientHasIncomeLimit || medicalSubsidy.inpatientHasIncomeLimit;
}

// 待機児童の割合は 0.1% 未満の差 (文京区 0.10%・中央区 0.07%) もあるため、小数第 2 位まで出す
/** 割合 rate (0〜1) を、小数第 2 位までのパーセントの文字列 (例: 0.81%) にする。 */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

// 62 区市町村の合計点 (保育所等は令和 8 年 4 月 1 日、医療費助成は令和 7 年 4 月 1 日のデータ) が 32〜98 点に分かれ、
// 10 点刻みで各区分に 9 自治体以上が入るため。最も低い区分も地図の上で塗りが見える濃さから始める
/** 地図と一覧で総合の評価を色分けする区分。点数の高い順。 */
export const childcareScoreClasses = [
  { minTotal: 90, label: "90 点以上", color: "#006d2c" },
  { minTotal: 80, label: "80〜89 点", color: "#31a354" },
  { minTotal: 70, label: "70〜79 点", color: "#74c476" },
  { minTotal: 60, label: "60〜69 点", color: "#a1d99b" },
  { minTotal: 0, label: "60 点未満", color: "#d9f0d3" },
] as const;

/** 根拠の指標が欠損して評価できない区市町村の色。どの点数の区分とも見分けられる灰色にする。 */
export const missingChildcareScoreColor = "#9ca3af";

/** 合計点 total の色分けの色を返す。total が null (評価できない) の時は missingChildcareScoreColor を返す。 */
export function childcareScoreColor(total: number | null): string {
  if (total === null) {
    return missingChildcareScoreColor;
  }
  return (
    childcareScoreClasses.find((scoreClass) => total >= scoreClass.minTotal) ??
    childcareScoreClasses[childcareScoreClasses.length - 1]
  ).color;
}
