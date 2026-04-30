# 工具鏈升級 Playbook

本檔對應 **FR-019**(工具鏈版本變更必須為孤立 commit,不夾帶其他重構或行為變更)與
**SC-005**(工具鏈升級 commit 可單獨 revert 通過率 = 100%)。升級任何 CORE 工具前,請先
完整閱讀本文。

---

## 核心工具版本宣告位置

| 工具                                | Pinning site                                                                                        | 當前版本 (v1.0.0)                       | 備註                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| **spec-kit**                        | `.devcontainer/post-create.sh` 第 73 行 `SPEC_KIT_VERSION="..."`                                    | `v0.8.1`                                | —                                                                    |
| **Node**                            | `.nvmrc` + `package.json` `engines.node`                                                            | `22`(`.nvmrc`) / `>=22`(`engines.node`) | 兩處須同步修改                                                       |
| **pnpm**                            | `package.json` `packageManager`                                                                     | `9.12.0`(含 sha512 hash)                | hash 須隨版本更新                                                    |
| **TypeScript**                      | `package.json` `devDependencies.typescript`                                                         | `^5.7.0`                                | —                                                                    |
| **vitest**                          | `package.json` `devDependencies.vitest`                                                             | `^4.0.0`                                | vitest 4 需要 vite^6 peer dep(見 §Reference exemplar)                |
| **vite**                            | `package.json` `devDependencies.vite`                                                               | `^6.0.0`                                | vitest peer dep;與 vitest 同 commit 調整                             |
| **eslint**                          | `package.json` `devDependencies.eslint`(+ 相關 plugin 版本)                                         | `^9.14.0`                               | `@eslint/js`、`eslint-config-prettier`、`typescript-eslint` 一併維護 |
| **prettier**                        | `package.json` `devDependencies.prettier`                                                           | `^3.3.3`                                | —                                                                    |
| **Hono**                            | `package.json` `dependencies.hono`                                                                  | `^4.6.0`                                | runtime dep;同樣適用孤立 commit 規則                                 |
| **Claude Code CLI**                 | `.devcontainer/devcontainer.json` features `ghcr.io/anthropics/devcontainer-features/claude-code:1` | `:1`(滾動 tag)                          | 不釘特定版本;詳見 §已知 FR-019 gap                                   |
| **superpowers skills**              | `.devcontainer/post-create.sh` `git clone obra/superpowers`                                         | (無 sha pin)                            | 不釘特定版本;詳見 §已知 FR-019 gap                                   |
| **wrangler**                        | `package.json` `devDependencies.wrangler` _(forward-declared)_                                      | N/A                                     | by 002                                                               |
| **@cloudflare/vitest-pool-workers** | `package.json` `devDependencies` _(forward-declared)_                                               | N/A                                     | by 002                                                               |
| **@cloudflare/workers-types**       | `package.json` `devDependencies` _(forward-declared)_                                               | N/A                                     | by 002                                                               |

---

## 升級流程(canonical)

1. **改版本字串於 pinning site** — 僅動對應行;若涉及 peer dep(例如 vitest→vite),於**同一
   commit** 一併調整所有受影響的 pinning site,不跨 commit 拆開。Node 版本同步更新 `.nvmrc` 與
   `package.json engines.node`。pnpm 升級需同步更新 `packageManager` 欄位的 sha512 hash
   (`corepack use pnpm@<new>` 可自動產生)。

2. **`pnpm install` 重生 lockfile** — **不**加 `--frozen-lockfile`;此步驟刻意允許
   `pnpm-lock.yaml` 漂移,讓 resolver 根據新版本字串重算依賴樹。

