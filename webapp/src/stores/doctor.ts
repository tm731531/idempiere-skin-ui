/**
 * Doctor Store
 *
 * Consultation and prescription state management
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { useRegistrationStore } from './registration'
import {
  type Medicine,
  type PrescriptionLine,
  searchMedicines,
  listMedicines,
  savePrescription,
  loadPrescription,
  calculateTotalQuantity,
} from '@/api/doctor'

export const useDoctorStore = defineStore('doctor', () => {
  const authStore = useAuthStore()
  const registrationStore = useRegistrationStore()

  // ========== State ==========

  // Current consultation
  const currentAssignmentId = ref<number | null>(null)
  const currentPatientName = ref('')
  const currentPatientTaxId = ref('')
  const currentResourceName = ref('')

  // Prescription
  const diagnosis = ref('')
  const prescriptionLines = ref<PrescriptionLine[]>([])
  const totalDays = ref(7)
  const prescriptionStatus = ref<'DRAFT' | 'COMPLETED'>('DRAFT')

  // Medicine search
  const medicines = ref<Medicine[]>([])
  const searchResults = ref<Medicine[]>([])
  const isSearching = ref(false)

  // Loading states
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  // ========== Getters ==========

  const hasCurrentPatient = computed(() => currentAssignmentId.value !== null)

  const consultingPatients = computed(() =>
    registrationStore.consultingList
  )

  const waitingCount = computed(() =>
    registrationStore.waitingList.length
  )

  // ========== Actions ==========

  /**
   * Start consultation for a patient
   */
  async function startConsultation(assignmentId: number, patientName: string, patientTaxId: string, resourceName: string): Promise<void> {
    currentAssignmentId.value = assignmentId
    currentPatientName.value = patientName
    currentPatientTaxId.value = patientTaxId
    currentResourceName.value = resourceName
    diagnosis.value = ''
    prescriptionLines.value = []
    totalDays.value = 7
    prescriptionStatus.value = 'DRAFT'
    error.value = null

    // Try to load existing prescription
    const existing = await loadPrescription(assignmentId)
    if (existing) {
      diagnosis.value = existing.diagnosis || ''
      prescriptionLines.value = existing.lines || []
      totalDays.value = existing.totalDays || 7
      prescriptionStatus.value = existing.status || 'DRAFT'
    }
  }

  /**
   * Search medicines
   */
  async function searchMedicine(keyword: string): Promise<void> {
    if (!keyword || keyword.length < 1) {
      searchResults.value = []
      return
    }

    isSearching.value = true
    error.value = null

    try {
      searchResults.value = await searchMedicines(keyword)
    } catch (e: any) {
      error.value = e.message || 'Search failed'
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }

  /**
   * Load all medicines
   */
  async function loadMedicines(): Promise<void> {
    isLoading.value = true
    try {
      medicines.value = await listMedicines()
    } catch (e: any) {
      error.value = e.message || 'Failed to load medicines'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Add medicine to prescription
   */
  function addMedicine(medicine: Medicine, dosage: number = 3, frequency: string = 'TID', days?: number): void {
    const d = days || totalDays.value
    const line: PrescriptionLine = {
      productId: medicine.id,
      productName: medicine.name,
      dosage,
      unit: 'g',
      frequency: frequency as PrescriptionLine['frequency'],
      days: d,
      totalQuantity: calculateTotalQuantity(dosage, frequency, d),
    }
    prescriptionLines.value.push(line)
  }

  /**
   * Remove medicine from prescription
   */
  function removeMedicine(index: number): void {
    prescriptionLines.value.splice(index, 1)
  }

  /**
   * Update a prescription line
   */
  function updateLine(index: number, updates: Partial<PrescriptionLine>): void {
    const line = prescriptionLines.value[index]
    if (!line) return

    Object.assign(line, updates)
    // Recalculate total
    line.totalQuantity = calculateTotalQuantity(line.dosage, line.frequency, line.days)
  }

  /**
   * Update total days for all lines
   */
  function setTotalDays(days: number): void {
    totalDays.value = days
    for (const line of prescriptionLines.value) {
      line.days = days
      line.totalQuantity = calculateTotalQuantity(line.dosage, line.frequency, days)
    }
  }

  /**
   * Save current prescription
   */
  async function save(): Promise<boolean> {
    if (!currentAssignmentId.value) {
      error.value = 'No active consultation'
      return false
    }

    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = 'Organization not set'
      return false
    }

    isSaving.value = true
    error.value = null

    try {
      await savePrescription(currentAssignmentId.value, {
        patientId: 0,
        patientName: currentPatientName.value,
        diagnosis: diagnosis.value,
        lines: prescriptionLines.value,
        totalDays: totalDays.value,
        status: prescriptionStatus.value,
        createdAt: new Date().toISOString(),
      }, authStore.context!.organizationId)
      return true
    } catch (e: any) {
      error.value = e.message || 'Save failed'
      return false
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Complete consultation - save prescription as COMPLETED and update status
   */
  async function completeConsultation(): Promise<boolean> {
    if (!currentAssignmentId.value) return false

    prescriptionStatus.value = 'COMPLETED'
    const saved = await save()
    if (!saved) return false

    // Update registration status to COMPLETED
    await registrationStore.completeConsult(currentAssignmentId.value)

    // Clear current
    clearConsultation()
    return true
  }

  /**
   * Clear current consultation
   */
  function clearConsultation(): void {
    currentAssignmentId.value = null
    currentPatientName.value = ''
    currentPatientTaxId.value = ''
    currentResourceName.value = ''
    diagnosis.value = ''
    prescriptionLines.value = []
    totalDays.value = 7
    prescriptionStatus.value = 'DRAFT'
    searchResults.value = []
    error.value = null
  }

  return {
    // State
    currentAssignmentId,
    currentPatientName,
    currentPatientTaxId,
    currentResourceName,
    diagnosis,
    prescriptionLines,
    totalDays,
    prescriptionStatus,
    medicines,
    searchResults,
    isSearching,
    isLoading,
    isSaving,
    error,

    // Getters
    hasCurrentPatient,
    consultingPatients,
    waitingCount,

    // Actions
    startConsultation,
    searchMedicine,
    loadMedicines,
    addMedicine,
    removeMedicine,
    updateLine,
    setTotalDays,
    save,
    completeConsultation,
    clearConsultation,
  }
})
