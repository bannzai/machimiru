// 東京都の境界データ (区市町村・町丁) を公開データから生成し、public/data/boundaries/ に書き出す。
// 実行: make boundaries。出力の形式は documents/PROJECT.md「境界データ」。
// 取得日 (source.retrievedAt) を除き、同じ入力からは同じ出力になるため、何度実行してもよい。
import type { BoundarySource } from "../src/lib/boundaries";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 1 つの境界データの入手先と、mapshaper で整形する手順。 */
type BoundaryDataset = {
  /** 出力ファイル名 (public/data/boundaries/ 配下)。 */
  outputFileName: string;
  /** 取得するファイルの URL と出典表示。retrievedAt は実行日を入れる。 */
  source: Omit<BoundarySource, "retrievedAt">;
  /** 展開した zip の中で読むファイル名。 */
  inputFileName: string;
  /** 入力ファイル名の直後に付ける mapshaper の読み込みオプション。 */
  inputOptions: string[];
  /** 入力ファイルの後ろに付ける mapshaper のコマンド (出力の -o を除く)。 */
  mapshaperCommands: string[];
};

/** 取得した zip と展開したファイル、mapshaper の出力を置く作業用のディレクトリ (git の管理外)。 */
const workDirectory = "tmp/boundaries";
/** 配信する境界データを書き出すディレクトリ。 */
const outputDirectory = "public/data/boundaries";

// 簡略化の結果は mapshaper の版で変わるため、版を固定して再生成で差分が出ないようにする
const mapshaperPackage = "mapshaper@0.7.72";

// 町丁を選ぶズーム (14 前後) で 1 px が 10 m 前後になり、15 m 以下の頂点を落としても境界の見た目が変わらないため。
// 町丁のファイルは 4 MB 程度 (gzip で 0.7 MB) に収まる
const simplifyIntervalMeters = 15;

// 経度・緯度の小数 5 桁 (約 1 m)。簡略化の間隔より十分細かく、それ以上の桁はファイルを大きくするだけのため
const coordinatePrecision = 0.00001;

/** 生成する境界データ (区市町村・町丁)。 */
const datasets: BoundaryDataset[] = [
  {
    outputFileName: "tokyo-municipalities.geojson",
    source: {
      name: "国土数値情報 行政区域データ (N03) 2026 年 東京都",
      provider: "国土交通省",
      license: "CC BY 4.0",
      licenseUrl: "https://nlftp.mlit.go.jp/ksj/other/agreement.html",
      pageUrl: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html",
      downloadUrl: "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_13_GML.zip",
      attribution:
        '出典: <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html">国土交通省国土数値情報ダウンロードサイト</a>「国土数値情報（行政区域データ）」をもとに machimiru 作成',
    },
    inputFileName: "N03-20260101_13.shp",
    // dbf の文字コードは同梱の cpg (UTF-8) から読む
    inputOptions: [],
    mapshaperCommands: [
      // 所属未定地 (境界が確定していない区域) は選べるエリアにしない
      "-filter",
      "N03_004 !== '所属未定地'",
      "-each",
      "code = N03_007, name = N03_004",
      // 島しょ部などは 1 つの区市町村が複数のポリゴンに分かれているため、区市町村ごとに 1 つにする
      "-dissolve",
      "fields=code,name",
    ],
  },
  {
    outputFileName: "tokyo-towns.geojson",
    source: {
      name: "令和 2 年国勢調査 小地域 (町丁・字等) 境界データ 東京都",
      provider: "総務省統計局 (政府統計の総合窓口 e-Stat)",
      license: "政府統計の総合窓口 (e-Stat) 利用規約",
      licenseUrl: "https://www.e-stat.go.jp/terms-of-use",
      pageUrl:
        "https://www.e-stat.go.jp/gis/statmap-search?page=1&type=2&aggregateUnitForBoundary=A&toukeiCode=00200521&toukeiYear=2020&serveyId=A002005212020&prefCode=13&coordsys=1&format=shape&datum=2011",
      downloadUrl:
        "https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code=13&coordSys=1&format=shape&downloadType=5&datum=2011",
      attribution:
        '出典: <a href="https://www.e-stat.go.jp/">政府統計の総合窓口(e-Stat)</a>「令和2年国勢調査 小地域（町丁・字等）境界データ」（総務省統計局）を加工して作成',
    },
    inputFileName: "r2ka13.shp",
    // dbf は Shift_JIS で、文字コードを示す cpg が同梱されていない
    inputOptions: ["encoding=shift_jis"],
    mapshaperCommands: [
      // HCODE 8101 が町丁・字等。8154 (水面調査区) と名前の無い区域は選べるエリアにしない
      "-filter",
      "HCODE === 8101 && S_NAME !== ''",
      "-each",
      "municipalityCode = PREF + CITY, code = PREF + CITY + S_AREA, name = S_NAME",
      // 同じ町丁が飛び地などで複数の小地域に分かれているため、区市町村と町丁名が同じものを 1 つにする
      "-dissolve",
      "fields=municipalityCode,name",
      "copy-fields=code",
    ],
  },
];

/** url のファイルを filePath に保存する。既に filePath があれば取得しない。 */
async function download(url: string, filePath: string) {
  if (existsSync(filePath)) {
    return;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} の取得に失敗した: HTTP ${response.status}`);
  }
  // 書き込みの途中で止まった不完全な zip を取得済みとみなさないよう、別名に書き終えてから filePath に移す
  const partialFilePath = `${filePath}.partial`;
  writeFileSync(partialFilePath, Buffer.from(await response.arrayBuffer()));
  renameSync(partialFilePath, filePath);
}

/** dataset を取得・整形して outputDirectory に書き出す。 */
async function generate(dataset: BoundaryDataset, retrievedAt: string) {
  const datasetDirectory = path.join(workDirectory, path.parse(dataset.outputFileName).name);
  mkdirSync(datasetDirectory, { recursive: true });
  const zipPath = path.join(datasetDirectory, "source.zip");
  await download(dataset.source.downloadUrl, zipPath);
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", datasetDirectory], { stdio: "inherit" });

  const mapshaperOutputPath = path.join(datasetDirectory, dataset.outputFileName);
  execFileSync(
    "npx",
    [
      "--yes",
      mapshaperPackage,
      path.join(datasetDirectory, dataset.inputFileName),
      ...dataset.inputOptions,
      ...dataset.mapshaperCommands,
      "-simplify",
      `interval=${simplifyIntervalMeters}`,
      "keep-shapes",
      "-o",
      mapshaperOutputPath,
      "format=geojson",
      `precision=${coordinatePrecision}`,
      "force",
    ],
    { stdio: "inherit" },
  );

  const featureCollection = JSON.parse(readFileSync(mapshaperOutputPath, "utf8"));
  featureCollection.features.sort((a: { properties: { code: string } }, b: { properties: { code: string } }) =>
    a.properties.code.localeCompare(b.properties.code),
  );
  const source: BoundarySource = { ...dataset.source, retrievedAt };
  writeFileSync(
    path.join(outputDirectory, dataset.outputFileName),
    `${JSON.stringify({ type: "FeatureCollection", source, features: featureCollection.features })}\n`,
  );
}

mkdirSync(outputDirectory, { recursive: true });
const retrievedAt = new Date().toISOString().slice(0, 10);
for (const dataset of datasets) {
  await generate(dataset, retrievedAt);
}
