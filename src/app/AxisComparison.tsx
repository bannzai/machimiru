import Link from "next/link";
import {
  type AxisCondition,
  type AxisId,
  type ConditionFitLevels,
  type ConditionId,
  type ConditionValues,
  type FitLevel,
  activeAxes,
  axisFitLevel,
  fitLevelColor,
  fitLevelLabel,
  fitLevels,
  missingFitColor,
  missingFitLabel,
  summaryFitLevel,
} from "@/lib/axes";
import { siteName } from "@/lib/site";
import type { Municipality } from "@/lib/tokyoData/schema";
import { municipalityPagePath, ScoreSwatch } from "./ChildcareScorePanel";

/** 街をくらべるタブ。summary (まとめ) か、軸の識別子。 */
export type AxisTab = "summary" | AxisId;

/**
 * 選んだ街を軸ごとに比べるタブ (documents/design/mockups/compare.html・matrix.html の構造)。
 * まとめのタブは選んだ街 × 軸の表、軸のタブはその軸の条件ごとの段階と根拠を出す。地図の塗り分けは同じ axisTab で AreaMap が切り替える。
 * municipalities は選んだ区市町村、activeConditionIds はチャットで使うことにした条件。
 */
export function AxisComparison({
  municipalities,
  conditionValues,
  conditionFitLevels,
  activeConditionIds,
  axisTab,
  onAxisTabChange,
}: {
  municipalities: readonly Municipality[];
  conditionValues: ConditionValues;
  conditionFitLevels: ConditionFitLevels;
  activeConditionIds: readonly ConditionId[];
  axisTab: AxisTab;
  onAxisTabChange: (axisTab: AxisTab) => void;
}) {
  const comparedAxes = activeAxes(activeConditionIds);
  const tabs = [
    { axisTab: "summary" as const, name: "まとめ" },
    ...comparedAxes.map((axis) => ({ axisTab: axis.id, name: axis.name })),
  ];
  const selectedAxis = comparedAxes.find((axis) => axis.id === axisTab);
  const activeConditionsOf = (conditions: readonly AxisCondition[]) =>
    conditions.filter((condition) => activeConditionIds.includes(condition.id as ConditionId));
  return (
    <section className="axis-comparison" aria-labelledby="axis-comparison-heading">
      <h2 id="axis-comparison-heading">街をくらべる</h2>
      <div role="tablist" aria-label="くらべる軸" className="axis-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.axisTab}
            type="button"
            role="tab"
            id={`axis-tab-${tab.axisTab}`}
            aria-selected={tab.axisTab === axisTab}
            aria-controls="axis-comparison-panel"
            onClick={() => onAxisTabChange(tab.axisTab)}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="axis-comparison-panel" aria-labelledby={`axis-tab-${axisTab}`}>
        <p className="axis-comparison-note">
          {selectedAxis === undefined
            ? comparedAxes.length === 0
              ? "使う条件がありません 文章を入れるか条件にチェックを付けてください"
              : `${comparedAxes.map((axis) => axis.name).join("・")}の段階を合わせて地図を塗り分けています`
            : activeConditionsOf(selectedAxis.conditions)
                .map((condition) => condition.name)
                .join(" ・ ")}
        </p>
        {selectedAxis !== undefined &&
          activeConditionsOf(selectedAxis.conditions).map(
            (condition) =>
              condition.note !== undefined && (
                <p key={condition.id} className="axis-comparison-note">
                  {condition.name}: {condition.note}
                </p>
              ),
          )}
        <ul className="axis-legend" aria-label="地図の色分け">
          {fitLevels.map((fitLevel) => (
            <li key={fitLevel.level}>
              <ScoreSwatch color={fitLevel.color} />
              {fitLevel.label}
            </li>
          ))}
          <li>
            <ScoreSwatch color={missingFitColor} />
            {missingFitLabel}
          </li>
        </ul>
        {municipalities.length === 0 ? (
          <p>地図で街を選ぶと選んだ街をこの軸でくらべられます</p>
        ) : selectedAxis === undefined ? (
          <AxisMatrix
            municipalities={municipalities}
            conditionFitLevels={conditionFitLevels}
            activeConditionIds={activeConditionIds}
          />
        ) : (
          <ul className="axis-municipality-list" aria-label={`選んだ街を${selectedAxis.name}で見ると`}>
            {municipalities.map((municipality) => (
              <li key={municipality.code}>
                <Link href={municipalityPagePath(municipality.code)}>{municipality.name}</Link>
                <FitLevelBadge
                  level={axisFitLevel(conditionFitLevels, activeConditionIds, selectedAxis.id, municipality.code)}
                />
                <ul className="axis-condition-list" aria-label={`${municipality.name}の条件ごとの段階`}>
                  {activeConditionsOf(selectedAxis.conditions).map((condition) => {
                    const conditionId = condition.id as ConditionId;
                    return (
                      <li key={conditionId}>
                        {condition.name}: {fitLevelLabel(conditionFitLevels[conditionId][municipality.code] ?? null)}
                        <small>{conditionValues[conditionId][municipality.code]?.detail}</small>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <p className="axis-comparison-note">
          合う度合いは公開データから {siteName}{" "}
          が独自に作ったもので、自治体による評価ではありません。東京都の区市町村の中の順位で 4 段階に分けています。
        </p>
      </div>
    </section>
  );
}

/** 選んだ街 × 軸の表。行はまとめの段階の合う順 (データなしは最後)、列はまとめと、使う条件を持つ軸。 */
function AxisMatrix({
  municipalities,
  conditionFitLevels,
  activeConditionIds,
}: {
  municipalities: readonly Municipality[];
  conditionFitLevels: ConditionFitLevels;
  activeConditionIds: readonly ConditionId[];
}) {
  const comparedAxes = activeAxes(activeConditionIds);
  const rows = municipalities
    .map((municipality) => ({
      municipality,
      summaryLevel: summaryFitLevel(conditionFitLevels, activeConditionIds, municipality.code),
    }))
    .sort((a, b) => (b.summaryLevel ?? -1) - (a.summaryLevel ?? -1));
  return (
    <table className="axis-matrix">
      <caption>選んだ街 {municipalities.length} 合う順</caption>
      <thead>
        <tr>
          <th scope="col">街</th>
          <th scope="col">まとめ</th>
          {comparedAxes.map((axis) => (
            <th key={axis.id} scope="col">
              {axis.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ municipality, summaryLevel }) => (
          <tr key={municipality.code}>
            <th scope="row">
              <Link href={municipalityPagePath(municipality.code)}>{municipality.name}</Link>
            </th>
            <td>
              <FitLevelBadge level={summaryLevel} />
            </td>
            {comparedAxes.map((axis) => (
              <td key={axis.id}>
                <FitLevelBadge level={axisFitLevel(conditionFitLevels, activeConditionIds, axis.id, municipality.code)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 段階 level の色の見本と表示名。 */
export function FitLevelBadge({ level }: { level: FitLevel | null }) {
  return (
    <span className="fit-level-badge">
      <ScoreSwatch color={fitLevelColor(level)} />
      {fitLevelLabel(level)}
    </span>
  );
}
