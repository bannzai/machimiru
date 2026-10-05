import { describe, expect, it } from "vitest";
import { addAxisRequests, axisRequestsPromptText, parseAxisRequests } from "./axisRequests";

describe("parseAxisRequests", () => {
  it("保存した一覧を読む", () => {
    expect(parseAxisRequests(JSON.stringify([{ axisName: "通勤", text: "新宿まで 30 分以内" }]))).toEqual([
      { axisName: "通勤", text: "新宿まで 30 分以内" },
    ]);
  });

  it.each([null, "", "{", JSON.stringify([{ axisName: "通勤" }]), JSON.stringify({ axisName: "通勤", text: "駅" })])(
    "保存が無い・形式が違う (%j) 時は空の一覧",
    (storedText) => {
      expect(parseAxisRequests(storedText)).toEqual([]);
    },
  );
});

describe("axisRequestsPromptText", () => {
  it("手順の文書を指す依頼の行と、リクエストごとの軸の候補名と条件の文の行にする", () => {
    expect(
      axisRequestsPromptText([
        { axisName: "通勤", text: "新宿まで 30 分以内" },
        { axisName: "医療・健康", text: "鍼灸の評判が良い場所が近い" },
      ]),
    ).toBe(
      [
        "documents/add-axis.md の手順で、次の軸の追加リクエストを軸にして",
        "- 軸の候補名: 通勤 / 条件の文: 新宿まで 30 分以内",
        "- 軸の候補名: 医療・健康 / 条件の文: 鍼灸の評判が良い場所が近い",
      ].join("\n"),
    );
  });
});

describe("addAxisRequests", () => {
  it("末尾に足し、軸の名前と文が同じリクエストは重ねない", () => {
    const requests = [{ axisName: "通勤", text: "新宿まで 30 分以内" }];
    expect(
      addAxisRequests(requests, [
        { axisName: "通勤", text: "新宿まで 30 分以内" },
        { axisName: "予算", text: "家賃は 15 万円まで" },
        { axisName: "予算", text: "家賃は 15 万円まで" },
      ]),
    ).toEqual([
      { axisName: "通勤", text: "新宿まで 30 分以内" },
      { axisName: "予算", text: "家賃は 15 万円まで" },
    ]);
  });

  it("軸を足せない理由を持つ条件は足さない", () => {
    expect(
      addAxisRequests(
        [],
        [
          { axisName: "評判", text: "鍼灸の評判が良い", unavailableReason: "評判を載せた公開データが無い" },
          { axisName: "医療・健康", text: "鍼灸の評判が良い" },
        ],
      ),
    ).toEqual([{ axisName: "医療・健康", text: "鍼灸の評判が良い" }]);
  });
});
