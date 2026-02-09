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
  listPrescriptionHistory: vi.fn(),
  listTemplates: vi.fn(),
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
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
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

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

  describe('loadHistory', () => {
    it('loads prescription history', async () => {
      const history = [
        {
          diagnosis: 'Cold',
          lines: [{ productId: 1, productName: 'Aspirin', dosage: 3, unit: 'g', frequency: 'TID', days: 7, totalQuantity: 63 }],
          status: 'COMPLETED',
          createdAt: '2025-01-01',
        },
      ]
      vi.mocked(doctorApi.listPrescriptionHistory).mockResolvedValue(history as any)

      const store = useDoctorStore()
      await store.loadHistory()

      expect(store.prescriptionHistory).toEqual(history)
    })

    it('sets error on failure', async () => {
      vi.mocked(doctorApi.listPrescriptionHistory).mockRejectedValue(new Error('Network'))

      const store = useDoctorStore()
      await store.loadHistory()

      expect(store.error).toBe('Network')
      expect(store.prescriptionHistory).toEqual([])
    })
  })

  describe('loadTemplateList', () => {
    it('loads templates', async () => {
      const templates = [
        {
          name: 'Cold combo',
          lines: [{ productId: 1, productName: 'Aspirin', dosage: 3, unit: 'g', frequency: 'TID', days: 7, totalQuantity: 63 }],
        },
      ]
      vi.mocked(doctorApi.listTemplates).mockResolvedValue(templates as any)

      const store = useDoctorStore()
      await store.loadTemplateList()

      expect(store.templates).toEqual(templates)
    })
  })

  describe('saveCurrentAsTemplate', () => {
    it('saves template from current prescription lines', async () => {
      vi.mocked(doctorApi.saveTemplate).mockResolvedValue()
      vi.mocked(doctorApi.listTemplates).mockResolvedValue([])

      const store = useDoctorStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

      store.addMedicine({ id: 1, value: '', name: 'Aspirin', isActive: true }, 3, 'TID', 7)

      await store.saveCurrentAsTemplate('cold')

      expect(doctorApi.saveTemplate).toHaveBeenCalledWith('cold',
        [expect.objectContaining({ productId: 1, productName: 'Aspirin' })],
        7,
        11
      )
      expect(doctorApi.listTemplates).toHaveBeenCalled() // reloaded
    })
  })

  describe('removeTemplate', () => {
    it('deletes template and reloads', async () => {
      vi.mocked(doctorApi.deleteTemplate).mockResolvedValue()

      const store = useDoctorStore()
      store.templates = [
        { id: 'CLINIC_TEMPLATE_cold', name: 'Cold combo', lines: [], totalDays: 7 },
      ]

      await store.removeTemplate('CLINIC_TEMPLATE_cold')

      expect(doctorApi.deleteTemplate).toHaveBeenCalledWith('CLINIC_TEMPLATE_cold')
      expect(store.templates).toEqual([]) // filtered out
    })
  })

  // ========== Template Editor ==========

  describe('openTemplateEditor', () => {
    it('opens empty editor for new template', () => {
      const store = useDoctorStore()
      store.openTemplateEditor()

      expect(store.isEditorOpen).toBe(true)
      expect(store.editingTemplateId).toBeNull()
      expect(store.editorName).toBe('')
      expect(store.editorLines).toEqual([])
      expect(store.editorTotalDays).toBe(7)
    })

    it('opens editor with existing template data', () => {
      const store = useDoctorStore()
      const template = {
        id: 'CLINIC_TEMPLATE_cold',
        name: 'Cold combo',
        lines: [
          { productId: 1, productName: 'Aspirin', dosage: 3, unit: 'g', frequency: 'TID' as const, days: 7, totalQuantity: 63 },
        ],
        totalDays: 7,
      }

      store.openTemplateEditor(template)

      expect(store.isEditorOpen).toBe(true)
      expect(store.editingTemplateId).toBe('CLINIC_TEMPLATE_cold')
      expect(store.editorName).toBe('Cold combo')
      expect(store.editorLines).toHaveLength(1)
      expect(store.editorLines[0].productName).toBe('Aspirin')
      expect(store.editorTotalDays).toBe(7)
    })

    it('clears any previous error', () => {
      const store = useDoctorStore()
      store.error = 'previous error'
      store.openTemplateEditor()
      expect(store.error).toBeNull()
    })
  })

  describe('closeTemplateEditor', () => {
    it('resets editor state', () => {
      const store = useDoctorStore()
      store.openTemplateEditor()
      store.editorName = 'Test'
      store.editorAddMedicine({ id: 1, value: '', name: 'Med', isActive: true })

      store.closeTemplateEditor()

      expect(store.isEditorOpen).toBe(false)
      expect(store.editorName).toBe('')
      expect(store.editorLines).toEqual([])
      expect(store.editorTotalDays).toBe(7)
      expect(store.editingTemplateId).toBeNull()
    })
  })

  describe('editorAddMedicine', () => {
    it('adds medicine to editor lines', () => {
      const store = useDoctorStore()
      store.openTemplateEditor()

      store.editorAddMedicine({ id: 10, value: 'MED010', name: 'Ibuprofen', isActive: true })

      expect(store.editorLines).toHaveLength(1)
      expect(store.editorLines[0].productId).toBe(10)
      expect(store.editorLines[0].productName).toBe('Ibuprofen')
      expect(store.editorLines[0].dosage).toBe(3)
      expect(store.editorLines[0].frequency).toBe('TID')
    })

    it('uses editorTotalDays as default', () => {
      const store = useDoctorStore()
      store.openTemplateEditor()
      store.editorTotalDays = 14

      store.editorAddMedicine({ id: 10, value: '', name: 'Med', isActive: true })

      expect(store.editorLines[0].days).toBe(14)
      expect(store.editorLines[0].totalQuantity).toBe(126) // 3 * 3 * 14
    })
  })

  describe('editorRemoveMedicine', () => {
    it('removes medicine from editor lines', () => {
      const store = useDoctorStore()
      store.openTemplateEditor()
      store.editorAddMedicine({ id: 1, value: '', name: 'A', isActive: true })
      store.editorAddMedicine({ id: 2, value: '', name: 'B', isActive: true })

      store.editorRemoveMedicine(0)

      expect(store.editorLines).toHaveLength(1)
      expect(store.editorLines[0].productId).toBe(2)
    })
  })

  describe('editorUpdateLine', () => {
    it('updates line and recalculates total', () => {
      const store = useDoctorStore()
      store.openTemplateEditor()
      store.editorAddMedicine({ id: 1, value: '', name: 'Med', isActive: true }, 3, 'TID', 7)

      store.editorUpdateLine(0, { dosage: 5 })

      expect(store.editorLines[0].dosage).toBe(5)
      expect(store.editorLines[0].totalQuantity).toBe(105) // 5 * 3 * 7
    })

    it('does nothing for invalid index', () => {
      const store = useDoctorStore()
      store.editorUpdateLine(99, { dosage: 5 }) // no crash
    })
  })

  describe('editorSetTotalDays', () => {
    it('updates all editor lines with new days', () => {
      const store = useDoctorStore()
      store.openTemplateEditor()
      store.editorAddMedicine({ id: 1, value: '', name: 'A', isActive: true }, 3, 'TID', 7)
      store.editorAddMedicine({ id: 2, value: '', name: 'B', isActive: true }, 2, 'BID', 7)

      store.editorSetTotalDays(14)

      expect(store.editorTotalDays).toBe(14)
      expect(store.editorLines[0].days).toBe(14)
      expect(store.editorLines[0].totalQuantity).toBe(126) // 3 * 3 * 14
      expect(store.editorLines[1].days).toBe(14)
      expect(store.editorLines[1].totalQuantity).toBe(56) // 2 * 2 * 14
    })
  })

  describe('saveTemplateFromEditor', () => {
    it('saves template and reloads list', async () => {
      vi.mocked(doctorApi.saveTemplate).mockResolvedValue()
      vi.mocked(doctorApi.listTemplates).mockResolvedValue([])

      const store = useDoctorStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

      store.openTemplateEditor()
      store.editorName = '冬天感冒方'
      store.editorAddMedicine({ id: 1, value: '', name: 'Aspirin', isActive: true }, 3, 'TID', 7)

      const result = await store.saveTemplateFromEditor()

      expect(result).toBe(true)
      expect(doctorApi.saveTemplate).toHaveBeenCalledWith(
        '冬天感冒方',
        [expect.objectContaining({ productId: 1, productName: 'Aspirin' })],
        7,
        11
      )
      expect(doctorApi.listTemplates).toHaveBeenCalled()
      expect(store.isEditorOpen).toBe(false) // editor closed
    })

    it('fails without template name', async () => {
      const store = useDoctorStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

      store.openTemplateEditor()
      store.editorAddMedicine({ id: 1, value: '', name: 'Med', isActive: true })

      const result = await store.saveTemplateFromEditor()

      expect(result).toBe(false)
      expect(store.error).toBe('請輸入範本名稱')
    })

    it('fails without medicines', async () => {
      const store = useDoctorStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

      store.openTemplateEditor()
      store.editorName = 'Test Template'

      const result = await store.saveTemplateFromEditor()

      expect(result).toBe(false)
      expect(store.error).toBe('請至少加入一項藥品')
    })

    it('fails without org context', async () => {
      const store = useDoctorStore()
      store.openTemplateEditor()
      store.editorName = 'Test'
      store.editorAddMedicine({ id: 1, value: '', name: 'Med', isActive: true })

      const result = await store.saveTemplateFromEditor()

      expect(result).toBe(false)
      expect(store.error).toBe('請先登入以設定組織環境')
    })
  })
})
