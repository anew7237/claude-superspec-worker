# Onboarding Stopwatch — SC-001 量測記錄

此檔追蹤 SC-001 在各主機平台上的實際量測結果。SC-001 定義見
[`specs/001-superspec-baseline/spec.md`](../specs/001-superspec-baseline/spec.md)（搜尋 `SC-001`）:
新成員從零(僅 Docker、IDE、Git)到 Node 應用 stack 全綠 healthcheck,首次 build 完成 ≤ 15 分鐘;
後續 reopen container ≤ 3 分鐘。

## 主要量測表

| 場景                                       | Mac M1 時間           | WSL2 Ubuntu 時間      | 符合 SC-001?          | 備註                  |
| ------------------------------------------ | --------------------- | --------------------- | --------------------- | --------------------- |
| 首次 build(devcontainer ready,banner 印出) | TODO(待 adopter 實測) | TODO(待 adopter 實測) | TODO(待 adopter 實測) | TODO(待 adopter 實測) |
| Reopen container(已 build 過)              | TODO(待 adopter 實測) | TODO(待 adopter 實測) | TODO(待 adopter 實測) | TODO(待 adopter 實測) |
| `make up` 到全綠 healthcheck(三個 service) | TODO(待 adopter 實測) | TODO(待 adopter 實測) | TODO(待 adopter 實測) | TODO(待 adopter 實測) |

## 量測方法

- **首次 build** — 依照 [`quickstart.md` Step 1](../specs/001-superspec-baseline/quickstart.md)
  （clone + `Reopen in Container`）。從點擊「Reopen in Container」開始計時,到 terminal 印出 banner
  (`Environment ready`) 為止。
- **Reopen container(已 build 過)** — 對已 build 完成的 devcontainer 執行 VS Code「Reopen in
  Container」。從點擊開始計時,到 banner 印出為止(只跑 `postStartCommand`,不重建映像)。
- **`make up` 到全綠 healthcheck** — 容器就緒後,於容器內 terminal 執行:
  ```bash
  time make up && docker compose ps
  ```
  計時區間:從 `make up` 啟動到三個 service(`app` / `db` / `redis`)狀態皆顯示 `healthy`。

## 第一個 SDD feature 量測(T009 補充)

_TODO(T009):在此新增「從 `/speckit-specify` 到第一個 feature PR 全綠」行,包含 SC-007 數值。_

## Fresh-eyes 二次驗證(T016 補充)

_TODO(T016):在此新增二次驗證人的量測結果,確認 SC-001 在全新視角下可重現。_
