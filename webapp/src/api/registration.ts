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
import { escapeODataString, toIdempiereDateTime } from './utils'

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
  id: number              // S_Resource_ID
  name: string
}

export type RegistrationType = 'WALK_IN' | 'APPOINTMENT'

export const TYPE_DISPLAY: Record<RegistrationType, { label: string; color: string }> = {
  'WALK_IN':     { label: '現場', color: '#4CAF50' },
  'APPOINTMENT': { label: '預約', color: '#2196F3' },
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
  type: RegistrationType
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
 * 查詢所有醫師（直接查 S_Resource）
 */
export async function listDoctors(): Promise<Doctor[]> {
  const response = await apiClient.get('/api/v1/models/S_Resource', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'S_Resource_ID,Name',
      '$orderby': 'Name asc',
      '$top': 100,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name || '',
  }))
}

// ========== Registration API ==========

/**
 * 取得今日下一個候診號碼
 */
export async function getNextQueueNumber(resourceId: number, date?: Date): Promise<string> {
  const target = date || new Date()
  const startOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const endOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1)

  const response = await apiClient.get('/api/v1/models/S_ResourceAssignment', {
    params: {
      '$filter': `S_Resource_ID eq ${resourceId} and AssignDateFrom ge '${toIdempiereDateTime(startOfDay)}' and AssignDateFrom lt '${toIdempiereDateTime(endOfDay)}'`,
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
  type: RegistrationType
  appointmentDate?: Date
}): Promise<Registration> {
  // 預約掛號用指定日期 09:00，現場掛號用現在
  const dateFrom = data.type === 'APPOINTMENT' && data.appointmentDate
    ? new Date(data.appointmentDate.getFullYear(), data.appointmentDate.getMonth(), data.appointmentDate.getDate(), 9, 0, 0)
    : new Date()
  const dateTo = new Date(dateFrom.getTime() + 30 * 60 * 1000)

  const description = JSON.stringify({
    patientId: data.patientId,
    patientName: data.patientName,
    patientTaxId: data.patientTaxId,
    type: data.type,
  })

  const response = await apiClient.post('/api/v1/models/S_ResourceAssignment', {
    'AD_Org_ID': data.orgId,
    'S_Resource_ID': data.resourceId,
    'Name': data.queueNumber,
    'AssignDateFrom': toIdempiereDateTime(dateFrom),
    'AssignDateTo': toIdempiereDateTime(dateTo),
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
    assignDateFrom: toIdempiereDateTime(dateFrom),
    assignDateTo: toIdempiereDateTime(dateTo),
    status: 'WAITING',
    isConfirmed: false,
    type: data.type,
  }
}

/**
 * 查詢指定日期掛號清單
 */
export async function listRegistrationsByDate(date?: Date, resourceId?: number): Promise<Registration[]> {
  const target = date || new Date()
  const startOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const endOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1)

  let filter = `AssignDateFrom ge '${toIdempiereDateTime(startOfDay)}' and AssignDateFrom lt '${toIdempiereDateTime(endOfDay)}'`
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
      type: patientData.type,
    }
  })
}

/**
 * 查詢今日掛號清單（便利包裝）
 */
export async function listTodayRegistrations(resourceId?: number): Promise<Registration[]> {
  return listRegistrationsByDate(undefined, resourceId)
}

/**
 * 解析 Description JSON（向前相容舊格式）
 */
function parseDescription(desc: string): { patientId: number; patientName: string; patientTaxId: string; type: RegistrationType } {
  if (!desc) return { patientId: 0, patientName: '', patientTaxId: '', type: 'WALK_IN' }

  try {
    const data = JSON.parse(desc)
    return {
      patientId: data.patientId || 0,
      patientName: data.patientName || '',
      patientTaxId: data.patientTaxId || '',
      type: data.type || 'WALK_IN',
    }
  } catch {
    // 舊格式: "姓名 (身分證) #ID"
    const match = desc.match(/^(.+?) \((.+?)\) #(\d+)$/)
    if (match && match[1] && match[2] && match[3]) {
      return { patientId: parseInt(match[3]), patientName: match[1], patientTaxId: match[2], type: 'WALK_IN' }
    }
    return { patientId: 0, patientName: desc, patientTaxId: '', type: 'WALK_IN' }
  }
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
