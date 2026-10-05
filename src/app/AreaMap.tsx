"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type AreaSelection,
  areaSelectionStorageKey,
  emptyAreaSelection,
  parseAreaSelection,
  toggleAreaCode,
  townSelectionMinZoom,
} from "@/lib/areaSelection";
import {
  type BoundaryFeatureCollection,
  type MunicipalityProperties,
  type TownProperties,
  municipalityBoundaryCode,
  municipalityBoundaryUrl,
  tokyoMainlandBounds,
  townBoundaryUrl,
} from "@/lib/boundaries";
import {
  type ChildcareScore,
  childcareScoreColor,
  computeChildcareScores,
  missingChildcareScoreColor,
} from "@/lib/childcareScore";
import type { SearchRange } from "@/lib/facilityMarking";
import { type BoundingBox, boundingBoxOfGeometry, normalizeLongitudeOfBoundingBox } from "@/lib/geometry";
import {
  type PropertySearchCondition,
  emptyPropertySearchCondition,
  parsePropertySearchCondition,
  propertySearchConditionStorageKey,
} from "@/lib/propertySearch";
import type { MunicipalitiesFile } from "@/lib/tokyoData/schema";
import { ChildcareScorePanel, municipalityPagePath, ScoreSwatch } from "./ChildcareScorePanel";
import { FacilityMarkingPanel, useFacilityMarking } from "./FacilityMarking";
import { PropertySearch } from "./PropertySearch";

// maplibre-gl は Web Worker のファイルを自分のモジュールの URL から相対で探すが、Next.js のバンドル後はその場所に無いため、
// npm の prebuild・predev で public/vendor/maplibre-gl/ に写したファイルを指す (package.json の scripts)
const maplibreWorkerUrl = "/vendor/maplibre-gl/maplibre-gl-worker.mjs";

// OpenFreeMap の標準のスタイル。API キーが要らず商用で使える (documents/PROJECT.md「データの出典」)
const baseMapStyleUrl = "https://tiles.openfreemap.org/styles/liberty";

// 境界データの出典表示の全文は出典ページに出し、地図の上は短い表記にする。全文を地図に重ねると、モバイル幅で 5 行に折り返して地図の下を覆うため
// (OpenFreeMap・OpenStreetMap の表記はベース地図のスタイルが地図の上に出す)
const boundaryAttribution = '<a href="/sources/">国土数値情報・e-Stat を加工 (出典)</a>';

/** 区市町村の境界の MapLibre のソース ID。 */
const municipalitySourceId = "municipalities";
/** 町丁の境界の MapLibre のソース ID。 */
const townSourceId = "towns";
/** 区市町村を選ぶズームで、子育てのしやすさの総合の評価で色分けし、タップの位置から区市町村を引くための塗りのレイヤー ID。 */
const municipalityFillLayerId = "municipalities-fill";
/** 選択中の区市町村の太い境界線のレイヤー ID。 */
const selectedMunicipalityLayerId = "municipalities-selected";
/** 区市町村の境界線のレイヤー ID。 */
const municipalityLineLayerId = "municipalities-line";
/** 町丁を選ぶズームで、タップの位置から町丁を引くための塗りのレイヤー ID。 */
const townFillLayerId = "towns-fill";
/** 選択中の町丁の塗りのレイヤー ID。 */
const selectedTownLayerId = "towns-selected";
/** 町丁の境界線のレイヤー ID。 */
const townLineLayerId = "towns-line";
/** 施設のピン (キーワードの候補と子育て施設) の MapLibre のソース ID。 */
const facilityPinSourceId = "facility-pins";
/** 施設のピンのレイヤー ID。 */
const facilityPinLayerId = "facility-pins-circle";

/**
 * 東京都の地図と、区市町村・町丁を選ぶ操作、選択中のエリアの一覧と物件の検索、施設のピン、区市町村ごとの子育てのしやすさの総合の評価。
 * 選択と検索の条件はブラウザの localStorage に保存する。施設はエリアを選んでいる時は選択中のエリアの中を、いない時は地図の表示範囲を探す。
 * municipalitiesFile は評価の根拠にする区市町村の指標。
 */
