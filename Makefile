# ============================================================
# Makefile — 常用開發指令
#
# 在 dev container 內執行;它會用 docker-outside-of-docker
# 透過 host docker daemon 開出 sibling container。
# ============================================================

.PHONY: help up down logs logs-all build rebuild test lint typecheck format shell db-shell clean reset ps claude specify-check specify-status

help:  ## 顯示這份說明
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

up:  ## 啟動所有 service
	docker compose up -d
	@echo ""
	@echo "App:    http://localhost:$${APP_PORT:-8000}"
	@echo "DB:     localhost:$${DB_PORT:-5432}"
	@echo "Redis:  localhost:$${REDIS_PORT:-6379}"

down:  ## 停止所有 service
	docker compose down

logs:  ## 跟蹤 app log
	docker compose logs -f app

logs-all:  ## 跟蹤所有 service log
	docker compose logs -f

build:  ## 重新 build app image
	docker compose build app

rebuild:  ## 強制全部重 build(no cache)
	docker compose build --no-cache

test:  ## 在容器內跑測試(vitest)
	docker compose run --rm app pnpm test

lint:  ## 在容器內跑 lint(eslint + prettier check)
	docker compose run --rm app pnpm lint
	docker compose run --rm app pnpm exec prettier --check .

typecheck:  ## 在容器內跑 tsc --noEmit
	docker compose run --rm app pnpm typecheck

format:  ## 格式化程式碼(prettier + eslint --fix)
	docker compose run --rm app pnpm format
	docker compose run --rm app pnpm lint:fix

shell:  ## 進入 app container
	docker compose exec app bash

db-shell:  ## 進入 db psql
	docker compose exec db psql -U app -d app

clean:  ## 停掉並移除 container(保留 volume)
	docker compose down

reset:  ## 全部砍掉重練(包含 volume!危險)
	docker compose down -v
	docker compose up -d --build

ps:  ## 看 service 狀態
	docker compose ps

# ============================================================
# spec-kit 工作流捷徑
# 大部分時候你會直接在 claude 內打 /speckit-* 指令
# 這些 make target 是給 CI / 腳本化用的
# ============================================================

claude:  ## 啟動 Claude Code
	claude

specify-check:  ## 檢查 spec-kit 環境
	specify check

specify-status:  ## 看當前 spec 進度(需安裝 spec-kit-status extension)
	@ls -la .specify/specs/ 2>/dev/null || echo "No specs yet"
