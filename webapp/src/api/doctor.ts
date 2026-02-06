/**
 * Doctor API Module
 *
 * 看診/開藥 API
 * - 目前看診病人: S_ResourceAssignment (status=CONSULTING)
 * - 藥品: M_Product
 * - 處方: AD_SysConfig (CLINIC_PRESCRIPTION_{assignmentId})
 */

import { apiClient } from './client'

// ========== Security Utils ==========

function escapeODataString(value: string): string {
  if (!value) return ''
  return value
    .replace(/'/g, "''")
    .replace(/[<>{}|\\^~\[\]`]/g, '')
    .trim()
}

// ========== Types ==========

export interface Medicine {
  id: number
  value: string        // Product code
  name: string
  upc?: string         // Barcode
  category?: string
  isActive: boolean
}

export interface PrescriptionLine {
  productId: number
  productName: string
  dosage: number       // Per-dose amount
  unit: string         // g, ml, etc.
  frequency: 'QD' | 'BID' | 'TID' | 'QID' | 'PRN'
  days: number
  totalQuantity: number // Auto-calculated
  instructions?: string
}

export interface Prescription {
  assignmentId: number
  patientId: number
  patientName: string
  diagnosis: string
  lines: PrescriptionLine[]
  totalDays: number
  status: 'DRAFT' | 'COMPLETED'
  createdAt: string
}

// Frequency multiplier mapping
const FREQ_MULTIPLIER: Record<string, number> = {
  'QD': 1,
  'BID': 2,
  'TID': 3,
  'QID': 4,
  'PRN': 1,
}

export function calculateTotalQuantity(dosage: number, frequency: string, days: number): number {
  const multiplier = FREQ_MULTIPLIER[frequency] || 1
  return dosage * multiplier * days
}

// ========== Medicine API ==========

/**
 * Search medicines by name or code
 */
export async function searchMedicines(keyword: string): Promise<Medicine[]> {
  const safeKeyword = escapeODataString(keyword)
  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': `IsActive eq true and (contains(Name,'${safeKeyword}') or contains(Value,'${safeKeyword}'))`,
      '$select': 'M_Product_ID,Value,Name,UPC',
      '$top': 20,
      '$orderby': 'Name asc',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    value: r.Value || '',
    name: r.Name || '',
    upc: r.UPC || '',
    isActive: true,
  }))
}

/**
 * Get all active medicines (for listing)
 */
export async function listMedicines(): Promise<Medicine[]> {
  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Product_ID,Value,Name,UPC',
      '$orderby': 'Name asc',
      '$top': 100,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    value: r.Value || '',
    name: r.Name || '',
    upc: r.UPC || '',
    isActive: true,
  }))
}

// ========== Prescription API (stored in AD_SysConfig) ==========

const PRESCRIPTION_PREFIX = 'CLINIC_PRESCRIPTION_'

/**
 * Save prescription (upsert to AD_SysConfig)
 */
export async function savePrescription(
  assignmentId: number,
  prescription: Omit<Prescription, 'assignmentId'>,
  orgId: number
): Promise<void> {
  const configName = `${PRESCRIPTION_PREFIX}${assignmentId}`
  const value = JSON.stringify(prescription)

  // Check if exists
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: {
      '$filter': `Name eq '${configName}'`,
    },
  })

  const records = response.data.records || []

  if (records.length > 0) {
    await apiClient.put(`/api/v1/models/AD_SysConfig/${records[0].id}`, {
      'Value': value,
    })
  } else {
    await apiClient.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': orgId,
      'Name': configName,
      'Value': value,
      'Description': 'Clinic prescription data',
      'ConfigurationLevel': 'S',
    })
  }
}

/**
 * Load prescription for an assignment
 */
export async function loadPrescription(assignmentId: number): Promise<Prescription | null> {
  const configName = `${PRESCRIPTION_PREFIX}${assignmentId}`

  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: {
        '$filter': `Name eq '${configName}'`,
      },
    })

    const records = response.data.records || []
    if (records.length === 0) return null

    const data = JSON.parse(records[0].Value)
    return { ...data, assignmentId }
  } catch {
    return null
  }
}

/**
 * Load all completed prescriptions (for pharmacy queue)
 */
export async function listCompletedPrescriptions(): Promise<Prescription[]> {
  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: {
        '$filter': `contains(Name,'${PRESCRIPTION_PREFIX}')`,
        '$orderby': 'Updated desc',
      },
    })

    const prescriptions: Prescription[] = []
    for (const r of response.data.records || []) {
      try {
        const data = JSON.parse(r.Value)
        if (data.status === 'COMPLETED') {
          const idMatch = r.Name.match(/(\d+)$/)
          if (idMatch) {
            prescriptions.push({
              ...data,
              assignmentId: parseInt(idMatch[1], 10),
            })
          }
        }
      } catch { /* skip invalid */ }
    }
    return prescriptions
  } catch {
    return []
  }
}
