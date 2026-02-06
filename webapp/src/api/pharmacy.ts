/**
 * Pharmacy API Module
 *
 * 配藥 API
 * - 待配藥清單: AD_SysConfig (completed prescriptions)
 * - 庫存: M_StorageOnHand
 * - 配藥狀態: AD_SysConfig (CLINIC_DISPENSE_STATUS_{assignmentId})
 */

import { apiClient } from './client'
import { type Prescription, listCompletedPrescriptions } from './doctor'

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
  const configName = `${DISPENSE_PREFIX}${assignmentId}`
  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq '${configName}'` },
    })
    const records = response.data.records || []
    return records.length > 0 ? (records[0].Value as DispenseStatus) : 'PENDING'
  } catch {
    return 'PENDING'
  }
}

export async function setDispenseStatus(
  assignmentId: number,
  status: DispenseStatus,
  orgId: number
): Promise<void> {
  const configName = `${DISPENSE_PREFIX}${assignmentId}`

  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: { '$filter': `Name eq '${configName}'` },
  })

  const records = response.data.records || []
  if (records.length > 0) {
    await apiClient.put(`/api/v1/models/AD_SysConfig/${records[0].id}`, { 'Value': status })
  } else {
    await apiClient.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': orgId,
      'Name': configName,
      'Value': status,
      'Description': 'Clinic dispense status',
      'ConfigurationLevel': 'S',
    })
  }
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
