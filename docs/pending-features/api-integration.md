# iDempiere REST API 整合規格

## 概述

前端與 iDempiere 後端的 API 串接規格，包含認證、各模組 CRUD 操作、錯誤處理。

**優先級：P0（最高）**

---

## 1. 認證機制

### 1.1 登入流程

```typescript
// Step 1: 取得 Token
POST /api/v1/auth/tokens
{
  "userName": "YishouA",
  "password": "YishouA"
}

// Response
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9...",
  "clients": [
    { "id": 1000000, "name": "Yishou" }
  ],
  "roles": [
    { "id": 1000000, "name": "Admin", "clientId": 1000000 }
  ]
}
```

```typescript
// Step 2: 設定 Context
PUT /api/v1/auth/tokens
Authorization: Bearer {token}
{
  "clientId": 1000000,
  "roleId": 1000000,
  "organizationId": 1000000,
  "warehouseId": 1000001
}
```

### 1.2 Token 管理

```typescript
interface AuthService {
  // 登入
  login(username: string, password: string): Promise<LoginResult>

  // 設定 Context
  setContext(context: UserContext): Promise<void>

  // 登出
  logout(): Promise<void>

  // 刷新 Token
  refreshToken(): Promise<string>

  // 檢查 Token 是否有效
  isTokenValid(): boolean

  // 取得當前使用者
  getCurrentUser(): User | null
}

interface UserContext {
  clientId: number
  roleId: number
  organizationId: number
  warehouseId: number
}
```

### 1.3 錯誤處理

| HTTP 狀態碼 | 說明 | 處理方式 |
|-------------|------|----------|
| 401 | 未認證 | 導向登入頁 |
| 403 | 無權限 | 顯示權限不足訊息 |
| 440 | Token 過期 | 嘗試刷新或重新登入 |

---

## 2. 病人管理 API

### 2.1 病人資料 (C_BPartner)

```typescript
// 查詢病人
GET /api/v1/models/c_bpartner?$filter=IsCustomer eq 'Y' and Value eq '{身分證字號}'

// 新增病人
POST /api/v1/models/c_bpartner
{
  "Name": "王小明",
  "Value": "A123456789",
  "C_BP_Group_ID": 1000000,
  "IsCustomer": true,
  "AD_Language": "zh_TW"
}

// 更新病人
PUT /api/v1/models/c_bpartner/{id}
{
  "Phone": "0912345678",
  "EMail": "test@example.com"
}
```

### 2.2 病人服務介面

```typescript
interface PatientService {
  // 依身分證查詢
  findByIdNumber(idNumber: string): Promise<Patient | null>

  // 依健保卡資料建立
  createFromNHICard(cardData: NHICardData): Promise<Patient>

  // 更新病人資料
  update(id: number, data: Partial<Patient>): Promise<Patient>

  // 查詢病人就醫紀錄
  getMedicalHistory(patientId: number): Promise<MedicalRecord[]>

  // 查詢病人過敏史
  getAllergies(patientId: number): Promise<Allergy[]>

  // 新增病人標記
  addTag(patientId: number, tag: PatientTag): Promise<void>
}

interface Patient {
  id: number
  idNumber: string           // 身分證字號
  name: string               // 姓名
  birthday: Date             // 生日
  gender: 'M' | 'F'          // 性別
  phone: string              // 電話
  address: string            // 地址
  email?: string             // Email
  tags: PatientTag[]         // 標記（VIP、注意、過敏等）
  nhiBirthday?: string       // 健保卡生日（可能與實際不同）
}

type PatientTag = 'VIP' | 'CAUTION' | 'ALLERGY' | 'CHRONIC' | 'DEBT'
```

---

## 3. 掛號管理 API

### 3.1 掛號單 (自訂 Table)

