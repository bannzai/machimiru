import { openPoiAttributionUrl, openPoiSearchEndpoint } from "../openPoi";
import type { DataSource } from "./schema";

const pdl1 = {
  license: "公共データ利用規約（第1.0版）（PDL1.0。CC BY 4.0 と互換）",
  licenseUrl: "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
};

const ccBy4 = {
  license: "クリエイティブ・コモンズ・ライセンス 表示 4.0 国際（CC BY 4.0）",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
};

/**
 * 東京都の子育てデータの生成に使う外部データの提供元。
 * URL を新しい版に替えた時は `retrievedOn` と `asOf` を更新し、`documents/PROJECT.md`「データの出典」も揃える。
 */
export const tokyoDataSources = {
  kosodateRegistry: {
    id: "tokyo-kosodate-registry",
    title: "東京デジタル2030ビジョン（こどもDX）子育て支援制度レジストリ（0-6歳制度）",
    provider: "東京都・GovTech東京",
    pageUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000029d0000000034",
    fileUrls: ["https://data.storage.data.metro.tokyo.lg.jp/digitalservice/130001_kosodateshienseido_tokyo.json"],
    // カタログのリソース名「0-6歳制度_2025年8月20日時点」による
    asOf: "2025-08-20",
    retrievedOn: "2026-10-04",
    ...ccBy4,
    // レジストリ README「5. 利用に関する留意事項」の記載例に従う
    attribution:
      "このページの子育て支援制度の情報は、以下の著作物を改変して利用しています。東京デジタル2030ビジョン（こどもDX）子育て支援制度レジストリ、東京都・GovTech東京、クリエイティブ・コモンズ・ライセンス 表示4.0 国際。各制度は、必ず各自治体の公式サイトをご確認のうえ申請・問い合わせをお願いします。",
  },
  childcareStatus: {
    id: "cfa-hoiku-torimatome-r8",
    title: "保育所等関連状況取りまとめ（令和8年4月1日）（参考）申込者の状況",
    provider: "こども家庭庁",
    pageUrl: "https://www.cfa.go.jp/policies/hoiku/torimatome/r8",
    fileUrls: [
      "https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/68234dca-5d01-4ec2-ac2f-86f598c55b5c/3e3cd95a/20260826_%20policies_hoiku_torimatome_r%EF%BC%98_02.xlsx",
    ],
    asOf: "2026-04-01",
    retrievedOn: "2026-10-04",
    ...pdl1,
    attribution:
      "「保育所等関連状況取りまとめ（令和8年4月1日）」（こども家庭庁）（https://www.cfa.go.jp/policies/hoiku/torimatome/r8）を加工して作成",
  },
  medicalSubsidy: {
    id: "cfa-kodomo-iryouhi-r7",
    title: "こどもに係る医療費の助成についての調査（令和7年度）別紙3 こども医療費に対する助成の実施状況調査（市区町村用）",
    provider: "こども家庭庁",
    pageUrl: "https://www.cfa.go.jp/policies/boshihoken/kodomoiryouhityousa-r7/",
    fileUrls: [
      "https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/6a9b8926-411c-4044-81aa-d8c26b21aaf5/12ae0d40/20251224policies-boshihoken-kodomoiryouhityousa-r7-03.pdf",
    ],
    asOf: "2025-04-01",
    retrievedOn: "2026-10-04",
    ...pdl1,
    attribution:
      "「こどもに係る医療費の助成についての調査（令和7年度）」（こども家庭庁）（https://www.cfa.go.jp/policies/boshihoken/kodomoiryouhityousa-r7/）を加工して作成",
  },
  medicalFacilities: {
    id: "mhlw-iryou-joho-net-20260601",
    title: "医療情報ネットのオープンデータ（2026年6月1日時点）病院・診療所の施設票と診療科・診療時間票",
    provider: "厚生労働省",
    pageUrl: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/newpage_43373.html",
    fileUrls: [
      "https://www.mhlw.go.jp/content/11121000/01-1_hospital_facility_info_20260601.csv.zip",
      "https://www.mhlw.go.jp/content/11121000/01-2_hospital_speciality_hours_20260601.csv.zip",
      "https://www.mhlw.go.jp/content/11121000/02-1_clinic_facility_info_20260601.csv.zip",
      "https://www.mhlw.go.jp/content/11121000/02-2_clinic_speciality_hours_20260601.csv.zip",
    ],
    asOf: "2026-06-01",
    retrievedOn: "2026-10-04",
    ...pdl1,
    attribution:
      "「医療情報ネットのオープンデータ」（厚生労働省）（https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/newpage_43373.html）を加工して作成",
  },
  welfareFacilities: {
    id: "ksj-p14-2023",
    title: "国土数値情報（福祉施設データ）2023年度（令和5年度）東京都",
    provider: "国土交通省",
    pageUrl: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P14-2023.html",
    fileUrls: ["https://nlftp.mlit.go.jp/ksj/gml/data/P14/P14-23/P14-23_13_GML.zip"],
    // 提供元はデータ基準年度 (2023年度) だけを示し、基準日を示していないため
    asOf: null,
    retrievedOn: "2026-10-04",
    ...ccBy4,
    attribution:
      "「国土数値情報（福祉施設データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P14-2023.html）を加工して作成",
  },
  // `make data-openpoi` (scripts/data/openpoi/generate.ts) が使う。検索し直す時は retrievedOn を検索する日に替えてから実行する
  openPoi: {
    id: "openpoi-api-search",
    title: "OpenPOI API 施設の検索 (/v1/search)",
    provider: "OpenPOI API",
    pageUrl: "https://docs.openpoiapi.com/",
    fileUrls: [openPoiSearchEndpoint],
    // API は検索した時点のデータを返し、データの基準日を示していないため
    asOf: null,
    retrievedOn: "2026-10-05",
    // ライセンスは施設のレコードごとに違い、各レコードの licenses に持つ。本文と NOTICE は public/data/tokyo/openpoi/LICENSES.txt から辿る
    license: "施設ごとに異なる (CDLA-Permissive-2.0・Apache-2.0・CC BY 4.0・PDL1.0。各レコードの licenses)",
    licenseUrl: openPoiAttributionUrl,
    attribution: "OpenPOI API の施設の検索結果を加工して作成 (施設ごとの出典表示は各レコードの attributions)",
  },
} satisfies Record<string, DataSource>;
