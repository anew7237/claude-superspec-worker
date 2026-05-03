# FR-013 / SC-002 Mac M1 Parity Measurement — Fill-in Template

此檔為 **預先草擬的 measurement worksheet + PR template**,等實際拿到 Mac M1
hardware access 後,照本檔指引填空、套 patch、開 PR,即可關掉 FR-013 / SC-002
單平台 deferral 狀態。

> **本檔本身不是 measurement evidence** — 它是一張「等填空」的工作表;Mac M1
> 真實量測完成、PR merge 進 main 之後,本檔可以連同 PR 一併刪除(或留作
> 未來 Q3/Q4 重複量測的範本)。

操作流程的 narrative 版見下方 Phase 0–5;PR 套用步驟見最末 §"Apply checklist"。

---

## Phase 0 — 前置條件

- [ ] Mac M1 / M2 / M3 / M4 hardware access(任一 Apple Silicon)
- [ ] Docker Desktop for Mac 已安裝且啟動
- [ ] VS Code + Dev Containers extension 已安裝
- [ ] Mac host 上已跑過 `claude` 一次(OAuth credentials cached)
- [ ] Git + SSH key 已配 GitHub
- [ ] ≥ 5 GB 空閒磁碟
- [ ] 預留 ~30 min(首次 devcontainer build ~15 min + 4 gate ~3 min + log/diff ~10 min)

---

## Phase 1 — Anchor commit

選用 commit anchor(雙平台都 checkout 同一 SHA):

- **建議**:`4fca1fa`(P2 land 後,FR-022 Layer 2 已生效;與既有 WSL2 baseline
  紀錄對齊,可直接 diff)
- 替代:本 PR merge 後之 main HEAD(這條路徑下,WSL2 baseline 需重跑一次)

```bash
# Mac 上
git clone git@github.com:anew7237/claude-superspec-worker.git
cd claude-superspec-worker
git fetch origin
git checkout 4fca1fa
git rev-parse HEAD   # 確認 4fca1fa...
```

本機暫存(**不 commit**):

```
session: 2026-MM-DD Mac M1 parity validation
commit:  4fca1fa
mac:     <name>  2026-MM-DD HH:MM <TZ>
wsl2:    project maintainer  2026-05-03 03:56 UTC(parity-validation.md L192-L216)
```

---

## Phase 2 — 跑 4 個 gate,錄 log

於 Mac 上 VS Code → Reopen in Container,等首次 build 完成。進 container terminal:

```bash
{
  echo "=== pnpm test:node ==="     ; { time pnpm test:node 2>&1     ; } 2>&1
  echo "=== pnpm test:worker ==="   ; { time pnpm test:worker 2>&1   ; } 2>&1
  echo "=== pnpm typecheck ==="     ; { time pnpm typecheck 2>&1     ; } 2>&1
  echo "=== pnpm lint ==="          ; { time pnpm lint 2>&1          ; } 2>&1
} > /tmp/parity-mac.log
```

把 `/tmp/parity-mac.log` 複製到 host(VS Code → Download,或 `cat` + 貼上)。
**不 commit 此 log**(per `parity-validation.md` L64)。

---

## Phase 3 — 對 WSL2 重跑 baseline + diff

```bash
# WSL2 上同 anchor SHA
git checkout 4fca1fa
{
  echo "=== pnpm test:node ==="     ; { time pnpm test:node 2>&1     ; } 2>&1
  echo "=== pnpm test:worker ==="   ; { time pnpm test:worker 2>&1   ; } 2>&1
  echo "=== pnpm typecheck ==="     ; { time pnpm typecheck 2>&1     ; } 2>&1
  echo "=== pnpm lint ==="          ; { time pnpm lint 2>&1          ; } 2>&1
} > /tmp/parity-wsl.log
```

把 `parity-mac.log` 拉到 WSL2(scp / Gist / 雲端硬碟皆可),raw diff:

```bash
diff /tmp/parity-mac.log /tmp/parity-wsl.log | less
```

normalize 過後再 diff(注意 Mac 路徑前綴是 `/Users/`,WSL2 是 `/home/`):

```bash
sed -E '
  s/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z?//g
  s|/home/[^/]+/||g
  s|/Users/[^/]+/||g
  s/[0-9]+\.[0-9]+s//g
  s/[0-9]+ms//g
' /tmp/parity-mac.log > /tmp/mac-norm.log

sed -E '
  s/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z?//g
  s|/home/[^/]+/||g
  s|/Users/[^/]+/||g
  s/[0-9]+\.[0-9]+s//g
  s/[0-9]+ms//g
' /tmp/parity-wsl.log > /tmp/wsl-norm.log

diff /tmp/mac-norm.log /tmp/wsl-norm.log
```

