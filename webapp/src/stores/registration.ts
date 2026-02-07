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
  type PatientTag,
  findPatientByTaxId,
  searchPatients,
  createPatient,
  listDoctors,
  listDoctorResources,
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
    if (!authStore.context?.organizationId) {
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
      // 並行載入醫師和資源（解決 N+1 問題）
      const [doctorList, resourceMap] = await Promise.all([
        listDoctors(),
        listDoctorResources(),
      ])

      // 用名稱匹配資源 ID
      for (const doctor of doctorList) {
        if (resourceMap[doctor.name]) {
          doctor.resourceId = resourceMap[doctor.name]
        }
      }

      doctors.value = doctorList
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

    if (!selectedDoctor.value?.resourceId) {
      error.value = '請先選擇醫師'
      return null
    }

    if (!authStore.context?.organizationId) {
      error.value = '未設定組織'
      return null
    }

    isRegistering.value = true
    error.value = null

    try {
      // 取得下一個號碼
      const queueNumber = await getNextQueueNumber(selectedDoctor.value.resourceId)

      // 建立掛號
      const registration = await createRegistration({
        resourceId: selectedDoctor.value.resourceId,
        patientId: currentPatient.value.id,
        patientName: currentPatient.value.name,
        patientTaxId: currentPatient.value.taxId,
        queueNumber,
        orgId: authStore.context.organizationId,
      })

      // 加入清單
      todayRegistrations.value.push(registration)

      // 清除選擇
      currentPatient.value = null
      selectedDoctor.value = null

      return registration
    } catch (e: any) {
      error.value = e.message || '掛號失敗'
      return null
    } finally {
      isRegistering.value = false
    }
  }

  /**
   * 載入今日掛號清單
   */
  async function loadTodayRegistrations(resourceId?: number): Promise<void> {
    isLoadingRegistrations.value = true
    error.value = null

    try {
      todayRegistrations.value = await listTodayRegistrations(resourceId)
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
    if (!authStore.context?.organizationId) return

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
    if (!authStore.context?.organizationId) return

    try {
      await startConsultation(registrationId, authStore.context.organizationId)

      // 更新本地狀態
      const reg = todayRegistrations.value.find(r => r.id === registrationId)
      if (reg) {
        reg.status = 'CONSULTING'
        reg.isConfirmed = true
      }
    } catch (e: any) {
      error.value = e.message || '開始看診失敗'
    }
  }

  /**
   * 完成看診
   */
  async function completeConsult(registrationId: number): Promise<void> {
    if (!authStore.context?.organizationId) return

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
    if (!authStore.context?.organizationId) return

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
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = 'Organization not set'
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
