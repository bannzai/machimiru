import {
  type PropertySearchCondition,
  floorAreaLowerLimitSquareMeterOptions,
  isSuumoSearchedByDistrict,
  rentUpperLimitManYenOptions,
  suumoSearchUrl,
} from "@/lib/propertySearch";

/**
 * 家賃・広さの条件を選ぶ欄と、municipalityCodes (選択中のエリアの区市町村。町丁はその区市町村) を condition で絞った
 * SUUMO の検索結果を開くリンク。条件を変えると onConditionChange を呼ぶ。
 * hasTownSelection は町丁を選んでいるかで、町丁を区市町村の単位で探すことの説明を出すために使う。
 * isConditionEditable が false の間 (保存済みの条件を読む前) は、読んだ条件で入力を上書きしないよう条件を選べなくする。
 */
export function PropertySearch({
  municipalityCodes,
  hasTownSelection,
  condition,
  isConditionEditable,
  onConditionChange,
}: {
  municipalityCodes: string[];
  hasTownSelection: boolean;
  condition: PropertySearchCondition;
  isConditionEditable: boolean;
  onConditionChange: (condition: PropertySearchCondition) => void;
}) {
  return (
    <section className="property-search" aria-labelledby="property-search-heading">
      <h2 id="property-search-heading">物件を探す</h2>
      <div className="property-search-conditions">
        <label>
          家賃の上限
          <select
            value={condition.rentUpperLimitManYen ?? ""}
            disabled={!isConditionEditable}
            onChange={(event) =>
              onConditionChange({ ...condition, rentUpperLimitManYen: optionalNumber(event.target.value) })
            }
          >
            <option value="">指定なし</option>
            {rentUpperLimitManYenOptions.map((rentUpperLimitManYen) => (
              <option key={rentUpperLimitManYen} value={rentUpperLimitManYen}>
                {rentUpperLimitManYen}万円
              </option>
            ))}
          </select>
        </label>
        <label>
          広さの下限
          <select
            value={condition.floorAreaLowerLimitSquareMeters ?? ""}
            disabled={!isConditionEditable}
            onChange={(event) =>
              onConditionChange({ ...condition, floorAreaLowerLimitSquareMeters: optionalNumber(event.target.value) })
            }
          >
            <option value="">指定なし</option>
            {floorAreaLowerLimitSquareMeterOptions.map((floorAreaLowerLimitSquareMeters) => (
              <option key={floorAreaLowerLimitSquareMeters} value={floorAreaLowerLimitSquareMeters}>
                {floorAreaLowerLimitSquareMeters}m²
              </option>
            ))}
          </select>
        </label>
      </div>
      {municipalityCodes.length === 0 ? (
        <p>エリアを選ぶと SUUMO の検索結果を開けます</p>
      ) : (
        <>
          <a href={suumoSearchUrl(municipalityCodes, condition)} target="_blank" rel="noopener noreferrer">
            SUUMO で賃貸物件を探す (外部サイト)
          </a>
          {hasTownSelection && <p className="property-search-note">町丁は区市町村の単位で探します</p>}
          {municipalityCodes.some(isSuumoSearchedByDistrict) && (
            <p className="property-search-note">瑞穂町・日の出町・檜原村・奥多摩町は西多摩郡全体で探します</p>
          )}
        </>
      )}
    </section>
  );
}

/** select の値を数に戻す。空 (指定なし) は null を返す。 */
function optionalNumber(selectValue: string): number | null {
  return selectValue === "" ? null : Number(selectValue);
}
