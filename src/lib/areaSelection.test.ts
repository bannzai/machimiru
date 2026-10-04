import { describe, expect, it } from "vitest";
import { emptyAreaSelection, parseAreaSelection, toggleAreaCode } from "./areaSelection";

describe("toggleAreaCode", () => {
  it("選択していないコードを末尾に足す", () => {
    expect(toggleAreaCode(["13104"], "13113")).toEqual(["13104", "13113"]);
  });

  it("選択中のコードを除く", () => {
    expect(toggleAreaCode(["13104", "13113"], "13104")).toEqual(["13113"]);
  });

  it("2 回続けると元に戻る", () => {
    expect(toggleAreaCode(toggleAreaCode(["13104"], "13113"), "13113")).toEqual(["13104"]);
  });
});

describe("parseAreaSelection", () => {
  it("保存した選択を戻す", () => {
    const selection = { municipalityCodes: ["13104", "13113"], townCodes: ["13104094002"] };
    expect(parseAreaSelection(JSON.stringify(selection))).toEqual(selection);
  });

  it.each([
    ["保存していない", null],
    ["壊れた JSON", "{"],
    ["形式が違う", JSON.stringify({ municipalityCodes: [13104], townCodes: [] })],
    ["項目が足りない", JSON.stringify({ municipalityCodes: [] })],
  ])("%s時は何も選択していない状態にする", (_, storedText) => {
    expect(parseAreaSelection(storedText)).toEqual(emptyAreaSelection);
  });
});
