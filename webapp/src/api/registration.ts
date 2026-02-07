/**
 * Registration API Module
 *
 * 掛號相關 API - 使用 iDempiere 內建表
 * - 病人: C_BPartner (IsCustomer=true)
 * - 醫師: AD_User (IsSalesRep=true) + S_Resource
 * - 掛號: S_ResourceAssignment
 * - 狀態: AD_SysConfig
 */

import { apiClient } from './client'
import { lookupCustomerGroupId } from './lookup'
import { upsertSysConfig, getSysConfigValue, batchGetSysConfig } from './sysconfig'
import { escapeODataString } from './utils'

// ========== Types ==========

export interface Patient {
  id: number
  value: string           // 病歷號
  name: string
  taxId: string           // 身分證
  phone?: string
  isActive: boolean
}

export interface Doctor {
  id: number              // AD_User_ID
  name: string
  resourceId?: number     // S_Resource_ID (for booking)
}

export interface Registration {
  id: number
  resourceId: number
  resourceName: string
  queueNumber: string
  patientId: number
  patientName: string
  patientTaxId: string
  assignDateFrom: string
  assignDateTo: string
  status: RegistrationStatus
  isConfirmed: boolean
  description?: string
}

export type RegistrationStatus = 'WAITING' | 'CALLING' | 'CONSULTING' | 'COMPLETED' | 'CANCELLED'

// ========== Patient API ==========

/**
 * 用身分證查詢病人
 */
export async function findPatientByTaxId(taxId: string): Promise<Patient | null> {
  const safeTaxId = escapeODataString(taxId)
  const response = await apiClient.get('/api/v1/models/C_BPartner', {
    params: {
      '$filter': `TaxID eq '${safeTaxId}' and IsCustomer eq true and IsActive eq true`,
    },
  })

  const records = response.data.records || []
  if (records.length === 0) return null

  const r = records[0]
  return {
    id: r.id,
    value: r.Value || '',
    name: r.Name || '',
    taxId: r.TaxID || '',
    phone: r.Phone || '',
    isActive: r.IsActive,
  }
}

/**
 * 搜尋病人（模糊搜尋）
 */
export async function searchPatients(keyword: string): Promise<Patient[]> {
  const safeKeyword = escapeODataString(keyword)
  const response = await apiClient.get('/api/v1/models/C_BPartner', {
    params: {
      '$filter': `IsCustomer eq true and IsActive eq true and (contains(Name,'${safeKeyword}') or contains(TaxID,'${safeKeyword}'))`,
      '$top': 20,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    value: r.Value || '',
    name: r.Name || '',
    taxId: r.TaxID || '',
    phone: r.Phone || '',
    isActive: r.IsActive,
  }))
}

/**
 * 建立新病人
 */
export async function createPatient(data: {
  name: string
  taxId: string
  phone?: string
  orgId: number
}): Promise<Patient> {
  // 產生病歷號: P + 日期 + 流水號
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const value = `P${dateStr}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`

  const bpGroupId = await lookupCustomerGroupId()

  const response = await apiClient.post('/api/v1/models/C_BPartner', {
    'AD_Org_ID': data.orgId,
    'Value': value,
    'Name': data.name,
    'TaxID': data.taxId,
    'C_BP_Group_ID': bpGroupId,
    'IsCustomer': true,
    'IsVendor': false,
    'IsEmployee': false,
    'IsSalesRep': false,
    'IsSummary': false,
    'IsOneTime': false,
    'SendEMail': false,
    'IsActive': true,
    'SO_CreditLimit': 0,
    'SO_CreditUsed': 0,
  })

  return {
    id: response.data.id,
    value: value,
    name: data.name,
    taxId: data.taxId,
    phone: data.phone,
    isActive: true,
  }
}

// ========== Doctor API ==========

/**
 * 查詢所有醫師
 */
export async function listDoctors(): Promise<Doctor[]> {
  const response = await apiClient.get('/api/v1/models/AD_User', {
    params: {
      '$filter': 'IsSalesRep eq true and IsActive eq true',
      '$select': 'AD_User_ID,Name',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name || '',
  }))
}

/**
 * 查詢醫師對應的資源 ID
 */
export async function getDoctorResource(doctorName: string): Promise<number | null> {
  const safeName = escapeODataString(doctorName)
  const response = await apiClient.get('/api/v1/models/S_Resource', {
    params: {
      '$filter': `contains(Name,'${safeName}') and IsActive eq true`,
      '$top': 1,
    },
  })

  const records = response.data.records || []
  return records.length > 0 ? records[0].id : null
}

