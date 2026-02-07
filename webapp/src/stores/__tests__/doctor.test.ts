/**
 * Doctor Store Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDoctorStore } from '../doctor'
import * as doctorApi from '@/api/doctor'

vi.mock('@/api/doctor', () => ({
  searchMedicines: vi.fn(),
  listMedicines: vi.fn(),
  savePrescription: vi.fn(),
  loadPrescription: vi.fn(),
  calculateTotalQuantity: vi.fn((dosage: number, freq: string, days: number) => {
    const mult: Record<string, number> = { QD: 1, BID: 2, TID: 3, QID: 4, PRN: 1 }
    return dosage * (mult[freq] || 1) * days
  }),
}))

vi.mock('@/api/client', () => ({
  apiClient: { defaults: { headers: { common: {} } } },
}))

vi.mock('@/config', () => ({
  getApiBaseUrl: () => '',
  getConfig: () => ({ apiBaseUrl: '' }),
  loadConfig: vi.fn(),
}))

vi.mock('@/api/registration', () => ({
  listTodayRegistrations: vi.fn().mockResolvedValue([]),
  listDoctors: vi.fn().mockResolvedValue([]),
  listDoctorResources: vi.fn().mockResolvedValue({}),
  findPatientByTaxId: vi.fn(),
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  getNextQueueNumber: vi.fn(),
  createRegistration: vi.fn(),
  callPatient: vi.fn(),
  startConsultation: vi.fn(),
  completeConsultation: vi.fn(),
  cancelRegistration: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('Doctor Store', () => {
  describe('initial state', () => {
    it('has no current patient', () => {
      const store = useDoctorStore()
      expect(store.hasCurrentPatient).toBe(false)
      expect(store.currentAssignmentId).toBeNull()
      expect(store.prescriptionLines).toEqual([])
      expect(store.totalDays).toBe(7)
    })
  })

  describe('startConsultation', () => {
    it('sets current patient and loads existing prescription', async () => {
      const existing = {
        diagnosis: 'Cold',
        lines: [{ productId: 1, productName: 'Asp', dosage: 3, unit: 'g', frequency: 'TID', days: 7, totalQuantity: 63 }],
        totalDays: 7,
        status: 'DRAFT',
      }
      vi.mocked(doctorApi.loadPrescription).mockResolvedValue(existing as any)

      const store = useDoctorStore()
      await store.startConsultation(100, 'John', 'A123', 'Dr. Smith')

      expect(store.currentAssignmentId).toBe(100)
      expect(store.currentPatientName).toBe('John')
      expect(store.diagnosis).toBe('Cold')
      expect(store.prescriptionLines).toHaveLength(1)
      expect(store.hasCurrentPatient).toBe(true)
    })

    it('initializes empty when no existing prescription', async () => {
      vi.mocked(doctorApi.loadPrescription).mockResolvedValue(null)

      const store = useDoctorStore()
      await store.startConsultation(100, 'John', 'A123', 'Dr. Smith')

      expect(store.diagnosis).toBe('')
      expect(store.prescriptionLines).toEqual([])
    })
  })

  describe('searchMedicine', () => {
    it('searches medicines and populates results', async () => {
      const results = [{ id: 1, value: 'MED001', name: 'Aspirin', isActive: true }]
      vi.mocked(doctorApi.searchMedicines).mockResolvedValue(results)

      const store = useDoctorStore()
      await store.searchMedicine('asp')

      expect(store.searchResults).toEqual(results)
      expect(store.isSearching).toBe(false)
    })

    it('clears results for empty keyword', async () => {
      const store = useDoctorStore()
      store.searchResults = [{ id: 1, value: '', name: 'X', isActive: true }] as any
      await store.searchMedicine('')

      expect(store.searchResults).toEqual([])
      expect(doctorApi.searchMedicines).not.toHaveBeenCalled()
    })

    it('sets error on failure', async () => {
      vi.mocked(doctorApi.searchMedicines).mockRejectedValue(new Error('Network'))

      const store = useDoctorStore()
      await store.searchMedicine('asp')

      expect(store.error).toBe('Network')
      expect(store.searchResults).toEqual([])
    })
  })

  describe('loadMedicines', () => {
    it('loads all medicines', async () => {
      const meds = [{ id: 1, value: '', name: 'Aspirin', isActive: true }]
      vi.mocked(doctorApi.listMedicines).mockResolvedValue(meds)

      const store = useDoctorStore()
      await store.loadMedicines()

      expect(store.medicines).toEqual(meds)
      expect(store.isLoading).toBe(false)
    })
  })

  describe('addMedicine', () => {
    it('adds a medicine line with calculated total', () => {
      const store = useDoctorStore()
      store.addMedicine({ id: 1, value: 'MED001', name: 'Aspirin', isActive: true }, 3, 'TID', 7)

      expect(store.prescriptionLines).toHaveLength(1)
      expect(store.prescriptionLines[0].productId).toBe(1)
      expect(store.prescriptionLines[0].totalQuantity).toBe(63) // 3 * 3 * 7
    })

    it('uses totalDays as default when days not specified', () => {
      const store = useDoctorStore()
      store.totalDays = 5
      store.addMedicine({ id: 1, value: '', name: 'Med', isActive: true })

      expect(store.prescriptionLines[0].days).toBe(5)
    })
  })

  describe('removeMedicine', () => {
    it('removes medicine at index', () => {
      const store = useDoctorStore()
      store.addMedicine({ id: 1, value: '', name: 'A', isActive: true })
      store.addMedicine({ id: 2, value: '', name: 'B', isActive: true })

      store.removeMedicine(0)

      expect(store.prescriptionLines).toHaveLength(1)
      expect(store.prescriptionLines[0].productId).toBe(2)
    })
  })

  describe('updateLine', () => {
    it('updates line and recalculates total', () => {
      const store = useDoctorStore()
      store.addMedicine({ id: 1, value: '', name: 'Med', isActive: true }, 3, 'TID', 7)

      store.updateLine(0, { dosage: 5 })

      expect(store.prescriptionLines[0].dosage).toBe(5)
      expect(store.prescriptionLines[0].totalQuantity).toBe(105) // 5 * 3 * 7
    })

    it('does nothing for invalid index', () => {
      const store = useDoctorStore()
      store.updateLine(99, { dosage: 5 }) // no crash
    })
  })

  describe('setTotalDays', () => {
    it('updates all lines with new days', () => {
      const store = useDoctorStore()
      store.addMedicine({ id: 1, value: '', name: 'A', isActive: true }, 3, 'TID', 7)
      store.addMedicine({ id: 2, value: '', name: 'B', isActive: true }, 2, 'BID', 7)

      store.setTotalDays(14)

      expect(store.totalDays).toBe(14)
      expect(store.prescriptionLines[0].days).toBe(14)
      expect(store.prescriptionLines[0].totalQuantity).toBe(126) // 3 * 3 * 14
      expect(store.prescriptionLines[1].days).toBe(14)
      expect(store.prescriptionLines[1].totalQuantity).toBe(56) // 2 * 2 * 14
    })
  })

  describe('save', () => {
    it('saves prescription successfully', async () => {
      vi.mocked(doctorApi.loadPrescription).mockResolvedValue(null)
      vi.mocked(doctorApi.savePrescription).mockResolvedValue()

      const store = useDoctorStore()
      await store.startConsultation(100, 'John', 'A123', 'Dr. Smith')

      // Manually set auth context (since auth store is also pinia)
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      const result = await store.save()

      expect(result).toBe(true)
      expect(doctorApi.savePrescription).toHaveBeenCalled()
      expect(store.isSaving).toBe(false)
    })

    it('returns false without active consultation', async () => {
      const store = useDoctorStore()
      const result = await store.save()
      expect(result).toBe(false)
      expect(store.error).toBe('No active consultation')
    })
  })

  describe('clearConsultation', () => {
    it('resets all consultation state', async () => {
      vi.mocked(doctorApi.loadPrescription).mockResolvedValue(null)

      const store = useDoctorStore()
      await store.startConsultation(100, 'John', 'A123', 'Dr. Smith')

      store.clearConsultation()

      expect(store.currentAssignmentId).toBeNull()
      expect(store.currentPatientName).toBe('')
      expect(store.diagnosis).toBe('')
      expect(store.prescriptionLines).toEqual([])
      expect(store.totalDays).toBe(7)
    })
  })
})