---

## Phase 4 — 差異分類

### ✅ 非語意性差異(允許,不計入 SC-008)

時間戳 / 絕對路徑前綴 / container ID hash / PID / wall time(ms) / `\r` 行尾 →
**判準**:兩邊 pass/fail count + error/warning 訊息**完全一致**只有上述欄位不同,
即視為 PASS。

### ❌ Parity 缺陷(計入 SC-008 季度配額,目標 ≤ 1/季)

- 同一 test 名一邊 PASS 一邊 FAIL
- test 總數不等
- typecheck error count 不等
- lint error/warning count 不等
- 整個 gate exit code 不等

→ **不要直接套 Phase 5a patch**;改走 Phase 5b 開 issue 修缺陷,SC-008 2026-Qx +1。

---

## Phase 5a — Apply patch(diff 全綠之預期路徑)

### Patch A — `.docs/parity-validation.md` 末尾新增 measurement block

把下面這個 block 貼到 `.docs/parity-validation.md` 末尾(L233 之後),
並把 L218-L230 的「Mac M1(pending)」整段改寫為「Mac M1 — ✅ verified」。

```markdown
### 2026-MM-DD — Mac M1 配對量測(commit `4fca1fa`)

**Anchor:** 同 WSL2 baseline(`4fca1fa`)— 雙平台 parity 對照成立。

**Host:**

- Hardware: <TODO: 例 MacBook Pro 14" M3 / 18 GiB RAM>
- OS: <TODO: 例 macOS 15.2 Sequoia>
- Toolchain(於 dev container 內): Node `<TODO>` / pnpm `<TODO>` / wrangler `<TODO>`
- Date/time: 2026-MM-DD HH:MM <TZ>
- 量測者: <TODO: name>
- 環境: dev container(per `.devcontainer/devcontainer.json`)

| Gate               | 結果                                | Wall time(`time` real) | Vitest reported |
| ------------------ | ----------------------------------- | ---------------------- | --------------- |
| `pnpm test:node`   | <TODO> files / <TODO> tests pass ✅ | <TODO>s                | <TODO>          |
| `pnpm test:worker` | <TODO> files / <TODO> tests pass ✅ | <TODO>s                | <TODO>          |
| `pnpm typecheck`   | exit 0(dual tsconfig 串接)          | <TODO>s                | —               |
| `pnpm lint`        | exit 0(含 `no-restricted-imports`)  | <TODO>s                | —               |

**Diff vs WSL2 baseline(`/tmp/parity-mac.log` ↔ `/tmp/parity-wsl.log` after normalization):** 0 語意性差異(僅時間戳 / 路徑前綴 / wall time 之非語意差,per §Step 4 分類規則)。

**對應 SC 證據:**

- **001 FR-013 / SC-002**: ✅ Mac M1 + WSL2 同 commit,4 gate 結果 100% 等價(Node + Worker pool 皆驗證)
- **002 FR-013 / SC-002**: ✅ Worker pool 跨平台等價(per Q2 Clarification 自 002 起對 Worker pool 啟動)
- **002 SC-004**: ✅ Mac 端 `pnpm test:worker` 全綠,miniflare in-memory(no outbound HTTP)

**SC-008 季度配額影響:** 本量測未觸發 parity 缺陷,2026-Qx 配額仍為 0/1。
```

### Patch B — 改寫 L218 「Mac M1(pending)」section

把現行的:

```markdown
### Mac M1(pending — requires hardware access)

**Status:** PENDING

**操作步驟**(取得 Mac M1 access 後):

1. ...
```

改為:

```markdown
### Mac M1 — ✅ verified(2026-MM-DD)

**Status:** ✅ VERIFIED — 詳見下方「2026-MM-DD — Mac M1 配對量測」block。

**單平台量測限制已解除:** 自本量測起,SC-002 雙平台等價條件成立(Mac M1 + WSL2 同 commit 4 gate 100% 等價)。
```

### Patch C — `.docs/baseline-traceability-matrix.md` SC-002 row

L54 現行:

```markdown
| SC-002 | `.docs/parity-validation.md` §「本機驗證流程」+ §「Measurement Records — T038」(WSL2 single-platform 量測 since 2026-05-03,Mac M1 pending)+ `research.md` §1.2 Q2 Clarification(Worker 端 parity 標準等同 Node 端) | US3 |
```

