import type { DataSource } from "@/lib/tokyoData/schema";

/** 外部データ source の出典表示。CC BY 4.0・PDL1.0 が求める原資料とライセンスへの参照として、データのページとライセンス本文へリンクする。 */
export function DataSourceAttribution({ source }: { source: DataSource }) {
  return (
    <>
      {source.attribution} (
      <a href={source.pageUrl} target="_blank" rel="noopener noreferrer">
        データのページ
      </a>
      ・
      <a href={source.licenseUrl} target="_blank" rel="noopener noreferrer">
        {source.license}
      </a>
      )
    </>
  );
}
