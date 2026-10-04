"use client";

import type { FeatureCollection, Point } from "geojson";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type FacilityKeyword,
  type SearchRange,
  addFacilityKeyword,
  facilityKindPinColors,
  isPointInSearchRanges,
  keywordPinColors,
  searchFacilitiesInRanges,
} from "@/lib/facilityMarking";
import { type LocatedOpenPoiFacility, openPoiAttributionUrl, openPoiSearchLimit } from "@/lib/openPoi";
import {
  type FacilitiesFile,
  type FacilityKind,
  facilitiesFileSchema,
  facilitiesFileUrl,
  facilityKindNames,
  facilityKindSchema,
} from "@/lib/tokyoData/schema";

/** キーワード 1 つの、ある範囲での OpenPOI API の検索の結果。検索中は結果が無い。 */
type KeywordSearchResult =
  | { status: "loaded"; facilities: LocatedOpenPoiFacility[]; isTruncated: boolean }
  | { status: "failed"; message: string };

/** 地図のピン 1 本の属性。 */
export type FacilityPinProperties = {
  /** ピンの色。 */
  color: string;
  /** 施設名。 */
  name: string;
};

// パネルにキーワード・施設の種類の一覧を複数並べても、PC 幅の画面の高さで 2 つ分を見渡せる件数
/** キーワード・施設の種類ごとに、パネルの一覧に最初に出す施設の数。残りはボタンで広げて出す。 */
const maxListedFacilities = 10;

/**
 * keyword を ranges で検索した結果を区別するキー。範囲が変わると別の検索として扱う。
 * 範囲は OpenPOI API に渡すのと同じ小数 5 桁で比べ、地図の位置が実質的に同じなら同じ検索として扱う。
 */
function keywordSearchKey(keyword: string, ranges: readonly SearchRange[]): string {
  return JSON.stringify([keyword, ranges.map((range) => range.boundingBox.map((degree) => degree.toFixed(5)))]);
}

/** keywordSearchKey が作ったキーから、キーワードを返す。 */
function keywordOfSearchKey(searchKey: string): string {
  return (JSON.parse(searchKey) as [string, unknown])[0];
}

/**
 * キーワードと子育て施設の種類で施設を探す状態。searchRanges の中の施設を、キーワードは OpenPOI API で、
 * 子育て施設は `public/data/tokyo/facilities.geojson` から探し、地図に立てるピンと一緒に返す。
 */