改為:

```markdown
| SC-002 | `.docs/parity-validation.md` §「本機驗證流程」+ §「Measurement Records — T038」+ ✅ **fully verified (2026-MM-DD)**:Mac M1 + WSL2 同 commit `4fca1fa` 4 gate(test:node / test:worker / typecheck / lint)100% 等價,0 parity 缺陷;SC-008 2026-Qx 配額未動用。`research.md` §1.2 Q2 Clarification(Worker 端 parity 標準等同 Node 端) | US3, _fully verified from 2026-MM-DD_ |
```

### Patch D — 同檔 SC-008 row(可選,若你想記下這次量測作為 baseline)

L60 現行:

```markdown
| SC-008 | `.docs/parity-validation.md` §「SC-008 季度配額記錄表」(季度 ≤ 1 件 parity 缺陷) | US3 |
```

可附加:

```markdown
| SC-008 | `.docs/parity-validation.md` §「SC-008 季度配額記錄表」+ 2026-Qx Mac M1 量測(0 缺陷,配額 0/1) | US3 |
```

### Patch E — 在 `parity-validation.md` SC-008 配額表加一筆紀錄(L132 起)

現行:

```markdown
| 2026-Q2 | 0 | ✅ | (無事件) | — |
| 2026-Q3 | TODO | TODO | TODO | TODO |
```

把 2026-Qx(看實際量測月份)那行從 TODO 升為:

```markdown
| 2026-Q3 | 0 | ✅ | Mac M1 + WSL2 同 commit 4fca1fa parity 量測,0 缺陷 | — |
```

### Patch F — 刪除本 template 檔

```bash
git rm .docs/fr013-mac-m1-measurement-template.md
```

(本檔的存在意義就是「等量測一回來就用完即丟」;PR merge 後它無剩餘價值,
留著反而干擾 SDD pipeline `/speckit-analyze` 之 cross-artifact 掃描。
若想保留作未來 Q3/Q4 重複量測範本,改名為 `.docs/parity-measurement-template.md` 也可。)

---

## Phase 5b — Apply patch(diff 顯示 parity 缺陷)

**不要走 Phase 5a。** 改為:

1. 在新分支 `bug/fr013-mac-m1-parity-defect-<short-name>` 起一個 issue + WIP PR
2. 把 Mac log + WSL log 中的具體缺陷段落貼進 issue,標明:
   - 哪個 test / typecheck / lint 結果不一致
   - 觸發 hypothesis(hardware 速度差?platform-specific code path?test 寫得不夠 hermetic?)
3. 按 systematic-debugging:重跑 1-2 次確認 reproducible(排除 flaky)
4. 修 root cause:
   - 若是 test hermeticity 問題 → 改 test
   - 若是真 platform-specific bug → 開 feature spec / 補 fix commit
5. 修完重跑 Phase 2-4,直到 diff 綠才回 Phase 5a
6. 在 `parity-validation.md` SC-008 配額表加一筆 (本季缺陷 +1,目標 ≤ 1)

---

## Apply checklist(Phase 5a 路徑)

- [ ] Phase 0 prereq 全勾
- [ ] Phase 1 anchor SHA 鎖定 + 本機 session txt 寫好
- [ ] Phase 2 Mac container 內跑完 4 gate,`/tmp/parity-mac.log` 存在
- [ ] Phase 3 WSL2 重跑 + diff 跑過(raw + normalized 兩種)
- [ ] Phase 4 分類:無 parity 缺陷,僅非語意性差異
- [ ] 開分支 `docs/fr013-mac-m1-parity-verified`
- [ ] 套 Patch A(parity-validation.md 新增 measurement block)
- [ ] 套 Patch B(parity-validation.md Mac M1 section 改寫)
- [ ] 套 Patch C(baseline-traceability-matrix.md SC-002 row)
- [ ] 套 Patch D(可選:matrix SC-008 row 補注)
- [ ] 套 Patch E(SC-008 配額表升 TODO → 0/✅)
- [ ] 套 Patch F(刪除本 template 檔,或改名為通用範本)
- [ ] `pnpm exec prettier --check .docs/parity-validation.md .docs/baseline-traceability-matrix.md` 綠
- [ ] commit + push,開 PR(commit / PR body 範本見下方)

---

## Commit message 範本(Phase 5a)

