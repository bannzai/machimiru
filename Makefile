.PHONY: setup dev lint typecheck test build-web screenshot check data-tokyo

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

# 公開データを取得し、東京都の子育てデータを public/data/tokyo/ に生成する (出典と手順は documents/PROJECT.md)
data-tokyo:
	npm run data:tokyo
