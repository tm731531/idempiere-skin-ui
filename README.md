# iDempiere 醫療診所 UI

基於 iDempiere REST API 的醫療診所前端系統。

## 專案概況

為醫療診所提供現代化、Mobile First 的操作介面，取代傳統 ZK 框架。以 Vue 3 + TypeScript 開發，透過 OSGi WAB Bundle 部署至 iDempiere 伺服器。

| 項目 | 內容 |
|------|------|
| 前端框架 | Vue 3 + Vite + TypeScript |
| API | iDempiere 12 REST API |
| 部署方式 | OSGi WAB JAR Bundle (Felix Web Console) |
| 測試 | Vitest — 266 tests / 18 test files |
| URL | `https://<host>:8443/ui/#/` |

## 功能模組

### 櫃台 (Counter)
| 功能 | 說明 |
|------|------|
| 掛號 | 身分證查詢/新增病人 → 選醫師 → 掛號；支援健保卡讀取自動帶入 |
| 候診看板 | 即時候診/叫號清單，依醫師分組 |
| 結帳 | 已配藥處方彙總，標記已收費 |

### 醫師 (Doctor)
| 功能 | 說明 |
|------|------|
| 看診 | 候診清單 → 看診 → 完成 |
| 開藥 | 處方開立、處方範本套用、歷史處方查詢 |

### 藥局 (Pharmacy)
| 功能 | 說明 |
|------|------|
| 配藥 | 待配藥清單 → 掃碼配藥 → 完成 |

### 庫存 (Inventory)
| 功能 | 說明 |
|------|------|
| 轉倉 | 批次轉倉（單一 M_Movement + 多 M_MovementLine） |
| 轉倉紀錄 | 歷史查詢，支援展開明細 |
| 入庫 | 收貨掃碼入庫 |
| 盤點 | 庫存盤點，掃碼逐品項盤 |
| 各倉庫存 | 依產品查看各倉庫現有庫存 |
| 採購單 | 建立採購單（自動查詢供應商地址，缺少時自動建立） |

### 產品管理
| 功能 | 說明 |
|------|------|
| 產品列表 | 搜尋、檢視、編輯產品資訊 |
| 新增產品 | 掃碼建立產品，自動查詢稅別 |
| 單位換算 | 產品 UOM 換算設定（C_UOM_Conversion） |

### 管理 (Admin)
| 功能 | 說明 |
|------|------|
| 醫師管理 | S_Resource CRUD |
| 健保讀卡設定 | tw-nhi-icc-service 下載/安裝說明、服務狀態檢查、測試讀卡 |

### 共用功能
| 功能 | 說明 |
|------|------|
| 多步驟登入 | Client → Role → Org → Warehouse（單一選項自動跳過） |
| 角色首頁 | 依登入角色顯示不同選單 |
| 病人標記 | WARNING / ALLERGY / VIP / CHRONIC / DEBT |
| 條碼掃描 | 手機相機掃描（html5-qrcode）+ 手動輸入 |
| 健保卡讀取 | 透過本地 tw-nhi-icc-service 讀取 NHI IC 卡，自動帶入身分證/姓名 |

## 專案結構

```
webapp/src/
├── api/                    # REST API 模組
│   ├── client.ts           #   axios instance + interceptors
│   ├── registration.ts     #   掛號/病人
│   ├── inventory.ts        #   庫存/轉倉/入庫
│   ├── pharmacy.ts         #   配藥
│   ├── product.ts          #   產品 CRUD
│   ├── purchase.ts         #   採購單
│   ├── checkout.ts         #   結帳
│   ├── doctor.ts           #   看診/處方
│   ├── resource.ts         #   S_Resource（醫師）
│   ├── uomConversion.ts    #   單位換算
│   ├── nhi.ts              #   健保卡讀取（native fetch → localhost:8000）
│   ├── lookup.ts           #   動態 ID 查詢 + session cache
│   └── __tests__/          #   單元測試（18 files, 266 tests）
├── stores/                 # Pinia stores
│   ├── auth.ts             #   認證 + context 切換
│   ├── registration.ts     #   掛號流程
│   ├── inventory.ts        #   庫存操作
│   ├── pharmacy.ts         #   配藥流程
│   ├── doctor.ts           #   看診流程
│   ├── checkout.ts         #   結帳流程
│   ├── stockcount.ts       #   盤點流程
│   └── purchase.ts         #   採購流程
├── views/                  # 頁面元件
│   ├── LoginView.vue
│   ├── HomeView.vue        #   角色首頁
│   ├── counter/            #   掛號、候診、結帳
│   ├── doctor/             #   看診、開藥
│   ├── pharmacy/           #   配藥
│   ├── inventory/          #   轉倉、入庫、盤點、採購、產品、庫存
│   └── admin/              #   醫師管理、健保讀卡設定
├── router/index.ts         # 路由定義
└── components/             # 共用元件（BarcodeInput）
```

## 建置與部署

```bash
# 安裝依賴
cd webapp && npm install

# 執行測試
npx vitest run

# 建置 + 部署 JAR 到 iDempiere plugins 目錄
cd .. && bash build.sh --deploy

# 透過 Felix Web Console 更新 bundle
# https://<host>:8443/osgi/system/console/bundles
# 帳號: SuperUser / System
```

## 設計原則

1. **Mobile First** — 手機優先設計，所有按鈕 ≥ 48px
2. **掃碼為主** — 減少打字，條碼/QR Code 掃描
3. **一頁一事** — 每個畫面專注一個工作流程
4. **動態查詢** — 不硬編 ID，所有 reference 透過 lookup API 動態取得
5. **錯誤不吞** — completion 錯誤回傳 UI 顯示，不靜默失敗

## 文件

```
docs/
├── BUSINESS_DECISIONS.md              # 商業邏輯決策紀錄
├── brainstorming/                     # 設計討論
├── requirements/system-requirements.md # 系統需求規格
├── flows/all-flows.md                 # 流程圖
├── wireframes/ui-wireframes.md        # UI 畫面草圖
└── test-cases/test-scenarios.md       # 測試情境
```

## 開發狀態

- [x] 需求討論 & 流程設計
- [x] UI Wireframe & 測試情境
- [x] 登入 & 角色首頁
- [x] 掛號 / 候診 / 看診 / 開藥
- [x] 配藥 / 結帳
- [x] 庫存（轉倉 / 入庫 / 盤點）
- [x] 產品管理 / 採購單
- [x] 醫師管理 / 單位換算
- [x] 健保卡讀取整合
- [x] 單元測試（266 tests passing）
- [ ] 整合測試
- [ ] 正式上線