export function AreaMap({ municipalitiesFile }: { municipalitiesFile: MunicipalitiesFile }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [boundaries, setBoundaries] = useState<{
    municipalities: BoundaryFeatureCollection<MunicipalityProperties>;
    towns: BoundaryFeatureCollection<TownProperties>;
  } | null>(null);
  const [areaSelection, setAreaSelection] = useState<AreaSelection>(emptyAreaSelection);
  const [propertySearchCondition, setPropertySearchCondition] =
    useState<PropertySearchCondition>(emptyPropertySearchCondition);
  // 保存済みの選択と検索の条件を読み終えたか。2 つは地図の読み込みの後に同時に読む
  const [isStoredSelectionLoaded, setIsStoredSelectionLoaded] = useState(false);
  const [isTownLevel, setIsTownLevel] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [mapBoundingBox, setMapBoundingBox] = useState<BoundingBox | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let isCancelled = false;
    let map: MapLibreMap | undefined;
    // maplibre-gl は読み込み時に window を参照するため、サーバーでの描画では読み込まない
    Promise.all([
      import("maplibre-gl"),
      fetchBoundary<MunicipalityProperties>(municipalityBoundaryUrl),
      fetchBoundary<TownProperties>(townBoundaryUrl),
    ])
      .then(([maplibregl, municipalities, towns]) => {
        if (isCancelled) {
          return;
        }
        maplibregl.setWorkerUrl(maplibreWorkerUrl);
        const loadedMap = new maplibregl.Map({
          container,
          style: baseMapStyleUrl,
          // URL に表示位置 (#ズーム/緯度/経度) が無い時に、最初に島しょ部を除いた東京都を表示する
          bounds: tokyoMainlandBounds,
          hash: true,
          // 既定ではモバイル幅で出典が「i」ボタンに畳まれるため、常に文字で出す
          attributionControl: { compact: false, customAttribution: boundaryAttribution },
        });
        map = loadedMap;
        loadedMap.addControl(new maplibregl.NavigationControl({ showCompass: false }));
        // スタイルの取得の失敗は Promise ではなく error イベントで届き、load が起きずに読み込み中のまま止まるため、
        // load の前の error を読み込みの失敗として出す。load の後の error (タイル 1 枚の取得失敗等) は地図を使い続けられるため出さない
        const showInitialLoadError = (event: { error: { message: string } }) => setLoadErrorMessage(event.error.message);
        loadedMap.on("error", showInitialLoadError);
        loadedMap.on("load", () => {
          loadedMap.off("error", showInitialLoadError);
          // load の前に起きた error が、読み込みを止めないもの (スプライトの取得失敗等) だった時に表示を戻す
          setLoadErrorMessage(null);
          addBoundaryLayers(loadedMap, municipalities, towns);
          addFacilityPinLayer(loadedMap);
          mapRef.current = loadedMap;
          const updateMapBoundingBox = () => {
            const bounds = loadedMap.getBounds();
            setMapBoundingBox(
              normalizeLongitudeOfBoundingBox([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]),
            );
          };
          updateMapBoundingBox();
          loadedMap.on("moveend", updateMapBoundingBox);
          setBoundaries({ municipalities, towns });
          setAreaSelection(parseAreaSelection(readStoredText(areaSelectionStorageKey)));
          setPropertySearchCondition(parsePropertySearchCondition(readStoredText(propertySearchConditionStorageKey)));
          setIsStoredSelectionLoaded(true);
          setIsTownLevel(loadedMap.getZoom() >= townSelectionMinZoom);
          // data-map-state は画面の撮影 (e2e/) が、境界データを描き終えてから地図を操作するための目印
          loadedMap.on("movestart", () => {
            container.dataset.mapState = "moving";
          });
          loadedMap.on("idle", () => {
            container.dataset.mapState = "idle";
          });
          loadedMap.on("zoomend", () => setIsTownLevel(loadedMap.getZoom() >= townSelectionMinZoom));
          loadedMap.on("click", (event) => {
            const isTownClick = loadedMap.getZoom() >= townSelectionMinZoom;
            const feature = loadedMap.queryRenderedFeatures(event.point, {
              layers: [isTownClick ? townFillLayerId : municipalityFillLayerId],
            })[0];
            if (!feature) {
              return;
            }
            const code = String(feature.properties.code);
            // 選択の塗りの描き直し (setFilter の後にタイルを作り直す) は非同期のため、描き終えて idle になるまでを e2e が待てるようにする
            container.dataset.mapState = "moving";
            setAreaSelection((current) =>
              isTownClick
                ? { ...current, townCodes: toggleAreaCode(current.townCodes, code) }
                : { ...current, municipalityCodes: toggleAreaCode(current.municipalityCodes, code) },
            );
          });
        });
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setLoadErrorMessage(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      isCancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaries) {
      return;
    }
    map.setFilter(selectedMunicipalityLayerId, codeFilter(areaSelection.municipalityCodes));
    map.setFilter(selectedTownLayerId, codeFilter(areaSelection.townCodes));
  }, [areaSelection, boundaries]);

  /** 区市町村ごとの子育てのしやすさの総合の評価 (municipalitiesFile.municipalities と同じ順)。 */
  const childcareScores = useMemo(
    () => computeChildcareScores(municipalitiesFile.municipalities),
    [municipalitiesFile],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaries) {
      return;
    }
    // 塗りの描き直しは非同期のため、描き終えて idle になるまでを e2e が待てるようにする
    map.getContainer().dataset.mapState = "moving";
    map.setPaintProperty(municipalityFillLayerId, "fill-color", childcareScoreFillColor(childcareScores));
  }, [boundaries, childcareScores]);

  useEffect(() => {
    // 保存済みの選択を読む前に保存すると、空の選択で上書きしてしまう
    if (!isStoredSelectionLoaded) {
      return;
    }
    writeStoredText(areaSelectionStorageKey, JSON.stringify(areaSelection));
  }, [areaSelection, isStoredSelectionLoaded]);

  useEffect(() => {
    // 保存済みの条件を読む前に保存すると、条件を付けない状態で上書きしてしまう
    if (!isStoredSelectionLoaded) {
      return;
    }
    writeStoredText(propertySearchConditionStorageKey, JSON.stringify(propertySearchCondition));
  }, [propertySearchCondition, isStoredSelectionLoaded]);

  const municipalityNames = useMemo(
    () =>
      new Map(boundaries?.municipalities.features.map((feature) => [feature.properties.code, feature.properties.name] as const)),
    [boundaries],
  );
  const townsByCode = useMemo(
    () => new Map(boundaries?.towns.features.map((feature) => [feature.properties.code, feature.properties] as const)),
    [boundaries],
  );
  /** 区市町村の境界の `code` (5 桁) から引く総合の評価。選択中のエリアの一覧が、地図で選んだ区市町村の評価を出すのに使う。 */
  const childcareScoresByBoundaryCode = useMemo(
    () =>
      new Map(
        municipalitiesFile.municipalities.map(
          (municipality, index) => [municipalityBoundaryCode(municipality.code), childcareScores[index]] as const,
        ),
      ),
    [municipalitiesFile, childcareScores],
  );
  const selectedMunicipalityCodes = areaSelection.municipalityCodes.filter((code) => municipalityNames.has(code));
  const selectedTownCodes = areaSelection.townCodes.filter((code) => townsByCode.has(code));

  const selectedAreaSearchRanges = useMemo<SearchRange[]>(
    () =>
      boundaries
        ? [
            ...boundaries.municipalities.features.filter((feature) =>
              areaSelection.municipalityCodes.includes(feature.properties.code),
            ),
            ...boundaries.towns.features.filter((feature) => areaSelection.townCodes.includes(feature.properties.code)),
          ].map((feature) => ({ boundingBox: boundingBoxOfGeometry(feature.geometry), geometry: feature.geometry }))
        : [],
    [boundaries, areaSelection],
  );
  const mapSearchRanges = useMemo<SearchRange[]>(
    () => (mapBoundingBox ? [{ boundingBox: mapBoundingBox, geometry: null }] : []),
    [mapBoundingBox],
  );
  const facilityMarking = useFacilityMarking(
    selectedAreaSearchRanges.length > 0 ? selectedAreaSearchRanges : mapSearchRanges,
  );
  const { pinFeatureCollection } = facilityMarking;
  const hasDrawnFacilityPins = useRef(false);

  // 一覧の表示 (e2e が待つ目印) より先に data-map-state を moving にするため、描画の前に走る useLayoutEffect にする
  useLayoutEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    // 地図の読み込み直後のピンの無い状態では描き直さない (描くものが無く、idle になる前の印だけが残らないようにする)
    if (!map || !boundaries || !container || (!hasDrawnFacilityPins.current && pinFeatureCollection.features.length === 0)) {
      return;
    }
    hasDrawnFacilityPins.current = pinFeatureCollection.features.length > 0;
    // ピンの描き直し (setData の後にタイルを作り直す) は非同期のため、描き終えて idle になるまでを e2e が待てるようにする
    container.dataset.mapState = "moving";
    map.getSource<GeoJSONSource>(facilityPinSourceId)?.setData(pinFeatureCollection);
  }, [pinFeatureCollection, boundaries]);

  return (
    <div className="area-map">
      <div ref={containerRef} className="area-map-canvas" data-map-state="loading" />
      <section className="area-panel" aria-labelledby="selected-areas-heading">
        {loadErrorMessage ? (
          <p role="alert">地図を読み込めませんでした ({loadErrorMessage})</p>
        ) : boundaries ? (
          <p className="area-panel-level">
            <strong>選択の単位: {isTownLevel ? "町丁" : "区市町村"}</strong>
            <br />
            {isTownLevel ? "ズームアウトすると区市町村を選べます" : "ズームすると町丁を選べます"}
          </p>
        ) : (
          <p>地図を読み込んでいます</p>
        )}
        <h2 id="selected-areas-heading">選択中のエリア ({selectedMunicipalityCodes.length + selectedTownCodes.length})</h2>
        {selectedMunicipalityCodes.length + selectedTownCodes.length === 0 ? (
          <p>地図のエリアをタップすると選べます</p>
        ) : (
          <>
            <ul aria-labelledby="selected-areas-heading" className="area-panel-list">
              {selectedMunicipalityCodes.map((code) => (
                <SelectedAreaItem
                  key={code}
                  areaName={municipalityNames.get(code) ?? ""}
                  childcareScore={childcareScoresByBoundaryCode.get(code)}
                  onRemove={() =>
                    setAreaSelection((current) => ({
                      ...current,
                      municipalityCodes: toggleAreaCode(current.municipalityCodes, code),
                    }))
                  }
                />
              ))}
              {selectedTownCodes.map((code) => (
                <SelectedAreaItem
                  key={code}
                  areaName={`${municipalityNames.get(townsByCode.get(code)?.municipalityCode ?? "") ?? ""} ${townsByCode.get(code)?.name ?? ""}`}
                  onRemove={() =>
                    setAreaSelection((current) => ({ ...current, townCodes: toggleAreaCode(current.townCodes, code) }))
                  }
                />
              ))}
            </ul>
            <button type="button" onClick={() => setAreaSelection(emptyAreaSelection)}>
              すべて解除
            </button>
          </>
        )}
        <PropertySearch
          municipalityCodes={[
            ...selectedMunicipalityCodes,
            ...selectedTownCodes.flatMap((code) => townsByCode.get(code)?.municipalityCode ?? []),
          ]}
          hasTownSelection={selectedTownCodes.length > 0}
          condition={propertySearchCondition}
          isConditionEditable={isStoredSelectionLoaded}
          onConditionChange={setPropertySearchCondition}
        />
        {boundaries && (
          <FacilityMarkingPanel facilityMarking={facilityMarking} isAreaSelected={selectedAreaSearchRanges.length > 0} />
        )}
        {/* 62 区市町村の順位の一覧は長く、上に置くと物件の検索と施設の欄がパネルの下へ遠のくため、最後に置く */}
        <ChildcareScorePanel municipalitiesFile={municipalitiesFile} childcareScores={childcareScores} />
      </section>
    </div>
  );
}

