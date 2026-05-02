# Parity Validation — SC-002 + SC-008 本機驗證流程

此檔描述 **SC-002**(Mac M1 vs WSL2 跨平台 parity)與 **SC-008**(container parity 缺陷季度配額)
的手動本機驗證程序。SC 定義見
[`specs/001-superspec-baseline/spec.md`](../specs/001-superspec-baseline/spec.md)(搜尋 `SC-002`、`SC-008`)。
Worker 端 parity 標準與 Node 端同(Q2 Clarification 2026-04-30)。

---

## 本機驗證流程

### Step 1 — 兩台機器鎖定同一 commit

在 Mac M1 與 WSL2 Ubuntu 兩台機器上 checkout **同一 commit SHA**。SHA 為本次比對的 anchor,
**必須記錄**,不可以 branch HEAD 替代(branch 可能在過程中前進)。

```bash
# 兩台機器各自執行
git fetch origin
git checkout <COMMIT_SHA>
# 確認雙方 SHA 一致
git rev-parse HEAD
```

建議把 SHA 連同日期暫存在 `parity-session.txt`(不 commit 至 repo):

```
session: 2026-Q2 手動驗證
commit:  <COMMIT_SHA>
mac:     <量測人員>  <日期時間>
wsl2:    <量測人員>  <日期時間>
```

---

### Step 2 — 進入 dev container,執行 quality gates 並錄製輸出

兩台機器各自 **Reopen in Container**,於容器內執行以下指令,並把 stdout + stderr 合流寫入檔案。

**Node 端(v1.0.0 起有效):**

```bash
# 於容器內 terminal 執行
{
  pnpm test 2>&1
  pnpm typecheck 2>&1
  pnpm lint 2>&1
} > parity-<platform>.log
# <platform> = mac 或 wsl2
```

**Worker 端(自 002-cloudflare-worker 落地後加入):**

```bash
{
  pnpm test 2>&1
  pnpm test:worker 2>&1
  pnpm typecheck 2>&1
  pnpm lint 2>&1
} > parity-<platform>.log
```

建議在同一個 subshell 中跑完整套,確保 log 順序一致。  
`parity-mac.log` 與 `parity-wsl.log` 為本地暫存檔,**不 commit 至 repo**。

---

### Step 3 — diff 兩份 log

將兩份 log 複製到同一機器(或透過 `scp` / shared storage 傳輸),再執行:

```bash
diff parity-mac.log parity-wsl.log
```

若無輸出(exit 0),兩份 log byte-for-byte 相同,驗證通過。  
若有輸出,進入 Step 4 分類差異。

**可選:先標準化非語意性差異再 diff**

```bash
# 移除時間戳(ISO 8601 格式)
sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z?//g' parity-mac.log > mac-norm.log
sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z?//g' parity-wsl.log > wsl-norm.log

# 移除絕對路徑前綴(保留相對部分)
sed -E 's|/home/[^/]+/[^/]+/[^/]+/||g' mac-norm.log > mac-norm2.log
sed -E 's|/home/[^/]+/[^/]+/[^/]+/||g' wsl-norm.log > wsl-norm2.log

diff mac-norm2.log wsl-norm2.log
```

_上述 sed 指令為建議起點,視 log 格式調整 pattern。_

---

### Step 4 — 差異分類

#### 非語意性差異(允許,不計入 SC-008)

此類差異不影響 test / typecheck / lint 結果語意,為容器層級可解釋的輸出差異:

| 差異類型             | 範例                                                     |
| -------------------- | -------------------------------------------------------- |
| 時間戳               | `2026-04-30T10:23:45.123Z` vs `2026-04-30T10:31:02.456Z` |
| 絕對路徑前綴         | `/home/anew/project/` vs `/home/user/project/`           |
| Container ID 後綴    | `vsc-project-abc123` vs `vsc-project-def456`             |
| 進程 PID             | `pid=42` vs `pid=87`                                     |
| 執行時間(ms)         | `Duration 1234ms` vs `Duration 1198ms`                   |
| 行尾(若 log 含 CRLF) | Windows 工具偶發注入 `\r`                                |