```typescript
// 建立掛號
POST /api/v1/models/yishou_registration
{
  "C_BPartner_ID": 1000001,
  "VisitDate": "2026-02-06",
  "DoctorID": 1000002,
  "VisitType": "FIRST",      // FIRST:初診, RETURN:複診
  "Status": "WAITING",        // WAITING:候診, CALLING:叫號中, DONE:完成
  "QueueNumber": 15,
  "NHISerialNumber": "001"
}

// 查詢今日掛號
GET /api/v1/models/yishou_registration?$filter=VisitDate eq '2026-02-06' and Status eq 'WAITING'&$orderby=QueueNumber
```

### 3.2 掛號服務介面

```typescript
interface RegistrationService {
  // 掛號
  register(data: RegistrationInput): Promise<Registration>

  // 取消掛號
  cancel(id: number, reason: string): Promise<void>

  // 叫號
  callNext(doctorId: number): Promise<Registration | null>

  // 過號
  skip(id: number): Promise<void>

  // 查詢候診清單
  getWaitingList(doctorId?: number): Promise<Registration[]>

  // 查詢候診人數
  getWaitingCount(doctorId?: number): Promise<number>

  // 取得下一個號碼
  getNextQueueNumber(): Promise<number>
}

interface Registration {
  id: number
  patient: Patient
  visitDate: Date
  doctorId: number
  doctorName: string
  visitType: 'FIRST' | 'RETURN'
  status: 'WAITING' | 'CALLING' | 'CONSULTING' | 'DONE' | 'CANCELLED'
  queueNumber: number
  nhiSerialNumber: string
  registrationTime: Date
  calledTime?: Date
  consultStartTime?: Date
  consultEndTime?: Date
}
```

---

## 4. 看診/處方 API

### 4.1 處方單 (自訂 Table)

```typescript
// 建立處方
POST /api/v1/models/yishou_prescription
{
  "Registration_ID": 1000001,
  "C_BPartner_ID": 1000001,
  "DoctorID": 1000002,
  "Diagnosis": "感冒",
  "DiagnosisCode": "J00",     // ICD-10
  "TotalDays": 7,
  "Status": "DRAFT"
}

// 新增處方明細
POST /api/v1/models/yishou_prescriptionline
{
  "Prescription_ID": 1000001,
  "M_Product_ID": 1000100,    // 藥品
  "Dosage": 1.5,              // 劑量
  "Unit": "g",                // 單位
  "Frequency": "TID",         // 頻率
  "Days": 7,                  // 天數
  "Route": "PO",              // 途徑 (口服)
  "Instructions": "飯後服用"
}
```

### 4.2 處方服務介面

```typescript
interface PrescriptionService {
  // 建立處方
  create(registration: Registration): Promise<Prescription>

  // 新增藥品
  addMedicine(prescriptionId: number, medicine: PrescriptionLine): Promise<void>

  // 移除藥品
  removeMedicine(prescriptionId: number, lineId: number): Promise<void>

  // 載入處方組合
  loadTemplate(prescriptionId: number, templateId: number): Promise<void>

  // 完成處方
  complete(prescriptionId: number): Promise<void>

  // 計算健保點數
  calculateNHIPoints(prescriptionId: number): Promise<NHIPointsSummary>

  // 檢查藥品交互作用
  checkInteractions(prescriptionId: number): Promise<DrugInteraction[]>

  // 查詢病人歷史處方
  getPatientHistory(patientId: number, limit?: number): Promise<Prescription[]>
}

interface Prescription {
  id: number
  registration: Registration
  patient: Patient
  doctor: Doctor
  diagnosis: string
  diagnosisCode: string       // ICD-10
  lines: PrescriptionLine[]
  totalDays: number
  status: 'DRAFT' | 'COMPLETED' | 'DISPENSED' | 'CANCELLED'
  nhiPoints?: NHIPointsSummary
  createdAt: Date
  completedAt?: Date
}

interface PrescriptionLine {
  id: number
  product: Product
  dosage: number              // 劑量
  unit: string                // 單位
  frequency: string           // TID, BID, QD 等
  days: number                // 天數
  route: string               // PO, IV, IM 等
  instructions?: string       // 備註
  totalQuantity: number       // 總量（自動計算）
}
```

