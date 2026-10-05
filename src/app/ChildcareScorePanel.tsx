import Link from "next/link";
import {
  type ChildcareScore,
  childcareScoreClasses,
  childcareScoreColor,
  formatPercent,
  hasMedicalCopayment,
  hasMedicalIncomeLimit,
  missingChildcareScoreColor,
  waitingChildrenRate,
} from "@/lib/childcareScore";
import type { MunicipalitiesFile, Municipality } from "@/lib/tokyoData/schema";
import { ChildcareScoreMethod } from "./ChildcareScoreMethod";
import { DataSourceAttribution } from "./DataSourceAttribution";

/**
 * 区市町村ごとの子育てのしやすさの総合の評価の凡例と順位の一覧、根拠のデータの出典。
 * childcareScores は municipalitiesFile.municipalities と同じ順の評価。
 */
export function ChildcareScorePanel({
  municipalitiesFile,
  childcareScores,
}: {
  municipalitiesFile: MunicipalitiesFile;
  childcareScores: readonly ChildcareScore[];
}) {
  const rankedMunicipalities = municipalitiesFile.municipalities
    .map((municipality, index) => ({ municipality, childcareScore: childcareScores[index] }))
    // 評価できない区市町村は 0 点の街と混ざらないよう、順位のある区市町村の後に並べる (同じ順位はコードの順のまま)
    .sort(
      (a, b) =>
        (a.childcareScore.rank ?? Number.MAX_SAFE_INTEGER) - (b.childcareScore.rank ?? Number.MAX_SAFE_INTEGER),
    );
  return (
    <section className="childcare-score" aria-labelledby="childcare-score-heading">
      <h2 id="childcare-score-heading">子育てのしやすさ (総合の評価)</h2>
      <ChildcareScoreMethod />
      <ul className="childcare-score-legend" aria-label="点数の色分け">
        {childcareScoreClasses.map((scoreClass) => (
          <li key={scoreClass.color}>
            <ScoreSwatch color={scoreClass.color} />
            {scoreClass.label}
          </li>
        ))}
        <li>
          <ScoreSwatch color={missingChildcareScoreColor} />
          評価なし (データ不足)
        </li>
      </ul>
      <p className="childcare-score-hint">区市町村名を選ぶと指標の値と子育て支援制度の一覧を見られます</p>
      <ol className="childcare-score-ranking" aria-label="子育てのしやすさの順位">
        {rankedMunicipalities.map(({ municipality, childcareScore }) => (
          <li key={municipality.code}>
            <ScoreSwatch color={childcareScoreColor(childcareScore.total)} />
            <span className="childcare-score-rank">{childcareScore.rank === null ? "—" : `${childcareScore.rank} 位`}</span>
            <Link href={municipalityPagePath(municipality.code)}>{municipality.name}</Link>
            <strong>{childcareScore.total === null ? "評価なし" : `${childcareScore.total} 点`}</strong>
            <small>{indicatorSummary(municipality)}</small>
          </li>
        ))}
      </ol>
      <h3>出典</h3>
      <ul className="childcare-score-sources">
        {municipalitiesFile.sources.map((source) => (
          <li key={source.id}>
            <DataSourceAttribution source={source} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 区市町村 (全国地方公共団体コード municipalityCode) の指標と子育て支援制度のページのパス。 */
export function municipalityPagePath(municipalityCode: string): string {
  return `/municipalities/${municipalityCode}/`;
}

/** 総合の評価の区分の色の見本。色の意味は隣の文字で伝えるため、読み上げない。 */
export function ScoreSwatch({ color }: { color: string }) {
  return <span className="childcare-score-swatch" style={{ backgroundColor: color }} aria-hidden="true" />;
}

/** 一覧の 1 行に添える、総合の評価の根拠の指標の値の要約。欠損している指標はデータが無いことを書く。 */
function indicatorSummary({ childcare, medicalSubsidy, programCount }: Municipality): string {
  return [
    childcare === null
      ? "待機児童のデータなし"
      : `待機児童 ${childcare.waitingChildrenCount} 人 (${formatPercent(waitingChildrenRate(childcare))})`,
    ...(medicalSubsidy === null
      ? ["医療費助成のデータなし"]
      : [
          `医療費の自己負担${hasMedicalCopayment(medicalSubsidy) ? "あり" : "なし"}`,
          `所得制限${hasMedicalIncomeLimit(medicalSubsidy) ? "あり" : "なし"}`,
        ]),
    `制度 ${programCount} 件`,
  ].join("・");
}