**判斷準則**:若兩邊的 pass/fail count、錯誤訊息、警告訊息 _完全一致_,只有上表所列欄位不同
→ 屬非語意性差異,可忽略。

#### Parity 缺陷(計入 SC-008 季度配額)

以下任何情況均視為 parity 缺陷,**須記錄至下方配額表**:

- 同一 test 名稱在一邊 `PASS`、另一邊 `FAIL`
- test 總數不等(一邊有漏跑或多跑)
- typecheck error count 不等
- lint error / warning count 不等
- 整個 quality gate 指令在一邊 exit 0、另一邊 exit non-zero

---

## SC-008 季度配額記錄表

_SC-008 定義_:此類「cross-platform parity 缺陷」每季 ≤ 1 件。  
_記錄說明_:每發現一件 parity 缺陷即新增一行,季末統計「缺陷數量」欄。

| 季度    | Parity 缺陷數量 | 配額狀態(≤1?) | 事件描述 | 處置 |
| ------- | --------------- | ------------- | -------- | ---- |
| 2026-Q2 | 0               | ✅            | (無事件) | —    |
| 2026-Q3 | TODO            | TODO          | TODO     | TODO |
| 2026-Q4 | TODO            | TODO          | TODO     | TODO |
| 2027-Q1 | TODO            | TODO          | TODO     | TODO |

> 配額超標(> 1 件)時,須在同季開立 bug issue 並於下一個 PR cycle 前 root-cause。

---

## 常見差異參考表

協助 reviewer 快速判斷差異是否屬可忽略類別。

| 差異範例(原始 diff 行)                                                      | 分類            | 說明                                                |
| --------------------------------------------------------------------------- | --------------- | --------------------------------------------------- |
| `< 2026-04-30T10:23:45.123Z` / `> 2026-04-30T10:31:02.456Z`                 | 非語意性        | vitest / pino 時間戳,兩邊跑在不同時刻               |
| `< /home/anew/repos/project/` / `> /home/ubuntu/project/`                   | 非語意性        | 兩台機器 home 路徑不同,同一相對檔案                 |
| `< Duration: 1234ms` / `> Duration: 1198ms`                                 | 非語意性        | 執行耗時受 host 效能影響                            |
| `< container: vsc-my-project-abc123` / `> container: vsc-my-project-def456` | 非語意性        | VS Code devcontainer 自動產生的 container name hash |
| `< pid=42` / `> pid=87`                                                     | 非語意性        | 容器內 Node.js 進程 PID                             |
| `< Tests: 10 passed, 10 total` / `> Tests: 9 passed, 1 failed, 10 total`    | **Parity 缺陷** | 同一 commit 一邊全過、另一邊有 fail                 |
| `< 0 errors` / `> 1 error`                                                  | **Parity 缺陷** | typecheck 結果不等                                  |
| `< 0 warnings` / `> 2 warnings`                                             | **Parity 缺陷** | lint 結果不等                                       |

---

## 後續 CI 自動化備註

CI 自動化(GitHub Actions 在 macOS-latest 與 ubuntu-latest 兩個 OS runner 上跑同一 commit)為
[`research.md` Critical Follow-up #1](../specs/001-superspec-baseline/research.md)(搜尋
`Critical follow-ups`)中已識別的 gap,**不在 001 baseline 範圍**。

**001 baseline 的當前驗證為手動流程**,實務上由:

- 開發者在兩台主機上跑完本文 Step 1–4 自驗(推薦每次 PR 前抽查一次)
- Reviewer 在 PR description 確認「已於容器內跑」並標注主機平台

CI 補建後,本流程中的 Step 2–3 可由 CI 自動產出並對照,但 Step 4 分類規則保持不變。

---

## Worker 端註記

v1.0.0 ratification 時 Worker pool(`pnpm test:worker`)不存在,Worker parity 條目**自
002-cloudflare-worker 落地後生效**。在此之前 Worker 端不參與 parity 量測,Worker 端違規空間
客觀為 0 — 同 SC-011 的生效邏輯(見 `spec.md` SC-011 與 Q2 Clarification FR-022 說明)。

