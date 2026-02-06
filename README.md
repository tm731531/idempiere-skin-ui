# iDempiere 醫療診所 UI

基於 iDempiere REST API 的醫療診所前端系統。

## 專案目標

為醫療診所提供現代化、Mobile First 的操作介面，取代傳統 ZK 框架。

## 文件結構

```
docs/
├── brainstorming/
│   └── 2026-02-06-design-discussion.md   # 設計討論紀錄
├── requirements/
│   └── system-requirements.md             # 系統需求規格
├── flows/
│   └── all-flows.md                       # 流程圖
├── wireframes/
│   └── ui-wireframes.md                   # UI 畫面草圖
└── test-cases/
    └── test-scenarios.md                  # 測試情境與測試資料
```

## 技術選型

| 項目 | 技術 |
|------|------|
| 前端框架 | Vue 3 + Vite + TypeScript |
| API | iDempiere REST API |
| 部署 | OSGi Bundle |

## 核心功能

- 📋 掛號與候診管理
- 🩺 看診與開藥
- 💊 配藥與庫存管理
- 💰 結帳與退費
- 📦 採購與入庫
- 📊 報表統計

## 設計原則

1. **Mobile First** - 手機優先設計
2. **掃碼為主** - 減少打字輸入
3. **一頁一事** - 每個畫面專注一件事
4. **即時同步** - 所有人看到同一份資料

## 開發狀態

- [x] 需求討論
- [x] 流程設計
- [x] UI Wireframe
- [x] 測試情境規劃
- [ ] 開發環境設定
- [ ] 功能開發
- [ ] 測試
- [ ] 部署

## 相關連結

- iDempiere API 測試環境：http://192.168.0.93:8080
- 測試帳號：GardenAdmin / GardenAdmin
