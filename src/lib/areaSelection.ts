/** 地図で選択中のエリア。区市町村と町丁は別々に選べ、どちらも複数選べる。 */
export type AreaSelection = {
  /** 選択中の区市町村の `MunicipalityProperties.code` (選んだ順)。 */
  municipalityCodes: string[];
  /** 選択中の町丁の `TownProperties.code` (選んだ順)。 */
  townCodes: string[];
};

/** 何も選択していない状態。 */
export const emptyAreaSelection: AreaSelection = { municipalityCodes: [], townCodes: [] };

// 保存する形式を変えた時に古い値を読まないよう、キーに形式の版を入れる
/** 選択中のエリアを保存する localStorage のキー。 */
export const areaSelectionStorageKey = "machimiru.areaSelection.v1";

// 町丁 (幅 300〜600 m 前後) が 1 つ 40〜80 px になり、指でタップして選び分けられる大きさになるズーム。
// MapLibre のズーム (512 px のタイル基準) では、ズーム 13 の東京付近は 1 px がおよそ 7.8 m になる。
// 1 つ下のズーム 12 では町丁が 20〜40 px で、隣の町丁と押し間違えやすい
/** このズーム以上では町丁を、未満では区市町村を選ぶ。 */
export const townSelectionMinZoom = 13;

/** codes に code があれば除き、無ければ末尾に足した新しい配列を返す。 */
export function toggleAreaCode(codes: readonly string[], code: string): string[] {
  return codes.includes(code) ? codes.filter((selectedCode) => selectedCode !== code) : [...codes, code];
}

/** localStorage に保存した文字列を AreaSelection に戻す。値が無い・形式が合わない時は何も選択していない状態を返す。 */
export function parseAreaSelection(storedText: string | null): AreaSelection {
  if (storedText === null) {
    return emptyAreaSelection;
  }
  try {
    const stored: unknown = JSON.parse(storedText);
    if (
      typeof stored === "object" &&
      stored !== null &&
      "municipalityCodes" in stored &&
      "townCodes" in stored &&
      isStringArray(stored.municipalityCodes) &&
      isStringArray(stored.townCodes)
    ) {
      return { municipalityCodes: stored.municipalityCodes, townCodes: stored.townCodes };
    }
  } catch {
    // 壊れた JSON は保存していない時と同じに扱う
  }
  return emptyAreaSelection;
}

/** value が文字列の配列かを返す。 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((element) => typeof element === "string");
}
