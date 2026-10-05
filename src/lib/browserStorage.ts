/** localStorage の storageKey に保存した文字列を返す。保存が無い・ストレージを読めない時は null を返す。 */
export function readStoredText(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/** localStorage の storageKey に text を保存する。 */
export function writeStoredText(storageKey: string, text: string) {
  try {
    localStorage.setItem(storageKey, text);
  } catch {
    // 保存できない環境 (ストレージを禁止したブラウザ等) では、再読み込みで保存した内容が消えるだけで操作は続けられる
  }
}
