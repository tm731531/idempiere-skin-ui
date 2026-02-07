/**
 * Inventory Store Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useInventoryStore } from '../inventory'
import * as inventoryApi from '@/api/inventory'

vi.mock('@/api/inventory', () => ({
  listStock: vi.fn(),
  listWarehouses: vi.fn(),
  searchProducts: vi.fn(),
  createTransfer: vi.fn(),
  listPurchaseOrders: vi.fn(),
  getOrderLines: vi.fn(),
  createReceipt: vi.fn(),
  getOrderVendorId: vi.fn(),
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

describe('Inventory Store', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const store = useInventoryStore()
      expect(store.stockItems).toEqual([])
      expect(store.warehouses).toEqual([])
      expect(store.isLoadingStock).toBe(false)
      expect(store.transferProducts).toEqual([])
      expect(store.purchaseOrders).toEqual([])
    })
  })

  describe('loadStock', () => {
    it('loads stock items', async () => {
      const items = [
        { productId: 100, productName: 'Aspirin', productCode: '', locatorId: 200, locatorName: 'WH1', qtyOnHand: 50 },
      ]
      vi.mocked(inventoryApi.listStock).mockResolvedValue(items)

      const store = useInventoryStore()
      await store.loadStock()

      expect(store.stockItems).toEqual(items)
      expect(store.isLoadingStock).toBe(false)
    })

    it('passes keyword to API', async () => {
      vi.mocked(inventoryApi.listStock).mockResolvedValue([])

      const store = useInventoryStore()
      await store.loadStock('aspirin')

      expect(inventoryApi.listStock).toHaveBeenCalledWith('aspirin')
    })

    it('sets error on failure', async () => {
      vi.mocked(inventoryApi.listStock).mockRejectedValue(new Error('Network'))

      const store = useInventoryStore()
      await store.loadStock()

      expect(store.error).toBe('Network')
    })
  })

  describe('loadWarehouses', () => {
    it('loads warehouses', async () => {
      const whs = [{ id: 10, name: 'Main', locators: [{ id: 20, name: 'L1' }] }]
      vi.mocked(inventoryApi.listWarehouses).mockResolvedValue(whs)

      const store = useInventoryStore()
      await store.loadWarehouses()

      expect(store.warehouses).toEqual(whs)
    })

    it('sets error on failure', async () => {
      vi.mocked(inventoryApi.listWarehouses).mockRejectedValue(new Error('Failed'))

      const store = useInventoryStore()
      await store.loadWarehouses()

      expect(store.error).toBe('Failed')
    })
  })

  describe('searchForTransfer', () => {
    it('searches products for transfer', async () => {
      const products = [{ id: 100, name: 'Aspirin', value: 'MED001' }]
      vi.mocked(inventoryApi.searchProducts).mockResolvedValue(products)

      const store = useInventoryStore()
      await store.searchForTransfer('asp')

      expect(store.transferProducts).toEqual(products)
    })
  })

  describe('executeTransfer', () => {
    it('creates transfer and reloads stock', async () => {
      vi.mocked(inventoryApi.createTransfer).mockResolvedValue(500)
      vi.mocked(inventoryApi.listStock).mockResolvedValue([])

      const store = useInventoryStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      const result = await store.executeTransfer(100, 200, 201, 10)

      expect(result).toBe(true)
      expect(inventoryApi.createTransfer).toHaveBeenCalledWith({
        productId: 100,
        fromLocatorId: 200,
        toLocatorId: 201,
        quantity: 10,
        orgId: 11,
      })
      // Stock reloaded
      expect(inventoryApi.listStock).toHaveBeenCalled()
      expect(store.isTransferring).toBe(false)
    })

    it('returns false without org context', async () => {
      const store = useInventoryStore()
      const result = await store.executeTransfer(100, 200, 201, 10)
      expect(result).toBe(false)
      expect(store.error).toBe('Organization not set')
    })

    it('handles orgId=0 correctly (falsy zero)', async () => {
      vi.mocked(inventoryApi.createTransfer).mockResolvedValue(500)
      vi.mocked(inventoryApi.listStock).mockResolvedValue([])

      const store = useInventoryStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 0, warehouseId: 1 }

      const result = await store.executeTransfer(100, 200, 201, 10)
      expect(result).toBe(true) // orgId=0 is valid
    })

    it('sets error on failure', async () => {
      vi.mocked(inventoryApi.createTransfer).mockRejectedValue(new Error('Transfer failed'))

      const store = useInventoryStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      const result = await store.executeTransfer(100, 200, 201, 10)

      expect(result).toBe(false)
      expect(store.error).toBe('Transfer failed')
    })
  })

  describe('loadPurchaseOrders', () => {
    it('loads purchase orders', async () => {
      const orders = [{ id: 300, documentNo: 'PO-001', dateOrdered: '2025-01-01', vendorName: 'Vendor A' }]
      vi.mocked(inventoryApi.listPurchaseOrders).mockResolvedValue(orders)

      const store = useInventoryStore()
      await store.loadPurchaseOrders()

      expect(store.purchaseOrders).toEqual(orders)
      expect(store.isLoadingOrders).toBe(false)
    })
  })

  describe('loadOrderLines', () => {
    it('loads order lines', async () => {
      const lines = [{ id: 400, productId: 100, productName: 'Aspirin', qtyOrdered: 100, qtyDelivered: 50 }]
      vi.mocked(inventoryApi.getOrderLines).mockResolvedValue(lines)

      const store = useInventoryStore()
      await store.loadOrderLines(300)

      expect(store.orderLines).toEqual(lines)
      expect(inventoryApi.getOrderLines).toHaveBeenCalledWith(300)
    })
  })

  describe('executeReceive', () => {
    it('creates receipt and reloads order lines', async () => {
      vi.mocked(inventoryApi.getOrderVendorId).mockResolvedValue(1000)
      vi.mocked(inventoryApi.createReceipt).mockResolvedValue(600)
      vi.mocked(inventoryApi.getOrderLines).mockResolvedValue([])

      const store = useInventoryStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 2000 }

      // Set up order lines with qtyReceived
      const lines = [
        { orderLineId: 400, productId: 100, productName: 'Aspirin', qtyOrdered: 100, qtyDelivered: 50, qtyReceived: 50 },
      ]
      store.selectedOrderId = 300

      const result = await store.executeReceive(300, lines)

      expect(result).toBe(true)
      expect(inventoryApi.getOrderVendorId).toHaveBeenCalledWith(300)
      expect(inventoryApi.createReceipt).toHaveBeenCalledWith(300, 1000, lines, 11, 2000)
      expect(inventoryApi.getOrderLines).toHaveBeenCalledWith(300) // reloaded
      expect(store.isReceiving).toBe(false)
    })

    it('returns false without org context', async () => {
      const store = useInventoryStore()
      const result = await store.executeReceive(300, [])
      expect(result).toBe(false)
      expect(store.error).toBe('Organization not set')
    })

    it('returns false without warehouse context', async () => {
      const store = useInventoryStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: null }

      const result = await store.executeReceive(300, [])
      expect(result).toBe(false)
      expect(store.error).toBe('Warehouse not set')
    })

    it('handles warehouseId=0 correctly', async () => {
      vi.mocked(inventoryApi.getOrderVendorId).mockResolvedValue(1000)
      vi.mocked(inventoryApi.createReceipt).mockResolvedValue(600)
      vi.mocked(inventoryApi.getOrderLines).mockResolvedValue([])

      const store = useInventoryStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 0 }

      const lines = [
        { orderLineId: 400, productId: 100, productName: 'Aspirin', qtyOrdered: 100, qtyDelivered: 50, qtyReceived: 50 },
      ]

      const result = await store.executeReceive(300, lines)
      expect(result).toBe(true) // warehouseId=0 is valid
    })
  })
})
