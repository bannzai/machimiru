import Link from "next/link";
import { contactEmail, siteDescription, siteName } from "@/lib/site";
import { readMunicipalitiesFile } from "@/lib/tokyoData/load";
import { AreaMap } from "./AreaMap";

// 区市町村の指標のファイルをビルド時に読むため、実行時にファイルを読む動的な描画にしない
export const dynamic = "force-static";

/** トップページ。東京都の地図でエリアを選ぶ画面と区市町村ごとの子育てのしやすさ、法務ページ・問い合わせ先への導線を出す。 */
export default function TopPage() {
  return (
    <main className="map-page">
      <header className="map-page-header">
        <h1>{siteName}</h1>
        <p>{siteDescription}</p>
      </header>
      <AreaMap municipalitiesFile={readMunicipalitiesFile()} />
      <footer className="map-page-footer">
        <nav aria-label="このサイトについて">
          <ul>
            <li>
              <Link href="/terms/">利用規約</Link>
            </li>
            <li>
              <Link href="/privacy/">プライバシーポリシー</Link>
            </li>
            <li>
              お問い合わせ: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </li>
          </ul>
        </nav>
      </footer>
    </main>
  );
}
