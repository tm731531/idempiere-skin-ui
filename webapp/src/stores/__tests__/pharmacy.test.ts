/**
 * Pharmacy Store Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePharmacyStore } from '../pharmacy'
import * as pharmacyApi from '@/api/pharmacy'

vi.mock('@/api/pharmacy', () => ({
  listPendingDispense: vi.fn(),
  setDispenseStatus: vi.fn(),
  getProductStock: vi.fn(),
  createDispenseMovement: vi.fn().mockResolvedValue({ movementId: 1, completed: true }),
}))

vi.mock('@/api/client', () => ({
  apiClient: {
    defaults: { headers: { common: {} } },
    get: vi.fn().mockResolvedValue({ data: { records: [{ id: 50 }] } }),
  },
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

describe('Pharmacy Store', () => {
  describe('initial state', () => {
    it('starts with empty queue', () => {
      const store = usePharmacyStore()
      expect(store.dispenseQueue).toEqual([])
      expect(store.currentItem).toBeNull()
      expect(store.isLoading).toBe(false)
      expect(store.pendingCount).toBe(0)
    })
  })

  describe('loadQueue', () => {
    it('loads pending dispense items', async () => {
      const items = [
        {
          assignmentId: 100,
          prescription: { lines: [] },
          status: 'PENDING' as const,
        },
      ]
      vi.mocked(pharmacyApi.listPendingDispense).mockResolvedValue(items as any)

      const store = usePharmacyStore()
      await store.loadQueue()

      expect(store.dispenseQueue).toEqual(items)
      expect(store.isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      vi.mocked(pharmacyApi.listPendingDispense).mockRejectedValue(new Error('Network'))

      const store = usePharmacyStore()
      await store.loadQueue()

      expect(store.error).toBe('Network')
      expect(store.isLoading).toBe(false)
    })
  })

  describe('pendingCount', () => {
    it('counts only PENDING items', () => {
      const store = usePharmacyStore()
      store.dispenseQueue = [
        { assignmentId: 1, prescription: {} as any, status: 'PENDING' },
        { assignmentId: 2, prescription: {} as any, status: 'DISPENSING' },
        { assignmentId: 3, prescription: {} as any, status: 'PENDING' },
      ]
      expect(store.pendingCount).toBe(2)
    })
  })

  describe('dispensingItem', () => {
    it('finds the dispensing item', () => {
      const store = usePharmacyStore()
      const dispensing = { assignmentId: 2, prescription: {} as any, status: 'DISPENSING' as const }
      store.dispenseQueue = [
        { assignmentId: 1, prescription: {} as any, status: 'PENDING' },
        dispensing,
      ]
      expect(store.dispensingItem).toEqual(dispensing)
    })

    it('returns undefined when nothing dispensing', () => {
      const store = usePharmacyStore()
      store.dispenseQueue = [
        { assignmentId: 1, prescription: {} as any, status: 'PENDING' },
      ]
      expect(store.dispensingItem).toBeUndefined()
    })
  })

  describe('startDispensing', () => {
    it('sets status and loads stock for prescription lines', async () => {
      vi.mocked(pharmacyApi.setDispenseStatus).mockResolvedValue()
      vi.mocked(pharmacyApi.getProductStock).mockResolvedValue([
        { productId: 100, productName: '', qtyOnHand: 50, warehouseName: 'WH1' },
      ])

      const store = usePharmacyStore()
      // Set auth context
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

      const item = {
        assignmentId: 100,
        prescription: {
          lines: [{ productId: 100, productName: 'Aspirin', dosage: 3, unit: 'g', frequency: 'TID', days: 7, totalQuantity: 63 }],
        } as any,
        status: 'PENDING' as const,
      }

      await store.startDispensing(item)

      expect(item.status).toBe('DISPENSING')
      expect(store.currentItem).toEqual(item)
      expect(store.currentStock[100]).toHaveLength(1)
      expect(pharmacyApi.setDispenseStatus).toHaveBeenCalledWith(100, 'DISPENSING', 11)
    })
  })

  describe('completeDispensing', () => {
    it('sets status and removes from queue', async () => {
      vi.mocked(pharmacyApi.setDispenseStatus).mockResolvedValue()

      const store = usePharmacyStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

      store.dispenseQueue = [
        { assignmentId: 100, prescription: {} as any, status: 'DISPENSING' },
        { assignmentId: 101, prescription: {} as any, status: 'PENDING' },
      ]
      store.currentItem = store.dispenseQueue[0]

      await store.completeDispensing(100)

      expect(store.dispenseQueue).toHaveLength(1)
      expect(store.dispenseQueue[0].assignmentId).toBe(101)
      expect(store.currentItem).toBeNull()
      expect(pharmacyApi.setDispenseStatus).toHaveBeenCalledWith(100, 'DISPENSED', 11)
    })
  })

  describe('clearCurrent', () => {
    it('clears current item and stock', () => {
      const store = usePharmacyStore()
      store.currentItem = { assignmentId: 1 } as any
      store.currentStock = { 100: [] }

      store.clearCurrent()

      expect(store.currentItem).toBeNull()
      expect(store.currentStock).toEqual({})
    })
  })
})
