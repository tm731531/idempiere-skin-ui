/**
 * Doctor API Module
 *
 * 看診/開藥 API
 * - 目前看診病人: S_ResourceAssignment (status=CONSULTING)
 * - 藥品: M_Product
 * - 處方: AD_SysConfig (CLINIC_PRESCRIPTION_{assignmentId})
 */

import { apiClient } from './client'
import { upsertSysConfig, getSysConfigValue, listSysConfigByPrefix, deleteSysConfig } from './sysconfig'
import { escapeODataString } from './utils'

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
  await upsertSysConfig(
    `${PRESCRIPTION_PREFIX}${assignmentId}`,
    JSON.stringify(prescription),
    orgId,
    'Clinic prescription data',
  )
}

/**
 * Load prescription for an assignment
 */
export async function loadPrescription(assignmentId: number): Promise<Prescription | null> {
  try {
    const value = await getSysConfigValue(`${PRESCRIPTION_PREFIX}${assignmentId}`)
    if (!value) return null
    const data = JSON.parse(value)
    return { ...data, assignmentId }
  } catch {
    return null
  }
}

/**
 * Load all prescriptions (history view)
 */
export async function listPrescriptionHistory(): Promise<Prescription[]> {
  try {
    const records = await listSysConfigByPrefix(PRESCRIPTION_PREFIX, 'Updated desc', 50)

    const prescriptions: Prescription[] = []
    for (const r of records) {
      try {
        const data = JSON.parse(r.value)
        const idMatch = r.name.match(/(\d+)$/)
        if (idMatch) {
          prescriptions.push({
            ...data,
            assignmentId: parseInt(idMatch[1], 10),
          })
        }
      } catch { /* skip invalid */ }
    }
    return prescriptions
  } catch {
    return []
  }
}

// ========== Template API (stored in AD_SysConfig) ==========

const TEMPLATE_PREFIX = 'CLINIC_TEMPLATE_'

export interface PrescriptionTemplate {
  id: string           // configName
  name: string
  lines: PrescriptionLine[]
  totalDays: number
}

/**
 * List all templates for the current user
 */
export async function listTemplates(): Promise<PrescriptionTemplate[]> {
  try {
    const records = await listSysConfigByPrefix(TEMPLATE_PREFIX, 'Name asc')

    const templates: PrescriptionTemplate[] = []
    for (const r of records) {
      try {
        const data = JSON.parse(r.value)
        templates.push({
          id: r.name,
          name: data.name || r.name.replace(TEMPLATE_PREFIX, ''),
          lines: data.lines || [],
          totalDays: data.totalDays || 7,
        })
      } catch { /* skip invalid */ }
    }
    return templates
  } catch {
    return []
  }
}

/**
 * Save a prescription template
 */
export async function saveTemplate(
  templateName: string,
  lines: PrescriptionLine[],
  totalDays: number,
  orgId: number
): Promise<void> {
  const safeName = escapeODataString(templateName)
  const configName = `${TEMPLATE_PREFIX}${safeName}`
  const value = JSON.stringify({ name: templateName, lines, totalDays })
  await upsertSysConfig(configName, value, orgId, `Prescription template: ${templateName}`)
}

/**
 * Delete a prescription template
 */
export async function deleteTemplate(configName: string): Promise<void> {
  await deleteSysConfig(configName)
}

/**
 * Load all completed prescriptions (for pharmacy queue)
 */
export async function listCompletedPrescriptions(): Promise<Prescription[]> {
  try {
    const records = await listSysConfigByPrefix(PRESCRIPTION_PREFIX, 'Updated desc')

    const prescriptions: Prescription[] = []
    for (const r of records) {
      try {
        const data = JSON.parse(r.value)
        if (data.status === 'COMPLETED') {
          const idMatch = r.name.match(/(\d+)$/)
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
