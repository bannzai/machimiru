"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
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
  municipalityBoundaryUrl,
  townBoundaryUrl,
} from "@/lib/boundaries";
import {
  type PropertySearchCondition,
  emptyPropertySearchCondition,
  parsePropertySearchCondition,
  propertySearchConditionStorageKey,
} from "@/lib/propertySearch";
import { PropertySearch } from "./PropertySearch";

// maplibre-gl は Web Worker のファイルを自分のモジュールの URL から相対で探すが、Next.js のバンドル後はその場所に無いため、
// npm の prebuild・predev で public/vendor/maplibre-gl/ に写したファイルを指す (package.json の scripts)
const maplibreWorkerUrl = "/vendor/maplibre-gl/maplibre-gl-worker.mjs";

// OpenFreeMap の標準のスタイル。API キーが要らず商用で使える (documents/PROJECT.md「データの出典」)
const baseMapStyleUrl = "https://tiles.openfreemap.org/styles/liberty";

// 島しょ部を除いた東京都 (西端の奥多摩町から東端の江戸川区まで) が収まる範囲。
// URL に表示位置 (#ズーム/緯度/経度) が無い時に、最初にこの範囲を表示する
const tokyoMainlandBounds: [[number, number], [number, number]] = [
  [138.94, 35.5],
  [139.93, 35.9],
];

/** 区市町村の境界の MapLibre のソース ID。 */
const municipalitySourceId = "municipalities";
/** 町丁の境界の MapLibre のソース ID。 */
const townSourceId = "towns";
/** 区市町村を選ぶズームで、タップの位置から区市町村を引くための塗りのレイヤー ID。 */
const municipalityFillLayerId = "municipalities-fill";
/** 選択中の区市町村の塗りのレイヤー ID。 */
const selectedMunicipalityLayerId = "municipalities-selected";
/** 区市町村の境界線のレイヤー ID。 */
const municipalityLineLayerId = "municipalities-line";
/** 町丁を選ぶズームで、タップの位置から町丁を引くための塗りのレイヤー ID。 */
const townFillLayerId = "towns-fill";
/** 選択中の町丁の塗りのレイヤー ID。 */
const selectedTownLayerId = "towns-selected";
/** 町丁の境界線のレイヤー ID。 */
const townLineLayerId = "towns-line";

/** 東京都の地図と、区市町村・町丁を選ぶ操作、選択中のエリアの一覧と物件の検索。選択と検索の条件はブラウザの localStorage に保存する。 */
export function AreaMap() {
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
          bounds: tokyoMainlandBounds,
          hash: true,
          // 既定ではモバイル幅で出典が「i」ボタンに畳まれるため、常に文字で出す
          attributionControl: { compact: false },
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
          mapRef.current = loadedMap;
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
  const selectedMunicipalityCodes = areaSelection.municipalityCodes.filter((code) => municipalityNames.has(code));
  const selectedTownCodes = areaSelection.townCodes.filter((code) => townsByCode.has(code));

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
          onConditionChange={setPropertySearchCondition}
        />
      </section>
    </div>
  );
}

/** 選択中のエリアの一覧の 1 行。areaName を出し、解除のボタンで onRemove を呼ぶ。 */
function SelectedAreaItem({ areaName, onRemove }: { areaName: string; onRemove: () => void }) {
  return (
    <li>
      <span>{areaName}</span>
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
  map.addSource(municipalitySourceId, {
    type: "geojson",
    data: municipalities,
    attribution: municipalities.source.attribution,
  });
  map.addSource(townSourceId, { type: "geojson", data: towns, attribution: towns.source.attribution });
  // 地名のラベルを境界の塗りで隠さないよう、ベース地図の最初の文字のレイヤーより下に入れる
  const firstSymbolLayerId = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  // 塗りの薄い色は、タップで選べる単位を見せるためと、クリックの位置からエリアを引くため
  map.addLayer(
    {
      id: municipalityFillLayerId,
      type: "fill",
      source: municipalitySourceId,
      maxzoom: townSelectionMinZoom,
      paint: { "fill-color": "#2563eb", "fill-opacity": 0.06 },
    },
    firstSymbolLayerId,
  );
  map.addLayer(
    {
      id: selectedMunicipalityLayerId,
      type: "fill",
      source: municipalitySourceId,
      filter: codeFilter([]),
      paint: { "fill-color": "#2563eb", "fill-opacity": 0.4 },
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
}
