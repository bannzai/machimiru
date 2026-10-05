import { z } from "zod";
import { type ConditionId, axes, conditionIds, registryConditions } from "./axes";

/** registry (axes.ts) に無い軸の候補 1 件。 */
export type UnsupportedAxisCandidate = {
  /** 画面に出す軸の名前。 */
  name: string;
  /** 文章の判定で Jev に渡す、この軸の話題の説明 (英語)。 */
  classifierDescription: string;
  /** 辞書による判定で、この軸の話題の文に含まれる語。 */
  keywords: readonly string[];
  /**
   * 出典が見つからない・利用条件で使えないため軸を足せない時の理由。「この軸は<理由>ため判定できません」に入る、
   * 「ため」に続く形で書く (例: 口コミを二次利用できる公開データが無い)。軸の追加のリクエストとして記録しない。
   * 登録の手順は documents/add-axis.md。
   */
  unavailableReason?: string;
};

/**
 * registry (axes.ts) に無い軸のうち、判定できない条件を振り分ける先の候補。unavailableReason の無い候補は画面に
 * 「この軸はまだ判定できません」と出し、軸の追加のリクエストとして記録する。どれにも当たらない文は otherAxisName に振り分ける。
 */
export const unsupportedAxisCandidates = [
  { name: "予算", classifierDescription: "Budget: rent, housing price, or living cost", keywords: ["家賃", "予算", "万円", "住宅費"] },
  {
    name: "通勤",
    classifierDescription: "Commute: travel time or distance to a workplace, school, or station",
    keywords: ["通勤", "通学", "職場", "仕事場", "駅", "分以内", "電車", "乗り換え"],
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
  { name: "教育", classifierDescription: "Education: schools, school districts, cram schools", keywords: ["学区", "学校", "塾"] },
] as const satisfies readonly UnsupportedAxisCandidate[];

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
  /**
   * registry に無い軸の条件。text は入力の文章を区切った文で、そのまま画面に出す。unavailableReason は、軸の候補に
   * 軸を足せない理由が登録されている時だけ持つ (UnsupportedAxisCandidate の unavailableReason)。
   */
  unsupportedConditions: z.array(
    z.object({
      axisName: z.string().min(1),
      text: z.string().min(1),
      unavailableReason: z.string().min(1).optional(),
    }),
  ),
});

/** 判定の API が返す、文章を軸と条件に分けた結果。 */
export type ConditionClassification = z.infer<typeof conditionClassificationSchema>;

/** チャットが registry に無い軸の条件 unsupportedCondition に添える文。軸を足せない理由があればそれを出す。 */
export function unsupportedConditionNote({
  unavailableReason,
}: ConditionClassification["unsupportedConditions"][number]): string {
  return unavailableReason === undefined
    ? "この軸はまだ判定できません 軸の追加のリクエストとして記録しました"
    : `この軸は${unavailableReason}ため判定できません`;
}

/** 文章を区切った文 1 つの判定。 */
export type ClauseClassification = {
  /** 住む場所への希望を書いた文か。家族の状況などの背景だけの文は false で、条件にしない。 */
  isWish: boolean;
  /** 文が求めている、registry の条件。 */
  conditionIds: ConditionId[];
  /**
   * 文が希望を書いている話題の軸の名前 (registry の軸と unsupportedAxisCandidates)。「保育園が近く新宿まで 30 分以内」のように
   * 1 つの文が複数の軸の希望を含むことがあるため、当たる軸をすべて持つ。
   */
  axisNames: string[];
};

/** 文 clauses のそれぞれを判定し、clauses と同じ順で返す判定器。 */
export type ClauseClassifier = {
  name: ConditionClassification["classifier"];
  classify: (clauses: readonly string[]) => Promise<ClauseClassification[]>;
};

