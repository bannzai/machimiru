import { readFileSync } from "node:fs";
import path from "node:path";
import type { MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import type { BoundaryFeatureCollection, MunicipalityProperties } from "./boundaries";
import {
  type BoundingBox,
  boundingBoxOfGeometry,
  distanceKilometers,
  geometryAreaSquareKilometers,
  geometryCenter,
  isPointInBoundingBox,
  isPointInGeometry,
  normalizeLongitudeOfBoundingBox,
  unionBoundingBox,
} from "./geometry";

// 経度 0〜10・緯度 0〜10 の正方形から、経度 4〜6・緯度 4〜6 の穴を抜いた形
const squareWithHole: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
};

// 離れた 2 つの正方形 (島しょ部のように分かれた区域)
const twoSquares: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
    [
      [
        [20, 20],
        [22, 20],
        [22, 23],
        [20, 23],
        [20, 20],
      ],
    ],
  ],
};

describe("boundingBoxOfGeometry", () => {
  it("Polygon の外側のリングを囲む", () => {
    expect(boundingBoxOfGeometry(squareWithHole)).toEqual([0, 0, 10, 10]);
  });

  it("MultiPolygon のすべての Polygon を囲む", () => {
    expect(boundingBoxOfGeometry(twoSquares)).toEqual([0, 0, 22, 23]);
  });
});

describe("unionBoundingBox", () => {
  it("すべての矩形を囲む", () => {
    expect(
      unionBoundingBox([
        [139.5, 35.6, 139.6, 35.7],
        [139.7, 35.65, 139.8, 35.75],
      ]),
    ).toEqual([139.5, 35.6, 139.8, 35.75]);
  });
});

describe("normalizeLongitudeOfBoundingBox", () => {
  it.each([
    ["-180〜180 度の中の範囲はそのまま", [139.5, 35.6, 139.6, 35.7], [139.5, 35.6, 139.6, 35.7]],
    ["東へ 1 周した東京", [499.5, 35.6, 499.6, 35.7], [139.5, 35.6, 139.6, 35.7]],
    ["西へ 1 周した東京", [-220.5, 35.6, -220.4, 35.7], [139.5, 35.6, 139.6, 35.7]],
    ["日付変更線をまたぐ範囲は中心の側だけ", [150, 30, 200, 40], [150, 30, 180, 40]],
    ["世界より広い範囲は -180〜180 度", [-250, -80, 260, 80], [-180, -80, 180, 80]],
  ] as [string, BoundingBox, BoundingBox][])("%s", (_, boundingBox, expected) => {
    const normalized = normalizeLongitudeOfBoundingBox(boundingBox);
    normalized.forEach((degree, index) => expect(degree).toBeCloseTo(expected[index], 9));
  });
});

describe("isPointInBoundingBox", () => {
  it.each([
    [[5, 5], true],
    [[0, 10], true],
    [[-0.1, 5], false],
    [[5, 10.1], false],
  ])("%j は %s", (point, expected) => {
    expect(isPointInBoundingBox(point, [0, 0, 10, 10])).toBe(expected);
  });
});

describe("isPointInGeometry", () => {
  it.each([
    ["外側のリングの中", [2, 2], true],
    ["穴の中", [5, 5], false],
    ["外側のリングの外", [11, 5], false],
  ])("Polygon の%s", (_, point, expected) => {
    expect(isPointInGeometry(point, squareWithHole)).toBe(expected);
  });

  it.each([
    ["1 つ目の中", [0.5, 0.5], true],
    ["2 つ目の中", [21, 22], true],
    ["2 つの間", [10, 10], false],
  ])("MultiPolygon の%s", (_, point, expected) => {
    expect(isPointInGeometry(point, twoSquares)).toBe(expected);
  });
});

describe("geometryCenter", () => {
  it("Polygon は外側のリングの重心にする", () => {
    expect(geometryCenter(squareWithHole)).toEqual([5, 5]);
  });

  it("MultiPolygon は面積の最も大きい Polygon の重心にする", () => {
    expect(geometryCenter(twoSquares)).toEqual([21, 21.5]);
  });

  it("新宿区の境界データの中心が新宿区の中にある", () => {
    const boundaries = JSON.parse(
      readFileSync(path.join(process.cwd(), "public", "data", "boundaries", "tokyo-municipalities.geojson"), "utf8"),
    ) as BoundaryFeatureCollection<MunicipalityProperties>;
    const shinjuku = boundaries.features.find((feature) => feature.properties.code === "13104")!;
    expect(isPointInGeometry(geometryCenter(shinjuku.geometry), shinjuku.geometry)).toBe(true);
  });
});

describe("distanceKilometers", () => {
  it("同じ点は 0 km", () => {
    expect(distanceKilometers([139.7, 35.7], [139.7, 35.7])).toBe(0);
  });

  it("経線に沿った緯度 1 度は、地球の半径 6371.0088 km の円周の 360 分の 1", () => {
    expect(distanceKilometers([139, 35], [139, 36])).toBeCloseTo((2 * Math.PI * 6371.0088) / 360, 6);
  });

  it("赤道に沿った経度 90 度は、円周の 4 分の 1", () => {
    expect(distanceKilometers([0, 0], [90, 0])).toBeCloseTo((2 * Math.PI * 6371.0088) / 4, 6);
  });
});

describe("geometryAreaSquareKilometers", () => {
  // 地球を半径 6371.0088 km の球とみなした時の、経度 longitudeDegrees 度・緯度 southDegrees〜northDegrees 度の帯の面積 (km²)
  const bandArea = (longitudeDegrees: number, southDegrees: number, northDegrees: number) =>
    6371.0088 ** 2 *
    ((longitudeDegrees * Math.PI) / 180) *
    (Math.sin((northDegrees * Math.PI) / 180) - Math.sin((southDegrees * Math.PI) / 180));

  it("Polygon は外側のリングの面積から穴の面積を引く", () => {
    expect(geometryAreaSquareKilometers(squareWithHole)).toBeCloseTo(bandArea(10, 0, 10) - bandArea(2, 4, 6), 3);
  });

  it("MultiPolygon は分かれた形の面積を足す", () => {
    expect(geometryAreaSquareKilometers(twoSquares)).toBeCloseTo(bandArea(1, 0, 1) + bandArea(2, 20, 23), 3);
  });

  it.each([
    // 国土地理院「全国都道府県市区町村別面積調」の面積。境界データは 15 m 間隔で簡略化しているため 3% までの差を許す
    ["13104", "新宿区", 18.22],
    ["13112", "世田谷区", 58.05],
  ])("区市町村の境界データ %s (%s) の面積が公表値 %f km² に近い", (code, _, publishedArea) => {
    const boundaries = JSON.parse(
      readFileSync(path.join(process.cwd(), "public", "data", "boundaries", "tokyo-municipalities.geojson"), "utf8"),
    ) as BoundaryFeatureCollection<MunicipalityProperties>;
    const boundary = boundaries.features.find((feature) => feature.properties.code === code)!;
    expect(Math.abs(geometryAreaSquareKilometers(boundary.geometry) - publishedArea) / publishedArea).toBeLessThan(0.03);
  });
});
