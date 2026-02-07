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
  type BatchTransferLine,
  listStock,
  listWarehouses,
  searchProducts,
  createTransfer,
  createBatchTransfer,
  listPurchaseOrders,
  getOrderLines,
  createReceipt,
  getOrderVendorId,
} from '@/api/inventory'

/** Check if auth context has a valid field (zero is valid!) */
function hasContextField(context: any, field: string): boolean {
  return context != null && context[field] !== null && context[field] !== undefined
}

export const useInventoryStore = defineStore('inventory', () => {
  const authStore = useAuthStore()

  // Stock
  const stockItems = ref<StockItem[]>([])
  const warehouses = ref<Warehouse[]>([])
  const isLoadingStock = ref(false)

  // Transfer
  const transferProducts = ref<{ id: number; name: string; value: string }[]>([])
  const isTransferring = ref(false)

  // Batch transfer
  const batchLines = ref<BatchTransferLine[]>([])

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
    if (!hasContextField(authStore.context, 'organizationId')) {
      error.value = '請先登入以設定組織環境'
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

  // Batch transfer actions
  function addBatchLine(product: { id: number; name: string }, quantity: number): void {
    const existing = batchLines.value.find(l => l.productId === product.id)
    if (existing) {
      existing.quantity += quantity
    } else {
      batchLines.value.push({ productId: product.id, productName: product.name, quantity })
    }
  }

  function removeBatchLine(index: number): void {
    batchLines.value.splice(index, 1)
  }

  function clearBatchLines(): void {
    batchLines.value = []
  }

  async function executeBatchTransfer(
    fromLocatorId: number,
    toLocatorId: number
  ): Promise<boolean> {
    if (!hasContextField(authStore.context, 'organizationId')) {
      error.value = '請先登入以設定組織環境'
      return false
    }

    if (batchLines.value.length === 0) {
      error.value = '請至少加入一項藥品'
      return false
    }

    isTransferring.value = true
    error.value = null
    try {
      await createBatchTransfer({
        fromLocatorId,
        toLocatorId,
        lines: batchLines.value,
        orgId: authStore.context!.organizationId,
      })
      batchLines.value = []
      await loadStock()
      return true
    } catch (e: any) {
      error.value = e.message || 'Batch transfer failed'
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
    if (!hasContextField(authStore.context, 'organizationId')) {
      error.value = '請先登入以設定組織環境'
      return false
    }
    if (!hasContextField(authStore.context, 'warehouseId')) {
      error.value = '請先登入以設定倉庫環境'
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
    batchLines,
    purchaseOrders, orderLines, isLoadingOrders, isReceiving,
    error,
    loadStock, loadWarehouses,
    searchForTransfer, executeTransfer,
    addBatchLine, removeBatchLine, clearBatchLines, executeBatchTransfer,
    loadPurchaseOrders, loadOrderLines, executeReceive,
  }
})
