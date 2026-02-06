# iDempiere 醫療診所 UI - Claude 開發指引

## 專案概述

為醫療診所開發的 iDempiere 前端 UI，基於 REST API，目標是取代傳統 ZK 介面。

**核心設計原則：**
- Mobile First（手機優先）
- 掃碼為主，減少打字
- 一頁一事，極簡操作
- 即時同步，單一真相來源

## 技術架構

| 項目 | 技術選型 |
|------|---------|
| 前端框架 | Vue 3 + Vite + TypeScript |
| API 介面 | iDempiere REST API |
| 部署方式 | OSGi Bundle |
| 程式碼保護 | Minify + Obfuscate |

## 目錄結構

```
idempiere-new-skin-ui/
├── CLAUDE.md                    # 本文件
├── README.md                    # 專案說明
├── docs/                        # 文件
│   ├── brainstorming/           # 設計討論紀錄
│   ├── requirements/            # 需求規格
│   ├── flows/                   # 流程圖
│   ├── wireframes/              # UI 草圖
│   └── test-cases/              # 測試情境
├── webapp/                      # Vue 前端原始碼
│   ├── src/
│   │   ├── api/                 # API 客戶端
│   │   ├── router/              # Vue Router
│   │   ├── stores/              # Pinia 狀態管理
│   │   ├── views/               # 頁面組件
│   │   │   ├── counter/         # 櫃檯模組
│   │   │   ├── doctor/          # 醫生模組
│   │   │   ├── pharmacy/        # 藥房模組
│   │   │   └── inventory/       # 庫存模組
│   │   ├── components/          # 共用組件
│   │   └── composables/         # 組合式函數
│   ├── vite.config.ts           # Vite 設定 (base: /ui/)
│   └── package.json
├── osgi-bundle/                 # OSGi Bundle（部署用）
│   ├── META-INF/MANIFEST.MF     # OSGi 設定
│   ├── plugin.xml               # Eclipse 擴展點（註冊 /ui）
│   ├── build.properties
│   ├── pom.xml                  # Maven 建構
│   └── web/                     # 編譯後的靜態檔案
└── scripts/
    └── backup/                  # 備份還原腳本
```

## 開發指令

```bash
# 1. 安裝依賴（首次）
cd webapp && npm install

# 2. 設定開發環境 API（可選）
cp .env.example .env
# 編輯 .env 設定 VITE_API_URL=http://your-idempiere:8080

# 3. 啟動開發模式
npm run dev
# 瀏覽器開啟 http://localhost:5173/ui/

# 4. 編譯（輸出到 osgi-bundle/web/）
npm run build

# 5. 類型檢查
npm run type-check
```

## 部署說明

**此 JAR 可部署到任何 iDempiere 12 伺服器**

```bash
# 1. 編譯並打包
./build.bat   # Windows
./build.sh    # Linux/Mac

# 2. 複製 JAR 到 iDempiere
cp org.idempiere.ui.clinic_1.0.0.jar /path/to/idempiere/plugins/

# 3. 重啟 iDempiere 或在 OSGi Console 更新
telnet localhost 12612
> update org.idempiere.ui.clinic
> refresh org.idempiere.ui.clinic

# 4. 訪問
http://your-server:8080/ui/
```

**關鍵：** iDempiere 12 需要 `Jetty-Environment: ee8` header（已設定在 MANIFEST.MF）

## 環境配置

### 本地開發 API 代理

開發時需要代理 API 到 iDempiere 伺服器：

```bash
# webapp/.env
VITE_API_URL=http://your-idempiere:8080
```

部署後不需要代理，因為前端跟 API 在同一台伺服器。

### iDempiere REST API 認證流程

```bash
# 1. 登入取得 Token
POST http://{server}:8080/api/v1/auth/tokens
{"userName": "your_user", "password": "your_password"}

# 2. 設定 Context
PUT /api/v1/auth/tokens
Authorization: Bearer {token}
{"clientId": 1000000, "roleId": 1000000, "organizationId": 0, "warehouseId": 0}

# 3. 後續請求帶 Token
Authorization: Bearer {token}
```

### 備份還原腳本

位置：`scripts/backup/`

```bash
# 備份目前資料
./backup.sh

# 列出所有備份
./list-backups.sh

# 比較差異
./compare.sh <backup_folder> <table_name>

# 還原庫存（需確認）
./restore-inventory.sh <backup_folder>
```

設定檔：`scripts/backup/config.env`（不入版控）

## 業務領域知識

### 使用者角色

| 角色 | 職責 | 主要設備 |
|------|------|---------|
| 櫃檯 | 掛號、叫號、結帳 | 平板 |
| 醫生 | 看診、開藥 | 平板 |
| 藥房 | 配藥、扣庫存 | 手機 |
| 庫管（4人） | 進貨、盤點、調撥 | 手機 |
| 採購（2人） | 下單採購 | 手機 |

### 藥品類型與單位

| 類型 | 進貨單位 | 庫存單位 | 開藥單位 | 扣庫存時機 |
|------|---------|---------|----------|-----------|
| 科中 | 罐 | 罐 | g | 配藥時 |
| 藥粉 | 包/罐 | g | g | 配藥時 |
| 袋裝 | 包 | g | g | 配藥時 |
| 水藥-散賣 | 包 | g | g | 交付時 |
| 水藥-整包 | 包 | 包 | 包 | 交付時 |
| 水藥-煮袋 | 包 | g | 帖 | **下鍋時** |

### 倉庫配置

