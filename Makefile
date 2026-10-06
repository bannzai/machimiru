.PHONY: setup dev lint typecheck test build-web screenshot check boundaries data-tokyo data-openpoi

setup:
	npm ci

dev:
	npm run dev

lint:
	npm run lint

# next build が生成する next-env.d.ts を型検査で参照するため、CI では build-web の後に実行する
typecheck:
	npm run typecheck

test:
	npm test

build-web:
	npm run build

# build-web の成果物を起動し、e2e/*.e2e.ts の各ページを tmp/screenshots/ に撮影する。
# Chromium が要るため CI (ci.yml の screenshot job) で実行し、artifact を読む
screenshot:
	npm run screenshot

check: lint build-web typecheck test

# 境界データ (public/data/boundaries/) を国土数値情報と e-Stat から作り直す。手順と形式は documents/PROJECT.md「境界データ」。
# Node 22.18 未満は TypeScript の実行にフラグが要るため付ける (22.18 以降と 24 では付けても同じ動作)
boundaries:
	node --experimental-strip-types scripts/generate-boundaries.ts

# 公開データを取得し、東京都の子育てデータを public/data/tokyo/ に生成する (出典と手順は documents/PROJECT.md)
data-tokyo:
	npm run data:tokyo

# 軸の registry の OpenPOI API の判定器の検索語で東京都の施設を検索し、public/data/tokyo/openpoi/ に生成する (手順は documents/PROJECT.md)
data-openpoi:
	npm run data:openpoi

# 引数なしの make で動作確認 (verify) を実行する
.DEFAULT_GOAL := verify

.PHONY: verify
verify: check
