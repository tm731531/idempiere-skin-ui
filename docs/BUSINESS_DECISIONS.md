# 診所 UI 業務決策記錄

本文件記錄 Clinic UI (idempiere-skin-ui) 專案中所有業務相關的決策，包括資料模型對應、流程設計、技術選型等。

---

## 資料模型

將診所業務概念對應到 iDempiere 既有資料表，盡量不建自訂表以簡化部署：

| 診所概念 | iDempiere 對應 | 說明 |
|---------|---------------|------|
| 病人 | C_BPartner (IsCustomer=true) | 病人即客戶，透過 C_BP_Group_ID 歸類 |
| 醫師 | AD_User (IsSalesRep=true) | 醫師即業務代表 |
| 醫師資源 | S_Resource | 代表可排程的醫師看診時段 |
| 掛號/排隊 | S_ResourceAssignment | 一筆掛號 = 一筆資源指派 |
| 掛號狀態 | AD_SysConfig (CLINIC_QUEUE_STATUS_{id}) | 以系統設定儲存狀態 |
| 處方 | AD_SysConfig (CLINIC_PRESCRIPTION_{assignmentId}) | JSON 格式，以看診 ID 為 key |
| 處方範本 | AD_SysConfig (CLINIC_TEMPLATE_{doctorName}_{templateName}) | 每位醫師可建立自己的範本 |
| 配藥狀態 | AD_SysConfig (CLINIC_DISPENSE_STATUS_{assignmentId}) | 追蹤配藥進度 |
| 結帳狀態 | AD_SysConfig (CLINIC_CHECKOUT_STATUS_{assignmentId}) | 追蹤付款狀態 |
| 病人標籤 | AD_SysConfig (CLINIC_PATIENT_TAGS_{patientId}) | JSON array 格式 |
| 盤點任務 | AD_SysConfig (CLINIC_COUNT_TASK_{id}) | 庫存盤點任務紀錄 |
| 藥品/產品 | M_Product | 標準產品表 |
| 庫存 | M_StorageOnHand | 標準庫存表（依倉位分組） |
| 調撥 | M_Movement + M_MovementLine | 倉庫間藥品移動 |
| 採購單 | C_Order + C_OrderLine | 向供應商訂購藥品 |
| 收貨 | M_InOut + M_InOutLine | 採購入庫 |

**決策理由**：大量使用 AD_SysConfig 作為輕量級 key-value 儲存，避免建立自訂表。這樣做的好處是部署時不需修改資料庫 schema，只要部署前端 WAB bundle 即可。缺點是查詢效能不如正規化資料表，但診所規模的資料量不會有問題。

---

## 候診流程

```
WAITING → CALLING → CONSULTING → COMPLETED / CANCELLED
```

| 狀態 | 說明 |
|------|------|
| WAITING | 病人已掛號，等待叫號 |
| CALLING | 醫師正在叫號，提醒病人進入診間 |
| CONSULTING | 看診中，醫師可開立處方 |
| COMPLETED | 看診完成，流向配藥 |
| CANCELLED | 取消掛號（如病人未到） |

**相關狀態流程**：

- 配藥：`PENDING → DISPENSING → DISPENSED`
- 結帳：`PENDING → PAID`
- 盤點：`PENDING → IN_PROGRESS → COMPLETED`

---

## 處方儲存

- 用 JSON 存在 AD_SysConfig（不建自訂表，簡化部署）
- 處方在「看診」(ConsultView) 中建立，不在「處方」(PrescriptionView) 頁面
- PrescriptionView 用於查看歷史處方和管理範本

**決策理由**：處方是看診過程的一部分，醫師在看診介面中一邊診斷一邊開藥，符合實際工作流程。PrescriptionView 則是獨立的管理介面，供醫師建立和維護處方範本、查閱歷史處方紀錄。

---

## 庫存扣除

- 在配藥時扣，不是開方時（避免處方變更導致庫存不一致）

**決策理由**：醫師開完處方後可能會修改、病人可能取消看診。如果在開方時就扣庫存，後續需要處理退回邏輯，增加複雜度。在藥師實際配藥時才扣庫存，確保庫存數量反映真實的藥品流動。

---

## 多 Client 支援

- 動態 ID 查詢取代硬編碼 (C_BP_Group_ID, C_DocType_ID, C_UOM_ID)
- 透過 api/lookup.ts 查詢並快取

