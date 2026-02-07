/**
 * Checkout Store Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCheckoutStore } from '../checkout'
import * as checkoutApi from '@/api/checkout'

vi.mock('@/api/checkout', () => ({
  listCheckoutItems: vi.fn(),
  setCheckoutStatus: vi.fn(),
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

describe('Checkout Store', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const store = useCheckoutStore()
      expect(store.checkoutItems).toEqual([])
      expect(store.currentItem).toBeNull()
      expect(store.receivedAmount).toBe(0)
      expect(store.pendingCount).toBe(0)
      expect(store.copayment).toBe(50) // Fixed MVP copayment
    })
  })

  describe('loadItems', () => {
    it('loads checkout items', async () => {
      const items = [
        { assignmentId: 100, prescription: {}, dispenseStatus: 'DISPENSED', checkoutStatus: 'PENDING' },
      ]
      vi.mocked(checkoutApi.listCheckoutItems).mockResolvedValue(items as any)

      const store = useCheckoutStore()
      await store.loadItems()

      expect(store.checkoutItems).toEqual(items)
      expect(store.isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      vi.mocked(checkoutApi.listCheckoutItems).mockRejectedValue(new Error('Network'))

      const store = useCheckoutStore()
      await store.loadItems()

      expect(store.error).toBe('Network')
    })
  })

  describe('pendingCount', () => {
    it('reflects checkout items length', () => {
      const store = useCheckoutStore()
      store.checkoutItems = [
        { assignmentId: 1 } as any,
        { assignmentId: 2 } as any,
      ]
      expect(store.pendingCount).toBe(2)
    })
  })

  describe('copayment', () => {
    it('returns fixed amount', () => {
      const store = useCheckoutStore()
      expect(store.copayment).toBe(50)
    })
  })

  describe('changeAmount', () => {
    it('calculates correct change', () => {
      const store = useCheckoutStore()
      store.receivedAmount = 100
      expect(store.changeAmount).toBe(50) // 100 - 50
    })

    it('returns 0 when insufficient payment', () => {
      const store = useCheckoutStore()
      store.receivedAmount = 30
      expect(store.changeAmount).toBe(0) // 30 - 50 = -20, clamped to 0
    })

    it('returns 0 when exact payment', () => {
      const store = useCheckoutStore()
      store.receivedAmount = 50
      expect(store.changeAmount).toBe(0) // 50 - 50 = 0
    })
  })

  describe('selectItem', () => {
    it('sets current item and resets received amount', () => {
      const store = useCheckoutStore()
      store.receivedAmount = 100

      const item = { assignmentId: 100, prescription: {} } as any
      store.selectItem(item)

      expect(store.currentItem).toEqual(item)
      expect(store.receivedAmount).toBe(0)
    })
  })

  describe('completeCheckout', () => {
    it('completes checkout and removes item from list', async () => {
      vi.mocked(checkoutApi.setCheckoutStatus).mockResolvedValue()

      const store = useCheckoutStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, clientName: 'Test', roleId: 1, roleName: 'Admin', organizationId: 11, organizationName: 'Org', warehouseId: 1, warehouseName: 'WH' }

      const item = { assignmentId: 100, prescription: {} } as any
      store.checkoutItems = [item, { assignmentId: 101 } as any]
      store.currentItem = item

      const result = await store.completeCheckout()

      expect(result).toBe(true)
      expect(store.checkoutItems).toHaveLength(1)
      expect(store.checkoutItems[0].assignmentId).toBe(101)
      expect(store.currentItem).toBeNull()
      expect(store.receivedAmount).toBe(0)
      expect(checkoutApi.setCheckoutStatus).toHaveBeenCalledWith(100, 'PAID', 11)
    })

    it('returns false without current item', async () => {
      const store = useCheckoutStore()
      const result = await store.completeCheckout()
      expect(result).toBe(false)
    })

    it('returns false without auth context', async () => {
      const store = useCheckoutStore()
      store.currentItem = { assignmentId: 100 } as any

      const result = await store.completeCheckout()
      expect(result).toBe(false)
    })
  })

  describe('clearCurrent', () => {
    it('clears current item and amount', () => {
      const store = useCheckoutStore()
      store.currentItem = { assignmentId: 1 } as any
      store.receivedAmount = 100

      store.clearCurrent()

      expect(store.currentItem).toBeNull()
      expect(store.receivedAmount).toBe(0)
    })
  })
})
