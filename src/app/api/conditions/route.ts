import {
  classifyConditionText,
  conditionClassifierFromEnvironment,
  conditionRequestSchema,
  maxConditionTextLength,
} from "@/lib/conditionClassification";

/**
 * 文章を軸と条件に分ける判定の API。本文 `{ text }` を受け取り、`ConditionClassification` を返す。
 * 入力の文章は判定にだけ使い、保存・ログへの出力をしない (content/legal/privacy.md)。
 * 本文が不正な時は 400、判定器 (Jev) の失敗は 502 を `{ message }` で返す。
 */
export async function POST(request: Request) {
  const parsedRequest = conditionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedRequest.success) {
    return Response.json({ message: `文章を 1〜${maxConditionTextLength} 文字で入れてください` }, { status: 400 });
  }
  try {
    return Response.json(
      await classifyConditionText(parsedRequest.data.text, conditionClassifierFromEnvironment(process.env)),
    );
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
