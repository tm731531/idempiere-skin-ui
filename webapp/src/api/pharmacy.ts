/**
 * Pharmacy API Module
 *
 * 配藥 API
 * - 待配藥清單: AD_SysConfig (completed prescriptions)
 * - 庫存: M_StorageOnHand
 * - 配藥狀態: AD_SysConfig (CLINIC_DISPENSE_STATUS_{assignmentId})
 * - 配藥記錄: AD_SysConfig (CLINIC_DISPENSE_RECORD_{assignmentId})
 * - 扣庫存: M_Inventory (Internal Use)
 */

import { apiClient } from './client'
import { type Prescription, type PrescriptionLine, listCompletedPrescriptions } from './doctor'
import { lookupInternalUseDocTypeId, lookupDispenseChargeId } from './lookup'
import { getSysConfigValue, upsertSysConfig, listSysConfigByPrefix } from './sysconfig'
import { toDateString } from './utils'

// ========== Types ==========

export type DispenseStatus = 'PENDING' | 'DISPENSING' | 'DISPENSED'

export interface DispenseItem {
  assignmentId: number
  prescription: Prescription
  status: DispenseStatus
}

export interface StockInfo {
  productId: number
  productName: string
  qtyOnHand: number
  warehouseName: string
}

export interface DispenseRecord {
  assignmentId: number
  patientName: string
  dispensedAt: string
  lines: { productId: number; productName: string; totalQuantity: number; unit: string }[]
  inventoryId?: number
}

export interface StockDeductionResult {
  inventoryId: number
  completed: boolean
  error?: string
}

// ========== Dispense Status API ==========

const DISPENSE_PREFIX = 'CLINIC_DISPENSE_STATUS_'
const DISPENSE_RECORD_PREFIX = 'CLINIC_DISPENSE_RECORD_'

export async function getDispenseStatus(assignmentId: number): Promise<DispenseStatus> {
  try {
    const value = await getSysConfigValue(`${DISPENSE_PREFIX}${assignmentId}`)
    return (value as DispenseStatus) || 'PENDING'
  } catch {
    return 'PENDING'
  }
}

export async function setDispenseStatus(
  assignmentId: number,
  status: DispenseStatus,
  orgId: number
): Promise<void> {
  await upsertSysConfig(`${DISPENSE_PREFIX}${assignmentId}`, status, orgId, 'Clinic dispense status')
}

/**
 * Get pending dispense items (completed prescriptions not yet dispensed)
 */
export async function listPendingDispense(): Promise<DispenseItem[]> {
  const prescriptions = await listCompletedPrescriptions()
  const items: DispenseItem[] = []

  for (const rx of prescriptions) {
    const status = await getDispenseStatus(rx.assignmentId)
    if (status !== 'DISPENSED') {
      items.push({ assignmentId: rx.assignmentId, prescription: rx, status })
    }
  }

  return items
}

// ========== Dispense Record API ==========

/**
 * Save a record of what was dispensed for a given assignment.
 */
export async function saveDispenseRecord(
  assignmentId: number,
  record: Omit<DispenseRecord, 'assignmentId'>,
  orgId: number,
): Promise<void> {
  await upsertSysConfig(
    `${DISPENSE_RECORD_PREFIX}${assignmentId}`,
    JSON.stringify(record),
    orgId,
    'Clinic dispense record',
  )
}

/**
 * List all dispense records (for history view).
 */
export async function listDispenseRecords(): Promise<DispenseRecord[]> {
  try {
    const records = await listSysConfigByPrefix(DISPENSE_RECORD_PREFIX, 'Updated desc', 50)
    const result: DispenseRecord[] = []
    for (const r of records) {
      try {
        const data = JSON.parse(r.value)
        const idMatch = r.name.match(/(\d+)$/)
        if (idMatch) {
          result.push({ ...data, assignmentId: parseInt(idMatch[1]!, 10) })
        }
      } catch { /* skip invalid */ }
    }
    return result
  } catch {
    return []
  }
}

