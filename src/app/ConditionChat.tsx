"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type ConditionId, axes, conditionIds } from "@/lib/axes";
import { addAxisRequests, axisRequestsPromptText, axisRequestsStorageKey, parseAxisRequests } from "@/lib/axisRequests";
import { readStoredText, writeStoredText } from "@/lib/browserStorage";
import {
  type ConditionClassification,
  conditionClassificationSchema,
  maxConditionTextLength,
  unsupportedConditionNote,
} from "@/lib/conditionClassification";

/** 判定の API へ送った文章の、判定の状態。 */
type ClassificationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "loaded"; classification: ConditionClassification };

/** 軸の追加の依頼文をクリップボードへコピーした結果。 */
type CopyState =
  | { status: "idle" }
  /** text はコピーした依頼文。 */
  | { status: "copied"; text: string }
  | { status: "failed"; message: string };

/** 入口の吹き出しを閉じたことを保存する localStorage のキー。形式を変える時は版の数字を上げ、古い形式を読まない。 */
export const conditionChatHintDismissedStorageKey = "machimiru.conditionChatHintDismissed.v1";

/** このタブで軸の追加のリクエストを書き換えた時に、表示し直す関数。 */
const axisRequestsListeners = new Set<() => void>();

/**
 * localStorage の変化 (このタブでの軸の追加のリクエストの記録と、別のタブでの storage イベント) を listener に知らせる。
 * 購読をやめる関数を返す。
 */
