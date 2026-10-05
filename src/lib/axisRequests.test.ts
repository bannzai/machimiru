import { describe, expect, it } from "vitest";
import { addAxisRequests, parseAxisRequests } from "./axisRequests";

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
});
