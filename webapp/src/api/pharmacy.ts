/**
 * Pharmacy API Module
 *
 * 配藥 API
 * - 待配藥清單: AD_SysConfig (completed prescriptions)
 * - 庫存: M_StorageOnHand
 * - 配藥狀態: AD_SysConfig (CLINIC_DISPENSE_STATUS_{assignmentId})
 */

import { apiClient } from './client'
import { type Prescription, type PrescriptionLine, listCompletedPrescriptions } from './doctor'
import { lookupDocTypeId, lookupEachUomId } from './lookup'
import { getSysConfigValue, upsertSysConfig } from './sysconfig'

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

// ========== Dispense Status API ==========

const DISPENSE_PREFIX = 'CLINIC_DISPENSE_STATUS_'

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

// ========== Dispense Movement API (stock deduction) ==========

export interface DispenseMovementResult {
  movementId: number
  completed: boolean
  error?: string
}

/**
 * Create a stock deduction movement (M_Movement) for dispensed prescription items.
 *
 * Moves products from the pharmacy locator to a "dispensed" locator (same locator,
 * consuming stock) via internal use movement. This creates the accounting trail
 * in iDempiere so stock reports reflect dispensed quantities.
 *
 * @param lines - Prescription lines with productId and totalQuantity
 * @param fromLocatorId - Pharmacy locator where stock is held
 * @param toLocatorId - Destination locator (can be same as from for internal use)
 * @param orgId - Organization ID
 * @param description - Movement description (e.g. "Dispense for assignment 123")
 */
export async function createDispenseMovement(
  lines: Pick<PrescriptionLine, 'productId' | 'productName' | 'totalQuantity'>[],
  fromLocatorId: number,
  toLocatorId: number,
  orgId: number,
  description?: string,
): Promise<DispenseMovementResult> {
  if (lines.length === 0) return { movementId: 0, completed: false, error: 'No lines to dispense' }

  const docTypeId = await lookupDocTypeId('MMM')
  const uomId = await lookupEachUomId()

  // Create M_Movement header
  const headerRes = await apiClient.post('/api/v1/models/M_Movement', {
    'AD_Org_ID': orgId,
    'C_DocType_ID': docTypeId,
    'MovementDate': new Date().toISOString().slice(0, 10),
    'Description': description || 'Clinic dispense',
  })

  const movementId = headerRes.data.id

  // Create M_MovementLine per prescription line
  for (const line of lines) {
    if (line.totalQuantity <= 0) continue
    await apiClient.post('/api/v1/models/M_MovementLine', {
      'AD_Org_ID': orgId,
      'M_Movement_ID': movementId,
      'M_Product_ID': line.productId,
      'M_Locator_ID': fromLocatorId,
      'M_LocatorTo_ID': toLocatorId,
      'C_UOM_ID': uomId,
      'MovementQty': line.totalQuantity,
      'QtyEntered': line.totalQuantity,
      'TargetQty': 0,
    })
  }

  // Complete the movement
  try {
    await apiClient.put(`/api/v1/models/M_Movement/${movementId}`, {
      'doc-action': 'CO',
    })
    return { movementId, completed: true }
  } catch (e: any) {
    return { movementId, completed: false, error: e.response?.data?.detail || e.message || '配藥扣庫存失敗' }
  }
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
