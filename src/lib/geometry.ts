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

/**
 * 地図の表示範囲 boundingBox を、中心の経度が -180〜180 度に入るよう 360 度の倍数だけずらし、経度を -180〜180 度に収めて返す。
 * 地図を横に一周させて繰り返し表示された東京を見ている時は、表示範囲の経度が ±180 度を超える (例: 499〜500 度) ため、
 * そのままでは施設のデータの経度 (139 度付近) と比べられない。日付変更線をまたぐ範囲は、中心の側だけを残す
 * (対象は東京都で、日付変更線の反対側に施設が無いため)。
 */
export function normalizeLongitudeOfBoundingBox([west, south, east, north]: BoundingBox): BoundingBox {
  const longitudeOffset = Math.round((west + east) / 2 / 360) * 360;
  return [Math.max(west - longitudeOffset, -180), south, Math.min(east - longitudeOffset, 180), north];
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

// 地球を球とみなした時の半径 (IUGG の平均半径)。区市町村の面積を比べる用途で、楕円体との差 (1% 未満) は順位に効かない
const earthRadiusMeters = 6_371_008.8;

/** geometry の面積 (km²) を、地球を球とみなして返す。Polygon の 2 つ目以降のリング (穴) の面積は差し引く。 */
export function geometryAreaSquareKilometers(geometry: Polygon | MultiPolygon): number {
  return (
    (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).reduce(
      (sum, [outerRing, ...holes]) =>
        sum + ringAreaSquareMeters(outerRing) - holes.reduce((holeSum, hole) => holeSum + ringAreaSquareMeters(hole), 0),
      0,
    ) / 1_000_000
  );
}

/**
 * geometry の中心 ([経度, 緯度])。外側のリングを、経度・緯度を平面の座標とみなした多角形の重心にする (区市町村の範囲では、
 * 球面の重心との差は中心から施設までの距離を比べる用途に効かない)。穴は考えない。MultiPolygon は、面積の最も大きい Polygon の中心にする
 * (島しょ部の村の中心が島の間の海にならないよう、主な島を選ぶ)。
 */
export function geometryCenter(geometry: Polygon | MultiPolygon): Position {
  const [outerRing] = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).reduce(
    (largest, polygon) => (ringAreaSquareMeters(polygon[0]) > ringAreaSquareMeters(largest[0]) ? polygon : largest),
  );
  let doubledArea = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;
  for (let index = 0, previousIndex = outerRing.length - 1; index < outerRing.length; previousIndex = index++) {
    const [longitudeA, latitudeA] = outerRing[previousIndex];
    const [longitudeB, latitudeB] = outerRing[index];
    const cross = longitudeA * latitudeB - longitudeB * latitudeA;
    doubledArea += cross;
    longitudeSum += (longitudeA + longitudeB) * cross;
    latitudeSum += (latitudeA + latitudeB) * cross;
  }
  return [longitudeSum / (3 * doubledArea), latitudeSum / (3 * doubledArea)];
}

/** 2 点 ([経度, 緯度]) の間の距離 (km) を、地球を球とみなした大円距離 (haversine の式) で返す。 */
export function distanceKilometers([longitudeA, latitudeA]: Position, [longitudeB, latitudeB]: Position): number {
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const haversine =
    Math.sin(toRadians(latitudeB - latitudeA) / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(toRadians(longitudeB - longitudeA) / 2) ** 2;
  return (2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine))) / 1000;
}

/**
 * 閉じたリング ring が球面上で囲む面積 (m²)。リングの向きによらず正の値を返す。
 * 式は球面上の多角形の面積の近似 (Chamberlain & Duquette「Some Algorithms for Polygons on a Sphere」(2007) の式) で、turf の area と同じ。
 */
function ringAreaSquareMeters(ring: Position[]): number {
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  let total = 0;
  for (let index = 0; index < ring.length; index++) {
    const lower = ring[index];
    const middle = ring[(index + 1) % ring.length];
    const upper = ring[(index + 2) % ring.length];
    total += (toRadians(upper[0]) - toRadians(lower[0])) * Math.sin(toRadians(middle[1]));
  }
  return Math.abs((total * earthRadiusMeters * earthRadiusMeters) / 2);
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
