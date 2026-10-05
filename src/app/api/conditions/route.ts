import {
  classifyConditionText,
  conditionClassifierFromEnvironment,
  conditionRequestSchema,
  maxConditionTextLength,
} from "@/lib/conditionClassification";
import { clientKeyOfRequest, createRateLimiter } from "@/lib/rateLimit";

// 判定は 1 回ごとに提供者の負担で Jev を呼ぶため、第三者の連続した呼び出しで費用と API の枠を使い切られないよう回数を制限する。
// 1 分に 10 回は、1 人が文章を入れ直して試す回数 (数回) に余裕を持たせた値
const isConditionRequestAllowed = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * 文章を軸と条件に分ける判定の API。本文 `{ text }` を受け取り、`ConditionClassification` を返す。
 * 入力の文章は判定にだけ使い、保存・ログへの出力をしない (content/legal/privacy.md)。
 * 呼び出しが多すぎる時は 429、本文が不正な時は 400、判定器 (Jev) の失敗は 502 を `{ message }` で返す。
 */
export async function POST(request: Request) {
  if (!isConditionRequestAllowed(clientKeyOfRequest(request), Date.now())) {
    return Response.json({ message: "判定の回数が多すぎます 1 分ほど待ってから入れ直してください" }, { status: 429 });
  }
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
