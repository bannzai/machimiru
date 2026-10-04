import type { Metadata } from "next";
import Link from "next/link";
import { renderDataSources } from "@/lib/dataSources";
import { siteName } from "@/lib/site";

// 出典の表をビルド時に読むため、実行時にファイルを読む動的な描画にしない
export const dynamic = "force-static";

/** 出典ページのタイトルと説明文。 */
export const metadata: Metadata = {
  title: `データの出典 | ${siteName}`,
  description: `${siteName} が地図と情報の表示に使う外部データの提供元とライセンス`,
};

/** 出典ページ。外部データの提供元・ライセンス・出典表示の全文を出す。地図の上の出典表示はここへのリンクにしている。 */
export default async function SourcesPage() {
  return (
    <main>
      <h1>データの出典</h1>
      <p>
        {siteName}
        が地図と情報の表示に使う外部データの提供元とライセンスです。地図の上には短い表記を出し、出典表示の全文はこのページに載せています。準備中の機能で使う予定のデータと、調べた結果使わないことにしたデータも含みます。
      </p>
      <div className="data-sources" dangerouslySetInnerHTML={{ __html: await renderDataSources() }} />
      <p>
        <Link href="/">トップページへ戻る</Link>
      </p>
    </main>
  );
}