---

## 5. 配藥/藥房 API

### 5.1 配藥單

```typescript
// 查詢待配藥處方
GET /api/v1/models/yishou_prescription?$filter=Status eq 'COMPLETED'&$orderby=CompletedAt

// 開始配藥
PUT /api/v1/models/yishou_prescription/{id}
{
  "Status": "DISPENSING",
  "DispenserId": 1000003
}

// 完成配藥
PUT /api/v1/models/yishou_prescription/{id}
{
  "Status": "DISPENSED",
  "DispensedAt": "2026-02-06T10:30:00"
}
```

### 5.2 配藥服務介面

```typescript
interface DispensingService {
  // 查詢待配藥清單
  getPendingList(): Promise<Prescription[]>

  // 開始配藥
  startDispensing(prescriptionId: number): Promise<void>

  // 記錄配藥明細
  recordDispensing(prescriptionId: number, line: DispensingLine): Promise<void>

  // 完成配藥
  completeDispensing(prescriptionId: number): Promise<void>

  // 扣庫存
  deductInventory(prescriptionId: number): Promise<InventoryResult>

  // 檢查庫存是否足夠
  checkInventory(prescriptionId: number): Promise<InventoryCheckResult>

  // 列印藥袋
  printMedicineBag(prescriptionId: number): Promise<Blob>
}

interface DispensingLine {
  prescriptionLineId: number
  actualQuantity: number      // 實際配藥量
  batchNumber?: string        // 批號
  warehouseId: number         // 來源倉庫
  note?: string
}

interface InventoryCheckResult {
  sufficient: boolean
  details: {
    productId: number
    productName: string
    required: number
    available: number
    shortage: number
    alternativeWarehouses?: {
      warehouseId: number
      warehouseName: string
      available: number
    }[]
  }[]
}
```

---

## 6. 庫存管理 API

### 6.1 庫存查詢 (M_StorageOnHand)

```typescript
// 查詢藥品庫存
GET /api/v1/models/m_storageonhand?$filter=M_Product_ID eq {productId}&$expand=M_Locator_ID

// 查詢倉庫庫存
GET /api/v1/models/m_storageonhand?$filter=M_Locator_ID/M_Warehouse_ID eq {warehouseId}
```

### 6.2 庫存異動 (M_Movement)

```typescript
// 建立調撥單
POST /api/v1/models/m_movement
{
  "MovementDate": "2026-02-06",
  "Description": "藥房補貨"
}

// 新增調撥明細
POST /api/v1/models/m_movementline
{
  "M_Movement_ID": 1000001,
  "M_Product_ID": 1000100,
  "M_Locator_ID": 1000001,        // 來源儲位
  "M_LocatorTo_ID": 1000002,      // 目標儲位
  "MovementQty": 100
}

// 完成調撥
POST /api/v1/models/m_movement/{id}/docaction
{
  "docAction": "CO"
}
```

### 6.3 庫存服務介面

```typescript
interface InventoryService {
  // 查詢藥品庫存
  getProductStock(productId: number, warehouseId?: number): Promise<StockInfo>

  // 查詢倉庫總覽
  getWarehouseOverview(warehouseId: number): Promise<WarehouseStock[]>

  // 查詢低庫存藥品
  getLowStockProducts(warehouseId?: number): Promise<LowStockProduct[]>

  // 建立調撥單
  createTransfer(transfer: TransferInput): Promise<Transfer>

  // 執行調撥
  executeTransfer(transferId: number): Promise<void>

  // 掃碼入庫
  receiveByBarcode(barcode: string, quantity: number): Promise<ReceiveResult>

  // 盤點
  createPhysicalCount(warehouseId: number): Promise<PhysicalCount>

  // 更新盤點數量
  updateCountLine(countId: number, productId: number, counted: number): Promise<void>

  // 完成盤點
  completeCount(countId: number): Promise<CountResult>
}

interface StockInfo {
  productId: number
  productName: string
  totalQty: number
  warehouses: {
    warehouseId: number
    warehouseName: string
    qty: number
    locators: {
      locatorId: number
      locatorName: string
      qty: number
    }[]
  }[]
  safetyStock: number
  reorderLevel: number
  status: 'OK' | 'LOW' | 'OUT'
}

interface TransferInput {
  fromWarehouseId: number
  toWarehouseId: number
  lines: {
    productId: number
    quantity: number
  }[]
  description?: string
}
```

