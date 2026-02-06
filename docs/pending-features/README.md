# 待實作功能清單

## 概述

本目錄包含所有尚未實作的功能規格文件。

**目前狀態：** 僅完成 OSGi WAB 部署框架與 Vue 專案骨架，所有業務功能皆未實作。

---

## 文件索引

| 文件 | 說明 | 優先級 |
|------|------|--------|
| [health-insurance-integration.md](./health-insurance-integration.md) | 健保申報整合（讀卡、點數、申報） | P0 |
| [api-integration.md](./api-integration.md) | iDempiere REST API 串接 | P0 |
| [module-counter.md](./module-counter.md) | 櫃檯模組（掛號、叫號、結帳） | P0 |
| [module-doctor.md](./module-doctor.md) | 醫生模組（看診、開藥） | P0 |
| [module-pharmacy.md](./module-pharmacy.md) | 藥房模組（配藥、扣庫存） | P0 |
| [module-inventory.md](./module-inventory.md) | 庫存模組（查詢、調撥、入庫、盤點） | P1 |

---

## 實作狀態總覽

### 已完成 ✅

- [x] Vue 3 + Vite + TypeScript 專案建立
- [x] OSGi WAB Bundle 結構（Jetty 12 + ee8）
- [x] 路由設定（base: /ui/）
- [x] 頁面骨架（登入、首頁、各模組空殼）
- [x] API Client 基礎架構
- [x] Pinia 狀態管理設定
- [x] 部署到 iDempiere（/ui/ 可訪問）

### 未完成 ❌

#### P0 最高優先級

- [ ] **健保卡讀取**
  - [ ] 讀卡機整合（WebUSB 或本機代理）
  - [ ] 讀取基本資料
  - [ ] 寫入就醫紀錄

- [ ] **健保點數計算**
  - [ ] 診察費計算
  - [ ] 藥費計算
  - [ ] 部分負擔計算

- [ ] **健保申報**
  - [ ] 申報資料產生
  - [ ] 申報檔案匯出
  - [ ] 健保署上傳

- [ ] **API 串接**
  - [ ] 認證登入
  - [ ] 病人管理
  - [ ] 掛號管理
  - [ ] 處方管理
  - [ ] 庫存管理

- [ ] **櫃檯功能**
  - [ ] 掛號作業
  - [ ] 叫號系統
  - [ ] 結帳收款

- [ ] **醫生功能**
  - [ ] 看診作業
  - [ ] 開藥功能
  - [ ] 處方組合

- [ ] **藥房功能**
  - [ ] 配藥作業
  - [ ] 庫存扣減
  - [ ] 藥袋列印

#### P1 高優先級

- [ ] **庫存功能**
  - [ ] 庫存查詢
  - [ ] 調撥作業
  - [ ] 入庫作業
  - [ ] 盤點作業
  - [ ] 採購建議

#### P2 中優先級

- [ ] 即時同步（WebSocket）
- [ ] 離線支援
- [ ] 報表功能
- [ ] 通知推播

---

## 開發建議順序

### 第一階段：核心流程

```
1. API 認證登入
2. 病人查詢/建立（手動輸入）
3. 掛號功能
4. 候診清單
5. 基本開藥
6. 配藥流程
7. 庫存扣減
```

**目標：** 完成基本看診流程（不含健保）

### 第二階段：健保整合

```
1. 健保卡讀取
2. 自動帶入病人資料
3. 健保點數計算
4. 部分負擔計算
5. 結帳功能
```

**目標：** 健保就醫流程完整

### 第三階段：進階功能

```
1. 處方組合
2. 藥物交互作用
3. 叫號看板
4. 庫存警示
5. 調撥功能
```

### 第四階段：申報與報表

```
1. 健保申報資料產生
2. 申報檔案匯出
3. 統計報表
4. 營運分析
```

---

## 技術決策紀錄

### 已確定

| 項目 | 決策 | 原因 |
|------|------|------|
| 部署方式 | OSGi WAB | iDempiere 12 標準 |
| HTTP Header | Jetty-Environment: ee8 | Jetty 12 需要 |
| 前端框架 | Vue 3 + Vite | 現代化、效能佳 |
| 狀態管理 | Pinia | Vue 3 官方推薦 |
| 程式碼保護 | Terser | 混淆 + 最小化 |

### 待決定

| 項目 | 選項 | 待確認 |
|------|------|--------|
| 健保卡讀取 | WebUSB / 本機代理 / 官方元件 | 需測試可行性 |
| 即時同步 | WebSocket / SSE / Polling | 依 iDempiere 支援 |
| 列印方案 | 瀏覽器列印 / 本機服務 | 依印表機需求 |

---

## 相關文件

- [系統需求規格](../requirements/system-requirements.md)
- [業務流程圖](../flows/all-flows.md)
- [UI 線框圖](../wireframes/ui-wireframes.md)
- [測試情境](../test-cases/test-scenarios.md)
- [設計討論紀錄](../brainstorming/2026-02-06-design-discussion.md)