/**
 * 選択中のエリアの一覧の 1 行。areaName を出し、解除のボタンで onRemove を呼ぶ。
 * 区市町村の行には childcareScore を渡し、総合の評価と、指標と子育て支援制度のページへのリンクを出す。
 */
function SelectedAreaItem({
  areaName,
  childcareScore,
  onRemove,
}: {
  areaName: string;
  childcareScore?: ChildcareScore;
  onRemove: () => void;
}) {
  return (
    <li>
      <span>{areaName}</span>
      {childcareScore && (
        <span className="area-panel-score">
          <ScoreSwatch color={childcareScoreColor(childcareScore.total)} />
          {childcareScore.total === null ? "評価なし" : `${childcareScore.total} 点`}
          {/* 複数の区市町村を選んだ時に、読み上げでリンクを区市町村ごとに見分けられるよう、名前に区市町村名を入れる */}
          <Link href={municipalityPagePath(childcareScore.municipalityCode)} aria-label={`${areaName}の指標と制度`}>
            指標と制度
          </Link>
        </span>
      )}
      <button type="button" aria-label={`${areaName}の選択を解除`} onClick={onRemove}>
        解除
      </button>
    </li>
  );
}

/** url の境界データを取得する。HTTP のエラーは例外にする。 */
async function fetchBoundary<Properties>(url: string): Promise<BoundaryFeatureCollection<Properties>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return response.json();
}

