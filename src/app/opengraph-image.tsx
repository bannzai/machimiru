import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Position } from "geojson";
import { ImageResponse } from "next/og";
import {
  type BoundaryFeatureCollection,
  type MunicipalityProperties,
  municipalityBoundaryUrl,
  tokyoMainlandBounds,
} from "@/lib/boundaries";
import { siteCatchphrase, siteName, siteTitle } from "@/lib/site";

// 境界データと文字の形 (フォント) をビルド時に読むため、リクエストごとに画像を作る動的な描画にしない
export const dynamic = "force-static";

/** OGP 画像の代替テキスト。 */
export const alt = siteTitle;

/** OGP 画像の大きさ。Facebook・X が大きいカードに推奨する 1200 × 630。 */
export const size = { width: 1200, height: 630 };

/** OGP 画像の形式。 */
export const contentType = "image/png";

/** 地図の左に出す、地図で選べる単位の説明。語の途中で折り返さないよう、行ごとに分けて持つ。 */
const mapCaptionLines = ["区市町村と町丁を", "地図で選んで比べる"];

/** 地図を描く枠の大きさ (px)。島しょ部を除いた東京都は東西が南北の約 2 倍のため、2 : 1 にする。 */
const mapFrame = { width: 680, height: 340 };

// 地図に描く区市町村の頂点を間引く間隔 (px)。これより近い頂点は縮小した地図で見分けられず、SVG を大きくするだけのため
const vertexMinDistancePx = 1.5;

// アプリで選んだエリアの見え方を示すため、塗って描く区市町村 (全国地方公共団体コードの上 5 桁)。
// 23 区・多摩の市部・東部の区から 1 つずつ選んだ例で、特定の区市町村を推す意図は無い
const highlightedMunicipalityCodes = ["13112", "13204", "13108"];

/**
 * 全ページ共通の OGP 画像 (1200 × 630 の PNG)。サービス名・一言の説明と、島しょ部を除いた東京都の区市町村の地図を描く。
 * ビルド時に境界データ (public/data/boundaries/) を読み、日本語の文字の形を Google Fonts から取得する。取得に失敗した時はビルドを失敗させる。
 */
export default async function OpenGraphImage() {
  const municipalities: BoundaryFeatureCollection<MunicipalityProperties> = JSON.parse(
    await readFile(path.join(process.cwd(), "public", municipalityBoundaryUrl), "utf8"),
  );
  // OGP 画像は SNS のカードなどで出典ページへのリンクなしに単体で表示されるため、地図の下に境界データの出典表示の全文を書く。
  // 文言は境界データが持つ出典表示の HTML からタグ (提供元へのリンク) を除いて使う
  const mapAttribution = municipalities.source.attribution.replace(/<[^>]+>/g, "");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "44px 64px 32px",
        background: "#ffffff",
        color: "#1e3a8a",
        fontFamily: "Noto Sans JP",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 44, color: "#2563eb" }}>{siteName}</div>
        <div style={{ fontSize: 62, lineHeight: 1.3 }}>{siteCatchphrase}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 30, lineHeight: 1.5, color: "#334155", marginBottom: 16 }}>
          {mapCaptionLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <svg width={mapFrame.width} height={mapFrame.height} viewBox={`0 0 ${mapFrame.width} ${mapFrame.height}`}>
          {municipalities.features.map((feature) => (
            <path
              key={feature.properties.code}
              d={municipalityPath(feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates)}
              fill={highlightedMunicipalityCodes.includes(feature.properties.code) ? "#93b4f5" : "#eef3fe"}
              stroke="#1e3a8a"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
      <div style={{ fontSize: 16, color: "#475569", justifyContent: "flex-end" }}>{mapAttribution}</div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Noto Sans JP",
          data: await fetchNotoSansJapaneseBold(`${siteName}${siteCatchphrase}${mapCaptionLines.join("")}${mapAttribution}`),
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}

/**
 * 区市町村の polygons (GeoJSON の MultiPolygon の座標) を、mapFrame に収めた SVG の path の d 属性にして返す。
 * 島しょ部のポリゴン (外周の最初の頂点が tokyoMainlandBounds の外にあるもの) は描かない。
 */
function municipalityPath(polygons: Position[][][]): string {
  const [[west, south], [east, north]] = tokyoMainlandBounds;
  // 経度 1 度の長さは緯度 1 度の cos(緯度) 倍のため、範囲の中央の緯度で東西を縮めて形をゆがめない
  const longitudeScale = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const pixelsPerDegree = Math.min(mapFrame.width / ((east - west) * longitudeScale), mapFrame.height / (north - south));
  const toPixel = ([longitude, latitude]: Position): [number, number] => [
    (longitude - west) * longitudeScale * pixelsPerDegree,
    (north - latitude) * pixelsPerDegree,
  ];
  return polygons
    .filter(([[[longitude, latitude]]]) => longitude >= west && longitude <= east && latitude >= south && latitude <= north)
    .flatMap((rings) =>
      rings.map((ring) => {
        const points = ring.map(toPixel).reduce<[number, number][]>((keptPoints, point) => {
          const lastKeptPoint = keptPoints.at(-1);
          if (!lastKeptPoint || Math.hypot(point[0] - lastKeptPoint[0], point[1] - lastKeptPoint[1]) >= vertexMinDistancePx) {
            keptPoints.push(point);
          }
          return keptPoints;
        }, []);
        return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
      }),
    )
    .join("");
}

/**
 * Noto Sans JP の太字のうち、text に含まれる文字だけの TrueType のフォントを Google Fonts から取得して返す。
 * next/og の既定のフォントは日本語の文字を持たないため、画像に描く文字の分だけを取る。取得できない時は例外にする。
 */
async function fetchNotoSansJapaneseBold(text: string): Promise<ArrayBuffer> {
  const cssResponse = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`,
  );
  if (!cssResponse.ok) {
    throw new Error(`Google Fonts の CSS を取得できませんでした: HTTP ${cssResponse.status}`);
  }
  const fontUrl = (await cssResponse.text()).match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!fontUrl) {
    throw new Error("Google Fonts の CSS に TrueType・OpenType のフォントの URL がありません");
  }
  const fontResponse = await fetch(fontUrl);
  if (!fontResponse.ok) {
    throw new Error(`Google Fonts のフォントを取得できませんでした: HTTP ${fontResponse.status}`);
  }
  return fontResponse.arrayBuffer();
}
