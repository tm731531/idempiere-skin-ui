/**
 * Registration Store Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRegistrationStore } from '../registration'
import * as registrationApi from '@/api/registration'

vi.mock('@/api/registration', () => ({
  findPatientByTaxId: vi.fn(),
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  listDoctors: vi.fn(),
  listDoctorResources: vi.fn(),
  getNextQueueNumber: vi.fn(),
  createRegistration: vi.fn(),
  listTodayRegistrations: vi.fn(),
  callPatient: vi.fn(),
  startConsultation: vi.fn(),
  completeConsultation: vi.fn(),
  cancelRegistration: vi.fn(),
  getPatientTags: vi.fn(),
  setPatientTags: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { defaults: { headers: { common: {} } } },
}))

vi.mock('@/config', () => ({
  getApiBaseUrl: () => '',
  getConfig: () => ({ apiBaseUrl: '' }),
  loadConfig: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('Registration Store', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const store = useRegistrationStore()
      expect(store.currentPatient).toBeNull()
      expect(store.patientSearchResults).toEqual([])
      expect(store.isSearchingPatient).toBe(false)
      expect(store.doctors).toEqual([])
      expect(store.selectedDoctor).toBeNull()
      expect(store.todayRegistrations).toEqual([])
      expect(store.error).toBeNull()
      expect(store.patientTags).toEqual({})
    })
  })

  describe('findPatient', () => {
    it('finds patient by taxId', async () => {
      const patient = { id: 100, value: 'P001', name: 'John', taxId: 'A123', isActive: true }
      vi.mocked(registrationApi.findPatientByTaxId).mockResolvedValue(patient)

      const store = useRegistrationStore()
      const result = await store.findPatient('A123')

      expect(result).toEqual(patient)
      expect(store.currentPatient).toEqual(patient)
    })

    it('returns null when not found', async () => {
      vi.mocked(registrationApi.findPatientByTaxId).mockResolvedValue(null)

      const store = useRegistrationStore()
      const result = await store.findPatient('X999')

      expect(result).toBeNull()
    })

    it('sets error on failure', async () => {
      vi.mocked(registrationApi.findPatientByTaxId).mockRejectedValue(new Error('Network'))

      const store = useRegistrationStore()
      await store.findPatient('A123')

      expect(store.error).toBe('Network')
    })
  })

  describe('searchPatient', () => {
    it('searches patients by keyword', async () => {
      const patients = [{ id: 100, value: 'P001', name: 'John', taxId: 'A123', isActive: true }]
      vi.mocked(registrationApi.searchPatients).mockResolvedValue(patients)

      const store = useRegistrationStore()
      await store.searchPatient('Jo')

      expect(store.patientSearchResults).toEqual(patients)
    })

    it('skips search for short keywords', async () => {
      const store = useRegistrationStore()
      await store.searchPatient('J')

      expect(registrationApi.searchPatients).not.toHaveBeenCalled()
      expect(store.patientSearchResults).toEqual([])
    })
  })

  describe('addPatient', () => {
    it('creates patient with orgId', async () => {
      const patient = { id: 200, value: 'P002', name: 'Jane', taxId: 'B456', isActive: true }
      vi.mocked(registrationApi.createPatient).mockResolvedValue(patient)

      const store = useRegistrationStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      const result = await store.addPatient({ name: 'Jane', taxId: 'B456' })

      expect(result).toEqual(patient)
      expect(store.currentPatient).toEqual(patient)
    })

    it('returns null without org context', async () => {
      const store = useRegistrationStore()
      const result = await store.addPatient({ name: 'Jane', taxId: 'B456' })

      expect(result).toBeNull()
      expect(store.error).toBe('未設定組織')
    })
  })

  describe('selectPatient / clearPatient', () => {
    it('selects patient and clears search', () => {
      const store = useRegistrationStore()
      store.patientSearchResults = [{ id: 1, value: 'P1', name: 'A', taxId: 'T1', isActive: true }]

      store.selectPatient({ id: 100, value: 'P100', name: 'Bob', taxId: 'C789', isActive: true })

      expect(store.currentPatient?.name).toBe('Bob')
      expect(store.patientSearchResults).toEqual([])
    })

    it('clears patient', () => {
      const store = useRegistrationStore()
      store.currentPatient = { id: 100, value: 'P100', name: 'Bob', taxId: 'C789', isActive: true }

      store.clearPatient()
      expect(store.currentPatient).toBeNull()
    })
  })

  describe('loadDoctors', () => {
    it('loads doctors with resource IDs', async () => {
      vi.mocked(registrationApi.listDoctors).mockResolvedValue([
        { id: 10, name: 'Dr. A' },
        { id: 20, name: 'Dr. B' },
      ])
      vi.mocked(registrationApi.listDoctorResources).mockResolvedValue({
        'Dr. A': 101,
        'Dr. B': 102,
      })

      const store = useRegistrationStore()
      await store.loadDoctors()

      expect(store.doctors).toHaveLength(2)
      expect(store.doctors[0].resourceId).toBe(101)
      expect(store.doctors[1].resourceId).toBe(102)
    })
  })

  describe('register', () => {
    it('requires patient and doctor', async () => {
      const store = useRegistrationStore()
      const result = await store.register()
      expect(result).toBeNull()
      expect(store.error).toBe('請先選擇病人')
    })

    it('requires doctor with resourceId', async () => {
      const store = useRegistrationStore()
      store.currentPatient = { id: 100, value: 'P1', name: 'John', taxId: 'A123', isActive: true }
      store.selectedDoctor = { id: 10, name: 'Dr. A' } // no resourceId

      const result = await store.register()
      expect(result).toBeNull()
      expect(store.error).toBe('請先選擇醫師')
    })
  })

  describe('loadTodayRegistrations', () => {
    it('loads registrations', async () => {
      const regs = [
        { id: 1, resourceId: 101, resourceName: 'Dr. A', queueNumber: '001', patientId: 100, patientName: 'John', patientTaxId: 'A123', assignDateFrom: '', assignDateTo: '', status: 'WAITING' as const, isConfirmed: false },
      ]
      vi.mocked(registrationApi.listTodayRegistrations).mockResolvedValue(regs)

      const store = useRegistrationStore()
      await store.loadTodayRegistrations()

      expect(store.todayRegistrations).toEqual(regs)
    })
  })

  describe('call / startConsult / completeConsult / cancel', () => {
    async function setupStoreWithRegs() {
      const store = useRegistrationStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      store.todayRegistrations = [
        { id: 1, resourceId: 101, resourceName: 'Dr. A', queueNumber: '001', patientId: 100, patientName: 'John', patientTaxId: 'A123', assignDateFrom: '', assignDateTo: '', status: 'WAITING', isConfirmed: false },
      ]
      return store
    }

    it('call updates status to CALLING', async () => {
      vi.mocked(registrationApi.callPatient).mockResolvedValue()
      const store = await setupStoreWithRegs()

      await store.call(1)
      expect(store.todayRegistrations[0].status).toBe('CALLING')
    })

    it('startConsult updates status to CONSULTING', async () => {
      vi.mocked(registrationApi.startConsultation).mockResolvedValue()
      const store = await setupStoreWithRegs()

      await store.startConsult(1)
      expect(store.todayRegistrations[0].status).toBe('CONSULTING')
      expect(store.todayRegistrations[0].isConfirmed).toBe(true)
    })

    it('completeConsult updates status to COMPLETED', async () => {
      vi.mocked(registrationApi.completeConsultation).mockResolvedValue()
      const store = await setupStoreWithRegs()

      await store.completeConsult(1)
      expect(store.todayRegistrations[0].status).toBe('COMPLETED')
    })

    it('cancel updates status to CANCELLED', async () => {
      vi.mocked(registrationApi.cancelRegistration).mockResolvedValue()
      const store = await setupStoreWithRegs()

      await store.cancel(1)
      expect(store.todayRegistrations[0].status).toBe('CANCELLED')
    })
  })

  describe('callNext', () => {
    it('calls the smallest waiting queue number', async () => {
      vi.mocked(registrationApi.callPatient).mockResolvedValue()

      const store = useRegistrationStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      store.todayRegistrations = [
        { id: 2, resourceId: 101, resourceName: 'Dr. A', queueNumber: '002', patientId: 101, patientName: 'B', patientTaxId: 'B', assignDateFrom: '', assignDateTo: '', status: 'WAITING', isConfirmed: false },
        { id: 1, resourceId: 101, resourceName: 'Dr. A', queueNumber: '001', patientId: 100, patientName: 'A', patientTaxId: 'A', assignDateFrom: '', assignDateTo: '', status: 'WAITING', isConfirmed: false },
      ]

      const next = await store.callNext()
      expect(next?.id).toBe(1) // ID 1 has queueNumber '001'
    })

    it('returns null when no waiting patients', async () => {
      const store = useRegistrationStore()
      store.todayRegistrations = []

      const next = await store.callNext()
      expect(next).toBeNull()
    })
  })

  describe('patient tags', () => {
    it('loads patient tags from API', async () => {
      vi.mocked(registrationApi.getPatientTags).mockResolvedValue(['WARNING', 'ALLERGY'])

      const store = useRegistrationStore()
      const tags = await store.loadPatientTags(100)

      expect(tags).toEqual(['WARNING', 'ALLERGY'])
      expect(store.patientTags[100]).toEqual(['WARNING', 'ALLERGY'])
    })

    it('returns cached tags if already loaded', async () => {
      const store = useRegistrationStore()
      store.patientTags = { 100: ['VIP'] }

      const tags = await store.loadPatientTags(100)
      expect(tags).toEqual(['VIP'])
      expect(registrationApi.getPatientTags).not.toHaveBeenCalled()
    })

    it('returns empty array on failure', async () => {
      vi.mocked(registrationApi.getPatientTags).mockRejectedValue(new Error('fail'))

      const store = useRegistrationStore()
      const tags = await store.loadPatientTags(100)
      expect(tags).toEqual([])
    })

    it('updates patient tags', async () => {
      vi.mocked(registrationApi.setPatientTags).mockResolvedValue()

      const store = useRegistrationStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      const result = await store.updatePatientTags(100, ['WARNING', 'VIP'])

      expect(result).toBe(true)
      expect(store.patientTags[100]).toEqual(['WARNING', 'VIP'])
    })

    it('handles orgId=0 for updatePatientTags', async () => {
      vi.mocked(registrationApi.setPatientTags).mockResolvedValue()

      const store = useRegistrationStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 0, warehouseId: 1 }

      const result = await store.updatePatientTags(100, ['CHRONIC'])
      expect(result).toBe(true)
    })

    it('fails updatePatientTags without org context', async () => {
      const store = useRegistrationStore()
      const result = await store.updatePatientTags(100, ['VIP'])
      expect(result).toBe(false)
      expect(store.error).toBe('Organization not set')
    })
  })

  describe('getters', () => {
    it('filters registrations by status', () => {
      const store = useRegistrationStore()
      store.todayRegistrations = [
        { id: 1, resourceId: 101, resourceName: '', queueNumber: '1', patientId: 100, patientName: '', patientTaxId: '', assignDateFrom: '', assignDateTo: '', status: 'WAITING', isConfirmed: false },
        { id: 2, resourceId: 101, resourceName: '', queueNumber: '2', patientId: 101, patientName: '', patientTaxId: '', assignDateFrom: '', assignDateTo: '', status: 'CALLING', isConfirmed: false },
        { id: 3, resourceId: 101, resourceName: '', queueNumber: '3', patientId: 102, patientName: '', patientTaxId: '', assignDateFrom: '', assignDateTo: '', status: 'CONSULTING', isConfirmed: true },
        { id: 4, resourceId: 101, resourceName: '', queueNumber: '4', patientId: 103, patientName: '', patientTaxId: '', assignDateFrom: '', assignDateTo: '', status: 'COMPLETED', isConfirmed: true },
      ]

      expect(store.waitingList).toHaveLength(1)
      expect(store.callingList).toHaveLength(1)
      expect(store.consultingList).toHaveLength(1)
      expect(store.completedList).toHaveLength(1)
    })

    it('counts waiting by doctor', () => {
      const store = useRegistrationStore()
      store.todayRegistrations = [
        { id: 1, resourceId: 101, resourceName: '', queueNumber: '1', patientId: 100, patientName: '', patientTaxId: '', assignDateFrom: '', assignDateTo: '', status: 'WAITING', isConfirmed: false },
        { id: 2, resourceId: 101, resourceName: '', queueNumber: '2', patientId: 101, patientName: '', patientTaxId: '', assignDateFrom: '', assignDateTo: '', status: 'WAITING', isConfirmed: false },
        { id: 3, resourceId: 102, resourceName: '', queueNumber: '3', patientId: 102, patientName: '', patientTaxId: '', assignDateFrom: '', assignDateTo: '', status: 'WAITING', isConfirmed: false },
      ]

      expect(store.waitingCountByDoctor[101]).toBe(2)
      expect(store.waitingCountByDoctor[102]).toBe(1)
    })
  })
})
