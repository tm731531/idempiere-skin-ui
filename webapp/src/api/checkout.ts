/**
 * Checkout API Module
 *
 * 結帳 API - Reads prescription data, calculates fees
 * - Status: AD_SysConfig (CLINIC_CHECKOUT_STATUS_{assignmentId})
 */

import { apiClient } from './client'
import { loadPrescription, type Prescription } from './doctor'
import { getDispenseStatus } from './pharmacy'

export type CheckoutStatus = 'PENDING' | 'PAID'

export interface CheckoutItem {
  assignmentId: number
  prescription: Prescription
  dispenseStatus: string
  checkoutStatus: CheckoutStatus
}

export interface CheckoutSummary {
  prescriptionLines: { name: string; qty: number; unit: string }[]
  totalItems: number
  copayment: number  // Fixed copayment for now
}

const CHECKOUT_PREFIX = 'CLINIC_CHECKOUT_STATUS_'

export async function getCheckoutStatus(assignmentId: number): Promise<CheckoutStatus> {
  const configName = `${CHECKOUT_PREFIX}${assignmentId}`
  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq '${configName}'` },
    })
    const records = response.data.records || []
    return records.length > 0 ? (records[0].Value as CheckoutStatus) : 'PENDING'
  } catch {
    return 'PENDING'
  }
}

export async function setCheckoutStatus(
  assignmentId: number,
  status: CheckoutStatus,
  orgId: number
): Promise<void> {
  const configName = `${CHECKOUT_PREFIX}${assignmentId}`

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
      'Description': 'Clinic checkout status',
      'ConfigurationLevel': 'S',
    })
  }
}

/**
 * List items ready for checkout (dispensed but not paid)
 */
export async function listCheckoutItems(): Promise<CheckoutItem[]> {
  // Get all prescription configs
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: {
      '$filter': "contains(Name,'CLINIC_PRESCRIPTION_')",
    },
  })

  const items: CheckoutItem[] = []
  for (const r of response.data.records || []) {
    try {
      const data = JSON.parse(r.Value)
      if (data.status !== 'COMPLETED') continue

      const idMatch = r.Name.match(/(\d+)$/)
      if (!idMatch) continue
      const assignmentId = parseInt(idMatch[1], 10)

      const dispenseStatus = await getDispenseStatus(assignmentId)
      if (dispenseStatus !== 'DISPENSED') continue

      const checkoutStatus = await getCheckoutStatus(assignmentId)
      if (checkoutStatus === 'PAID') continue

      items.push({
        assignmentId,
        prescription: { ...data, assignmentId },
        dispenseStatus,
        checkoutStatus,
      })
    } catch { /* skip */ }
  }

  return items
}