---

## 7. 藥品主檔 API

### 7.1 藥品查詢 (M_Product)

```typescript
// 查詢藥品
GET /api/v1/models/m_product?$filter=ProductType eq 'I' and IsActive eq 'Y'&$expand=M_Product_Category_ID

// 依條碼查詢
GET /api/v1/models/m_product?$filter=UPC eq '{barcode}'

// 依藥品代碼查詢
GET /api/v1/models/m_product?$filter=Value eq '{code}'
```

### 7.2 藥品服務介面

```typescript
interface ProductService {
  // 查詢藥品
  search(keyword: string, options?: SearchOptions): Promise<Product[]>

  // 依條碼查詢
  findByBarcode(barcode: string): Promise<Product | null>

  // 依健保碼查詢
  findByNHICode(nhiCode: string): Promise<Product | null>

  // 取得藥品詳情
  getDetail(productId: number): Promise<ProductDetail>

  // 取得藥品價格
  getPrice(productId: number, priceListId?: number): Promise<Price>

  // 取得常用藥品
  getFrequentlyUsed(doctorId?: number, limit?: number): Promise<Product[]>
}

interface Product {
  id: number
  code: string                // 藥品代碼
  name: string                // 品名
  description?: string        // 說明
  barcode?: string            // 條碼
  nhiCode?: string            // 健保碼
  category: string            // 分類
  unit: string                // 單位
  packageSize?: number        // 包裝量
  isNHI: boolean              // 是否健保用藥
  nhiPrice?: number           // 健保價
}

interface ProductDetail extends Product {
  manufacturer: string        // 製造商
  ingredients: string         // 成分
  indications: string         // 適應症
  contraindications: string   // 禁忌
  sideEffects: string         // 副作用
  interactions: string        // 交互作用
  storage: string             // 儲存條件
  images: string[]            // 圖片
}
```

---

## 8. 通用功能

### 8.1 API Client 封裝

```typescript
// src/api/client.ts
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// Request 攔截器
apiClient.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
})

// Response 攔截器
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore()
      await authStore.logout()
      window.location.href = '/ui/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
```

### 8.2 錯誤處理

```typescript
interface APIError {
  code: string
  message: string
  details?: Record<string, unknown>
}

// 通用錯誤處理
function handleAPIError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as APIError
    throw new Error(apiError?.message || '系統錯誤，請稍後再試')
  }
  throw error
}
```

### 8.3 快取策略

| API 類型 | 快取策略 | TTL |
|----------|----------|-----|
| 藥品主檔 | 長期快取 | 1 小時 |
| 庫存查詢 | 短期快取 | 30 秒 |
| 候診清單 | 不快取 | - |
| 掛號建立 | 不快取 | - |

---

## 9. 實作優先順序

### Phase 1: 認證與基礎
1. [ ] 登入/登出
2. [ ] Token 管理
3. [ ] API Client 封裝
4. [ ] 錯誤處理

### Phase 2: 病人與掛號
1. [ ] 病人查詢/建立
2. [ ] 掛號功能
3. [ ] 候診清單
4. [ ] 叫號功能

### Phase 3: 看診與處方
1. [ ] 處方建立
2. [ ] 藥品搜尋
3. [ ] 處方組合
4. [ ] 健保點數計算

### Phase 4: 配藥與庫存
1. [ ] 配藥流程
2. [ ] 庫存查詢
3. [ ] 庫存扣減
4. [ ] 調撥功能

### Phase 5: 進階功能
1. [ ] 即時同步（WebSocket）
2. [ ] 離線支援
3. [ ] 報表匯出