| 倉庫 | 用途 | 優先級 |
|------|------|--------|
| 藥房 | 配藥用 | 優先扣這裡 |
| 庫房 | 備貨用 | 藥房不夠來這拿 |
| 前台 | 少量常用藥 | - |

### 核心流程

**看診循環：**
```
刷健保卡 → 掛號 → 候診 → 叫號 → 看診 → 開藥 → 配藥 → 結帳 → 離開
```

**採購循環：**
```
庫存不足 → 建採購單 → 送出 → 等到貨 → 掃碼入庫 → 庫存更新
```

**調撥流程（最低負擔）：**
```
上樓 → 掃藥品條碼 → 輸入數量 → 確認 → 自動記錄
```

### 重要設計決策

1. **扣庫存時機**：配藥完成時扣，不是開藥時扣（避免退藥問題）
2. **水藥煮袋**：下鍋時就扣，因為煮了就不能給別人
3. **叫號機制**：認卡不認人，按刷卡順序
4. **處方組合**：醫生的常用藥組合要系統化，不能只存在藥房小姐腦中
5. **庫管合作**：任務制盤點，誰有空誰接，打破各管各的

### 用語對照

| iDempiere 術語 | 使用者聽得懂的說法 |
|---------------|-------------------|
| 在途訂單 | 「已訂貨，X天後到」 |
| 庫存量 | 「現在有 N 個」 |
| 安全庫存 | 「建議補貨」 |
| 採購建議 | 「要不要買？」 |

## 開發指引

### UI 設計規範

**庫存狀態顏色：**
| 狀態 | 顏色 | 條件 |
|------|------|------|
| 充足 | 🟢 綠 | 藥房庫存 >= 需求 |
| 需調撥 | 🟡 黃 | 藥房不夠，但庫房有 |
| 缺貨 | 🔴 紅 | 完全沒有 |

**候診人數提醒：**
| 人數 | 顏色 | 意涵 |
|------|------|------|
| 0-3 | 🟢 綠 | 正常 |
| 4-10 | 🟡 黃 | 該加快 |
| 10+ | 🔴 紅 | 別聊了 |

**病人標記：**
| 標記 | 圖示 | 說明 |
|------|------|------|
| 注意 | ⚠️ | 難搞、愛抱怨 |
| 過敏 | 💊 | 藥物過敏史 |
| VIP | ❤️ | 重要客人 |
| 慢性 | 🔄 | 慢性病患 |
| 欠款 | 💰 | 有未付款紀錄 |

### 按鈕尺寸（觸控友善）

| 類型 | 最小高度 |
|------|---------|
| 主要按鈕 | 48px |
| 列表項目 | 56px |
| 數字鍵盤 | 64px |

## 測試策略

### 測試分層

| 層級 | 框架 | 內容 |
|------|------|------|
| 單元測試 | Vitest | 元件、邏輯 |
| 整合測試 | Vitest + API | API 呼叫 |
| E2E 測試 | Playwright | 完整流程 |

### 測試環境

- 測試用獨立 Client，不影響正式資料
- 測試資料可隨時 Reset
- 每天凌晨自動重置

### Reset 機制

測試資料重置時：
- ✅ 保留：使用者帳號、藥品主檔、廠商、病人基本資料、處方組合
- 🗑️ 清除：交易紀錄、掛號紀錄、預約紀錄
- 🔄 重置：庫存數量回到初始值

## 可用技能

### iDempiere API 相關

```
/idempiere-api:test <module>   # 執行 API 測試
/idempiere-api:create <doc>    # 單據建立指導
/idempiere-api:debug           # 錯誤診斷
/idempiere-api:modules         # 列出所有模組
```

### 開發流程相關

```
/commit                        # 建立 git commit
/commit-push-pr                # Commit + Push + 開 PR
```

## 文件參考

| 文件 | 路徑 | 內容 |
|------|------|------|
| 討論紀錄 | docs/brainstorming/2026-02-06-design-discussion.md | 完整設計討論過程 |
| 需求規格 | docs/requirements/system-requirements.md | 功能清單+優先級 |
| 流程圖 | docs/flows/all-flows.md | 9 大業務流程 |
| UI 草圖 | docs/wireframes/ui-wireframes.md | 10+ 畫面設計 |
| 測試情境 | docs/test-cases/test-scenarios.md | 30+ 測試案例 |

## 注意事項

1. **不要用 ERP 術語** - 用醫療人員聽得懂的話
2. **減少輸入負擔** - 能掃碼就不要打字，能一鍵就不要多鍵
3. **庫存準確性** - 開罐時要 Double Check
4. **權限隔離** - 測試資料不能影響正式環境
5. **健保整合** - 需要計算點數、串接健保署（P0 功能）

## 開發狀態

- [x] 需求討論
- [x] 流程設計
- [x] UI Wireframe
- [x] 測試情境規劃
- [x] 備份還原腳本
- [x] 開發環境設定（Vue 專案骨架）
- [x] OSGi WAB Bundle 結構（Jetty 12 + ee8）
- [x] 部署測試通過（/ui/ 可訪問）
- [ ] 功能開發（詳見 docs/pending-features/）
  - [x] 登入頁面（骨架）
  - [x] 首頁選單（骨架）
  - [ ] 健保卡整合
  - [ ] API 串接
  - [ ] 掛號功能
  - [ ] 叫號系統
  - [ ] 看診/開藥
  - [ ] 配藥功能
  - [ ] 結帳功能
  - [ ] 庫存功能
- [ ] 測試
- [ ] 正式部署
