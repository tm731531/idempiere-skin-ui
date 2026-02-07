/**
 * Inventory Store
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import {
  type StockItem,
  type Warehouse,
  type ReceiptLine,
  listStock,
  listWarehouses,
  searchProducts,
  createTransfer,
  listPurchaseOrders,
  getOrderLines,
  createReceipt,
  getOrderVendorId,
} from '@/api/inventory'

export const useInventoryStore = defineStore('inventory', () => {
  const authStore = useAuthStore()

  // Stock
  const stockItems = ref<StockItem[]>([])
  const warehouses = ref<Warehouse[]>([])
  const isLoadingStock = ref(false)

  // Transfer
  const transferProducts = ref<{ id: number; name: string; value: string }[]>([])
  const isTransferring = ref(false)

  // Receive
  const purchaseOrders = ref<any[]>([])
  const orderLines = ref<any[]>([])
  const isLoadingOrders = ref(false)
  const isReceiving = ref(false)

  const error = ref<string | null>(null)

  // Stock actions
  async function loadStock(keyword?: string): Promise<void> {
    isLoadingStock.value = true
    error.value = null
    try {
      stockItems.value = await listStock(keyword)
    } catch (e: any) {
      error.value = e.message || 'Failed to load stock'
    } finally {
      isLoadingStock.value = false
    }
  }

  async function loadWarehouses(): Promise<void> {
    try {
      warehouses.value = await listWarehouses()
    } catch (e: any) {
      error.value = e.message || 'Failed to load warehouses'
    }
  }

  // Transfer actions
  async function searchForTransfer(keyword: string): Promise<void> {
    try {
      transferProducts.value = await searchProducts(keyword)
    } catch (e: any) {
      error.value = e.message || 'Search failed'
    }
  }

  async function executeTransfer(
    productId: number,
    fromLocatorId: number,
    toLocatorId: number,
    quantity: number
  ): Promise<boolean> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = 'Organization not set'
      return false
    }

    isTransferring.value = true
    error.value = null
    try {
      await createTransfer({
        productId,
        fromLocatorId,
        toLocatorId,
        quantity,
        orgId: authStore.context!.organizationId,
      })
      // Reload stock
      await loadStock()
      return true
    } catch (e: any) {
      error.value = e.message || 'Transfer failed'
      return false
    } finally {
      isTransferring.value = false
    }
  }

  // Receive actions
  async function loadPurchaseOrders(): Promise<void> {
    isLoadingOrders.value = true
    error.value = null
    try {
      purchaseOrders.value = await listPurchaseOrders()
    } catch (e: any) {
      error.value = e.message || 'Failed to load orders'
    } finally {
      isLoadingOrders.value = false
    }
  }

  async function loadOrderLines(orderId: number): Promise<void> {
    try {
      orderLines.value = await getOrderLines(orderId)
    } catch (e: any) {
      error.value = e.message || 'Failed to load order lines'
    }
  }

  async function executeReceive(orderId: number, lines: ReceiptLine[]): Promise<boolean> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = 'Organization not set'
      return false
    }
    if (!authStore.context?.warehouseId && authStore.context?.warehouseId !== 0) {
      error.value = 'Warehouse not set'
      return false
    }

    isReceiving.value = true
    error.value = null
    try {
      const vendorId = await getOrderVendorId(orderId)
      await createReceipt(
        orderId,
        vendorId,
        lines,
        authStore.context!.organizationId,
        authStore.context!.warehouseId,
      )
      // Reload order lines to show updated qty
      await loadOrderLines(orderId)
      return true
    } catch (e: any) {
      error.value = e.message || 'Receipt failed'
      return false
    } finally {
      isReceiving.value = false
    }
  }

  return {
    stockItems, warehouses, isLoadingStock,
    transferProducts, isTransferring,
    purchaseOrders, orderLines, isLoadingOrders, isReceiving,
    error,
    loadStock, loadWarehouses,
    searchForTransfer, executeTransfer,
    loadPurchaseOrders, loadOrderLines, executeReceive,
  }
})