/** localStorage の storageKey に保存した文字列を返す。保存が無い・ストレージを読めない時は null を返す。 */
function readStoredText(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/** localStorage の storageKey に text を保存する。 */
function writeStoredText(storageKey: string, text: string) {
  try {
    localStorage.setItem(storageKey, text);
  } catch {
    // 保存できない環境 (ストレージを禁止したブラウザ等) では、再読み込みで選択と条件が消えるだけで操作は続けられる
  }
}

/** codes のどれかを `code` に持つエリアだけを残すフィルタを返す。 */
function codeFilter(codes: string[]): FilterSpecification {
  return ["in", ["get", "code"], ["literal", codes]];
}

/** 区市町村と町丁の境界のソースとレイヤーを map に足す。選択中のエリアのレイヤーは何も選ばない状態で足す。 */
function addBoundaryLayers(
  map: MapLibreMap,
  municipalities: BoundaryFeatureCollection<MunicipalityProperties>,
  towns: BoundaryFeatureCollection<TownProperties>,
) {
  // 出典は地図の customAttribution (boundaryAttribution) にまとめて出すため、ソースごとの attribution は渡さない
  map.addSource(municipalitySourceId, { type: "geojson", data: municipalities });
  map.addSource(townSourceId, { type: "geojson", data: towns });
  // 地名のラベルを境界の塗りで隠さないよう、ベース地図の最初の文字のレイヤーより下に入れる
  const firstSymbolLayerId = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  // 区市町村の塗りは子育てのしやすさの総合の評価の色分けで、クリックの位置からエリアを引くためにも使う。
  // 色は評価を読み込んだ後に setPaintProperty で入れ、それまでは評価なしの色にする。
  // 透けた下の地名・道路が読める範囲で、最も薄い区分の色も塗りと分かる不透明度にする
  map.addLayer(
    {
      id: municipalityFillLayerId,
      type: "fill",
      source: municipalitySourceId,
      maxzoom: townSelectionMinZoom,
      paint: { "fill-color": missingChildcareScoreColor, "fill-opacity": 0.6 },
    },
    firstSymbolLayerId,
  );
  map.addLayer(
    {
      id: townFillLayerId,
      type: "fill",
      source: townSourceId,
      minzoom: townSelectionMinZoom,
      paint: { "fill-color": "#ea580c", "fill-opacity": 0.04 },
    },
    firstSymbolLayerId,
  );
  map.addLayer(
    {
      id: selectedTownLayerId,
      type: "fill",
      source: townSourceId,
      filter: codeFilter([]),
      paint: { "fill-color": "#ea580c", "fill-opacity": 0.5 },
    },
    firstSymbolLayerId,
  );
  map.addLayer(
    {
      id: townLineLayerId,
      type: "line",
      source: townSourceId,
      minzoom: townSelectionMinZoom,
      paint: { "line-color": "#9a3412", "line-width": 0.6, "line-opacity": 0.7 },
    },
    firstSymbolLayerId,
  );
  map.addLayer(
    {
      id: municipalityLineLayerId,
      type: "line",
      source: municipalitySourceId,
      paint: { "line-color": "#1e3a8a", "line-width": 1.5 },
    },
    firstSymbolLayerId,
  );
  // 選択中の区市町村は、総合の評価の塗りの色を変えずに見分けられるよう、塗りではなく太い境界線で示す
  map.addLayer(
    {
      id: selectedMunicipalityLayerId,
      type: "line",
      source: municipalitySourceId,
      filter: codeFilter([]),
      paint: { "line-color": "#2563eb", "line-width": 4 },
    },
    firstSymbolLayerId,
  );
}

/** 区市町村の境界の `code` ごとに、childcareScores の総合の評価の色を返す MapLibre の式。評価の無い区市町村は評価なしの色にする。 */
function childcareScoreFillColor(childcareScores: readonly ChildcareScore[]): ExpressionSpecification {
  // MapLibre の型は match の「値と色の組」を固定長の tuple で表し、区市町村の数だけ組を並べた配列を受け取れないため変換する
  return [
    "match",
    ["get", "code"],
    ...childcareScores.flatMap((childcareScore) => [
      municipalityBoundaryCode(childcareScore.municipalityCode),
      childcareScoreColor(childcareScore.total),
    ]),
    missingChildcareScoreColor,
  ] as unknown as ExpressionSpecification;
}

/** 施設のピンのソースとレイヤーを、ピンの無い状態で map の一番上に足す。ピンの色は Feature の `color` を使う。 */
function addFacilityPinLayer(map: MapLibreMap) {
  map.addSource(facilityPinSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // 地名のラベルに隠れないよう、ベース地図の文字のレイヤーより上に足す
  map.addLayer({
    id: facilityPinLayerId,
    type: "circle",
    source: facilityPinSourceId,
    paint: {
      "circle-color": ["get", "color"],
      // 直径 12 px は色を見分けられる最小の大きさとして選んだ。区部の保育所のように数十 m おきに並ぶ施設でも、
      // ズーム 15 (1 px がおよそ 1.9 m) なら隣のピンと重なりにくい
      "circle-radius": 6,
      // 白い縁で、エリアの塗りや同じ色のピンの重なりの上でも 1 本ずつ見分けられるようにする
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
}