export function useFacilityMarking(searchRanges: readonly SearchRange[]) {
  const [keywords, setKeywords] = useState<readonly FacilityKeyword[]>([]);
  const [keywordSearchResults, setKeywordSearchResults] = useState<Readonly<Record<string, KeywordSearchResult>>>({});
  const startedKeywordSearchKeys = useRef(new Set<string>());
  // 地図を動かして新しい範囲を検索している間も、直前に取れた施設のピンを出し続けるため、キーワードごとに最後の結果を持つ
  const [lastLoadedFacilitiesByKeyword, setLastLoadedFacilitiesByKeyword] = useState<
    Readonly<Record<string, LocatedOpenPoiFacility[]>>
  >({});
  const [facilityKinds, setFacilityKinds] = useState<readonly FacilityKind[]>([]);
  const [facilitiesFile, setFacilitiesFile] = useState<FacilitiesFile | null>(null);
  const [facilitiesLoadErrorMessage, setFacilitiesLoadErrorMessage] = useState<string | null>(null);
  const isFacilitiesLoadStarted = useRef(false);

  /** keyword の ranges での検索を始め、終わったら結果を keywordSearchKey のキーで残す。 */
  const startKeywordSearch = (keyword: string, ranges: readonly SearchRange[]) => {
    const searchKey = keywordSearchKey(keyword, ranges);
    startedKeywordSearchKeys.current.add(searchKey);
    searchFacilitiesInRanges(keyword, ranges).then(
      (result) => {
        setKeywordSearchResults((current) => ({ ...current, [searchKey]: { status: "loaded", ...result } }));
        setLastLoadedFacilitiesByKeyword((current) => ({ ...current, [keyword]: result.facilities }));
      },
      (error: unknown) =>
        setKeywordSearchResults((current) => ({
          ...current,
          [searchKey]: { status: "failed", message: error instanceof Error ? error.message : String(error) },
        })),
    );
  };

  // 依存の配列を持たせず描画のたびに確かめる。検索を始めたキーは startedKeywordSearchKeys で除くため、同じ検索を重ねて送らない
  useEffect(() => {
    if (searchRanges.length === 0) {
      return;
    }
    // 同じ範囲で検索済みのキーワードは、地図を動かして戻った時やキーワードを足した時に検索し直さない
    for (const { keyword } of keywords) {
      if (!startedKeywordSearchKeys.current.has(keywordSearchKey(keyword, searchRanges))) {
        startKeywordSearch(keyword, searchRanges);
      }
    }
  });

  useEffect(() => {
    if (facilityKinds.length === 0 || isFacilitiesLoadStarted.current) {
      return;
    }
    // 2.5 MB あるため、子育て施設の種類を初めて選んだ時に読む
    isFacilitiesLoadStarted.current = true;
    fetch(facilitiesFileUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        setFacilitiesFile(facilitiesFileSchema.parse(await response.json()));
        setFacilitiesLoadErrorMessage(null);
      })
      .catch((error: unknown) => {
        // 種類を選び直した時に読み直せるようにする
        isFacilitiesLoadStarted.current = false;
        setFacilitiesLoadErrorMessage(error instanceof Error ? error.message : String(error));
      });
  }, [facilityKinds]);

  const keywordSearches = useMemo(
    () =>
      keywords.map((facilityKeyword) => ({
        ...facilityKeyword,
        // 範囲が無い (地図の読み込み前) 時と検索中は undefined
        result:
          searchRanges.length === 0
            ? undefined
            : keywordSearchResults[keywordSearchKey(facilityKeyword.keyword, searchRanges)],
      })),
    [keywords, keywordSearchResults, searchRanges],
  );

  const facilityFeatures = useMemo(
    () =>
      facilitiesFile?.features.filter(
        (feature) =>
          facilityKinds.includes(feature.properties.kind) && isPointInSearchRanges(feature.geometry.coordinates, searchRanges),
      ) ?? [],
    [facilitiesFile, facilityKinds, searchRanges],
  );

  // 地図はこの値が変わるたびにピンを描き直すため、描くものが変わった時だけ作り直す
  const pinFeatureCollection = useMemo<FeatureCollection<Point, FacilityPinProperties>>(
    () => ({
      type: "FeatureCollection",
      // 後に並べたピンが上に描かれる。数の多い子育て施設の上にキーワードのピンを出す
      features: [
        ...facilityFeatures.map((feature) => ({
          type: "Feature" as const,
          geometry: feature.geometry,
          properties: { color: facilityKindPinColors[feature.properties.kind], name: feature.properties.name },
        })),
        ...keywordSearches.flatMap(({ keyword, color, result }) =>
          (result === undefined
            ? (lastLoadedFacilitiesByKeyword[keyword] ?? [])
            : result.status === "loaded"
              ? result.facilities
              : []
          ).map((facility) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [facility.lng, facility.lat] },
            properties: { color, name: facility.name },
          })),
        ),
      ],
    }),
    [facilityFeatures, keywordSearches, lastLoadedFacilitiesByKeyword],
  );

  // パネルの入力のたびに全施設を走査しないよう、選んだ種類が変わった時だけ求める
  const usedFacilitySourceIds = useMemo(
    () =>
      new Set(
        facilitiesFile?.features
          .filter((feature) => facilityKinds.includes(feature.properties.kind))
          .map((feature) => feature.properties.sourceId),
      ),
    [facilitiesFile, facilityKinds],
  );

  return {
    keywordSearches,
    addKeyword: (keywordText: string) => setKeywords((current) => addFacilityKeyword(current, keywordText)),
    removeKeyword: (keyword: string) => {
      setKeywords((current) => current.filter((facilityKeyword) => facilityKeyword.keyword !== keyword));
      // 付け直した時に、失敗した結果や前の範囲の結果を出さずに検索し直す
      for (const searchKey of startedKeywordSearchKeys.current) {
        if (keywordOfSearchKey(searchKey) === keyword) {
          startedKeywordSearchKeys.current.delete(searchKey);
        }
      }
      setKeywordSearchResults((current) =>
        Object.fromEntries(Object.entries(current).filter(([searchKey]) => keywordOfSearchKey(searchKey) !== keyword)),
      );
      setLastLoadedFacilitiesByKeyword((current) =>
        Object.fromEntries(Object.entries(current).filter(([loadedKeyword]) => loadedKeyword !== keyword)),
      );
    },
    retryKeywordSearch: (keyword: string) => {
      setKeywordSearchResults((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([searchKey]) => searchKey !== keywordSearchKey(keyword, searchRanges)),
        ),
      );
      startKeywordSearch(keyword, searchRanges);
    },
    facilityKinds,
    toggleFacilityKind: (kind: FacilityKind) =>
      setFacilityKinds((current) =>
        current.includes(kind) ? current.filter((selectedKind) => selectedKind !== kind) : [...current, kind],
      ),
    facilitiesFile,
    facilitiesLoadErrorMessage,
    facilityFeatures,
    usedFacilitySourceIds,
    pinFeatureCollection,
  };
}

