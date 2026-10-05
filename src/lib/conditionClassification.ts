import { z } from "zod";
import { type ConditionId, axes, conditionIds } from "./axes";

/**
 * registry (axes.ts) に無い軸のうち、判定できない条件を振り分ける先の候補。画面には「この軸はまだ判定できません」と出し、
 * 軸の追加のリクエストとして記録する。どれにも当たらない文は otherAxisName に振り分ける。
 */
export const unsupportedAxisCandidates = [
  // 辞書による判定は先に並べた候補から語を探すため、「家賃は 15 万円まで」が通勤の語に当たらないよう予算を通勤より先に置く
  { name: "予算", classifierDescription: "Budget: rent, housing price, or living cost", keywords: ["家賃", "予算", "万円", "住宅費"] },
  {
    name: "通勤",
    classifierDescription: "Commute: travel time or distance to a workplace, school, or station",
    keywords: ["通勤", "通学", "駅", "分以内", "電車", "乗り換え"],
  },
  {
    name: "買い物",
    classifierDescription: "Shopping: supermarkets, drugstores, shopping streets",
    keywords: ["買い物", "スーパー", "ドラッグストア", "商店街"],
  },
  { name: "治安", classifierDescription: "Safety: crime rate, security", keywords: ["治安", "犯罪", "防犯"] },
  { name: "自然", classifierDescription: "Nature: parks, greenery, quiet surroundings", keywords: ["自然", "公園", "緑"] },
  {
    name: "医療・健康",
    classifierDescription: "Medical and health care for adults: hospitals, dentists, acupuncture, clinics",
    keywords: ["病院", "歯科", "鍼灸", "整骨", "クリニック"],
  },
  {
    name: "仕事場",
    classifierDescription: "Work places: coworking spaces, offices",
    keywords: ["コワーキング", "オフィス", "職場"],
  },
  { name: "教育", classifierDescription: "Education: schools, school districts, cram schools", keywords: ["学区", "学校", "塾"] },
] as const;

/** 判定できない条件が、registry の軸にも unsupportedAxisCandidates にも当たらない時の軸の名前。 */
export const otherAxisName = "その他";

// 1 回の入力で書かれる暮らしの条件 (issue の例文で 50 文字ほど) に十分な長さで、Jev に送る文章と費用の上限を決める
/** 判定に送れる文章の最大の文字数。 */
export const maxConditionTextLength = 400;

/** 判定の API (`POST /api/conditions/`) が受け取る本文。 */
export const conditionRequestSchema = z.object({
  text: z.string().trim().min(1).max(maxConditionTextLength),
});

/** 判定の API が返す、文章を軸と条件に分けた結果。 */
export const conditionClassificationSchema = z.object({
  /** 判定に使った方式。jev は TypeSafe の Jev、dictionary は API キーの無い環境の辞書による対応付け。 */
  classifier: z.enum(["jev", "dictionary"]),
  /** 文章から読み取った、registry にある条件 (registry の順、重複なし)。 */
  conditionIds: z.array(z.enum(conditionIds)),
  /** registry に無い軸の条件。text は入力の文章を区切った文で、そのまま画面に出す。 */
  unsupportedConditions: z.array(z.object({ axisName: z.string().min(1), text: z.string().min(1) })),
});

/** 判定の API が返す、文章を軸と条件に分けた結果。 */
export type ConditionClassification = z.infer<typeof conditionClassificationSchema>;

/** 文章を区切った文 1 つの判定。 */
export type ClauseClassification = {
  /** 住む場所への希望を書いた文か。家族の状況などの背景だけの文は false で、条件にしない。 */
  isWish: boolean;
  /** 文が求めている、registry の条件。 */
  conditionIds: ConditionId[];
  /** 文の話題の軸の名前 (registry の軸、unsupportedAxisCandidates、otherAxisName のどれか)。 */
  axisName: string;
};

