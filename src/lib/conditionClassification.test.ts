import { describe, expect, it, vi } from "vitest";
import {
  type ClauseClassifier,
  classifyConditionText,
  conditionClassifierFromEnvironment,
  dictionaryClauseClassifier,
  jevClauseClassifier,
  jevModel,
  splitConditionClauses,
} from "./conditionClassification";

// issue の例文 (https://github.com/bannzai/machimiru/issues/9)
const exampleText = "2 歳の子どもがいて、保育園と小児科が近く、新宿まで 30 分以内、家賃は 15 万円まで";

describe("splitConditionClauses", () => {
  it("句読点・改行・中黒で区切り、空の文を除く", () => {
    expect(splitConditionClauses(`${exampleText}。\n犯罪率が低い・自然豊か!`)).toEqual([
      "2 歳の子どもがいて",
      "保育園と小児科が近く",
      "新宿まで 30 分以内",
      "家賃は 15 万円まで",
      "犯罪率が低い",
      "自然豊か",
    ]);
  });
});

describe("classifyConditionText (判定器を固定の判定に差し替える)", () => {
  /** 文ごとの判定を clauseClassifications から返す判定器。 */
  const fixedClassifier = (
    clauseClassifications: Awaited<ReturnType<ClauseClassifier["classify"]>>,
  ): ClauseClassifier => ({ name: "jev", classify: async () => clauseClassifications });

  it("背景の文を除き、registry の条件と、registry に無い軸の条件に分ける", async () => {
    const classification = await classifyConditionText(
      exampleText,
      fixedClassifier([
        { isWish: false, conditionIds: [], axisName: "子育て" },
        { isWish: true, conditionIds: ["nurseryAvailability", "pediatricsNearby"], axisName: "子育て" },
        { isWish: true, conditionIds: [], axisName: "通勤" },
        { isWish: true, conditionIds: [], axisName: "予算" },
      ]),
    );
    expect(classification).toEqual({
      classifier: "jev",
      conditionIds: ["pediatricsNearby", "nurseryAvailability"],
      unsupportedConditions: [
        { axisName: "通勤", text: "新宿まで 30 分以内" },
        { axisName: "予算", text: "家賃は 15 万円まで" },
      ],
    });
  });

  it("registry の軸の話題だけを書いた文は、その軸のすべての条件を使う", async () => {
    const classification = await classifyConditionText(
      "熊本から遠方で子育てしやすい",
      fixedClassifier([{ isWish: true, conditionIds: [], axisName: "子育て" }]),
    );
    expect(classification.conditionIds).toEqual(["pediatricsNearby", "nurseryAvailability", "childcareSupport"]);
    expect(classification.unsupportedConditions).toEqual([]);
  });
});

describe("dictionaryClauseClassifier", () => {
  it("issue の例文を、子育ての 2 条件と、通勤・予算の判定できない条件に分ける", async () => {
    expect(await classifyConditionText(exampleText, dictionaryClauseClassifier)).toEqual({
      classifier: "dictionary",
      conditionIds: ["pediatricsNearby", "nurseryAvailability"],
      unsupportedConditions: [
        { axisName: "通勤", text: "新宿まで 30 分以内" },
        { axisName: "予算", text: "家賃は 15 万円まで" },
      ],
    });
  });

  it("軸の追加の要望の文を、それぞれの軸の判定できない条件にする", async () => {
    expect(
      (await classifyConditionText("鍼灸の評判が良い場所が近い、コワーキングが近い場所、犯罪率が低い場所、駅前の雰囲気", dictionaryClauseClassifier))
        .unsupportedConditions,
    ).toEqual([
      { axisName: "医療・健康", text: "鍼灸の評判が良い場所が近い" },
      { axisName: "仕事場", text: "コワーキングが近い場所" },
      { axisName: "治安", text: "犯罪率が低い場所" },
      { axisName: "通勤", text: "駅前の雰囲気" },
    ]);
  });

  it("どの軸の語も含まない文は「その他」の軸にする", async () => {
    expect((await classifyConditionText("にぎやかな街", dictionaryClauseClassifier)).unsupportedConditions).toEqual([
      { axisName: "その他", text: "にぎやかな街" },
    ]);
  });
});

describe("jevClauseClassifier", () => {
  it("文ごとの質問を 1 回の API 呼び出しにまとめ、0.5 以上の Noul を「はい」として読む", async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () =>
      Response.json({
        model: "jev-1.13.0",
        answers: {
          clause_0_is_wish: { type: "noul", noul: 0.07 },
          clause_0_pediatricsNearby: { type: "noul", noul: 0.03 },
          clause_0_nurseryAvailability: { type: "noul", noul: 0.13 },
          clause_0_childcareSupport: { type: "noul", noul: 0.11 },
          clause_0_axis: { type: "choice", choice: "子育て", probabilities: {}, confidence: 0.99 },
          clause_1_is_wish: { type: "noul", noul: 0.96 },
          clause_1_pediatricsNearby: { type: "noul", noul: 0.88 },
          clause_1_nurseryAvailability: { type: "noul", noul: 0.84 },
          clause_1_childcareSupport: { type: "noul", noul: 0.09 },
          clause_1_axis: { type: "choice", choice: "子育て", probabilities: {}, confidence: 1 },
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    const clauses = ["2 歳の子どもがいて", "保育園と小児科が近く"];
    expect(await jevClauseClassifier("test-key", fetchFunction).classify(clauses)).toEqual([
      { isWish: false, conditionIds: [], axisName: "子育て" },
      { isWish: true, conditionIds: ["pediatricsNearby", "nurseryAvailability"], axisName: "子育て" },
    ]);
    expect(fetchFunction).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFunction.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(jevModel);
    expect(body.state).toEqual({ clauses });
    expect(Object.keys(body.questions)).toHaveLength(10);
    expect(Object.keys(body.questions.clause_1_axis.criteria)).toEqual(
      expect.arrayContaining(["子育て", "通勤", "予算", "その他"]),
    );
  });

  it("API の失敗は HTTP の状態を含めたエラーにする", async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () => new Response("{}", { status: 429 }));
    await expect(jevClauseClassifier("test-key", fetchFunction).classify(["自然豊か"])).rejects.toThrow("HTTP 429");
  });
});

describe("conditionClassifierFromEnvironment", () => {
  it.each([
    [{}, "dictionary"],
    [{ TYPESAFE_API_KEY: "" }, "dictionary"],
    [{ TYPESAFE_API_KEY: "key", CONDITION_CLASSIFIER: "dictionary" }, "dictionary"],
    [{ TYPESAFE_API_KEY: "key" }, "jev"],
  ])("%j では %s で判定する", (environment, expected) => {
    expect(conditionClassifierFromEnvironment(environment).name).toBe(expected);
  });
});
