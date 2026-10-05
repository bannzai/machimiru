"use client";

import { type FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { type ConditionId, axes, conditionIds } from "@/lib/axes";
import { addAxisRequests, axisRequestsStorageKey, parseAxisRequests } from "@/lib/axisRequests";
import { readStoredText, writeStoredText } from "@/lib/browserStorage";
import {
  type ConditionClassification,
  conditionClassificationSchema,
  maxConditionTextLength,
} from "@/lib/conditionClassification";

/** 判定の API へ送った文章の、判定の状態。 */
type ClassificationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "loaded"; classification: ConditionClassification };

/** このタブで軸の追加のリクエストを書き換えた時に、表示し直す関数。 */
const axisRequestsListeners = new Set<() => void>();

/** 軸の追加のリクエストの変化 (このタブでの記録と、別のタブでの storage イベント) を listener に知らせる。購読をやめる関数を返す。 */
function subscribeAxisRequests(listener: () => void) {
  axisRequestsListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    axisRequestsListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * 暮らしの条件の文章を入れ、サーバーの判定で軸と条件に分けるチャット (documents/design/mockups/chat.html の構造)。
 * registry にある条件はチェックボックスで使う・外すを選べ、activeConditionIds と onActiveConditionIdsChange で地図と比べる軸に反映する。
 * registry に無い軸の条件は「まだ判定できません」と出し、軸の追加のリクエストとしてこのブラウザの localStorage に記録する。
 */
export function ConditionChat({
  activeConditionIds,
  onActiveConditionIdsChange,
}: {
  activeConditionIds: readonly ConditionId[];
  onActiveConditionIdsChange: (conditionIds: readonly ConditionId[]) => void;
}) {
  const [text, setText] = useState("");
  const [classificationState, setClassificationState] = useState<ClassificationState>({ status: "idle" });
  // サーバーでの描画とハイドレーションでは保存を読めないため、保存が無い時と同じ空の一覧にする
  const storedAxisRequestsText = useSyncExternalStore(
    subscribeAxisRequests,
    () => readStoredText(axisRequestsStorageKey),
    () => null,
  );
  const axisRequests = useMemo(() => parseAxisRequests(storedAxisRequestsText), [storedAxisRequestsText]);

  const submitText = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClassificationState({ status: "loading" });
    try {
      const response = await fetch("/api/conditions/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const { message } = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(message ?? `HTTP ${response.status}`);
      }
      const classification = conditionClassificationSchema.parse(await response.json());
      setClassificationState({ status: "loaded", classification });
      onActiveConditionIdsChange(classification.conditionIds);
      // 判定を待つ間に別のタブが記録したリクエストを消さないよう、送信を始めた時の一覧ではなく保存の直前の一覧に足す
      writeStoredText(
        axisRequestsStorageKey,
        JSON.stringify(
          addAxisRequests(
            parseAxisRequests(readStoredText(axisRequestsStorageKey)),
            classification.unsupportedConditions,
          ),
        ),
      );
      axisRequestsListeners.forEach((listener) => listener());
    } catch (error) {
      setClassificationState({ status: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section className="condition-chat" aria-labelledby="condition-chat-heading">
      <h2 id="condition-chat-heading">探している暮らしを文章で入れる</h2>
      <form className="condition-chat-form" onSubmit={submitText}>
        <label htmlFor="condition-chat-input">条件を足す 言い直す</label>
        <textarea
          id="condition-chat-input"
          value={text}
          rows={3}
          maxLength={maxConditionTextLength}
          placeholder="例 2 歳の子どもがいて保育園と小児科が近く新宿まで 30 分以内"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" disabled={text.trim().length === 0 || classificationState.status === "loading"}>
          軸に分ける
        </button>
      </form>
      {classificationState.status === "loading" && <p role="status">文章を軸に分けています</p>}
      {classificationState.status === "failed" && (
        <p role="alert">文章を軸に分けられませんでした ({classificationState.message})</p>
      )}
      {classificationState.status === "loaded" && (
        <ClassificationSummary classification={classificationState.classification} />
      )}
      {axes.map((axis) => (
        <fieldset key={axis.id} className="condition-chat-axis">
          <legend>{axis.name}</legend>
          {axis.conditions.map((condition) => (
            <label key={condition.id}>
              <input
                type="checkbox"
                checked={activeConditionIds.includes(condition.id)}
                onChange={() =>
                  onActiveConditionIdsChange(
                    activeConditionIds.includes(condition.id)
                      ? activeConditionIds.filter((conditionId) => conditionId !== condition.id)
                      : conditionIds.filter(
                          (conditionId) => conditionId === condition.id || activeConditionIds.includes(conditionId),
                        ),
                  )
                }
              />
              {condition.name}
            </label>
          ))}
        </fieldset>
      ))}
      {classificationState.status === "loaded" && classificationState.classification.unsupportedConditions.length > 0 && (
        <ul className="condition-chat-unsupported" aria-label="判定できない条件">
          {classificationState.classification.unsupportedConditions.map(({ axisName, text: conditionText }) => (
            <li key={`${axisName}:${conditionText}`}>
              <strong>{axisName}</strong> {conditionText}
              <br />
              <small>この軸はまだ判定できません 軸の追加のリクエストとして記録しました</small>
            </li>
          ))}
        </ul>
      )}
      {axisRequests.length > 0 && (
        <>
          <h3 id="axis-requests-heading">リクエスト済みの条件</h3>
          <ul className="condition-chat-requests" aria-labelledby="axis-requests-heading">
            {axisRequests.map(({ axisName, text: requestText }) => (
              <li key={`${axisName}:${requestText}`}>
                {axisName} {requestText}
              </li>
            ))}
          </ul>
          <p className="condition-chat-note">このブラウザにだけ記録しサーバーには送りません</p>
        </>
      )}
    </section>
  );
}

/** 判定の結果の見出し。分けた軸の数と、判定の方式を出す。 */
function ClassificationSummary({ classification }: { classification: ConditionClassification }) {
  const axisCount =
    axes.filter((axis) => axis.conditions.some((condition) => classification.conditionIds.includes(condition.id))).length +
    new Set(classification.unsupportedConditions.map(({ axisName }) => axisName)).size;
  return (
    <div role="status">
      <p>
        <strong>{axisCount} つの軸に分けました</strong>
      </p>
      <p className="condition-chat-note">
        判定できる条件にチェックを付けました 違っていたら外すか言い直してください
        {classification.classifier === "dictionary" && (
          <>
            <br />
            判定のモデルを使えない環境のため語の辞書で分けています
          </>
        )}
      </p>
    </div>
  );
}