002 落地後,請在 Step 2 中加入 `pnpm test:worker`,並在 Step 4 的 parity 缺陷定義中一併涵蓋
Worker 端 test count 與 typecheck 結果。

---

## Measurement Records — T038(P3 partial,2026-05-03 起)

本節登記實際量測證據,對應 **001 SC-002 + 002 SC-002 + 002 SC-004**。

歷史脈絡:T038(Mac M1 + WSL2 worker-pool parity)在 002 落地時 deferred(per `.docs/baseline-traceability-matrix.md` 與 PR #5 review note);P3 follow-up 開始補入單平台量測證據,Mac M1 條目在 hardware access 取得後填入。

### 2026-05-03 — WSL2 baseline 量測(commit `4fca1fa`)

**Anchor:** `4fca1fa feat(eslint): P2 — fully mechanize FR-022 cross-runtime import ban`(P2 land 後第一筆量測,FR-022 Layer 2 已生效)

**Host:**

- OS:Ubuntu 24.04.4 LTS (Noble Numbat) on Linux `6.6.87.2-microsoft-standard-WSL2` x86_64
- 記憶體:32 GiB
- Toolchain:Node `v24.15.0` / pnpm `9.12.0` / wrangler `3.114.17`
- Date/time(UTC):2026-05-03 03:56–03:57
- 量測者:project maintainer(單機紀錄)
- 環境:host shell(非 dev container)— per Q2 Clarification,本量測以「同一 commit、同樣 host shell 運行 toolchain」之語意 parity 為標的;dev container 環境之 parity 由 Mac M1 條目補入時一併確認

| Gate               | 結果                                  | Wall time(`time` real) | Vitest reported                                       |
| ------------------ | ------------------------------------- | ---------------------- | ----------------------------------------------------- |
| `pnpm test:node`   | 8 files / 26 tests pass ✅            | 15.768s                | 11.53s(transform 1.91s / import 25.31s / tests 7.16s) |
| `pnpm test:worker` | 5 files / 18 tests pass ✅            | 30.075s                | 24.37s(transform 4.37s / import 8.01s / tests 258ms)  |
| `pnpm typecheck`   | exit 0(dual tsconfig 串接)            | 29.726s                | —                                                     |
| `pnpm lint`        | exit 0(含 P2 `no-restricted-imports`) | 64.133s                | —                                                     |

**對應 SC 證據:**

- **002 SC-002**:`pnpm test:node` + `pnpm test:worker` 兩 pool 在本機(WSL2)皆 pass — single-platform half;Mac M1 條目填入後可正式 diff
- **002 SC-004**:`pnpm test:worker` 全綠;miniflare in-memory D1 + KV(no outbound HTTP)— 透過 vitest-pool-workers 之 hermetic isolate 自證
- **001 SC-002**:Node + Worker 兩面在 WSL2 皆 green — single-platform half

### Mac M1(pending — requires hardware access)

**Status:** PENDING

**操作步驟**(取得 Mac M1 access 後):

1. 於 Mac M1 host 上 `git fetch origin && git checkout 4fca1fa`(或本 P3 PR merge 後之 main HEAD)
2. Reopen in Container(per 001 baseline `.devcontainer/devcontainer.json`)
3. 於 dev container 內 terminal 跑 4 個 gate(同上表),把輸出寫入 `parity-mac.log`(本檔之 Step 2 標準程序)
4. 將 `parity-mac.log` 連同上方 WSL2 結果置入 Step 3 之 diff 程序;`parity-wsl.log` 可於後續 session 在 WSL2 host 重跑同 commit 取得
5. 結果回填本節 — 新增 `### 2026-MM-DD — Mac M1 配對量測` block,並更新 SC-008 配額表

**單平台量測限制:** 本量測僅證 WSL2 toolchain 自身可運行 4 gate;002 SC-002 之「100% 等價」需雙平台同 commit diff 才能判定。Mac M1 條目補入前,本紀錄僅作為 single-platform 上限證據,**不**等同 SC-002 通過。

---
