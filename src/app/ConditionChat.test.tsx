// @vitest-environment happy-dom
import { act, useState } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type ConditionId, conditionIds } from "@/lib/axes";
import type { ConditionClassification } from "@/lib/conditionClassification";
import { ConditionChat, conditionChatHintDismissedStorageKey } from "./ConditionChat";

// React が、テストの中の状態の更新を act で包んでいるかを検査する設定
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const conditionText = "保育園と小児科が近い";
/** 判定の API が conditionText に返す結果。 */
const classification: ConditionClassification = {
  classifier: "dictionary",
  conditionIds: ["pediatricsNearby", "nurseryAvailability"],
  unsupportedConditions: [],
};

let container: HTMLDivElement;
let root: Root;

/** AreaMap と同じく、最初は registry のすべての条件を使う状態で ConditionChat を出す。 */
function ConditionChatWithState() {
  const [activeConditionIds, setActiveConditionIds] = useState<readonly ConditionId[]>(conditionIds);
  return <ConditionChat activeConditionIds={activeConditionIds} onActiveConditionIdsChange={setActiveConditionIds} />;
}

/** ConditionChat を、ページを開き直した時と同じ最初の状態で描画する。 */
function renderConditionChat() {
  root = createRoot(container);
  act(() => root.render(<ConditionChatWithState />));
}

/** selector に当たる要素を返す。無い時は例外にする。 */
function element<ElementType extends HTMLElement = HTMLElement>(selector: string): ElementType {
  const found = container.querySelector<ElementType>(selector);
  if (found === null) {
    throw new Error(`${selector} が見つかりません`);
  }
  return found;
}

/** チャットのパネル (dialog) を返す。 */
function panel(): HTMLDialogElement {
  return element<HTMLDialogElement>(".condition-chat");
}

/** パネルの中の、表示の文字が buttonText のボタンを返す。 */
function panelButton(buttonText: string): HTMLButtonElement {
  const found = [...element(".condition-chat").querySelectorAll("button")].find(
    (button) => button.textContent === buttonText,
  );
  if (found === undefined) {
    throw new Error(`ボタン「${buttonText}」が見つかりません`);
  }
  return found;
}

/** target をクリックし、React の描画の更新を終える。 */
function click(target: HTMLElement) {
  act(() => target.click());
}

/** 開いているパネルの入力欄に conditionText を入れて送り、判定の API の応答が画面に出るまで待つ。 */
async function submitConditionText() {
  act(() => {
    // React は value への代入を自分の変更として記録し、input イベントで変化なしと判断するため、要素の元の setter で入れる
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      element("#condition-chat-input"),
      conditionText,
    );
    element("#condition-chat-input").dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    panelButton("軸に分ける").click();
    // 判定の応答を読んで結果を出すまでの非同期の処理を終える
    await new Promise((resolve) => setTimeout(resolve));
  });
}

/**
 * pressTarget で押し始めて clickTarget にクリックが届く操作を起こし、React の描画の更新を終える。
 * happy-dom は要素の位置を持たず、パネルの矩形がすべて 0 になるため、押し始めがパネルの外側かを isPressOutsidePanel で
 * 座標 (外側は負、内側は 0) にして渡す。
 */
function pressAndClick({
  pressTarget,
  isPressOutsidePanel,
  clickTarget,
}: {
  pressTarget: HTMLElement;
  isPressOutsidePanel: boolean;
  clickTarget: HTMLElement;
}) {
  act(() => {
    pressTarget.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: isPressOutsidePanel ? -1 : 0, clientY: 0 }),
    );
    clickTarget.click();
  });
}