/** 施設を探すパネル。キーワードの入力と子育て施設の種類の選択、それぞれの候補の一覧と出典を出す。 */
export function FacilityMarkingPanel({
  facilityMarking,
  isAreaSelected,
}: {
  facilityMarking: ReturnType<typeof useFacilityMarking>;
  /** エリアを選んでいるか。選んでいる時は選択中のエリアの中を、いない時は地図の表示範囲を探す。 */
  isAreaSelected: boolean;
}) {
  const [keywordText, setKeywordText] = useState("");
  const {
    keywordSearches,
    addKeyword,
    removeKeyword,
    retryKeywordSearch,
    facilityKinds,
    toggleFacilityKind,
    facilitiesFile,
    facilitiesLoadErrorMessage,
    facilityFeatures,
    usedFacilitySourceIds,
  } = facilityMarking;
  const canAddKeyword = keywordSearches.length < keywordPinColors.length;

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addKeyword(keywordText);
    setKeywordText("");
  };

  return (
    <section className="facility-panel" aria-labelledby="facility-panel-heading">
      <h2 id="facility-panel-heading">施設を地図に出す</h2>
      <p className="facility-panel-note">{isAreaSelected ? "選択中のエリアの中を探します" : "地図に表示している範囲を探します"}</p>

      <form className="facility-keyword-form" onSubmit={submitKeyword}>
        <label htmlFor="facility-keyword-input">キーワード</label>
        <input
          id="facility-keyword-input"
          type="search"
          value={keywordText}
          placeholder="例: 公園"
          disabled={!canAddKeyword}
          onChange={(event) => setKeywordText(event.target.value)}
        />
        <button type="submit" disabled={!canAddKeyword}>
          追加
        </button>
      </form>
      {!canAddKeyword && <p className="facility-panel-note">キーワードは {keywordPinColors.length} 個まで重ねられます</p>}
      {keywordSearches.length > 0 && (
        <>
          <ul className="facility-layer-list" aria-label="キーワードの候補">
            {keywordSearches.map(({ keyword, color, result }) => (
              <li key={keyword} className="facility-layer">
                <FacilityLayerHeader
                  color={color}
                  title={`「${keyword}」`}
                  count={result?.status === "loaded" ? result.facilities.length : null}
                  onRemove={() => removeKeyword(keyword)}
                />
                {result === undefined ? (
                  <p className="facility-panel-note">検索しています</p>
                ) : result.status === "failed" ? (
                  <p role="alert" className="facility-panel-note">
                    「{keyword}」の検索に失敗しました ({result.message})
                    <button type="button" onClick={() => retryKeywordSearch(keyword)}>
                      もう一度検索
                    </button>
                  </p>
                ) : (
                  <>
                    {/* 上限まで取れた時は、形で絞った後に 0 件でも範囲の中に残りの候補がある見込みがあるため、件数によらず出す */}
                    {result.isTruncated && (
                      <p role="status" className="facility-panel-note">
                        候補が多いため 1 回の検索で {openPoiSearchLimit} 件までを取っています
                        <br />
                        地図を拡大するか選ぶエリアを減らすと残りも探せます
                      </p>
                    )}
                    {result.facilities.length > 0 ? (
                      <FacilityList
                        label={`「${keyword}」の候補`}
                        facilities={result.facilities.map((facility) => ({
                          name: facility.name,
                          address: facility.address || facility.city,
                        }))}
                      />
                    ) : (
                      !result.isTruncated && (
                        <p role="status" className="facility-panel-note">
                          この範囲に「{keyword}」は見つかりませんでした
                        </p>
                      )
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="facility-attribution">
            キーワードの候補の出典: <a href={openPoiAttributionUrl}>OpenPOI API</a>
          </p>
        </>
      )}

      <fieldset className="facility-kind-fieldset">
        <legend>子育て施設</legend>
        {facilityKindSchema.options.map((kind) => (
          <label key={kind}>
            <input type="checkbox" checked={facilityKinds.includes(kind)} onChange={() => toggleFacilityKind(kind)} />
            <PinSwatch color={facilityKindPinColors[kind]} />
            {facilityKindNames[kind]}
          </label>
        ))}
      </fieldset>
      {facilityKinds.length > 0 &&
        (facilitiesLoadErrorMessage ? (
          <p role="alert" className="facility-panel-note">
            子育て施設のデータを読み込めませんでした ({facilitiesLoadErrorMessage})
          </p>
        ) : !facilitiesFile ? (
          <p className="facility-panel-note">子育て施設のデータを読み込んでいます</p>
        ) : (
          <>
            <ul className="facility-layer-list" aria-label="子育て施設の候補">
              {facilityKinds.map((kind) => {
                const kindFeatures = facilityFeatures.filter((feature) => feature.properties.kind === kind);
                return (
                  <li key={kind} className="facility-layer">
                    <FacilityLayerHeader
                      color={facilityKindPinColors[kind]}
                      title={facilityKindNames[kind]}
                      count={kindFeatures.length}
                      onRemove={() => toggleFacilityKind(kind)}
                    />
                    {kindFeatures.length === 0 ? (
                      <p role="status" className="facility-panel-note">
                        この範囲に{facilityKindNames[kind]}はありません
                      </p>
                    ) : (
                      <FacilityList
                        label={`${facilityKindNames[kind]}の候補`}
                        facilities={kindFeatures.map((feature) => feature.properties)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="facility-attribution">子育て施設の出典:</p>
            <ul className="facility-attribution-list">
              {facilitiesFile.sources
                .filter((source) => usedFacilitySourceIds.has(source.id))
                .map((source) => (
                  <li key={source.id}>
                    {source.attribution} (<a href={source.licenseUrl}>{source.license}</a>)
                  </li>
                ))}
            </ul>
          </>
        ))}
    </section>
  );
}

/** キーワード・施設の種類の見出し。ピンの色と title・件数 (null なら出さない) と、外すボタンを出す。 */
function FacilityLayerHeader({
  color,
  title,
  count,
  onRemove,
}: {
  color: string;
  title: string;
  count: number | null;
  onRemove: () => void;
}) {
  return (
    <div className="facility-layer-header">
      <h3>
        <PinSwatch color={color} />
        {title}
        {count !== null && ` (${count} 件)`}
      </h3>
      <button type="button" aria-label={`${title}を外す`} onClick={onRemove}>
        外す
      </button>
    </div>
  );
}

/** 施設の一覧。最初は先頭の maxListedFacilities 件の名前と住所を出し、残りはボタンで広げて出す。 */
function FacilityList({ label, facilities }: { label: string; facilities: { name: string; address: string }[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <>
      <ul className="facility-list" aria-label={label}>
        {(isExpanded ? facilities : facilities.slice(0, maxListedFacilities)).map((facility, index) => (
          // 同じ名前・住所の施設が別の営業許可として複数あるため、順番もキーに含める
          <li key={`${index}:${facility.name}:${facility.address}`}>
            <span>{facility.name}</span>
            {facility.address && <small>{facility.address}</small>}
          </li>
        ))}
      </ul>
      {facilities.length > maxListedFacilities && (
        <button type="button" className="facility-list-toggle" onClick={() => setIsExpanded((current) => !current)}>
          {isExpanded
            ? `先頭の ${maxListedFacilities} 件だけを表示`
            : `残りの ${facilities.length - maxListedFacilities} 件を表示`}
        </button>
      )}
    </>
  );
}

/** ピンの色の見本。 */
function PinSwatch({ color }: { color: string }) {
  return <span className="pin-swatch" style={{ backgroundColor: color }} aria-hidden="true" />;
}
