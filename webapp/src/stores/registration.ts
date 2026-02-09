/**
 * Registration Store
 *
 * 掛號狀態管理
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import {
  type Patient,
  type Doctor,
  type Registration,
  type RegistrationType,
  type RegistrationStatus,
  type PatientTag,
  findPatientByTaxId,
  searchPatients,
  createPatient,
  listDoctors,
  getNextQueueNumber,
  createRegistration,
  listTodayRegistrations,
  callPatient,
  startConsultation,
  completeConsultation,
  cancelRegistration,
  getPatientTags,
  setPatientTags,
} from '@/api/registration'
import { toDateString } from '@/api/utils'

/** Check if auth context has a valid organizationId (zero is valid!) */
function hasOrgContext(context: { organizationId: number } | null | undefined): context is { organizationId: number } {
  return context != null && context.organizationId !== null && context.organizationId !== undefined
}

/** Status rank for merge-based refresh — never regress status */
const STATUS_RANK: Record<RegistrationStatus, number> = {
  'WAITING': 0, 'CALLING': 1, 'CONSULTING': 2, 'COMPLETED': 3, 'CANCELLED': 3,
}
function statusRank(status: RegistrationStatus): number {
  return STATUS_RANK[status] ?? 0
}

export const useRegistrationStore = defineStore('registration', () => {
  const authStore = useAuthStore()

  // ========== State ==========

  // 病人
  const currentPatient = ref<Patient | null>(null)
  const patientSearchResults = ref<Patient[]>([])
  const isSearchingPatient = ref(false)

  // 醫師
  const doctors = ref<Doctor[]>([])
  const selectedDoctor = ref<Doctor | null>(null)
  const isLoadingDoctors = ref(false)

  // 掛號清單
  const todayRegistrations = ref<Registration[]>([])
  const isLoadingRegistrations = ref(false)

  // 掛號類型
  const registrationType = ref<RegistrationType>('WALK_IN')
  const appointmentDate = ref<Date | null>(null)

  // 操作狀態
  const isRegistering = ref(false)
  const error = ref<string | null>(null)

  // ========== Getters ==========

  // 等候中的掛號
  const waitingList = computed(() =>
    todayRegistrations.value.filter(r => r.status === 'WAITING')
  )

  // 叫號中的掛號
  const callingList = computed(() =>
    todayRegistrations.value.filter(r => r.status === 'CALLING')
  )

  // 看診中的掛號
  const consultingList = computed(() =>
    todayRegistrations.value.filter(r => r.status === 'CONSULTING')
  )

  // 已完成的掛號
  const completedList = computed(() =>
    todayRegistrations.value.filter(r => r.status === 'COMPLETED')
  )

  // 各醫師候診人數
  const waitingCountByDoctor = computed(() => {
    const counts: Record<number, number> = {}
    for (const r of waitingList.value) {
      counts[r.resourceId] = (counts[r.resourceId] || 0) + 1
    }
    return counts
  })

  // ========== Actions ==========

  /**
   * 用身分證查詢病人
   */
  async function findPatient(taxId: string): Promise<Patient | null> {
    isSearchingPatient.value = true
    error.value = null

    try {
      const patient = await findPatientByTaxId(taxId)
      currentPatient.value = patient
      return patient
    } catch (e: any) {
      error.value = e.message || '查詢病人失敗'
      return null
    } finally {
      isSearchingPatient.value = false
    }
  }

  /**
   * 搜尋病人（模糊）
   */
  async function searchPatient(keyword: string): Promise<void> {
    if (!keyword || keyword.length < 2) {
      patientSearchResults.value = []
      return
    }

    isSearchingPatient.value = true
    error.value = null

    try {
      patientSearchResults.value = await searchPatients(keyword)
    } catch (e: any) {
      error.value = e.message || '搜尋病人失敗'
      patientSearchResults.value = []
    } finally {
      isSearchingPatient.value = false
    }
  }

  /**
   * 建立新病人
   */
  async function addPatient(data: { name: string; taxId: string; phone?: string }): Promise<Patient | null> {
    if (!hasOrgContext(authStore.context)) {
      error.value = '未設定組織'
      return null
    }

    error.value = null

    try {
      const patient = await createPatient({
        ...data,
        orgId: authStore.context.organizationId,
      })
      currentPatient.value = patient
      return patient
    } catch (e: any) {
      error.value = e.message || '建立病人失敗'
      return null
    }
  }

  /**
   * 選擇病人
   */
  function selectPatient(patient: Patient): void {
    currentPatient.value = patient
    patientSearchResults.value = []
  }

  /**
   * 清除目前病人
   */
  function clearPatient(): void {
    currentPatient.value = null
    patientSearchResults.value = []
  }

  /**
   * 載入醫師清單
   */
  async function loadDoctors(): Promise<void> {
    isLoadingDoctors.value = true
    error.value = null

    try {
      doctors.value = await listDoctors()
    } catch (e: any) {
      error.value = e.message || '載入醫師清單失敗'
    } finally {
      isLoadingDoctors.value = false
    }
  }

  /**
   * 選擇醫師
   */
  function selectDoctor(doctor: Doctor): void {
    selectedDoctor.value = doctor
  }

  /**
   * 執行掛號
   */
  async function register(): Promise<Registration | null> {
    if (!currentPatient.value) {
      error.value = '請先選擇病人'
      return null
    }

    if (!selectedDoctor.value?.id) {
      error.value = '請先選擇醫師'
      return null
    }

    if (!hasOrgContext(authStore.context)) {
      error.value = '未設定組織'
      return null
    }

    // S_ResourceAssignment 不接受 org=0 (*)，自動找第一個非零組織
    let orgId = authStore.context.organizationId
    if (orgId === 0) {
      const realOrg = authStore.availableOrgs.find(o => o.id !== 0)
      if (!realOrg) {
        error.value = '找不到可用的組織'
        return null
      }
      orgId = realOrg.id
    }

    if (registrationType.value === 'APPOINTMENT' && !appointmentDate.value) {
      error.value = '請選擇預約日期'
      return null
    }

    isRegistering.value = true
    error.value = null

    try {
      const targetDate = registrationType.value === 'APPOINTMENT' && appointmentDate.value
        ? appointmentDate.value
        : undefined

      // 取得下一個號碼（依日期）
      const queueNumber = await getNextQueueNumber(selectedDoctor.value.id, targetDate)

      // 建立掛號
      const registration = await createRegistration({
        resourceId: selectedDoctor.value.id,
        patientId: currentPatient.value.id,
        patientName: currentPatient.value.name,
        patientTaxId: currentPatient.value.taxId,
        queueNumber,
        orgId,
        type: registrationType.value,
        appointmentDate: targetDate,
      })

      // 只有今天的掛號才加入本地清單
      const today = toDateString(new Date())
      const regDate = targetDate ? toDateString(targetDate) : today
      if (regDate === today) {
        todayRegistrations.value.push(registration)
      }

      // 清除選擇
      currentPatient.value = null
      selectedDoctor.value = null
      registrationType.value = 'WALK_IN'
      appointmentDate.value = null

      return registration
    } catch (e: any) {
      error.value = e.message || '掛號失敗'
      return null
    } finally {
      isRegistering.value = false
    }
  }

  /**
   * 載入今日掛號清單（merge-based：不會把本地較新的狀態倒退）
   */
  async function loadTodayRegistrations(resourceId?: number): Promise<void> {
    isLoadingRegistrations.value = true
    error.value = null

    try {
      const serverData = await listTodayRegistrations(resourceId)

      // 用本地 map 做 merge，避免 race condition 導致狀態倒退
      const localMap = new Map(todayRegistrations.value.map(r => [r.id, r]))
      const merged = serverData.map(serverReg => {
        const localReg = localMap.get(serverReg.id)
        if (localReg && statusRank(localReg.status) > statusRank(serverReg.status)) {
          return { ...serverReg, status: localReg.status, isConfirmed: localReg.isConfirmed }
        }
        return serverReg
      })

      todayRegistrations.value = merged
    } catch (e: any) {
      error.value = e.message || '載入掛號清單失敗'
    } finally {
      isLoadingRegistrations.value = false
    }
  }

  /**
   * 叫號
   */
  async function call(registrationId: number): Promise<void> {
    if (!hasOrgContext(authStore.context)) return

    try {
      await callPatient(registrationId, authStore.context.organizationId)

      // 更新本地狀態
      const reg = todayRegistrations.value.find(r => r.id === registrationId)
      if (reg) reg.status = 'CALLING'
    } catch (e: any) {
      error.value = e.message || '叫號失敗'
    }
  }

  /**
   * 開始看診
   */
  async function startConsult(registrationId: number): Promise<void> {
    if (!hasOrgContext(authStore.context)) return

    try {
      await startConsultation(registrationId, authStore.context.organizationId)

      // 更新本地狀態
      const reg = todayRegistrations.value.find(r => r.id === registrationId)
      if (reg) {
        reg.status = 'CONSULTING'
      }
    } catch (e: any) {
      error.value = e.message || '開始看診失敗'
    }
  }

  /**
   * 完成看診
   */
  async function completeConsult(registrationId: number): Promise<void> {
    if (!hasOrgContext(authStore.context)) return

    try {
      await completeConsultation(registrationId, authStore.context.organizationId)

      // 更新本地狀態
      const reg = todayRegistrations.value.find(r => r.id === registrationId)
      if (reg) reg.status = 'COMPLETED'
    } catch (e: any) {
      error.value = e.message || '完成看診失敗'
    }
  }

  /**
   * 取消掛號
   */
  async function cancel(registrationId: number): Promise<void> {
    if (!hasOrgContext(authStore.context)) return

    try {
      await cancelRegistration(registrationId, authStore.context.organizationId)

      // 更新本地狀態
      const reg = todayRegistrations.value.find(r => r.id === registrationId)
      if (reg) reg.status = 'CANCELLED'
    } catch (e: any) {
      error.value = e.message || '取消掛號失敗'
    }
  }

  /**
   * 叫下一位（自動找 WAITING 中最小號碼）
   */
  async function callNext(resourceId?: number): Promise<Registration | null> {
    const waiting = waitingList.value
      .filter(r => !resourceId || r.resourceId === resourceId)
      .sort((a, b) => parseInt(a.queueNumber) - parseInt(b.queueNumber))

    const next = waiting[0]
    if (!next) return null

    await call(next.id)
    return next
  }

  // ========== Patient Tags ==========

  const patientTags = ref<Record<number, PatientTag[]>>({})

  async function loadPatientTags(patientId: number): Promise<PatientTag[]> {
    if (patientTags.value[patientId]) return patientTags.value[patientId]
    try {
      const tags = await getPatientTags(patientId)
      patientTags.value[patientId] = tags
      return tags
    } catch {
      return []
    }
  }

  async function updatePatientTags(patientId: number, tags: PatientTag[]): Promise<boolean> {
    if (!hasOrgContext(authStore.context)) {
      error.value = '請先登入以設定組織環境'
      return false
    }
    try {
      await setPatientTags(patientId, tags, authStore.context!.organizationId)
      patientTags.value[patientId] = tags
      return true
    } catch (e: any) {
      error.value = e.message || 'Failed to update tags'
      return false
    }
  }

  return {
    // State
    currentPatient,
    patientSearchResults,
    isSearchingPatient,
    doctors,
    selectedDoctor,
    isLoadingDoctors,
    todayRegistrations,
    isLoadingRegistrations,
    isRegistering,
    error,
    patientTags,
    registrationType,
    appointmentDate,

    // Getters
    waitingList,
    callingList,
    consultingList,
    completedList,
    waitingCountByDoctor,

    // Actions
    findPatient,
    searchPatient,
    addPatient,
    selectPatient,
    clearPatient,
    loadDoctors,
    selectDoctor,
    register,
    loadTodayRegistrations,
    call,
    startConsult,
    completeConsult,
    cancel,
    callNext,
    loadPatientTags,
    updatePatientTags,
  }
})
