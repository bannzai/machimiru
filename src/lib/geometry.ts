import type { MultiPolygon, Polygon, Position } from "geojson";

/** 経度・緯度の矩形。[西端の経度, 南端の緯度, 東端の経度, 北端の緯度] の順で、OpenPOI API の bbox と同じ並び。 */
export type BoundingBox = [number, number, number, number];

/** geometry のすべての頂点を囲む矩形を返す。 */
export function boundingBoxOfGeometry(geometry: Polygon | MultiPolygon): BoundingBox {
  return (geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2)).reduce<BoundingBox>(
    ([west, south, east, north], [longitude, latitude]) => [
      Math.min(west, longitude),
      Math.min(south, latitude),
      Math.max(east, longitude),
      Math.max(north, latitude),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/** boundingBoxes のすべてを囲む矩形を返す。 */
export function unionBoundingBox(boundingBoxes: readonly BoundingBox[]): BoundingBox {
  return boundingBoxes.reduce<BoundingBox>(
    ([west, south, east, north], [otherWest, otherSouth, otherEast, otherNorth]) => [
      Math.min(west, otherWest),
      Math.min(south, otherSouth),
      Math.max(east, otherEast),
      Math.max(north, otherNorth),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/** point ([経度, 緯度]) が boundingBox の中 (辺の上を含む) にあるかを返す。 */
export function isPointInBoundingBox([longitude, latitude]: Position, [west, south, east, north]: BoundingBox): boolean {
  return west <= longitude && longitude <= east && south <= latitude && latitude <= north;
}

/** point ([経度, 緯度]) が geometry の中にあるかを返す。Polygon の 2 つ目以降のリング (穴) の中は外として扱う。 */
export function isPointInGeometry(point: Position, geometry: Polygon | MultiPolygon): boolean {
  return (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).some(
    ([outerRing, ...holes]) => isPointInRing(point, outerRing) && !holes.some((hole) => isPointInRing(point, hole)),
  );
}

/** point が閉じたリング ring の中にあるかを、point から東へ伸ばした半直線とリングの辺の交差の回数 (奇数なら中) で返す。 */
function isPointInRing([longitude, latitude]: Position, ring: Position[]): boolean {
  let isInside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const [longitudeA, latitudeA] = ring[index];
    const [longitudeB, latitudeB] = ring[previousIndex];
    if (
      latitudeA > latitude !== latitudeB > latitude &&
      longitude < ((longitudeB - longitudeA) * (latitude - latitudeA)) / (latitudeB - latitudeA) + longitudeA
    ) {
      isInside = !isInside;
    }
  }
  return isInside;
}