/**
 * 批次查詢所有醫師資源（解決 N+1 問題）
 */
export async function listDoctorResources(): Promise<Record<string, number>> {
  const response = await apiClient.get('/api/v1/models/S_Resource', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'S_Resource_ID,Name',
    },
  })

  const result: Record<string, number> = {}
  for (const r of response.data.records || []) {
    // 用名稱作為 key（醫師名稱 → 資源 ID）
    result[r.Name] = r.id
  }
  return result
}

// ========== Registration API ==========

/**
 * 取得今日下一個候診號碼
 */
export async function getNextQueueNumber(resourceId: number): Promise<string> {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

  const response = await apiClient.get('/api/v1/models/S_ResourceAssignment', {
    params: {
      '$filter': `S_Resource_ID eq ${resourceId} and AssignDateFrom ge '${startOfDay.toISOString()}' and AssignDateFrom lt '${endOfDay.toISOString()}'`,
      '$select': 'Name',
      '$orderby': 'Name desc',
      '$top': 1,
    },
  })

  const records = response.data.records || []
  const lastNumber = records.length > 0 ? parseInt(records[0].Name, 10) || 0 : 0
  return String(lastNumber + 1).padStart(3, '0')
}

/**
 * 建立掛號
 */
export async function createRegistration(data: {
  resourceId: number
  patientId: number
  patientName: string
  patientTaxId: string
  queueNumber: string
  orgId: number
}): Promise<Registration> {
  const now = new Date()
  const endTime = new Date(now.getTime() + 30 * 60 * 1000) // 30 分鐘後

  // 使用 JSON 格式儲存病人資訊（便於解析）
  const description = JSON.stringify({
    patientId: data.patientId,
    patientName: data.patientName,
    patientTaxId: data.patientTaxId,
  })

  const response = await apiClient.post('/api/v1/models/S_ResourceAssignment', {
    'AD_Org_ID': data.orgId,
    'S_Resource_ID': data.resourceId,
    'Name': data.queueNumber,
    'AssignDateFrom': now.toISOString(),
    'AssignDateTo': endTime.toISOString(),
    'Qty': 1,
    'IsConfirmed': false,
    'Description': description,
  })

  // 設定初始狀態為 WAITING
  await setRegistrationStatus(response.data.id, 'WAITING', data.orgId)

  return {
    id: response.data.id,
    resourceId: data.resourceId,
    resourceName: '',
    queueNumber: data.queueNumber,
    patientId: data.patientId,
    patientName: data.patientName,
    patientTaxId: data.patientTaxId,
    assignDateFrom: now.toISOString(),
    assignDateTo: endTime.toISOString(),
    status: 'WAITING',
    isConfirmed: false,
  }
}

/**
 * 查詢今日掛號清單
 */
