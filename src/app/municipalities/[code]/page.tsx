import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  type ChildcareScoreItem,
  childcareScoreColor,
  childcareScoreItemNames,
  childcareScoreMaxPoints,
  computeChildcareScores,
  formatPercent,
  maxChildcareProgramCount,
  waitingChildrenRate,
} from "@/lib/childcareScore";
import { siteName } from "@/lib/site";
import { readMunicipalitiesFile, readProgramsFile } from "@/lib/tokyoData/load";
import {
  type Municipality,
  type MunicipalityIndicatorField,
  type ProgramCategoryCode,
  programCategoryNames,
} from "@/lib/tokyoData/schema";
import { ChildcareScoreMethod } from "../../ChildcareScoreMethod";
import { ScoreSwatch } from "../../ChildcareScorePanel";
import { DataSourceAttribution } from "../../DataSourceAttribution";

// 62 区市町村のページをビルド時にすべて作り、それ以外のコードは 404 にする
export const dynamicParams = false;

/** 区市町村のページの URL のパラメータ。code は全国地方公共団体コード (6 桁)。 */
type MunicipalityPageProps = { params: Promise<{ code: string }> };

/** ビルド時に作る区市町村のページの一覧。 */
export function generateStaticParams() {
  return readMunicipalitiesFile().municipalities.map(({ code }) => ({ code }));
}

/** 区市町村のページのタイトルと説明文。 */
export async function generateMetadata({ params }: MunicipalityPageProps): Promise<Metadata> {
  const { code } = await params;
  const municipality = readMunicipalitiesFile().municipalities.find((candidate) => candidate.code === code);
  if (!municipality) {
    notFound();
  }
  return {
    title: `${municipality.name}の子育ての指標と制度 | ${siteName}`,
    description: `${municipality.name}の待機児童・子ども医療費助成・子育て支援制度を、公開データから ${siteName} が整理したページ`,
  };
}