**決策理由**：iDempiere 在不同 Client 下，同一種文件類型（如調撥單）的 ID 可能不同。硬編碼 ID 只能在特定 Client 下運作。動態查詢可確保在任何 Client 環境下都能正確運作，提高系統的可移植性。

---

## 登入流程

- 層級選擇：client → role → organization → warehouse
- 只有一個選項時自動跳過（單 client 用戶體驗不變）

**決策理由**：iDempiere REST API 的認證是分層的，必須依序選擇 client、role、organization、warehouse 才能取得完整的 context。對於大多數診所（只有一個 client），自動跳過機制可以讓登入流程幾乎無感，只需輸入帳號密碼即可。

---

## 批次調撥

- 一個 M_Movement header + 多個 M_MovementLine
- From/To 倉位固定，可加入多個藥品+數量後一次送出

**決策理由**：診所的藥品調撥通常是從主倉庫搬到診間或配藥區，來源和目的地固定。批次模式讓使用者可以一次選擇多種藥品，比一筆一筆建立效率更高。

---

## 病人識別

- 身分證 (TaxID) 查詢
- 自動產生病歷號 P+日期+流水 (Value)

**決策理由**：使用身分證作為主要查詢條件，因為這是唯一識別病人的方式。病歷號自動產生可避免人為輸入錯誤，P 前綴代表 Patient，日期+流水確保唯一性。

---

## 角色首頁

- 依角色名稱關鍵字過濾功能選單
- 不同角色看到不同的功能入口

**決策理由**：診所有多種角色（掛號櫃台、醫師、藥師、管理者），每個角色只需看到相關功能。透過角色名稱關鍵字匹配（而非額外設定表），可以快速部署且容易維護。

---

## Barcode 掃描

- 外接 USB/Bluetooth 掃描器為主（模擬鍵盤輸入）
- 相機掃描為未來擴充方向
- 掃描後自動查詢 M_Product.Value 或 M_Product.UPC

**決策理由**：外接掃描器在診所環境中更可靠、速度更快，且不需處理瀏覽器相機權限等問題。模擬鍵盤輸入的方式不需特殊驅動程式，任何輸入框都能接收掃描結果。相機掃描保留為未來選項，適用於平板等行動裝置場景。

---

## 產品建立

- 快速建立模式：名稱 + 編號/條碼 + 產品類別
- 最少必填欄位：Name, Value, M_Product_Category_ID, C_UOM_ID, ProductType='I', C_TaxCategory_ID
- 搜尋找不到時提供「快速建立」按鈕

**決策理由**：診所新進藥品時，需要快速建檔才能配藥。完整的 iDempiere 產品表單欄位太多，快速建立模式只要求最少必填欄位，讓前線人員可以在幾秒內完成建檔。後續可由管理者補充完整資料。

---

## 病人標籤

- 標籤類型：WARNING, ALLERGY, VIP, CHRONIC, DEBT
- 存在 AD_SysConfig（JSON array 格式）
- 在掛號和看診介面顯示

**決策理由**：

| 標籤 | 用途 |
|------|------|
| WARNING | 一般注意事項提醒 |
| ALLERGY | 過敏資訊，開藥時重要參考 |
| VIP | 特殊照護病人 |
| CHRONIC | 慢性病患，可能有長期用藥 |
| DEBT | 有欠款紀錄，結帳時提醒 |

標籤在掛號和看診介面醒目顯示，確保醫護人員在接觸病人前就能注意到重要資訊。

---

## 技術決策

| 決策項目 | 選擇 | 理由 |
|---------|------|------|
| 前端框架 | Vue 3 + Vite + TypeScript | 輕量、快速建構、型別安全，無外部 UI 庫減少依賴 |
| 部署格式 | OSGi WAB JAR | 與 iDempiere 整合，透過 Felix Web Console 熱部署 |
| 路由模式 | Hash mode (`/#/`) | OSGi WAB 不支援 SPA history mode 路由 |
| 狀態管理 | Pinia | Vue 3 官方推薦，型別支援佳 |
| 部署方式 | Felix Web Console 熱部署 | 不需重啟 iDempiere，可即時更新 |
| JAR 版本號 | 時間戳格式 (如 1.0.0.202602071546) | OSGi qualifier 只接受英數字，時間戳確保每次建構唯一 |
| Jetty 環境 | ee8 | iDempiere 12 使用 Jetty 12，需指定 servlet 規範版本 |
| 認證處理 | 不自動登出 | 401 時顯示 session expired 提示，避免使用者未儲存的操作遺失 |
