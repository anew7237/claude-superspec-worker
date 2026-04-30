# Phase 1 Data Model: GET /echo Endpoint

**Date**: 2026-04-30
**Spec**: [spec.md](./spec.md) — see "Key Entities" section
**Plan**: [plan.md](./plan.md)

> **Note**:本 feature 為純 stateless echo endpoint,**無持久化資料 / 無 entity / 無 schema**。
> 此檔僅作為 SDD pipeline 完整性形式存在(spec-kit 流程要求每個 feature 有 data-model.md,
> 即便為空亦顯式記錄「為何空」)。

## Process / API Entities(暫態,僅 request lifetime)

僅有兩個暫態結構,生命週期 = 一次 HTTP request 處理時間:

### EchoRequest(讀取自 query string)

- **fields**:
  - `msg`:`string \| undefined`(由 `c.req.query('msg')` 回傳)
- **驗證規則**:`msg !== undefined && msg !== ''` → 視為合法;否則回 400
- **持久化**:無

### EchoResponseBody(JSON,2 種 variant)

- **Success variant**:`{ "message": string }` — value 為 `EchoRequest.msg` 之忠實 echo
- **Error variant**:`{ "error": "missing msg" }` — 字面字串,英文小寫,client 可 string-equality match

## Relationships

無 — endpoint 不涉資料間關係,單一 in→out 映射。

## State Transitions

無 — endpoint 為 stateless,無生命週期狀態機。

## 為何 data-model.md 在此仍存在

per `.specify/templates/plan-template.md` `### Documentation (this feature)` 結構,data-model.md 為
expected artifact;省略會讓 `/speckit-analyze` 跨 artifact 一致性掃描標 missing。本檔以
explicit「無 entity」聲明取代省略,讓 derivative auditors 一眼可確認此 feature 為純 stateless,
而非「漏寫 data model」。
