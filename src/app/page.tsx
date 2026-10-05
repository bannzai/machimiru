import Link from "next/link";
import { contactEmail, siteCatchphrase, siteJsonLd, siteName } from "@/lib/site";
import { readConditionValues, readMunicipalitiesFile } from "@/lib/tokyoData/load";
import { AreaMap } from "./AreaMap";

// 区市町村の指標のファイルをビルド時に読むため、実行時にファイルを読む動的な描画にしない
export const dynamic = "force-static";

/**
 * トップページ。東京都の地図でエリアを選ぶ画面と区市町村ごとの子育てのしやすさ、
 * その下にサービスの紹介・使い方・問い合わせ先・出典と法務ページへの導線を出す。
 */
export default function TopPage() {
  const municipalitiesFile = readMunicipalitiesFile();
  return (
    <main className="map-page">
      {/* JSON の中の < で script 要素が閉じないよう、Next.js のドキュメントの推奨どおり < に置き換える */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd).replace(/</g, "\\u003c") }}
      />
      <header className="map-page-header">
        <h1>{siteName}</h1>
        <p>{siteCatchphrase}</p>
      </header>
      <AreaMap
        municipalitiesFile={municipalitiesFile}
        conditionValues={readConditionValues(municipalitiesFile.municipalities)}
      />
      <div className="top-introduction">
        <section aria-labelledby="about-heading">
          <h2 id="about-heading">土地勘がなくても子育てしやすい街を比べる</h2>
          <p>
            遠くから東京へ引っ越す子育て世帯は、住む街を選ぶ時に土地勘がありません。保育園や小児科がどこにあるか、区市町村の子育て支援がどう違うかを、エリアをまたいで見比べる手段も多くありません。
          </p>
          <p>
            {siteName}
            は、気になる区市町村や町丁を地図で選び、子育てに必要な情報をエリアごとに集めて見比べるためのサービスです。住む街の候補を地図の上で絞り込めます。
          </p>
        </section>
        <section aria-labelledby="usage-heading">
          <h2 id="usage-heading">使い方</h2>
          <ol>
            <li>探している暮らしを文章で入れると子育てなどの軸と条件に分かれる</li>
            <li>地図で気になる区市町村をタップして選ぶ</li>
            <li>軸のタブを切り替えて選んだ街が条件に合うかをくらべる</li>
            <li>地図を拡大すると町丁の単位で選べる</li>
            <li>選んだエリアはこのブラウザに保存され次に開いた時も残る</li>
            <li>地図の色と一覧で区市町村ごとの子育てのしやすさを比べ区市町村名から指標と子育て支援制度を見る</li>
          </ol>
        </section>
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading">準備中の機能</h2>
          <ul>
            <li>保育所・小児科・産婦人科など子育て施設の表示</li>
            <li>キーワードで探した施設を地図に重ねる表示</li>
          </ul>
        </section>
        <section aria-labelledby="support-heading">
          <h2 id="support-heading">サポート・お問い合わせ</h2>
          <p>
            ご質問・不具合のご連絡は <a href={`mailto:${contactEmail}`}>{contactEmail}</a> までお送りください。
          </p>
        </section>
      </div>
      <footer className="map-page-footer">
        <nav aria-label="このサイトについて">
          <ul>
            <li>
              <Link href="/sources/">データの出典</Link>
            </li>
            <li>
              <Link href="/terms/">利用規約</Link>
            </li>
            <li>
              <Link href="/privacy/">プライバシーポリシー</Link>
            </li>
          </ul>
        </nav>
      </footer>
    </main>
  );
}
