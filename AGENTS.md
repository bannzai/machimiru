# AGENTS.md

地図とチャットで、住みたいエリアや物件周辺の暮らしに必要な情報を集めて提示する Web サービス。機能とインフラ構成は `documents/PROJECT.md`、仮説・判定基準・決めたことは `documents/DIRECTION.md` を正とする。チャットの軸の追加リクエストを軸にするよう頼まれたら `documents/add-axis.md` に従う。

## 不変条件

- 賃貸物件サイト (SUUMO・LIFULL HOME'S・at home 等) の物件データを取得・保存・転載しない。物件の絞り込みは、選んだエリアと条件を各サイトの検索結果 URL に変換して開く形だけにする (各社の利用規約が商業利用・転載を禁じているため。根拠は `documents/PROJECT.md`「物件サイトとの関係」)
- 物件の説明・交渉・契約の取り次ぎを行う機能を作らない (宅地建物取引業の免許を持たないため。同上)
- 外部データを画面に出す時は出典を表示し、保存する時はライセンス情報をレコードと一緒に保存する (`.claude/rules/external-data-attribution.md`)

## 検証方法

ビルド・テスト・ブラウザ・simulator での動作確認は外部マシンに任せ、このマシン (ローカル Mac) の負荷を避ける。本リポジトリは public のため GitHub Actions の runner を使う (private に変える場合は Devin のセッションに移す。iOS / macOS は `/devin-macos-e2e` skill)。ローカルで `next build`・`next dev`・Chromium・iOS Simulator を起動するのは、runner で再現できない時だけにし、その理由を PR に書く。

| 対象 | 方法 |
| --- | --- |
| lint / 型検査 / テスト / ビルド | PR の `ci.yml` の `check` job の結果で確認する (`make check` と同じコマンド)。結果は `gh pr checks <PR番号>`、失敗の詳細は `gh run view <run ID> --log-failed` で読む。ローカルの `make setup` → `make check` は CI の失敗を再現・修正する時だけ実行する |
| 画面の確認 (既定) | PR の `ci.yml` の `screenshot` job が runner 上の Chromium で `e2e/*.e2e.ts` の各ページを PC 幅とモバイル幅で撮影し、artifact `screenshots` に残す。`gh run download <run ID> -n screenshots -D tmp/artifact` で取得し、PNG を Read して目視確認してから完了報告する (HTTP 200 やビルド成功で表示を判断しない)。画面を追加・変更した時は、その画面と操作後の状態を撮る手順を `e2e/` に足す |
| 画面の操作を伴う確認 | webtunnel skill (`~/.claude/skills/webtunnel/SKILL.md`。Codex CLI では `~/.agents/skills/webtunnel/SKILL.md`) で、runner 上の Chromium と dev サーバ (`browser-session.yml`) を開く。`WEBTUNNEL_REPO=bannzai/machimiru` と `--ref <ブランチ>` で PR のコードを開く。地図 (MapLibre GL JS) は WebGL を使うため `--software-webgl` を付ける。Secrets (`TS_OIDC_CLIENT_ID` / `TS_OIDC_AUDIENCE`) が未登録の間は使えないため、上の `screenshot` job で確認する |
| iOS アプリ (SwiftUI の殻 + WebView。追加後) | simtunnel (GitHub Actions の macOS runner 上の iOS Simulator。`/ios-simulator` skill Phase 1) で確認する。特別な理由がない限りローカルの simulator を使わない |
| 公開後の確認 | 公開 URL を webtunnel のセッションで開く |
| 公開後の利用状況の分析 | `/cloudflare-web-analytics-report` (設定は `.claude/cloudflare-web-analytics.json`。公開時に追加する) で Cloudflare Web Analytics の日別の訪問数・人気ページを読む |

`make` の target: `setup` (依存の導入) / `web` (`dev` と同じ dev サーバーを起動し http://localhost:3000/ をブラウザで開く。引数なしの `make` で実行される、人が手で動作確認するための入口。検査・テストは含めず CI が行う) / `dev` (http://localhost:3000/) / `lint` / `typecheck` / `test` / `build-web` / `screenshot` (`build-web` の成果物を起動して `tmp/screenshots/` に撮影) / `check` (lint・build-web・typecheck・test) / `verify` (`check` と同じ) / `data-tokyo` (公開データから `public/data/tokyo/` を生成。手順は `documents/PROJECT.md`「東京都の子育てデータの生成」)

<!-- ai-review-config begin -->
<!--
このブロックは自動生成です。直接編集せず、テンプレートを更新してから再生成してください。
内容は AI コードレビュー時の挙動指示であり、コードベース自体への規約ではありません。
-->

## レビュー時の応答スタイル

- 応答は日本語で行う

## レビュー範囲外

以下は自動レビューで指摘しない (別の検出経路があるため):

- コンパイルエラー・型エラー (ローカル/CI のビルドで検出される)
- Lint/フォーマット違反 (リンター・フォーマッターで検出される)
<!-- ai-review-config end -->
