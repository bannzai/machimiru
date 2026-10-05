import { describe, expect, it, vi } from "vitest";
import {
  type ClauseClassifier,
  classifyConditionText,
  conditionClassifierFromEnvironment,
  dictionaryClauseClassifier,
  jevClauseClassifier,
  jevModel,
  splitConditionClauses,
  unsupportedAxisCandidates,
  unsupportedConditionNote,
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

  it("数字に挟まれた小数点・桁区切りでは区切らない", () => {
    expect(splitConditionClauses("家賃は15.5万円まで,家賃150,000円以内。駅まで 10 分.")).toEqual([
      "家賃は15.5万円まで",
      "家賃150,000円以内",
      "駅まで 10 分",
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
        { isWish: false, conditionIds: [], axisNames: ["子育て"] },
        { isWish: true, conditionIds: ["nurseryAvailability", "pediatricsNearby"], axisNames: ["子育て"] },
        { isWish: true, conditionIds: [], axisNames: ["通勤"] },
        { isWish: true, conditionIds: [], axisNames: ["予算"] },
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
      fixedClassifier([{ isWish: true, conditionIds: [], axisNames: ["子育て"] }]),
    );
    expect(classification.conditionIds).toEqual(["pediatricsNearby", "nurseryAvailability", "childcareSupport"]);
    expect(classification.unsupportedConditions).toEqual([]);
  });

  it("1 つの文に registry の条件と registry に無い軸の希望がある時は、両方を残す", async () => {
    const classification = await classifyConditionText(
      "保育園が近く新宿まで 30 分以内",
      fixedClassifier([{ isWish: true, conditionIds: ["nurseryAvailability"], axisNames: ["子育て", "通勤"] }]),
    );
    expect(classification.conditionIds).toEqual(["nurseryAvailability"]);
    expect(classification.unsupportedConditions).toEqual([{ axisName: "通勤", text: "保育園が近く新宿まで 30 分以内" }]);
  });

  it("軸を足せない理由を登録した候補の軸の条件には、その理由を付ける", async () => {
    const classification = await classifyConditionText(
      "鍼灸の評判が良い場所が近い、新宿まで 30 分以内",
      fixedClassifier([
        { isWish: true, conditionIds: [], axisNames: ["医療・健康", "評判"] },
        { isWish: true, conditionIds: [], axisNames: ["通勤"] },
      ]),
      [
        ...unsupportedAxisCandidates,
        {
          name: "評判",
          classifierDescription: "Reputation or reviews of places",
          keywords: ["評判"],
          unavailableReason: "評判を載せた公開データが無い",
        },
      ],
    );
    expect(classification.unsupportedConditions).toEqual([
      { axisName: "医療・健康", text: "鍼灸の評判が良い場所が近い" },
      { axisName: "評判", text: "鍼灸の評判が良い場所が近い", unavailableReason: "評判を載せた公開データが無い" },
      { axisName: "通勤", text: "新宿まで 30 分以内" },
    ]);
  });

  it("チャットは、理由のある条件にその理由を、無い条件にリクエストとして記録したことを添える", () => {
    expect(
      unsupportedConditionNote({
        axisName: "評判",
        text: "鍼灸の評判が良い場所が近い",
        unavailableReason: "評判を載せた公開データが無い",
      }),
    ).toBe("この軸は評判を載せた公開データが無いため判定できません");
    expect(unsupportedConditionNote({ axisName: "通勤", text: "新宿まで 30 分以内" })).toBe(
      "この軸はまだ判定できません 軸の追加のリクエストとして記録しました",
    );
  });

  it("希望だがどの軸にも当たらない文は「その他」の軸にする", async () => {
    expect(
      (await classifyConditionText("にぎやかな街", fixedClassifier([{ isWish: true, conditionIds: [], axisNames: [] }])))
        .unsupportedConditions,
    ).toEqual([{ axisName: "その他", text: "にぎやかな街" }]);
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

  it("句読点の無い文の中の、子育ての条件と通勤の希望を両方とも読む", async () => {
    expect(
      await classifyConditionText("2 歳の子どもがいて保育園と小児科が近く新宿まで 30 分以内", dictionaryClauseClassifier),
    ).toEqual({
      classifier: "dictionary",
      conditionIds: ["pediatricsNearby", "nurseryAvailability"],
      unsupportedConditions: [{ axisName: "通勤", text: "2 歳の子どもがいて保育園と小児科が近く新宿まで 30 分以内" }],
    });
  });

  it("背景と同じ文に書いた registry に無い軸の希望を残し、背景だけの文は除く", async () => {
    expect(
      await classifyConditionText("東京に引っ越すので新宿まで30分以内、九州から東京に引っ越します", dictionaryClauseClassifier),
    ).toEqual({
      classifier: "dictionary",
      conditionIds: [],
      unsupportedConditions: [{ axisName: "通勤", text: "東京に引っ越すので新宿まで30分以内" }],
    });
  });

  it("引っ越しの文に書いた子育ての希望は、子育ての軸のすべての条件にする", async () => {
    expect(await classifyConditionText("子育てしやすい街に引っ越したい", dictionaryClauseClassifier)).toEqual({
      classifier: "dictionary",
      conditionIds: ["pediatricsNearby", "nurseryAvailability", "childcareSupport"],
      unsupportedConditions: [],
    });
  });

  it("どの軸の語も含まない文は「その他」の軸にする", async () => {
    expect((await classifyConditionText("にぎやかな街", dictionaryClauseClassifier)).unsupportedConditions).toEqual([
      { axisName: "その他", text: "にぎやかな街" },
    ]);
  });
});

describe("jevClauseClassifier", () => {
  it("文ごとの質問を 1 回の API 呼び出しにまとめ、0.5 以上の Noul を「はい」として読む", async () => {
    // 2026-10-05 に jev-1.13.0 で確かめた応答の値。0.5 未満の答えは省略せず 0.1 にする
    const yesAnswers: Record<string, number> = {
      clause_1_is_wish: 0.96,
      clause_1_pediatricsNearby: 0.85,
      clause_1_nurseryAvailability: 0.76,
      clause_1_axis_0: 0.93,
      clause_1_axis_2: 0.88,
    };
    const fetchFunction = vi.fn<typeof fetch>(async (_, init) => {
      const questionIds = Object.keys(JSON.parse(String(init?.body)).questions);
      return Response.json({
        model: "jev-1.13.0",
        answers: Object.fromEntries(
          questionIds.map((questionId) => [questionId, { type: "noul", noul: yesAnswers[questionId] ?? 0.1 }]),
        ),
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    });
    const clauses = ["2 歳の子どもがいて", "保育園と小児科が近く新宿まで 30 分以内"];
    expect(await jevClauseClassifier("test-key", fetchFunction).classify(clauses)).toEqual([
      { isWish: false, conditionIds: [], axisNames: [] },
      { isWish: true, conditionIds: ["pediatricsNearby", "nurseryAvailability"], axisNames: ["子育て", "通勤"] },
    ]);
    expect(fetchFunction).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFunction.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(jevModel);
    expect(body.state).toEqual({ clauses });
    // 文ごとに、希望か (1)・registry の条件 (3)・軸 (registry の 1 と registry に無い 8)
    expect(Object.keys(body.questions)).toHaveLength(2 * 13);
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