/** 区市町村 1 件の子育てのしやすさの総合の評価・根拠の指標の値と、子育て支援制度の分野ごとの一覧。 */
export default async function MunicipalityPage({ params }: MunicipalityPageProps) {
  const { code } = await params;
  const { sources, municipalities } = readMunicipalitiesFile();
  const municipalityIndex = municipalities.findIndex((candidate) => candidate.code === code);
  if (municipalityIndex === -1) {
    notFound();
  }
  const municipality = municipalities[municipalityIndex];
  const childcareScore = computeChildcareScores(municipalities)[municipalityIndex];
  const programsFile = readProgramsFile(code);
  return (
    <main className="municipality-page">
      <p>
        <Link href="/">地図に戻る</Link>
      </p>
      <h1>{municipality.name}の子育ての指標と制度</h1>
      <p className="childcare-score-notice">
        このページは、公開データをもとに {siteName} が作成したもので、{municipality.name}の発信ではありません。
      </p>

      <section aria-labelledby="childcare-score-heading">
        <h2 id="childcare-score-heading">子育てのしやすさ (総合の評価)</h2>
        <p className="municipality-score">
          <ScoreSwatch color={childcareScoreColor(childcareScore.total)} />
          {childcareScore.total === null ? (
            <strong>評価なし (根拠の指標のデータが無いため)</strong>
          ) : (
            <>
              <strong>{childcareScore.total} 点</strong> / 100 点 (東京都の {municipalities.length} 区市町村中{" "}
              {childcareScore.rank} 位)
            </>
          )}
        </p>
        <ChildcareScoreMethod />
        <table>
          <caption>根拠の指標</caption>
          <thead>
            <tr>
              <th scope="col">指標</th>
              <th scope="col">この街の値</th>
              <th scope="col">点数</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(childcareScoreMaxPoints) as ChildcareScoreItem[]).map((item) => (
              <tr key={item}>
                <th scope="row">{childcareScoreItemNames[item]}</th>
                <td>{scoreItemValueText(municipality, item, maxChildcareProgramCount(municipalities))}</td>
                <td>{scoreItemPointsText(childcareScore.points[item], item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table>
          <caption>評価に使っていない指標</caption>
          <tbody>
            <tr>
              <th scope="row">保育サービスの利用率</th>
              <td>
                {municipality.childcareUsageRate === null
                  ? missingText(municipality, "childcareUsageRate")
                  : formatPercent(municipality.childcareUsageRate)}
              </td>
            </tr>
            <tr>
              <th scope="row">保育所等の利用児童数</th>
              <td>
                {municipality.childcare === null
                  ? missingText(municipality, "childcare")
                  : `${municipality.childcare.enrolledCount} 人 (申込者 ${municipality.childcare.applicantCount} 人のうち)`}
              </td>
            </tr>
            <tr>
              <th scope="row">子ども医療費助成の対象年齢</th>
              <td>
                {municipality.medicalSubsidy === null
                  ? missingText(municipality, "medicalSubsidy")
                  : `通院 ${municipality.medicalSubsidy.outpatientMaxAgeAtFiscalYearEnd} 歳・入院 ${municipality.medicalSubsidy.inpatientMaxAgeAtFiscalYearEnd} 歳の年度末まで`}
              </td>
            </tr>
          </tbody>
        </table>
        <h3>指標の出典</h3>
        <ul>
          {sources.map((source) => (
            <li key={source.id}>
              <DataSourceAttribution source={source} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="programs-heading">
        <h2 id="programs-heading">子育て支援制度の一覧 (分野ごと)</h2>
        {programsFile.sources.map((source) => (
          <p key={source.id}>
            <DataSourceAttribution source={source} />
          </p>
        ))}
        {programsFile.programs.length === 0 ? (
          <p>子育て支援制度レジストリに、この区市町村の制度は載っていません。</p>
        ) : (
          <>
            <p>
              子育て支援制度レジストリに載っている {programsFile.programs.length}{" "}
              件の制度を、レジストリの分野で分けています。複数の分野にまたがる制度は、それぞれの分野に出しています。
            </p>
            {programsByCategory(programsFile.programs).map(({ categoryCode, categoryPrograms }) => (
              <details key={categoryCode} className="program-category">
                <summary>
                  {programCategoryNames[categoryCode]} ({categoryPrograms.length} 件)
                </summary>
                <ul className="program-list">
                  {categoryPrograms.map((program) => (
                    <li key={program.psid}>
                      <h3>
                        {program.url === null ? (
                          program.name
                        ) : (
                          <a href={program.url} target="_blank" rel="noopener noreferrer">
                            {program.name}
                          </a>
                        )}
                      </h3>
                      {program.shortName !== null && program.shortName !== program.name && (
                        <p>通称: {program.shortName}</p>
                      )}
                      {program.summary !== null && <p>{program.summary}</p>}
                      {program.targetPersons !== null && <p>対象: {program.targetPersons}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </>
        )}
      </section>
    </main>
  );
}

/** 根拠の指標 item の、この区市町村の値の説明。maxProgramCount は制度の件数の点の満点にした件数。指標が欠損している時はデータが無いことを書く。 */
function scoreItemValueText(municipality: Municipality, item: ChildcareScoreItem, maxProgramCount: number): string {
  const { childcare, medicalSubsidy } = municipality;
  switch (item) {
    case "nurseryAvailability":
      return childcare === null
        ? missingText(municipality, "childcare")
        : `待機児童 ${childcare.waitingChildrenCount} 人 ÷ 申込者 ${childcare.applicantCount} 人 = ${formatPercent(waitingChildrenRate(childcare))}`;
    case "medicalCopayment":
      return medicalSubsidy === null
        ? missingText(municipality, "medicalSubsidy")
        : `通院: ${medicalSubsidy.outpatientHasCopayment ? "あり" : "なし"}・入院: ${medicalSubsidy.inpatientHasCopayment ? "あり" : "なし"}`;
    case "medicalIncomeLimit":
      return medicalSubsidy === null
        ? missingText(municipality, "medicalSubsidy")
        : `通院: ${medicalSubsidy.outpatientHasIncomeLimit ? "あり" : "なし"}・入院: ${medicalSubsidy.inpatientHasIncomeLimit ? "あり" : "なし"}`;
    case "programs":
      return `${municipality.programCount} 件 (東京都の区市町村で最も多いのは ${maxProgramCount} 件)`;
  }
}

/** 根拠の指標 item の点数 points の表示。指標が欠損して点数が無い (null) 時は横棒にする。 */
function scoreItemPointsText(points: number | null, item: ChildcareScoreItem): string {
  return points === null ? "—" : `${points.toFixed(1)} / ${childcareScoreMaxPoints[item]} 点`;
}

/** 欠損している指標 field の表示。ほかの区市町村と同じ値に見えないよう、データが無いことと理由を書く。 */
function missingText(municipality: Municipality, field: MunicipalityIndicatorField): string {
  const reason = municipality.missing.find((missingIndicator) => missingIndicator.field === field)?.reason;
  return reason === undefined ? "データなし" : `データなし (${reason})`;
}

/**
 * programs をレジストリの分野ごとに分けて、分野のコードの順で返す。制度の無い分野は返さない。
 * 複数の分野を持つ制度はそれぞれの分野に入れ、分野を持たない制度は未分類に入れる。
 */
function programsByCategory(programs: ReturnType<typeof readProgramsFile>["programs"]) {
  return (Object.keys(programCategoryNames) as ProgramCategoryCode[])
    .map((categoryCode) => ({
      categoryCode,
      categoryPrograms: programs.filter((program) =>
        program.categories.length === 0 ? categoryCode === "000" : program.categories.includes(categoryCode),
      ),
    }))
    .filter(({ categoryPrograms }) => categoryPrograms.length > 0);
}