3. **跑 mandatory gates 全套** — 依序執行:

   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   pnpm exec prettier --check .
   ```

   任一 gate 失敗:修補問題後重跑,或放棄本次升級(回覆 pinning site + 重跑 `pnpm install`)。

4. **單獨 commit** — subject 格式固定為 `chore(deps): bump <tool> <old> -> <new>`,body 須
   包含以下三段:
   - **為何**:升級動機(新功能、安全修補、peer dep 需求……)
   - **相容掃描**:API surface 掃描結果(有無 breaking change 影響本 repo)
   - **verify 結果**:各 mandatory gate 的實際輸出摘要(pass count / error count)

   Commit diff **僅允許**出現:pinning site 檔案(如 `package.json`、`.nvmrc`、
   `.devcontainer/post-create.sh`)+ `pnpm-lock.yaml`。

5. **PR review** — Reviewer 確認 diff 僅限 pinning site + lockfile。若 PR 夾帶其他
   重構或行為變更 → Reviewer 駁回,要求拆 PR。此即 FR-019 的 gate。

---

## Revert 演練

1. **辨識升級 commit**:

   ```bash
   git log --oneline --grep 'chore(deps): bump'
   ```

2. **執行 revert**:

   ```bash
   git revert <commit-sha>
   ```

   因 commit 為孤立(僅 pinning site + lockfile),應**一次回退無衝突**。若出現衝突,代表
   升級 commit 被夾帶了非工具鏈變更 → SC-005 不通過,須列為 SC-008 配額或開 follow-up issue。

3. **跑 mandatory gates 確認綠**:

   ```bash
   pnpm install
   pnpm test && pnpm typecheck && pnpm lint && pnpm exec prettier --check .
   ```

   若 revert 後 gates fail,代表升級前後有耦合變更未被分離 → 同樣計入 SC-005 violation。

4. **revert 亦為單獨 commit** — `git revert` 的預設訊息格式
   `Revert "chore(deps): bump <tool> <old> -> <new>"` 即符合規範,不必修改。

---

## Reference exemplar:vitest 2 → 4

| 欄位          | 內容                                                    |
| ------------- | ------------------------------------------------------- |
| Commit SHA    | `ec6781a`                                               |
| Subject       | `chore(deps): bump vitest 2 -> 4`                       |
| 日期          | 2026-04-30                                              |
| Author        | Andrew Hsieh                                            |
| Changed files | `package.json` + `pnpm-lock.yaml`(2 files, 302+ / 287-) |

**為何 isolated**:diff 嚴格限於 `package.json`(版本字串)+ `pnpm-lock.yaml`(resolver
重算);無任何 src/ 或 test/ 變動,完美符合 FR-019 定義的孤立 commit。

**為何同時加 vite^6**:vitest 4 將 vite@^6 列為 peer dep;缺少時 resolver 退回 transitive
的 vite 5 副本,於 startup 觸發 `ERR_PACKAGE_PATH_NOT_EXPORTED`。因此 `vite@^6.0.0` 與
`vitest@^4.0.0` 屬於**同一邏輯升級單元**,應於同一 commit 調整。

**verify 結果**:

```
pnpm test        — 20/20 pass
pnpm typecheck   — 0 errors
pnpm lint        — 0 errors
pnpm bench --run — 完成,無錯誤
```

此 commit 可作為未來所有工具鏈升級 commit 的格式範本。

---

## 已知 FR-019 gap(superpowers / Claude Code CLI)

**superpowers skills**:由 `.devcontainer/post-create.sh` 執行
`git clone --depth=1 obra/superpowers`(無 sha pin)。`git clone` 每次都拉 upstream HEAD,
版本不可重現,亦不可透過 `git revert` 回退 — 屬不可孤立 revert 範疇,為已知的 FR-019
gap。改善方向:在 post-create.sh 中改為 `git clone ... && git checkout <sha>` 並將 sha 宣告
為 pinning site;留為 follow-up。

**Claude Code CLI**:由 devcontainer feature `ghcr.io/anthropics/devcontainer-features/claude-code:1`
拉取,`:1` 為滾動 major tag,不釘特定 patch 版本。container rebuild 時版本可能靜默升級,
同樣不在 FR-019 可控範圍。若需釘版,改用完整 semver tag(如 `:1.2.3`);屬 follow-up。

以上兩項 gap **不阻擋 SC-005 對 _release_ 工具的衡量**(spec-kit / vitest / pnpm / wrangler
等有明確 pinning site 的工具),但 baseline 預留改善空間。

---

## 常見故障模式

| 故障模式                                   | 觸發情境                                             | 期望處置                                                            |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| 升級 commit 夾帶 lockfile 以外的 src 變更  | 工具升級需連帶修改 src 才能通過 gates                | 拆成兩個 commit:先孤立升級(即使 gates 暫紅),再補 src adapter commit |
| peer dep 不滿足(`npm ERR! ERESOLVE`)       | 只更新主套件,漏更對應 peer dep                       | 在同一 commit 一併調整所有受影響的 peer dep(參考 vitest→vite 案例)  |
| `engines` 欄位與 `.nvmrc` 不同步           | 更新 Node 版本時只改一處                             | 兩處(`engines.node` + `.nvmrc`)必須同 commit 同步修改               |
| pnpm `packageManager` hash 未更新          | 升級 pnpm 版本後未更新 sha512 hash                   | 執行 `corepack use pnpm@<new>` 讓 corepack 自動寫入正確 hash        |
| revert 後 mandatory gates fail             | 升級 commit 實際夾帶了耦合變更                       | 計入 SC-005 violation;開 issue root-cause;不可只重做 revert         |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` at startup | vitest 類工具 peer dep 版本衝突(transitive 解析錯誤) | 明確加入正確 peer dep 版本至 `devDependencies`,同 commit 納入       |
