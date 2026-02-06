# 健保申報整合規格

## 概述

台灣全民健康保險（NHI）申報整合，包含健保卡讀取、點數計算、申報資料產出、健保署上傳。

**優先級：P0（最高）**

---

## 1. 健保卡讀取

### 1.1 硬體需求

| 項目 | 規格 |
|------|------|
| 讀卡機 | 符合健保署規範的 IC 卡讀卡機 |
| 介面 | USB HID 或 PC/SC |
| 常見型號 | 虹堡 EZ100PU、訊想 IT500 |

### 1.2 整合方式

#### 方案 A：WebUSB API（推薦）
```javascript
// 現代瀏覽器原生支援，不需安裝外掛
navigator.usb.requestDevice({ filters: [{ vendorId: 0x... }] })
```

**優點：**
- 不需安裝額外軟體
- 跨平台支援（Chrome, Edge）
- 安全性高（需使用者授權）

**缺點：**
- Safari/Firefox 不支援
- 需要 HTTPS

#### 方案 B：本機代理程式
```
瀏覽器 <--WebSocket--> 本機代理程式 <--PC/SC--> 讀卡機
```

**優點：**
- 所有瀏覽器都支援
- 可整合現有健保卡元件

**缺點：**
- 需安裝本機程式
- 維護成本較高

#### 方案 C：健保署官方元件
- 使用健保署提供的 ActiveX 或 Web 元件
- 需遵循健保署規範

### 1.3 讀取資料欄位

| 欄位 | 說明 | 用途 |
|------|------|------|
| 身分證字號 | 10 碼 | 病人識別 |
| 姓名 | 中文姓名 | 顯示用 |
| 生日 | YYYYMMDD | 年齡計算 |
| 性別 | M/F | 處方判斷 |
| 卡片號碼 | 12 碼 | 就醫序號 |
| 就醫可用次數 | 0-6 | 檢查是否可用 |
| 卡片狀態 | 正常/註銷/過期 | 檢查有效性 |

### 1.4 API 設計

```typescript
// 健保卡服務介面
interface NHICardService {
  // 連接讀卡機
  connect(): Promise<boolean>

  // 讀取基本資料
  readBasicData(): Promise<NHICardData>

  // 讀取就醫紀錄
  readMedicalRecords(): Promise<MedicalRecord[]>

  // 寫入就醫紀錄
  writeMedicalRecord(record: MedicalRecord): Promise<boolean>

  // 更新就醫次數
  updateVisitCount(): Promise<boolean>

  // 斷開連接
  disconnect(): void
}

interface NHICardData {
  idNumber: string        // 身分證字號
  name: string            // 姓名
  birthday: string        // 生日 YYYYMMDD
  gender: 'M' | 'F'       // 性別
  cardNumber: string      // 卡片號碼
  visitCount: number      // 可用就醫次數
  cardStatus: CardStatus  // 卡片狀態
  issueDate: string       // 發卡日期
  expiryDate: string      // 有效期限
}

interface MedicalRecord {
  visitDate: string       // 就醫日期
  hospitalCode: string    // 醫療院所代碼
  visitType: string       // 就醫類別
  serialNumber: string    // 就醫序號
}
```

### 1.5 錯誤處理

| 錯誤碼 | 說明 | 處理方式 |
|--------|------|----------|
| E001 | 讀卡機未連接 | 提示插入讀卡機 |
| E002 | 健保卡未插入 | 提示插入健保卡 |
| E003 | 健保卡已過期 | 提示更換健保卡 |
| E004 | 就醫次數已滿 | 提示需更新卡片 |
| E005 | 卡片已註銷 | 拒絕服務，提示聯繫健保署 |
| E006 | 讀取失敗 | 重試或手動輸入 |

---

## 2. 健保點數計算

### 2.1 計算規則

#### 診察費
| 項目 | 點數 | 條件 |
|------|------|------|
| 西醫門診診察費 | 271 | 一般 |
| 中醫門診診察費 | 300 | 一般 |
| 複診 | 降 20% | 同一疾病 14 天內 |

#### 藥費
```
藥費點數 = Σ(藥品單價 × 數量 × 給付比率)
```

| 藥品類型 | 給付比率 |
|----------|----------|
| 健保用藥 | 100% |
| 部分給付 | 依規定 |
| 自費藥品 | 0% |

#### 藥事服務費
| 調劑天數 | 點數 |
|----------|------|
| 1-7 天 | 48 |
| 8-14 天 | 57 |
| 15-21 天 | 66 |
| 22-28 天 | 75 |
| 29 天以上 | 84 |

### 2.2 點數計算服務

```typescript
interface NHIPointsService {
  // 計算診察費
  calculateConsultationFee(params: ConsultationParams): number

  // 計算藥費
  calculateMedicineFee(prescriptions: Prescription[]): MedicineFeeResult

  // 計算藥事服務費
  calculatePharmacyFee(days: number): number

  // 計算總點數
  calculateTotal(visit: Visit): NHIPointsSummary

  // 檢查是否符合申報條件
  validateClaim(visit: Visit): ValidationResult
}

interface NHIPointsSummary {
  consultationFee: number    // 診察費
  medicineFee: number        // 藥費
  pharmacyFee: number        // 藥事服務費
  treatmentFee: number       // 治療費
  totalPoints: number        // 總點數
  copayment: number          // 部分負擔
  patientPays: number        // 病人應付
}
```

