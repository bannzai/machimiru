import { z } from "zod";

/**
 * 外部データの提供元 1 件の出典とライセンス。
 * `.claude/rules/external-data-attribution.md` に従い、データファイルの中にレコードと一緒に保存する。
 */
export const dataSourceSchema = z.object({
  /** データファイルのレコードが `sourceId` で参照する識別子。 */
  id: z.string().min(1),
  /** データの名称。 */
  title: z.string().min(1),
  /** 提供元の組織名。 */
  provider: z.string().min(1),
  /** データを公開しているページの URL。 */
  pageUrl: z.url(),
  /** 生成スクリプトが取得したファイルの URL。 */
  fileUrls: z.array(z.url()).min(1),
  /** データの基準日 (YYYY-MM-DD)。提供元が示していない場合は null。 */
  asOf: z.iso.date().nullable(),
  /** ファイルを取得し、利用条件を一次情報で確認した日 (YYYY-MM-DD)。 */
  retrievedOn: z.iso.date(),
  /** ライセンスの名称。 */
  license: z.string().min(1),
  /** ライセンス本文の URL。 */
  licenseUrl: z.url(),
  /** 画面に表示する出典の文言。加工して使うため「加工して作成」まで含める。 */
  attribution: z.string().min(1),
});

/** 外部データの提供元 1 件の出典とライセンス。 */
export type DataSource = z.infer<typeof dataSourceSchema>;

/**
 * 全国地方公共団体コード (6 桁。末尾は検査数字)。
 * 検査数字の計算は総務省「全国地方公共団体コード仕様」11 検査数字 ( https://www.soumu.go.jp/main_content/000137948.pdf ) に従う。
 */
export const localGovernmentCodeSchema = z
  .string()
  .regex(/^\d{6}$/)
  .refine((code) => localGovernmentCheckDigit(code.slice(0, 5)) === Number(code[5]), "検査数字が合わない");

/** 5 桁の団体コードから、全国地方公共団体コードの検査数字を返す。 */
export function localGovernmentCheckDigit(code5: string): number {
  return (11 - ([...code5].reduce((sum, digit, index) => sum + Number(digit) * (6 - index), 0) % 11)) % 10;
}

/** 区市町村ごとの保育所等の利用状況 (こども家庭庁「保育所等関連状況取りまとめ」の申込者の状況)。 */
export const childcareSchema = z.object({
  sourceId: z.string().min(1),
  /** 保育所等の利用の申込者数。 */
  applicantCount: z.int().nonnegative(),
  /** 申込者のうち、保育所・認定こども園・地域型保育事業・企業主導型保育事業・地方単独事業等を利用している児童数の合計。 */
  enrolledCount: z.int().nonnegative(),
  /** 待機児童数。 */
  waitingChildrenCount: z.int().nonnegative(),
});

/** 区市町村の子ども医療費助成の実施状況 (こども家庭庁「こどもに係る医療費の助成についての調査」別紙 3)。 */
export const medicalSubsidySchema = z.object({
  sourceId: z.string().min(1),
  /** 通院の助成の対象年齢の上限 (その年齢の年度末まで)。 */
  outpatientMaxAgeAtFiscalYearEnd: z.int().positive(),
  /** 入院の助成の対象年齢の上限 (その年齢の年度末まで)。 */
  inpatientMaxAgeAtFiscalYearEnd: z.int().positive(),
  /** 通院の助成に所得制限があるか。 */
  outpatientHasIncomeLimit: z.boolean(),
  /** 入院の助成に所得制限があるか。 */
  inpatientHasIncomeLimit: z.boolean(),
  /** 通院に一部自己負担があるか。 */
  outpatientHasCopayment: z.boolean(),
  /** 入院に一部自己負担があるか。 */
  inpatientHasCopayment: z.boolean(),
});

/** 区市町村の指標のうち、値を持てる項目の名前。 */
export const municipalityIndicatorFieldSchema = z.enum(["childcare", "childcareUsageRate", "medicalSubsidy"]);

/** 区市町村の指標のうち、値を持てる項目の名前。 */
export type MunicipalityIndicatorField = z.infer<typeof municipalityIndicatorFieldSchema>;

/** 取得できなかった指標と、その理由。 */
export const missingIndicatorSchema = z.object({
  field: municipalityIndicatorFieldSchema,
  reason: z.string().min(1),
});

/** 区市町村 1 件の指標。取得できなかった項目は null にし、`missing` に理由を書く (0 や空文字で埋めない)。 */
export const municipalitySchema = z.object({
  code: localGovernmentCodeSchema,
  name: z.string().min(1),
  childcare: childcareSchema.nullable(),
  /** 保育サービスの利用率 (利用児童数 / 就学前児童人口)。使える出典が無く、現在はすべて null。 */
  childcareUsageRate: z.number().min(0).max(1).nullable(),
  medicalSubsidy: medicalSubsidySchema.nullable(),
  /** 子育て支援制度レジストリに載っている、この区市町村の制度の件数。 */
  programCount: z.int().nonnegative(),
  missing: z.array(missingIndicatorSchema),
});

/** 区市町村 1 件の指標。 */
export type Municipality = z.infer<typeof municipalitySchema>;

