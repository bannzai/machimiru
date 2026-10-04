# machimiru の要件とインフラ構成

仮説・判定基準・必要な機能の一覧・決めたことは `documents/DIRECTION.md` を正とする。本書は、機能を実装する時の前提 (データの入手先・外部サービス・制約) を持つ。調査は 2026-10-04 に行い、起票元は https://github.com/bannzai/IdeaMemo/issues/351 。

## 対象

- 利用者: 遠方から東京への引っ越しを検討している子育て世帯
- 対象地域: 東京都 (62 区市町村)。全国への拡張は MVP に含めない
- 形態: Web (Next.js + MapLibre GL JS)。iOS は Web の公開後に SwiftUI の殻 + WebView で追加する

## インフラ構成

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| ホスティング | Cloudflare Workers (`@opennextjs/cloudflare`) | チャットの判定でサーバー側に API キーを置く必要があり、静的書き出しでは足りない。Workers の無料枠 (1 日 100,000 リクエスト) で始められる。Vercel Hobby は商用 (アフィリエイト・広告) を禁じる |
| ドメイン | workers.dev のサブドメイン | ドメインの取得は費用が発生するため、取るかは bannzai が決める |
| DB | 持たない | アカウント・保存機能が無い。選択中のエリアと条件はブラウザのストレージに置く |
| 静的データ | 境界・施設・施策のデータはビルド済みのファイルとして配信する。境界データは `public/data/boundaries/` の GeoJSON (「境界データ」)。施設・施策のデータの置き場所は実装時に決める | 更新頻度が年〜月単位で、実行時に書き込まない |
| 認証 | 持たない | アカウント機能が無い |
| Analytics | Cloudflare Web Analytics (手動 beacon。配信のビルドだけに token を渡す) と Google Search Console | 判定基準の計測元を `/cloudflare-web-analytics-report` と `/google-search-console-report` で読める形にする |
| 課金 | 持たない | 目的は本人が使う道具。送客 (アフィリエイト) を入れる場合は「広告」の表示が要る |
| 通知 | Slack の `#machimiru-notification` | 関門の投稿の要約と、公開後のアラートの宛先 |
| クラッシュ収集・GCP | 使わない | Firebase・GCP を使う機能が無い |

配信の設定 (wrangler・デプロイの workflow) は関門 3 の後に入れる。それまで main へのマージは配信を起こさない。

`content/legal/privacy.md` と `content/legal/terms.md` は MVP の設計を前提に書いてあり、実装より先行している。配信を有効にする変更では、両文書の送信先・送信する情報・保存の有無が実装と一致することを確認し、食い違いを直してから公開する。

## データの出典

外部データを足す時はこの表に行を足す (`.claude/rules/external-data-attribution.md`)。