export async function listTodayRegistrations(resourceId?: number): Promise<Registration[]> {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

  let filter = `AssignDateFrom ge '${startOfDay.toISOString()}' and AssignDateFrom lt '${endOfDay.toISOString()}'`
  if (resourceId) {
    filter += ` and S_Resource_ID eq ${resourceId}`
  }

  const response = await apiClient.get('/api/v1/models/S_ResourceAssignment', {
    params: {
      '$filter': filter,
      '$orderby': 'Name asc',
      '$expand': 'S_Resource_ID',
    },
  })

  const records = response.data.records || []

  // 批次取得所有狀態（解決 N+1 問題）
  const ids = records.map((r: any) => r.id)
  const statusMap = await getRegistrationStatuses(ids)

  // 解析病人資訊（使用 JSON 格式，向前相容舊格式）
  function parseDescription(desc: string): { patientId: number; patientName: string; patientTaxId: string } {
    if (!desc) return { patientId: 0, patientName: '', patientTaxId: '' }

    // 嘗試 JSON 格式
    try {
      const data = JSON.parse(desc)
      return {
        patientId: data.patientId || 0,
        patientName: data.patientName || '',
        patientTaxId: data.patientTaxId || '',
      }
    } catch {
      // 舊格式: "姓名 (身分證) #ID"
      const match = desc.match(/^(.+?) \((.+?)\) #(\d+)$/)
      if (match && match[1] && match[2] && match[3]) {
        return { patientId: parseInt(match[3]), patientName: match[1], patientTaxId: match[2] }
      }
      return { patientId: 0, patientName: desc, patientTaxId: '' }
    }
  }

  return records.map((r: any) => {
    const patientData = parseDescription(r.Description || '')
    return {
      id: r.id,
      resourceId: r.S_Resource_ID?.id || r.S_Resource_ID,
      resourceName: r.S_Resource_ID?.identifier || '',
      queueNumber: r.Name || '',
      patientId: patientData.patientId,
      patientName: patientData.patientName,
      patientTaxId: patientData.patientTaxId,
      assignDateFrom: r.AssignDateFrom,
      assignDateTo: r.AssignDateTo,
      status: statusMap[r.id] || 'WAITING',
      isConfirmed: r.IsConfirmed,
      description: r.Description || '',
    }
  })
}

// ========== Status API (using AD_SysConfig) ==========

const STATUS_PREFIX = 'CLINIC_QUEUE_STATUS_'

/**
 * 批次查詢多筆掛號狀態（解決 N+1 問題）
 */
async function getRegistrationStatuses(ids: number[]): Promise<Record<number, RegistrationStatus>> {
  if (ids.length === 0) return {}

  const names = ids.map(id => `${STATUS_PREFIX}${id}`)
  const valueMap = await batchGetSysConfig(names)

  const result: Record<number, RegistrationStatus> = {}
  for (const [name, value] of Object.entries(valueMap)) {
    const idMatch = name.match(/(\d+)$/)
    if (idMatch) {
      result[parseInt(idMatch[1]!, 10)] = value as RegistrationStatus
    }
  }
  return result
}

/**
 * 設定掛號狀態
 */
export async function setRegistrationStatus(
  registrationId: number,
  status: RegistrationStatus,
  orgId: number
): Promise<void> {
  await upsertSysConfig(`${STATUS_PREFIX}${registrationId}`, status, orgId, 'Clinic queue status')
}

/**
 * 取得掛號狀態
 */
export async function getRegistrationStatus(registrationId: number): Promise<RegistrationStatus> {
  const value = await getSysConfigValue(`${STATUS_PREFIX}${registrationId}`)
  return (value as RegistrationStatus) || 'WAITING'
}

/**
 * 叫號（更新狀態為 CALLING）
 */
export async function callPatient(registrationId: number, orgId: number): Promise<void> {
  await setRegistrationStatus(registrationId, 'CALLING', orgId)
}

/**
 * 開始看診（更新狀態為 CONSULTING）
 */
export async function startConsultation(registrationId: number, orgId: number): Promise<void> {
  await setRegistrationStatus(registrationId, 'CONSULTING', orgId)

  // 同時更新 IsConfirmed
  await apiClient.put(`/api/v1/models/S_ResourceAssignment/${registrationId}`, {
    'IsConfirmed': true,
  })
}

/**
 * 完成看診（更新狀態為 COMPLETED）
 */
export async function completeConsultation(registrationId: number, orgId: number): Promise<void> {
  await setRegistrationStatus(registrationId, 'COMPLETED', orgId)
}

/**
 * 取消掛號
 */
export async function cancelRegistration(registrationId: number, orgId: number): Promise<void> {
  await setRegistrationStatus(registrationId, 'CANCELLED', orgId)
}

// ========== Patient Tags API ==========

const TAG_PREFIX = 'CLINIC_PATIENT_TAGS_'

export type PatientTag = 'WARNING' | 'ALLERGY' | 'VIP' | 'CHRONIC' | 'DEBT'

export const TAG_DISPLAY: Record<PatientTag, { icon: string; label: string }> = {
  'WARNING': { icon: '⚠️', label: '注意' },
  'ALLERGY': { icon: '💊', label: '過敏' },
  'VIP':     { icon: '❤️', label: 'VIP' },
  'CHRONIC': { icon: '🔄', label: '慢性' },
  'DEBT':    { icon: '💰', label: '欠款' },
}

export async function getPatientTags(patientId: number): Promise<PatientTag[]> {
  try {
    const value = await getSysConfigValue(`${TAG_PREFIX}${patientId}`)
    if (!value) return []
    return JSON.parse(value) as PatientTag[]
  } catch {
    return []
  }
}

export async function setPatientTags(
  patientId: number,
  tags: PatientTag[],
  orgId: number
): Promise<void> {
  await upsertSysConfig(`${TAG_PREFIX}${patientId}`, JSON.stringify(tags), orgId, 'Patient tags')
}