```
docs(p6): close FR-013 / SC-002 — Mac M1 + WSL2 parity verified

Mac M1 配對量測完成於 commit 4fca1fa(同 WSL2 baseline anchor),
4 gate(test:node / test:worker / typecheck / lint)結果 100% 等價,
diff after normalization 為 0 語意性差異。

Updates:
- .docs/parity-validation.md: Mac M1 section PENDING → VERIFIED;
  新增 2026-MM-DD measurement record block;SC-008 2026-Qx 配額紀錄
  從 TODO 升為 0/✅
- .docs/baseline-traceability-matrix.md: SC-002 row 從 "WSL2 single-
  platform 量測, Mac M1 pending" 升為 "fully verified (2026-MM-DD)"
- .docs/fr013-mac-m1-measurement-template.md: 刪除(用完即丟)

對應:001 FR-013 / 001 SC-002 / 002 FR-013 / 002 SC-002 全部從
single-platform 升為 fully verified。002 SC-004 同步驗證 Mac 端
miniflare in-memory(no outbound HTTP)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## PR body 範本(Phase 5a)

```markdown
## Summary

關閉 **FR-013** + **SC-002**(001 + 002 兩 spec 都涵蓋)的 single-platform deferral
狀態。Mac M1 配對量測完成,雙平台同 commit `4fca1fa` 4 gate 100% 等價。

## Measurement summary

| 項目               | Mac M1                                      | WSL2(baseline)                                 | Diff                    |
| ------------------ | ------------------------------------------- | ---------------------------------------------- | ----------------------- |
| host               | <TODO: model> / macOS <TODO>                | Ubuntu 24.04 LTS / WSL2                        | n/a                     |
| toolchain          | Node <TODO> / pnpm <TODO> / wrangler <TODO> | Node 24.15.0 / pnpm 9.12.0 / wrangler 3.114.17 | <TODO: 一致 / 差異說明> |
| `pnpm test:node`   | <TODO> files / <TODO> tests pass            | 8 files / 26 tests pass                        | 0 語意性差異            |
| `pnpm test:worker` | <TODO> files / <TODO> tests pass            | 5 files / 18 tests pass                        | 0 語意性差異            |
| `pnpm typecheck`   | exit 0                                      | exit 0                                         | 0 差異                  |
| `pnpm lint`        | exit 0                                      | exit 0                                         | 0 差異                  |

完整 normalized diff(扣除時間戳 / 路徑 / wall time)為**空** — 詳見
`.docs/parity-validation.md` 新增 measurement block。

## Spec impact

- **001 FR-013**: ✅ verified(Mac + WSL2 dev container 跨平台 mandatory gate 等價)
- **001 SC-002**: ✅ verified(同 commit pass/fail count + 訊息 100% 一致)
- **002 FR-013**: ✅ verified(Worker pool 跨平台等價,Q2 Clarification 兌現)
- **002 SC-002**: ✅ verified(`pnpm test` 整合 Node + Worker 兩 pool 跨平台等價)
- **002 SC-004**: ✅ side-effect verified(Mac 端 `pnpm test:worker` 全綠不打網路)
- **001 SC-008**: 2026-Qx 配額 0/1(本量測未觸發缺陷)

## Test plan

- [x] Phase 1-4 程序按 `.docs/fr013-mac-m1-measurement-template.md` 執行
- [x] `pnpm exec prettier --check .docs/*.md` 綠
- [x] 無 code 變更 → mandatory gates 不受影響(`pnpm typecheck` / `pnpm lint` /
      `pnpm test` 已於兩平台分別跑過,皆綠)

## Out of scope

- CI 自動化雙平台 parity(對應 001 FR-017 CI gap)— 本 PR 仍是手動 attest
- 下次量測:建議下季(2026-Q4)重跑一次,確認沒有 regression

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## 為什麼預先草擬這個 template?

1. **Mac M1 access 不在當下** — 等到拿到 hardware 那天,記憶會冷,流程細節易漏
2. **降低執行門檻** — 拿到機器當天直接照本檔 checklist 跑,不用再去翻 spec /
   parity-validation.md / matrix 拼湊上下文
3. **PR 預期內容鎖定** — patch 形狀已預先 review 過,實際量測完成後 PR 應只
   含「填空後的數字」+「刪除本 template 檔」,reviewer 一眼就能判斷
4. **與 SDD pipeline 對齊** — 此 template 本身遵循 spec-kit 的「先有計畫再執行」
   原則(Phase 1-5 對應 brainstorm → measure → diff → classify → land)

完成 measurement 並 PR merge 後,本檔即可刪除(per Patch F)。