function subscribeStoredText(listener: () => void) {
  axisRequestsListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    axisRequestsListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * 暮らしの条件の文章を入れ、サーバーの判定で軸と条件に分けるチャット (中身は documents/design/mockups/chat.html の構造)。
 * 画面の右下に常に出すボタンと、ボタンで開くパネル (モバイル幅は画面の下から、PC 幅は右下のカード)。パネルは閉じるボタン・
 * 外側のタップ・Esc キーで閉じ、閉じても入力した文章と判定の結果を持ち続ける。初回はボタンの横に入口の吹き出しを出し、
 * 閉じたことをこのブラウザの localStorage に記録する。
 * registry にある条件はチェックボックスで使う・外すを選べ、activeConditionIds と onActiveConditionIdsChange で地図と比べる軸に反映する。
 * registry に無い軸の条件は「まだ判定できません」と出し、軸の追加のリクエストとしてこのブラウザの localStorage に記録する。
 * 記録したリクエストは、agent に軸の追加を頼む文 (documents/add-axis.md) としてコピーできる。軸を足せない理由が登録された軸の
 * 条件は、その理由を出して記録しない。
 */
export function ConditionChat({
  activeConditionIds,
  onActiveConditionIdsChange,
}: {
  activeConditionIds: readonly ConditionId[];
  onActiveConditionIdsChange: (conditionIds: readonly ConditionId[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // 保存できない環境 (ストレージを禁止したブラウザ等) でも吹き出しを閉じられるよう、このページを開いている間の閉じた状態を持つ
  const [isHintClosed, setIsHintClosed] = useState(false);
  // サーバーでの描画とハイドレーションでは保存を読めず、閉じた人にも吹き出しが一度出てしまうため、閉じた扱いにする
  const isHintDismissed = useSyncExternalStore(
    subscribeStoredText,
    () => readStoredText(conditionChatHintDismissedStorageKey) !== null,
    () => true,
  );
  const [text, setText] = useState("");
  const [classificationState, setClassificationState] = useState<ClassificationState>({ status: "idle" });
  // サーバーでの描画とハイドレーションでは保存を読めないため、保存が無い時と同じ空の一覧にする
  const storedAxisRequestsText = useSyncExternalStore(
    subscribeStoredText,
    () => readStoredText(axisRequestsStorageKey),
    () => null,
  );
  const axisRequests = useMemo(() => parseAxisRequests(storedAxisRequestsText), [storedAxisRequestsText]);
  const [copyState, setCopyState] = useState<CopyState>({ status: "idle" });
  // 言い直した文章の判定に失敗しても、前の判定の条件は地図に使われたままのため、判定の状態とは別に持つ
  const [hasClassified, setHasClassified] = useState(false);
  // 文章を入れる前は registry のすべての条件を使っており (AreaMap)、判定した条件ではないため数えない
  const activeConditionCount = hasClassified ? activeConditionIds.length : 0;
  const dialogRef = useRef<HTMLDialogElement>(null);
  // パネルの外側で押し始めたタップか。中の文字をドラッグで選んで外側で離した時と、パネルのスクロールバーの操作でも
  // クリックは dialog 自身に届くため、押し始めの位置で外側のタップと見分ける
  const isPressStartedOutsideRef = useRef(false);

  // パネルの外側のタップで下の地図のエリアを選ばないよう、開いている間は外側の操作を受けないモーダルの dialog にする。
  // キーボードの操作の位置をパネルの中に留め、閉じた時に入口のボタンへ戻すのもブラウザの dialog が行う
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open === isOpen) {
      return;
    }
    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  /** 入口の吹き出しを閉じ、次に開いた時も出さないよう localStorage に記録する。 */
  const dismissHint = () => {
    setIsHintClosed(true);
    writeStoredText(conditionChatHintDismissedStorageKey, "dismissed");
  };

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
      setHasClassified(true);
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
    <>
      <div className="condition-chat-launcher">
        {!isHintClosed && !isHintDismissed && (
          <p className="condition-chat-hint">
            文章で条件を入れる
            <button type="button" aria-label="吹き出しを閉じる" onClick={dismissHint}>
              ×
            </button>
          </p>
        )}
        <button
          type="button"
          className="condition-chat-button"
          aria-label={
            activeConditionCount > 0 ? `文章で条件を入れる 使っている条件 ${activeConditionCount}` : "文章で条件を入れる"
          }
          aria-haspopup="dialog"
          onClick={() => {
            // ボタンを押した人は入口を見つけているため、パネルを閉じた後に吹き出しを出し直さない
            dismissHint();
            setIsOpen(true);
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          </svg>
          {!isOpen && activeConditionCount > 0 && <span className="condition-chat-badge">{activeConditionCount}</span>}
        </button>
      </div>
      {/* 閉じても入力した文章と判定の結果を持ち続けるよう、閉じている間も描画したままにする */}
      <dialog
        ref={dialogRef}
        className="condition-chat"
        aria-labelledby="condition-chat-heading"
        // Esc キーで閉じた時に、開閉の状態を合わせる
        onClose={() => setIsOpen(false)}
        onPointerDown={(event) => {
          const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
          isPressStartedOutsideRef.current =
            event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
        }}
        // パネルの外側 (::backdrop) のタップは dialog 自身に届く。中身は condition-chat-body が全面を覆う
        onClick={(event) => {
          if (event.target === event.currentTarget && isPressStartedOutsideRef.current) {
            setIsOpen(false);
          }
          // キーボードでのボタンの操作は押し始めを伴わないため、前のタップの記録を残さない
          isPressStartedOutsideRef.current = false;
        }}
      >
        <div className="condition-chat-body">
          <div className="condition-chat-header">
            <h2 id="condition-chat-heading">探している暮らしを文章で入れる</h2>
            <button type="button" onClick={() => setIsOpen(false)}>
              閉じる
            </button>
          </div>
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
              {classificationState.classification.unsupportedConditions.map((unsupportedCondition) => (
                <li key={`${unsupportedCondition.axisName}:${unsupportedCondition.text}`}>
                  <strong>{unsupportedCondition.axisName}</strong> {unsupportedCondition.text}
                  <br />
                  <small>{unsupportedConditionNote(unsupportedCondition)}</small>
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
              <button
                type="button"
                onClick={async () => {
                  const promptText = axisRequestsPromptText(axisRequests);
                  // 安全でない接続 (https でも localhost でもない配信) では navigator.clipboard が無い
                  if (navigator.clipboard === undefined) {
                    setCopyState({ status: "failed", message: "この接続ではクリップボードを使えません" });
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(promptText);
                    setCopyState({ status: "copied", text: promptText });
                  } catch (error) {
                    setCopyState({ status: "failed", message: error instanceof Error ? error.message : String(error) });
                  }
                }}
              >
                軸の追加の依頼文をコピー
              </button>
              {/* コピーの後にリクエストが増えた時は、クリップボードの文が今の一覧と違うため出さない */}
              {copyState.status === "copied" && copyState.text === axisRequestsPromptText(axisRequests) && (
                <p role="status">コピーしました</p>
              )}
              {copyState.status === "failed" && <p role="alert">コピーできませんでした ({copyState.message})</p>}
            </>
          )}
        </div>
      </dialog>
    </>
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