| データ | 用途 | 提供元・入手先 | ライセンス・条件 |
| --- | --- | --- | --- |
| ベース地図 | 地図の表示 | OpenFreeMap ( https://openfreemap.org/ ) | 無料・API キー不要・商用可。出典表示「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」。SLA なし |
| 行政区域 (都道府県・市区町村) | エリアの階層選択 | 国土数値情報 行政区域 N03 ( https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html )。2026 年版の東京都を 2026-10-04 に取得 | CC BY 4.0。出典表示「出典: 国土交通省国土数値情報ダウンロードサイト「国土数値情報（行政区域データ）」をもとに machimiru 作成」(加工した時の書き方は https://nlftp.mlit.go.jp/ksj/other/agreement.html ) |
| 町丁・字の境界 | エリアの階層選択 | e-Stat 統計GIS 境界データ (令和 2 年国勢調査 小地域。東京都は 6,021 ポリゴン)。2026-10-04 に取得 | e-Stat 利用規約 ( https://www.e-stat.go.jp/terms-of-use )。商用可。出典表示「出典: 政府統計の総合窓口(e-Stat)「令和2年国勢調査 小地域（町丁・字等）境界データ」（総務省統計局）を加工して作成」。実際の行政界との一致は保証されない |
| 施設 (キーワード検索) | 施設マーキング | OpenPOI API ( https://docs.openpoiapi.com/ ) | 無料・API キー不要・商用可・保存可。出典として OpenPOI API を記載しライセンスページへリンクする。SLA なし・予告なく終了し得る |
| 診療所・病院 (診療科目つき) | 小児科・産婦人科の表示 | 医療情報ネットのオープンデータ (厚生労働省。 https://data.e-gov.go.jp/data/ja/dataset/iryou_teikyouseido_mhlw/resource/af88450b-049c-4deb-8dc9-327312d877e1 ) | CC BY |
| 福祉施設 (保育所を含む) | 保育所の表示 | 国土数値情報 福祉施設 P14 (2023 年度。 https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P14-2023.html ) | CC BY 4.0 (一部制限) |
| 子ども医療費助成 | 施策の色分け | こども家庭庁「こどもに係る医療費の助成についての調査」令和 7 年度 別紙 3 ( https://www.cfa.go.jp/policies/boshihoken/kodomoiryouhityousa-r7/ ) | 二次利用条件は未確認 (使う前に確認する) |
| 待機児童数・保育サービスの利用率 | 施策の色分け | 東京都「都内の保育サービスの状況について」表 4 ( https://www.metro.tokyo.lg.jp/information/press/2025/08/2025082917 ) | 二次利用条件は未確認 (使う前に確認する) |
| 子育て支援制度 | 施策の色分け | 東京都 子育て支援制度レジストリ ( https://www.metro.tokyo.lg.jp/information/press/2024/11/2024112807 ) | CC BY 4.0。出典「東京都・GovTech東京」。自治体が発信したように見せない |

## 境界データ

区市町村と町丁の境界は、`make boundaries` (`scripts/generate-boundaries.ts`) が国土数値情報 N03 と e-Stat の小地域境界を取得して作る。生成物はリポジトリに入れて配信し、CI とビルドは提供元へ取りに行かない。

- 更新する時は、スクリプトの入手先 URL を新しい版に替えて `make boundaries` を実行し、生成物の差分を commit する。取得した zip は `tmp/boundaries/` に取得元の URL と一緒に残り、同じ URL での再実行では取得し直さない (URL を替えると取り直す。同じ URL で取り直す時は `tmp/boundaries/` を消してから実行する)。取得日を除き、同じ入力からは同じ出力になる
- 形式は GeoJSON の FeatureCollection (経度・緯度、JGD2011)。feature は `code` の順に並ぶ。頂点は 15 m 間隔で簡略化し、座標は小数 5 桁に丸める
- 各ファイルは GeoJSON の foreign member `source` に提供元・ライセンス・出典表示の HTML (`attribution`)・取得日を持つ。画面の出典表示は、この `attribution` を MapLibre の attribution に渡して出す
- properties の型は `src/lib/boundaries.ts`。選択中のエリアは、この `code` を `src/lib/areaSelection.ts` の形式でブラウザの localStorage に保存する

| ファイル (配信する URL) | 中身 | properties |
| --- | --- | --- |
| `public/data/boundaries/tokyo-municipalities.geojson` (`/data/boundaries/tokyo-municipalities.geojson`) | 東京都の 62 区市町村。所属未定地を除き、島しょ部などで複数に分かれたポリゴンを区市町村ごとに 1 つにまとめる | `code` (全国地方公共団体コードの上 5 桁。例: 新宿区は `13104`)、`name` |
| `public/data/boundaries/tokyo-towns.geojson` (`/data/boundaries/tokyo-towns.geojson`) | 東京都の町丁 5,518 件。e-Stat の小地域 6,021 件から水面調査区と名前の無い区域を除き、区市町村と町丁名が同じ小地域 (飛び地など) を 1 つにまとめる | `code` (都道府県 2 桁 + 市区町村 3 桁 + 町丁 6 桁。まとめた町丁は、まとめた小地域のうち最初の 1 つの値)、`municipalityCode` (区市町村の `code`)、`name` |

## 実装の前提になる調査結果

- OpenPOI API の検索は施設名・住所の文字列検索で、種類で絞るパラメータが無い。三鷹市周辺の実測 (2026-10-04) で「小児科」7 件・「産婦人科」1 件・「こども園」0 件、「保育園」88 件の大半は給食施設の営業許可のデータだった。子育て施設を種類で出す機能は行政のオープンデータを使い、OpenPOI API は自由なキーワード検索に使う
- 東京都の 62 区市町村は、子ども医療費助成の対象年齢がすべて 18 歳年度末で差が無い。差があるのは通院の一部自己負担 (18 自治体) と所得制限 (4 市)。施策の色分けは待機児童数・保育サービスの利用率・制度レジストリと組み合わせる
- チャットの候補出しは、TypeSafe の判定モデル Jev ( https://docs.typesafe.ai/ ) を第一候補にする (入力 100 万トークンあたり $0.042)。公開サービスのサーバーから呼ぶ用途の可否と送信データの扱いはドキュメントに記載が無く未確認のため、実装の前に確認する。確認が取れるまで `content/legal/privacy.md` の「利用する外部サービス」に TypeSafe を載せておらず、チャットの候補出しを実装する時に、送信先と送信する情報を同じ表に足す

## 物件サイトとの関係

- SUUMO の利用規約は「商業目的で利用する行為」を、LIFULL HOME'S の利用規約は「営利を目的とする行為」と情報の第三者提供を禁じ、at home は無断の複製・転載を禁じる (2026-10-04 に各規約を確認)。物件データの公式 API は見つからなかった。このため物件データを取得・保存・転載しない
- 物件の絞り込みは、選んだ市区町村と条件を各サイトの検索結果 URL に変換して開く。SUUMO は `https://suumo.jp/jj/chintai/ichiran/FR301FC001/` に市区町村コード `sc` (全国地方公共団体コード 5 桁。複数指定可)・家賃上限 `ct`・面積下限 `mb` を渡す形が動いた (2026-10-04 の実測で三鷹市・15 万円以下・50m2 以上が 843 件)。リンクが各社規約の「商業目的」に当たるかは各社の判断で、確定していない
- 宅地建物取引業法 2 条 2 号は、貸借の代理・媒介を業として行うことを宅地建物取引業と定める。免許を持たないため、物件の説明・交渉・契約の取り次ぎを行う機能を作らない
- アフィリエイトのリンクを置く場合は、「広告」「PR」等の表示を付ける (消費者庁のステルスマーケティング告示の運用基準)
