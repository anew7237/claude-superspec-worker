# Onboarding Stopwatch — SC-001 量測記錄

此檔追蹤 SC-001 在各主機平台上的實際量測結果。SC-001 定義見
[`specs/001-superspec-baseline/spec.md`](../specs/001-superspec-baseline/spec.md)（搜尋 `SC-001`）:
新成員從零(僅 Docker、IDE、Git)到 Node 應用 stack 全綠 healthcheck,首次 build 完成 ≤ 15 分鐘;
後續 reopen container ≤ 3 分鐘。

## 主要量測表

| 場景                                       | Mac M1 時間 | WSL2 Ubuntu 時間 | 符合 SC-001?                           | 備註                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------- | ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次 build(devcontainer ready,banner 印出) | 30 s        | 45 s             | ✅(≪ 15 min)                           | Mac M1: T016 / 2026-04-30;**需先 `export SSH_AUTH_SOCK=/run/host-services/ssh-auth.sock`** 才能起 container — 否則 launchd socket bind fail(`sensitive-material.md` Mac magic socket edge case 已標,但 baseline 未自動處理 → follow-up #SSH-mac-socket)。WSL2: T006 / 2026-04-30;`vsc-*` + worker app image 預先砍除,base image / features / `~/.claude` mount 仍 cached;banner 0 WARN / 0 NOT FOUND |
| Reopen container(已 build 過)              | 20 s        | 25 s             | ✅(≪ 3 min)                            | Mac M1: T016 / 2026-04-30。WSL2: T006 / 2026-04-30。皆只跑 `postStartCommand`                                                                                                                                                                                                                                                                                                                        |
| `make up` 到全綠 healthcheck(三個 service) | 12 s        | 20 s             | ✅(SC-001 spec 未明列上限,典型 ≤ 30 s) | Mac M1: T016 / 2026-04-30。WSL2: T006 / 2026-04-30;app image 已 build。Mac 比 WSL 快 8 s,在 Apple Silicon native arm64 image 走 + Docker Desktop VM resource pre-allocated 範圍內合理                                                                                                                                                                                                                |

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

**完成日期**:2026-04-30
**驗證者**:同一 maintainer,於 Mac M1(Apple Silicon)host 上跑;repo 為從 origin 新 clone 至
`/Users/testc1aw/x_Project/TEST-claude/claude-superspec-worker`,checkout 至 `001-superspec-baseline`
HEAD `14b0824`(含 T006 measurement)。

### 跨平台量測對比(SC-001 兌現)

| 場景       | Mac M1 | WSL2 Ubuntu | 差異  | 備註                                                                                                    |
| ---------- | ------ | ----------- | ----- | ------------------------------------------------------------------------------------------------------- |
| 首次 build | 30 s   | 45 s        | -15 s | Mac M1 較快;ARM64 native + Docker Desktop VM 預配資源 / WSL2 走 Hyper-V VM 啟動有額外 fs cache 預熱成本 |
| Reopen     | 20 s   | 25 s        | -5 s  | 兩端皆只跑 `postStartCommand`,差異在 noise 範圍                                                         |
| `make up`  | 12 s   | 20 s        | -8 s  | Mac arm64 native image 啟動快;db/redis healthcheck 同樣 10 s interval                                   |

兩平台皆 ≪ SC-001 上限(15 min / 3 min),**SC-001 在 v1.0.0 跨 Mac M1 + WSL2 Ubuntu 雙平台兌現**。

### 本次驗證新發現(follow-up evidence)

**SSH-mac-socket footgun**:Mac M1 首次 build 在 default `SSH_AUTH_SOCK` 下會 bind-mount fail
(`/var/run/com.apple.launchd.*/Listeners` 在 Docker Desktop VM 內不存在),容器無法啟動。
**Workaround**:啟動 VS Code 前於 host shell `export SSH_AUTH_SOCK=/run/host-services/ssh-auth.sock`
(Docker Desktop magic socket)。`sensitive-material.md` Mac magic socket edge case 已標明此情境,
但 baseline 未自動偵測 / 提供自動 fallback,屬 derivative UX 缺口。

**處置建議**(超出 001 範圍,記為 follow-up):

1. README §1 Mac 段加 callout 提醒先設 `SSH_AUTH_SOCK`;
2. 後續 feature 可評估 `.devcontainer/devcontainer.json` 是否改條件式 mount source(目前
   devcontainer schema 不直接支援 platform 分支,需研究)或於 `post-create.sh` 移至更早階段預檢;
3. 直至 follow-up 落地前,SSH agent forwarding 在 Mac M1 上仍可用,只是 onboarding 多一行 `export`。
