// 物件データは取得・保存せず、選んだエリアと条件を物件サイトの検索結果 URL に変換して開くだけにする (documents/PROJECT.md「物件サイトとの関係」)

/** 物件サイトの検索に渡す条件。null はその条件を付けない。 */
export type PropertySearchCondition = {
  /** 家賃の上限 (万円)。`rentUpperLimitManYenOptions` のどれか。 */
  rentUpperLimitManYen: number | null;
  /** 専有面積の下限 (m²)。`floorAreaLowerLimitSquareMeterOptions` のどれか。 */
  floorAreaLowerLimitSquareMeters: number | null;
};

/** 条件を付けない状態。 */
export const emptyPropertySearchCondition: PropertySearchCondition = {
  rentUpperLimitManYen: null,
  floorAreaLowerLimitSquareMeters: null,
};

// 保存する形式を変えた時に古い値を読まないよう、キーに形式の版を入れる
/** 物件の検索の条件を保存する localStorage のキー。 */
export const propertySearchConditionStorageKey = "machimiru.propertySearchCondition.v1";

// SUUMO の家賃上限 ct に渡し、三鷹市で値ごとに件数が絞られることを確かめた値 (2026-10-05 の実測)。
// 都内の子育て世帯の家賃の帯を 1 万円刻みで選べるようにし、20 万円より上は刻みを粗くする
/** 選べる家賃の上限 (万円)。 */
export const rentUpperLimitManYenOptions: readonly number[] = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 30,
];

// SUUMO の面積下限 mb に渡し、三鷹市で値ごとに件数が絞られることを確かめた値 (2026-10-05 の実測)。
// mb は決まった値だけを受け付け、47 のような値ではエラーのページになる
/** 選べる専有面積の下限 (m²)。 */
export const floorAreaLowerLimitSquareMeterOptions: readonly number[] = [
  20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100,
];

/** SUUMO の賃貸の検索結果のページ。 */
const suumoSearchResultUrl = "https://suumo.jp/jj/chintai/ichiran/FR301FC001/";

// 地域 ar=030 (関東)・種別 bs=040 (賃貸)・都道府県 ta=13 (東京都)。どれかが欠けるとエラーのページになる (2026-10-05 の実測)
/** SUUMO の検索結果 URL に常に付けるパラメータ。 */
const suumoFixedSearchParams = [
  ["ar", "030"],
  ["bs", "040"],
  ["ta", "13"],
];

/** SUUMO が市区町村コード sc で受け付けない、西多摩郡の町村 (瑞穂町・日の出町・檜原村・奥多摩町) の全国地方公共団体コード (5 桁)。 */
const nishitamaDistrictMunicipalityCodes: ReadonlySet<string> = new Set(["13303", "13305", "13307", "13308"]);

// 西多摩郡の町村のコードを sc に 1 つでも含めると、ほかの区市町村と並べてもエラーのページになり、
// 郡のコードでは西多摩郡全体の検索結果になる (2026-10-05 の実測)
/** SUUMO で西多摩郡全体を表す sc。 */
const suumoNishitamaDistrictCode = "13300";

/** municipalityCode (全国地方公共団体コード 5 桁) の区市町村を、SUUMO が郡全体でしか探せないかを返す。 */
export function isSuumoSearchedByDistrict(municipalityCode: string): boolean {
  return nishitamaDistrictMunicipalityCodes.has(municipalityCode);
}

/**
 * municipalityCodes (全国地方公共団体コード 5 桁。重複してよい) の区市町村を condition で絞った、SUUMO の賃貸の検索結果の URL を返す。
 * 西多摩郡の町村は郡全体の検索にする。
 */
export function suumoSearchUrl(municipalityCodes: readonly string[], condition: PropertySearchCondition): string {
  const searchParams = new URLSearchParams(suumoFixedSearchParams);
  for (const code of new Set(
    municipalityCodes.map((municipalityCode) =>
      isSuumoSearchedByDistrict(municipalityCode) ? suumoNishitamaDistrictCode : municipalityCode,
    ),
  )) {
    searchParams.append("sc", code);
  }
  if (condition.rentUpperLimitManYen !== null) {
    // ct は小数 1 桁で渡す。「15」ではエラーのページになり「15.0」で検索結果になる (2026-10-05 の実測)
    searchParams.append("ct", condition.rentUpperLimitManYen.toFixed(1));
  }
  if (condition.floorAreaLowerLimitSquareMeters !== null) {
    searchParams.append("mb", String(condition.floorAreaLowerLimitSquareMeters));
  }
  return `${suumoSearchResultUrl}?${searchParams}`;
}

/**
 * localStorage に保存した文字列を PropertySearchCondition に戻す。値が無い・形式が合わない時は条件を付けない状態を返し、
 * 選べる値に無い条件は付けない (SUUMO がエラーのページを返す値を URL に入れないため)。
 */
export function parsePropertySearchCondition(storedText: string | null): PropertySearchCondition {
  if (storedText === null) {
    return emptyPropertySearchCondition;
  }
  try {
    const stored: unknown = JSON.parse(storedText);
    if (
      typeof stored === "object" &&
      stored !== null &&
      "rentUpperLimitManYen" in stored &&
      "floorAreaLowerLimitSquareMeters" in stored
    ) {
      return {
        rentUpperLimitManYen: optionOrNull(rentUpperLimitManYenOptions, stored.rentUpperLimitManYen),
        floorAreaLowerLimitSquareMeters: optionOrNull(
          floorAreaLowerLimitSquareMeterOptions,
          stored.floorAreaLowerLimitSquareMeters,
        ),
      };
    }
  } catch {
    // 壊れた JSON は保存していない時と同じに扱う
  }
  return emptyPropertySearchCondition;
}

/** value が options のどれかならその値を、それ以外は null を返す。 */
function optionOrNull(options: readonly number[], value: unknown): number | null {
  return typeof value === "number" && options.includes(value) ? value : null;
}
