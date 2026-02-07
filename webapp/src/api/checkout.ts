/**
 * Checkout API Module
 *
 * 結帳 API - Reads prescription data, calculates fees
 * - Status: AD_SysConfig (CLINIC_CHECKOUT_STATUS_{assignmentId})
 */

import { apiClient } from './client'
import { type Prescription } from './doctor'
import { getDispenseStatus } from './pharmacy'
import { getSysConfigValue, upsertSysConfig } from './sysconfig'

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
  try {
    const value = await getSysConfigValue(`${CHECKOUT_PREFIX}${assignmentId}`)
    return (value as CheckoutStatus) || 'PENDING'
  } catch {
    return 'PENDING'
  }
}

export async function setCheckoutStatus(
  assignmentId: number,
  status: CheckoutStatus,
  orgId: number
): Promise<void> {
  await upsertSysConfig(`${CHECKOUT_PREFIX}${assignmentId}`, status, orgId, 'Clinic checkout status')
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