// Jev は文を生成できないため、条件の表示に使う文は code で区切る (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md 「Generation」)
/** text を句読点・改行・中黒で文に区切る。数字に挟まれたピリオド・カンマ (「15.5 万円」「150,000 円」) では区切らない。空の文は除く。 */
export function splitConditionClauses(text: string): string[] {
  return text
    .split(/[、。・!?！？\n]|(?<![0-9０-９])[,.，．]|[,.，．](?![0-9０-９])/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

/**
 * text を文に区切って classifier で判定し、registry の条件と、registry に無い軸の条件に分ける。registry に無い軸の条件には、
 * axisCandidates の同じ名前の候補の unavailableReason を付ける (axisCandidates はテストで差し替える)。
 */
export async function classifyConditionText(
  text: string,
  classifier: ClauseClassifier,
  axisCandidates: readonly UnsupportedAxisCandidate[] = unsupportedAxisCandidates,
): Promise<ConditionClassification> {
  const clauses = splitConditionClauses(text);
  const clauseClassifications = clauses.length === 0 ? [] : await classifier.classify(clauses);
  const detectedConditionIds = new Set<ConditionId>();
  const unsupportedConditions: ConditionClassification["unsupportedConditions"] = [];
  clauseClassifications.forEach(({ isWish, conditionIds: clauseConditionIds, axisNames }, index) => {
    if (!isWish) {
      return;
    }
    clauseConditionIds.forEach((conditionId) => detectedConditionIds.add(conditionId));
    for (const axisName of axisNames) {
      const registryAxis = axes.find((axis) => axis.name === axisName);
      if (registryAxis === undefined) {
        const unavailableReason = axisCandidates.find((candidate) => candidate.name === axisName)?.unavailableReason;
        unsupportedConditions.push({
          axisName,
          text: clauses[index],
          ...(unavailableReason === undefined ? {} : { unavailableReason }),
        });
      } else if (!registryAxis.conditions.some((condition) => clauseConditionIds.includes(condition.id))) {
        // 「子育てしやすい」のように軸の話題だけを書いた文は、軸のすべての条件を求めているとみなす
        registryAxis.conditions.forEach((condition) => detectedConditionIds.add(condition.id));
      }
    }
    if (clauseConditionIds.length === 0 && axisNames.length === 0) {
      unsupportedConditions.push({ axisName: otherAxisName, text: clauses[index] });
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
      const clauseConditionIds = registryConditions
        .filter((condition) => condition.keywords.some((keyword) => clause.includes(keyword)))
        .map((condition) => condition.id);
      // 「東京に引っ越すので新宿まで 30 分以内」「子育てしやすい街に引っ越したい」のように背景と同じ文に書いた希望を落とさないよう、
      // 条件か軸の語を含む文は、背景の書き方を含んでいても希望として扱う
      const hasAxisKeyword = [...axes, ...unsupportedAxisCandidates].some((candidate) =>
        candidate.keywords.some((keyword) => clause.includes(keyword)),
      );
      return {
        isWish: clauseConditionIds.length > 0 || hasAxisKeyword || !backgroundClausePattern.test(clause),
        conditionIds: clauseConditionIds,
        axisNames: [...axes, ...unsupportedAxisCandidates]
          .filter(
            (candidate) =>
              candidate.keywords.some((keyword) => clause.includes(keyword)) ||
              ("conditions" in candidate &&
                candidate.conditions.some((condition) => clauseConditionIds.includes(condition.id))),
          )
          .map((candidate) => candidate.name),
      };
    }),
};

// 閾値を Jev 1.13 の応答で決めたため、alias (jev-latest) ではなく版を固定する。alias は新しい版の公開で答えが変わり得る
// (https://docs.typesafe.ai/models.md 「Aliases」)
/** 判定に使う Jev の版。 */
export const jevModel = "jev-1.13.0";

// Noul は「はい」の確率を返す。0.5 は「はい」と「いいえ」のどちらが確からしいかの境目で、issue の例文と軸の追加の要望の文
// (2026-10-05 に jev-1.13.0 で確認) では、当たる質問が 0.57 以上、当たらない質問が 0.42 以下に分かれた
const jevYesThreshold = 0.5;

// 応答は 2026-10-05 の確認で 13 文・169 問を 1 回で数秒だった。それより大きく遅れる時は待たせずに失敗を出す
const jevTimeoutMs = 20_000;

/** TypeSafe の Jev の応答のうち、判定器が読む部分 (質問の id ごとの Noul の答え)。 */
const jevResponseSchema = z.object({
  answers: z.record(z.string(), z.object({ type: z.literal("noul"), noul: z.number() })),
});

/**
 * TypeSafe の Jev で判定する判定器。1 回の API 呼び出しで、文ごとに「住む場所への希望か」「registry の各条件を求めているか」
 * 「各軸の話題の希望を書いているか」を Noul で聞く。apiKey は TypeSafe の API キー、fetchFunction はテストで差し替える fetch。
 */
export function jevClauseClassifier(apiKey: string, fetchFunction: typeof fetch = fetch): ClauseClassifier {
  const axisCandidates = [...axes, ...unsupportedAxisCandidates];
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
          // 質問の id は英数字にそろえるため、軸は名前ではなく並びの番号で区別する
          ...axisCandidates.map((candidate, axisIndex) => [
            `clause_${index}_axis_${axisIndex}`,
            {
              type: "noul",
              instructions: `Does \`clauses[${index}]\` state a wish or requirement about this topic: ${candidate.classifierDescription}?`,
            },
          ]),
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
      /** 質問 questionId に「はい」と答えたか。応答に答えが無い時は例外にする。 */
      const isYes = (questionId: string) => {
        const answer = answers[questionId];
        if (answer === undefined) {
          throw new Error(`Jev の応答に ${questionId} の答えがありません`);
        }
        return answer.noul >= jevYesThreshold;
      };
      return clauses.map((_, index) => ({
        isWish: isYes(`clause_${index}_is_wish`),
        conditionIds: registryConditions
          .filter((condition) => isYes(`clause_${index}_${condition.id}`))
          .map((condition) => condition.id),
        axisNames: axisCandidates
          .filter((_, axisIndex) => isYes(`clause_${index}_axis_${axisIndex}`))
          .map((candidate) => candidate.name),
      }));
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