### 2.3 部分負擔計算

| 身分別 | 門診藥品 | 門診基本 |
|--------|----------|----------|
| 一般 | 依金額級距 | 50-420 元 |
| 低收入戶 | 免 | 免 |
| 榮民 | 免 | 免 |
| 3 歲以下 | 免 | 免 |
| 重大傷病 | 免 | 免 |
| 慢性病連續處方 | 依規定 | 免 |

---

## 3. 申報資料產出

### 3.1 申報檔案格式

#### 門診醫療費用申報檔 (OPDT)
```
欄位說明：
位置 01-02: 資料格式 (固定 "10")
位置 03-12: 醫事機構代碼
位置 13-22: 病人身分證號
位置 23-30: 就醫日期 (YYYYMMDD)
位置 31-32: 就醫科別
位置 33-34: 就醫序號
...
```

#### 門診處方明細檔 (OPDM)
```
欄位說明：
位置 01-02: 資料格式 (固定 "20")
位置 03-12: 醫事機構代碼
位置 13-22: 病人身分證號
位置 23-30: 就醫日期
位置 31-42: 藥品代碼
位置 43-49: 用量 (小數點後兩位)
位置 50-52: 給藥日數
...
```

### 3.2 申報服務介面

```typescript
interface NHIClaimService {
  // 產生申報資料
  generateClaimData(period: ClaimPeriod): ClaimData

  // 驗證申報資料
  validateClaimData(data: ClaimData): ValidationResult[]

  // 匯出申報檔案
  exportClaimFiles(data: ClaimData): ClaimFiles

  // 計算申報統計
  getClaimStatistics(period: ClaimPeriod): ClaimStatistics
}

interface ClaimPeriod {
  year: number              // 民國年
  month: number             // 月份
  type: 'regular' | 'supplementary'  // 正常/補報
}

interface ClaimFiles {
  opdt: Blob                // 門診醫療費用申報檔
  opdm: Blob                // 門診處方明細檔
  summary: Blob             // 申報總表
}
```

### 3.3 申報週期

| 類型 | 申報期限 | 說明 |
|------|----------|------|
| 正常申報 | 次月 20 日前 | 當月就醫資料 |
| 補申報 | 6 個月內 | 漏報或退件重報 |
| 事前審查 | 依規定 | 特殊項目 |

---

## 4. 健保署上傳整合

### 4.1 上傳方式

#### VPN 上傳（主要）
- 透過健保署 VPN 連線
- 使用健保署提供的上傳程式
- 需申請 VPN 帳號

#### 網路申報（備用）
- 透過健保署網站上傳
- 需醫事人員卡認證
- 適合小量資料

### 4.2 上傳流程

```
1. 產生申報檔案
      ↓
2. 檔案格式驗證
      ↓
3. 加密壓縮
      ↓
4. VPN 連線
      ↓
5. 上傳至健保署
      ↓
6. 取得回執
      ↓
7. 等待審核結果
      ↓
8. 下載核定清單
```

### 4.3 回應處理

| 狀態碼 | 說明 | 處理方式 |
|--------|------|----------|
| 00 | 上傳成功 | 記錄回執編號 |
| 01 | 格式錯誤 | 檢查並重新產生 |
| 02 | 重複上傳 | 確認是否需覆蓋 |
| 03 | 逾期上傳 | 改用補申報 |
| 99 | 系統錯誤 | 稍後重試 |

---

## 5. 實作優先順序

### Phase 1: 基礎建設
1. [ ] 健保卡讀取模組（選擇整合方案）
2. [ ] 病人資料自動帶入
3. [ ] 基本點數計算

### Phase 2: 核心功能
1. [ ] 完整點數計算引擎
2. [ ] 部分負擔計算
3. [ ] 申報資料產生

### Phase 3: 整合上傳
1. [ ] 申報檔案匯出
2. [ ] 格式驗證工具
3. [ ] VPN 上傳整合

### Phase 4: 進階功能
1. [ ] 申報追蹤
2. [ ] 核定結果匯入
3. [ ] 異常件處理
4. [ ] 統計報表

---

## 6. 相關法規參考

- 全民健康保險法
- 全民健康保險醫療費用申報與核付及醫療服務審查辦法
- 全民健康保險醫事服務機構醫療服務審查辦法
- 健保署各項公告及函釋

---

## 7. 外部資源

- [健保署全球資訊網](https://www.nhi.gov.tw/)
- [醫事機構網路申報及核付作業](https://www.nhi.gov.tw/ch/np-1698-1.html)
- [健保卡規格文件](https://www.nhi.gov.tw/ch/np-1866-1.html)
- [藥品給付規定](https://www.nhi.gov.tw/ch/lp-3740-1.html)
