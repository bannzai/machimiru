import { z } from "zod";
import type { ConditionClassification } from "./conditionClassification";

/** 判定できなかった条件 1 件。軸の追加のリクエストとしてブラウザに記録する。サーバーには保存しない。 */
export const axisRequestSchema = z.object({
  /** 条件を振り分けた軸の名前 (例: 通勤)。 */
  axisName: z.string().min(1),
  /** 入力の文章を区切った、条件の文。 */
  text: z.string().min(1),
});

/** 判定できなかった条件 1 件。 */
export type AxisRequest = z.infer<typeof axisRequestSchema>;

/** 軸の追加のリクエストを保存する localStorage のキー。形式を変える時は版の数字を上げ、古い形式を読まない。 */
export const axisRequestsStorageKey = "machimiru.axisRequests.v1";

/** localStorage に保存した文字列 storedText を読む。保存が無い・形式が違う時は空の一覧を返す。 */
export function parseAxisRequests(storedText: string | null): AxisRequest[] {
  if (storedText === null) {
    return [];
  }
  try {
    return z.array(axisRequestSchema).parse(JSON.parse(storedText));
  } catch {
    return [];
  }
}

/**
 * requests を、bannzai が claude の対話にそのまま貼って軸の追加を頼める文にする (手順は documents/add-axis.md)。
 * 1 行目が依頼、2 行目以降がリクエスト 1 件ごとの軸の候補名と条件の文。
 */
export function axisRequestsPromptText(requests: readonly AxisRequest[]): string {
  return [
    "documents/add-axis.md の手順で、次の軸の追加リクエストを軸にして",
    ...requests.map(({ axisName, text }) => `- 軸の候補名: ${axisName} / 条件の文: ${text}`),
  ].join("\n");
}

/**
 * requests の末尾に、判定の API が返した registry に無い軸の条件 unsupportedConditions を足した一覧を返す。
 * 軸の名前と文が同じリクエストと、軸を足せない理由 (unavailableReason) を持つ条件は足さない。
 */
export function addAxisRequests(
  requests: readonly AxisRequest[],
  unsupportedConditions: ConditionClassification["unsupportedConditions"],
): AxisRequest[] {
  return unsupportedConditions.reduce<AxisRequest[]>(
    (current, { axisName, text, unavailableReason }) =>
      unavailableReason !== undefined ||
      current.some((request) => request.axisName === axisName && request.text === text)
        ? current
        : [...current, { axisName, text }],
    [...requests],
  );
}