beforeEach(() => {
  localStorage.clear();
  container = document.body.appendChild(document.createElement("div"));
  renderConditionChat();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

test("右下のボタンでパネルを開き、閉じるボタンと外側のタップで閉じる", () => {
  expect(panel().open).toBe(false);

  click(element(".condition-chat-button"));
  expect(panel().open).toBe(true);
  click(panelButton("閉じる"));
  expect(panel().open).toBe(false);

  click(element(".condition-chat-button"));
  expect(panel().open).toBe(true);
  // パネルの中身のクリックでは閉じない
  pressAndClick({
    pressTarget: element(".condition-chat-body"),
    isPressOutsidePanel: false,
    clickTarget: element(".condition-chat-body"),
  });
  expect(panel().open).toBe(true);
  // 中の文字をドラッグで選んで外側で離すと、クリックは dialog 自身に届くが、閉じない
  pressAndClick({ pressTarget: element("#condition-chat-input"), isPressOutsidePanel: false, clickTarget: panel() });
  expect(panel().open).toBe(true);
  // パネルの外側 (::backdrop) のタップは、押し始めもクリックも dialog 自身に届く
  pressAndClick({ pressTarget: panel(), isPressOutsidePanel: true, clickTarget: panel() });
  expect(panel().open).toBe(false);
});

test("ブラウザが dialog を閉じた時 (Esc キー) に開閉の状態を合わせ、ボタンでもう一度開ける", () => {
  click(element(".condition-chat-button"));
  // Esc キーでブラウザが出す close イベントを、dialog を直接閉じて起こす (Esc キーそのものは e2e で確かめる)
  act(() => panel().close());
  expect(panel().open).toBe(false);
  click(element(".condition-chat-button"));
  expect(panel().open).toBe(true);
});

test("閉じても入力した文章と判定の結果を保持し、閉じている間は使っている条件の数をボタンに出す", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => classification })),
  );
  // 文章を入れる前は registry のすべての条件を使っているが、判定した条件ではないため数を出さない
  expect(container.querySelector(".condition-chat-badge")).toBeNull();

  click(element(".condition-chat-button"));
  await submitConditionText();
  expect(element(".condition-chat").textContent).toContain("1 つの軸に分けました");
  // 文章を軸に分けた後もパネルは開いたまま
  expect(panel().open).toBe(true);
  expect(container.querySelector(".condition-chat-badge")).toBeNull();

  click(panelButton("閉じる"));
  expect(element(".condition-chat-badge").textContent).toBe("2");
  expect(element(".condition-chat-button").getAttribute("aria-label")).toBe("文章で条件を入れる 使っている条件 2");

  click(element(".condition-chat-button"));
  expect(element<HTMLTextAreaElement>("#condition-chat-input").value).toBe(conditionText);
  expect(element(".condition-chat").textContent).toContain("1 つの軸に分けました");
  expect(
    [...element(".condition-chat").querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
      (checkbox) => checkbox.checked,
    ),
  ).toEqual(conditionIds.map((conditionId) => classification.conditionIds.includes(conditionId)));

  // 言い直した文章の判定に失敗しても、前の判定の条件は使われたままのため、数を出し続ける
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
  );
  await act(async () => {
    panelButton("軸に分ける").click();
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(element(".condition-chat").textContent).toContain("文章を軸に分けられませんでした (HTTP 503)");
  click(panelButton("閉じる"));
  expect(element(".condition-chat-badge").textContent).toBe("2");
});

test("判定の後にすべての条件を外した時は、ボタンに 0 と出す", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => classification })),
  );
  click(element(".condition-chat-button"));
  await submitConditionText();

  // 1 つ外すたびに描画し直されるため、チェックの付いた条件をその都度探して外す
  classification.conditionIds.forEach(() => click(element('.condition-chat input[type="checkbox"]:checked')));
  click(panelButton("閉じる"));
  expect(element(".condition-chat-badge").textContent).toBe("0");
  expect(element(".condition-chat-button").getAttribute("aria-label")).toBe("文章で条件を入れる 使っている条件 0");
});

test("入口の吹き出しは、閉じると localStorage に記録して次に開いた時も出さない", () => {
  expect(element(".condition-chat-hint").textContent).toContain("文章で条件を入れる");
  expect(localStorage.getItem(conditionChatHintDismissedStorageKey)).toBeNull();

  click(element(".condition-chat-hint button"));
  expect(container.querySelector(".condition-chat-hint")).toBeNull();
  expect(localStorage.getItem(conditionChatHintDismissedStorageKey)).not.toBeNull();

  act(() => root.unmount());
  renderConditionChat();
  expect(container.querySelector(".condition-chat-hint")).toBeNull();
});

test("localStorage を使えない環境でも、入口の吹き出しを閉じられる", () => {
  /** ストレージを禁止したブラウザと同じく、読み書きのたびに例外にする。 */
  const throwStorageError = () => {
    throw new Error("localStorage を使えません");
  };
  vi.stubGlobal("localStorage", { getItem: throwStorageError, setItem: throwStorageError });

  click(element(".condition-chat-hint button"));
  expect(container.querySelector(".condition-chat-hint")).toBeNull();
});

test("ボタンでパネルを開いた後は、入口の吹き出しを出さない", () => {
  click(element(".condition-chat-button"));
  click(panelButton("閉じる"));
  expect(container.querySelector(".condition-chat-hint")).toBeNull();
  expect(localStorage.getItem(conditionChatHintDismissedStorageKey)).not.toBeNull();
});
