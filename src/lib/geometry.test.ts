import type { MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import {
  boundingBoxOfGeometry,
  isPointInBoundingBox,
  isPointInGeometry,
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