// ========== Stock Deduction API (Internal Use Inventory) ==========

/**
 * Create an Internal Use Inventory (M_Inventory) to deduct stock.
 *
 * Uses C_DocType "Internal Use Inventory" (DocBaseType=MMI).
 * Each line sets QtyInternalUse to deduct from the warehouse's default locator.
 */
export async function createStockDeduction(
  lines: Pick<PrescriptionLine, 'productId' | 'productName' | 'totalQuantity'>[],
  warehouseId: number,
  orgId: number,
  description?: string,
): Promise<StockDeductionResult> {
  if (lines.length === 0) return { inventoryId: 0, completed: false, error: 'No lines to deduct' }

  const [docTypeId, chargeId, locatorId] = await Promise.all([
    lookupInternalUseDocTypeId(),
    lookupDispenseChargeId(orgId),
    lookupDefaultLocator(warehouseId),
  ])

  if (!locatorId) {
    return { inventoryId: 0, completed: false, error: '找不到倉庫的預設庫位' }
  }

  // Create M_Inventory header
  const headerRes = await apiClient.post('/api/v1/models/M_Inventory', {
    'AD_Org_ID': orgId,
    'C_DocType_ID': docTypeId,
    'M_Warehouse_ID': warehouseId,
    'MovementDate': toDateString(new Date()),
    'Description': description || 'Clinic dispense',
  })

  const inventoryId = headerRes.data.id

  // Create M_InventoryLine per product
  for (const line of lines) {
    if (line.totalQuantity <= 0) continue
    await apiClient.post('/api/v1/models/M_InventoryLine', {
      'AD_Org_ID': orgId,
      'M_Inventory_ID': inventoryId,
      'M_Product_ID': line.productId,
      'M_Locator_ID': locatorId,
      'QtyInternalUse': line.totalQuantity,
      'C_Charge_ID': chargeId,
    })
  }

  // Complete the inventory
  try {
    await apiClient.put(`/api/v1/models/M_Inventory/${inventoryId}`, {
      'doc-action': 'CO',
    })
    return { inventoryId, completed: true }
  } catch (e: any) {
    return {
      inventoryId,
      completed: false,
      error: e.response?.data?.detail || e.message || '扣庫存失敗',
    }
  }
}

/**
 * Lookup default locator for a warehouse.
 */
async function lookupDefaultLocator(warehouseId: number): Promise<number> {
  const resp = await apiClient.get('/api/v1/models/M_Locator', {
    params: {
      '$filter': `M_Warehouse_ID eq ${warehouseId} and IsDefault eq true and IsActive eq true`,
      '$top': 1,
    },
  })
  return resp.data.records?.[0]?.id || 0
}

// ========== Stock API ==========

/**
 * Get stock for a product across all warehouses
 */
export async function getProductStock(productId: number): Promise<StockInfo[]> {
  const response = await apiClient.get('/api/v1/models/M_StorageOnHand', {
    params: {
      '$filter': `M_Product_ID eq ${productId}`,
      '$expand': 'M_Locator_ID',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    productId,
    productName: '',
    qtyOnHand: r.QtyOnHand || 0,
    warehouseName: r.M_Locator_ID?.identifier || '',
  }))
}

/**
 * Get all stock (for inventory view)
 */
export async function listAllStock(): Promise<any[]> {
  const response = await apiClient.get('/api/v1/models/M_StorageOnHand', {
    params: {
      '$expand': 'M_Product_ID,M_Locator_ID',
      '$orderby': 'M_Product_ID asc',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    productId: r.M_Product_ID?.id || r.M_Product_ID,
    productName: r.M_Product_ID?.identifier || '',
    locatorId: r.M_Locator_ID?.id || r.M_Locator_ID,
    locatorName: r.M_Locator_ID?.identifier || '',
    qtyOnHand: r.QtyOnHand || 0,
  }))
}
