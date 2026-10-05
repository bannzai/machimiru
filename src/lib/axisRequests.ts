import { z } from "zod";

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

/** requests の末尾に newRequests を足した一覧を返す。軸の名前と文が同じリクエストは足さない。 */
export function addAxisRequests(requests: readonly AxisRequest[], newRequests: readonly AxisRequest[]): AxisRequest[] {
  return newRequests.reduce<AxisRequest[]>(
    (current, newRequest) =>
      current.some((request) => request.axisName === newRequest.axisName && request.text === newRequest.text)
        ? current
        : [...current, newRequest],
    [...requests],
  );
}