/** `public/data/tokyo/municipalities.json` の形式。 */
export const municipalitiesFileSchema = z.object({
  sources: z.array(dataSourceSchema).min(1),
  municipalities: z.array(municipalitySchema),
});

/** `public/data/tokyo/municipalities.json` の中身。 */
export type MunicipalitiesFile = z.infer<typeof municipalitiesFileSchema>;

/** 子育て支援制度レジストリのカテゴリーコード (README「3. タグについて」CSC_個人向けカテゴリー) と名称。 */
export const programCategoryNames = {
  "000": "未分類",
  "001": "住民向け情報",
  "002": "妊娠・出産",
  "003": "子育て",
  "004": "保育",
  "005": "学校教育",
  "006": "結婚・離婚",
  "007": "引越し・住まい",
  "008": "就職・退職",
  "009": "高齢者支援",
  "010": "在宅介護",
  "011": "施設介護",
  "012": "ご不幸",
  "013": "戸籍・住民票・印鑑登録等",
  "014": "税",
  "015": "国民健康保険",
  "016": "国民年金",
  "017": "水道・ガス・電気",
  "018": "交通",
  "019": "駐輪・駐車",
  "020": "都市計画",
  "021": "ごみ・環境保全",
  "022": "食品・衛生",
  "023": "ペット・動物",
  "024": "生活困窮者支援",
  "025": "障がい者支援",
  "026": "消費生活",
  "027": "健康・医療",
  "028": "文化・スポーツ・生涯学習",
  "029": "市民活動・コミュニティ",
  "030": "防災・災害",
  "031": "防犯・犯罪",
  "032": "救急・消防",
} as const;

/** 子育て支援制度レジストリのカテゴリーコード。 */
export type ProgramCategoryCode = keyof typeof programCategoryNames;

/** 制度のページの URL。`javascript:` 等のリンクを画面に出さないため、スキームを http(s) に限る。 */
export const programUrlSchema = z.url({ protocol: /^https?$/ });

/** 子育て支援制度レジストリの制度 1 件。 */
export const programSchema = z.object({
  /** UM 普及協会が定める publicserviceID。 */
  psid: z.string().min(1),
  /** 制度の正式名称。 */
  name: z.string().min(1),
  /** 自治体の Web サイトでの制度の通称。 */
  shortName: z.string().min(1).nullable(),
  /** 制度の概要。 */
  summary: z.string().min(1).nullable(),
  /** 対象者の説明。 */
  targetPersons: z.string().min(1).nullable(),
  /** 分野 (カテゴリーコード)。 */
  categories: z.array(z.enum(Object.keys(programCategoryNames) as [ProgramCategoryCode, ...ProgramCategoryCode[]])),
  /** 自治体の制度のページの URL。画面にリンクとして出すため http(s) に限る。 */
  url: programUrlSchema.nullable(),
});

/** `public/data/tokyo/programs/<全国地方公共団体コード>.json` の形式。 */
export const programsFileSchema = z.object({
  sources: z.array(dataSourceSchema).min(1),
  municipalityCode: localGovernmentCodeSchema,
  programs: z.array(programSchema.extend({ sourceId: z.string().min(1) })),
});

/** 施設の種類。 */
export const facilityKindSchema = z.enum(["pediatrics", "obstetrics", "nursery", "certifiedChildcareCenter"]);

/** 施設の種類。 */
export type FacilityKind = z.infer<typeof facilityKindSchema>;

/** 施設の種類の表示名。 */
export const facilityKindNames: Record<FacilityKind, string> = {
  pediatrics: "小児科",
  obstetrics: "産婦人科・産科",
  nursery: "保育所",
  certifiedChildcareCenter: "認定こども園",
};

/** 施設 1 件 (GeoJSON の Feature)。小児科と産婦人科の両方を持つ医療機関は、種類ごとに別の Feature にする。 */
export const facilityFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    /** [経度, 緯度] (世界測地系 JGD2011)。 */
    coordinates: z.tuple([z.number().min(136).max(154), z.number().min(20).max(36)]),
  }),
  properties: z.object({
    sourceId: z.string().min(1),
    /** 提供元のデータでの施設の識別子。 */
    facilityId: z.string().min(1),
    kind: facilityKindSchema,
    name: z.string().min(1),
    address: z.string().min(1),
    municipalityCode: localGovernmentCodeSchema,
    /**
     * 位置の正確さ (国土数値情報の位置正確度コード)。1 は位置を特定、2〜5 は小字・町丁目・区市町村・都道府県の代表点。
     * 医療情報ネットは座標の正確さを示さないため null。
     */
    positionAccuracy: z.int().min(1).max(5).nullable(),
  }),
});

/** `public/data/tokyo/facilities.geojson` の形式。 */
export const facilitiesFileSchema = z.object({
  type: z.literal("FeatureCollection"),
  sources: z.array(dataSourceSchema).min(1),
  features: z.array(facilityFeatureSchema),
});

/** `public/data/tokyo/facilities.geojson` の中身。 */
export type FacilitiesFile = z.infer<typeof facilitiesFileSchema>;

/** `public/data/tokyo/facilities.geojson` を配信する URL。 */
export const facilitiesFileUrl = "/data/tokyo/facilities.geojson";