/** 文 clauses のそれぞれを判定し、clauses と同じ順で返す判定器。 */
export type ClauseClassifier = {
  name: ConditionClassification["classifier"];
  classify: (clauses: readonly string[]) => Promise<ClauseClassification[]>;
};

// Jev は文を生成できないため、条件の表示に使う文は code で区切る (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md 「Generation」)
/** text を句読点・改行・中黒で文に区切る。空の文は除く。 */
export function splitConditionClauses(text: string): string[] {
  return text
    .split(/[、。,.，．・!?！？\n]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

/** text を文に区切って classifier で判定し、registry の条件と、registry に無い軸の条件に分ける。 */
export async function classifyConditionText(text: string, classifier: ClauseClassifier): Promise<ConditionClassification> {
  const clauses = splitConditionClauses(text);
  const clauseClassifications = clauses.length === 0 ? [] : await classifier.classify(clauses);
  const detectedConditionIds = new Set<ConditionId>();
  const unsupportedConditions: ConditionClassification["unsupportedConditions"] = [];
  clauseClassifications.forEach(({ isWish, conditionIds: clauseConditionIds, axisName }, index) => {
    if (!isWish) {
      return;
    }
    const registryAxis = axes.find((axis) => axis.name === axisName);
    if (clauseConditionIds.length > 0) {
      clauseConditionIds.forEach((conditionId) => detectedConditionIds.add(conditionId));
    } else if (registryAxis !== undefined) {
      // 「子育てしやすい」のように軸の話題だけを書いた文は、軸のすべての条件を求めているとみなす
      registryAxis.conditions.forEach((condition) => detectedConditionIds.add(condition.id));
    } else {
      unsupportedConditions.push({ axisName, text: clauses[index] });
    }
  });
  return {
    classifier: classifier.name,
    conditionIds: conditionIds.filter((conditionId) => detectedConditionIds.has(conditionId)),
    unsupportedConditions,
  };
}

// 「2 歳の子どもがいて」「九州から東京に引っ越します」のように、条件ではなく家族の状況を書いた文の書き方
const backgroundClausePattern = /(子ども|子供|娘|息子|家族|夫|妻).*(いて|います|いる)|引っ越|引越|転勤/;

/** API キーの無い環境 (PR の CI・テスト・キーを置いていないローカル) で使う、語の辞書による判定器。同じ文には常に同じ判定を返す。 */
export const dictionaryClauseClassifier: ClauseClassifier = {
  name: "dictionary",
  classify: async (clauses) =>
    clauses.map((clause) => {
      const clauseConditionIds = axes
        .flatMap((axis) => axis.conditions)
        .filter((condition) => condition.keywords.some((keyword) => clause.includes(keyword)))
        .map((condition) => condition.id);
      const axisName =
        [...axes, ...unsupportedAxisCandidates].find((candidate) =>
          candidate.keywords.some((keyword) => clause.includes(keyword)),
        )?.name ?? otherAxisName;
      return {
        isWish: clauseConditionIds.length > 0 || !backgroundClausePattern.test(clause),
        conditionIds: clauseConditionIds,
        axisName:
          clauseConditionIds.length > 0
            ? axes.find((axis) => axis.conditions.some((condition) => condition.id === clauseConditionIds[0]))!.name
            : axisName,
      };
    }),
};

// 閾値を Jev 1.13 の応答で決めたため、alias (jev-latest) ではなく版を固定する。alias は新しい版の公開で答えが変わり得る
// (https://docs.typesafe.ai/models.md 「Aliases」)
/** 判定に使う Jev の版。 */
export const jevModel = "jev-1.13.0";

// Noul は「はい」の確率を返す。0.5 は「はい」と「いいえ」のどちらが確からしいかの境目で、
// issue の例文と軸の追加の要望の文 (2026-10-05 に jev-1.13.0 で確認) では、当たる文が 0.73 以上、当たらない文が 0.34 以下に分かれた
const jevYesThreshold = 0.5;

// 応答は 2026-10-05 の確認で 11 文・55 問を 1 回で数秒だった。それより大きく遅れる時は待たせずに失敗を出す
const jevTimeoutMs = 20_000;

/** TypeSafe の Jev の応答のうち、判定器が読む部分。 */
const jevResponseSchema = z.object({
  answers: z.record(
    z.string(),
    z.union([z.object({ type: z.literal("noul"), noul: z.number() }), z.object({ type: z.literal("choice"), choice: z.string() })]),
  ),
});

/**
 * TypeSafe の Jev で判定する判定器。1 回の API 呼び出しで、文ごとに「住む場所への希望か」「registry の各条件を求めているか」(Noul) と
 * 「話題の軸はどれか」(Choice) を聞く。apiKey は TypeSafe の API キー、fetchFunction はテストで差し替える fetch。
 */
export function jevClauseClassifier(apiKey: string, fetchFunction: typeof fetch = fetch): ClauseClassifier {
  const registryConditions = axes.flatMap((axis) => axis.conditions);
  const axisCriteria = Object.fromEntries(
    [...axes, ...unsupportedAxisCandidates, { name: otherAxisName, classifierDescription: "None of the above" }].map(
      ({ name, classifierDescription }) => [name, classifierDescription],
    ),
  );
  return {
    name: "jev",
    classify: async (clauses) => {
      const questions = Object.fromEntries(
        clauses.flatMap((_, index) => [
          [
            `clause_${index}_is_wish`,
            {
              type: "noul",
              instructions: `Is \`clauses[${index}]\` a wish or requirement about where to live or what should be near the home (for example nearby facilities, commute time, rent, safety, nature)?`,
              criteria: {
                true: "It states a wish or requirement about the place to live",
                false: "It only states background facts, such as the age of a child or where the family is moving from",
              },
            },
          ],
          ...registryConditions.map((condition) => [
            `clause_${index}_${condition.id}`,
            { type: "noul", instructions: `Does \`clauses[${index}]\` ask for ${condition.classifierDescription}?` },
          ]),
          [
            `clause_${index}_axis`,
            { type: "choice", instructions: `Which topic is \`clauses[${index}]\` about?`, criteria: axisCriteria },
          ],
        ]),
      );
      const response = await fetchFunction("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ state: { clauses }, model: jevModel, questions }),
        signal: AbortSignal.timeout(jevTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Jev の判定に失敗しました (HTTP ${response.status})`);
      }
      const { answers } = jevResponseSchema.parse(await response.json());
      /** 質問 questionId の Noul の答え (「はい」の確率)。応答に Noul の答えが無い時は例外にする。 */
      const noul = (questionId: string) => {
        const answer = answers[questionId];
        if (answer?.type !== "noul") {
          throw new Error(`Jev の応答に ${questionId} の答えがありません`);
        }
        return answer.noul;
      };
      return clauses.map((_, index) => {
        const axisAnswer = answers[`clause_${index}_axis`];
        if (axisAnswer?.type !== "choice") {
          throw new Error(`Jev の応答に clause_${index}_axis の答えがありません`);
        }
        return {
          isWish: noul(`clause_${index}_is_wish`) >= jevYesThreshold,
          conditionIds: registryConditions
            .filter((condition) => noul(`clause_${index}_${condition.id}`) >= jevYesThreshold)
            .map((condition) => condition.id),
          axisName: axisAnswer.choice,
        };
      });
    },
  };
}

/**
 * 環境変数から判定器を選ぶ。CONDITION_CLASSIFIER が dictionary の時 (e2e の撮影) と、TYPESAFE_API_KEY が無い時 (PR の CI・ローカル) は
 * 辞書による判定器、それ以外は Jev の判定器を返す。
 */
export function conditionClassifierFromEnvironment(environment: Record<string, string | undefined>): ClauseClassifier {
  const apiKey = environment.TYPESAFE_API_KEY;
  return environment.CONDITION_CLASSIFIER === "dictionary" || !apiKey ? dictionaryClauseClassifier : jevClauseClassifier(apiKey);
}
