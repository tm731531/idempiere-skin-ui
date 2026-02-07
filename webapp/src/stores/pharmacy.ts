/**
 * Pharmacy Store
 *
 * Dispensing state management
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import {
  type DispenseItem,
  type StockInfo,
  listPendingDispense,
  setDispenseStatus,
  getProductStock,
  createDispenseMovement,
} from '@/api/pharmacy'

export const usePharmacyStore = defineStore('pharmacy', () => {
  const authStore = useAuthStore()

  // State
  const dispenseQueue = ref<DispenseItem[]>([])
  const currentItem = ref<DispenseItem | null>(null)
  const currentStock = ref<Record<number, StockInfo[]>>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const pendingCount = computed(() =>
    dispenseQueue.value.filter(i => i.status === 'PENDING').length
  )

  const dispensingItem = computed(() =>
    dispenseQueue.value.find(i => i.status === 'DISPENSING')
  )

  // Actions
  async function loadQueue(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      dispenseQueue.value = await listPendingDispense()
    } catch (e: any) {
      error.value = e.message || 'Failed to load dispense queue'
    } finally {
      isLoading.value = false
    }
  }

  async function startDispensing(item: DispenseItem): Promise<void> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) return

    try {
      await setDispenseStatus(item.assignmentId, 'DISPENSING', authStore.context!.organizationId)
      item.status = 'DISPENSING'
      currentItem.value = item

      // Load stock for all products in prescription
      for (const line of item.prescription.lines) {
        const stock = await getProductStock(line.productId)
        currentStock.value[line.productId] = stock
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to start dispensing'
    }
  }

  async function completeDispensing(assignmentId: number): Promise<void> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) return

    const orgId = authStore.context!.organizationId
    const warehouseId = authStore.context!.warehouseId

    try {
      await setDispenseStatus(assignmentId, 'DISPENSED', orgId)

      // Create stock deduction movement if we have prescription lines
      const item = dispenseQueue.value.find(i => i.assignmentId === assignmentId)
      if (item && item.prescription?.lines && item.prescription.lines.length > 0 && warehouseId) {
        const { apiClient } = await import('@/api/client')
        // Look up default locator for current warehouse (source)
        const fromLocRes = await apiClient.get('/api/v1/models/M_Locator', {
          params: {
            '$filter': `M_Warehouse_ID eq ${warehouseId} and IsDefault eq true and IsActive eq true`,
            '$top': 1,
          },
        })
        const fromLocatorId = fromLocRes.data.records?.[0]?.id

        // Look up Counter warehouse locator (dispensing destination)
        const counterWhRes = await apiClient.get('/api/v1/models/M_Warehouse', {
          params: {
            '$filter': "Name eq 'Counter' and IsActive eq true",
            '$top': 1,
          },
        })
        let toLocatorId = 0
        const counterWhId = counterWhRes.data.records?.[0]?.id
        if (counterWhId) {
          const toLocRes = await apiClient.get('/api/v1/models/M_Locator', {
            params: {
              '$filter': `M_Warehouse_ID eq ${counterWhId} and IsActive eq true`,
              '$top': 1,
            },
          })
          toLocatorId = toLocRes.data.records?.[0]?.id || 0
        }

        if (fromLocatorId && toLocatorId && fromLocatorId !== toLocatorId) {
          const result = await createDispenseMovement(
            item!.prescription.lines,
            fromLocatorId,
            toLocatorId,
            orgId,
            `Clinic dispense for assignment ${assignmentId}`,
          )
          if (!result.completed && result.error) {
            error.value = `配藥完成但扣庫存失敗: ${result.error}`
          }
        }
      }

      // Remove from queue
      dispenseQueue.value = dispenseQueue.value.filter(i => i.assignmentId !== assignmentId)
      currentItem.value = null
      currentStock.value = {}
    } catch (e: any) {
      error.value = e.message || 'Failed to complete dispensing'
    }
  }

  function clearCurrent(): void {
    currentItem.value = null
    currentStock.value = {}
  }

  return {
    dispenseQueue,
    currentItem,
    currentStock,
    isLoading,
    error,
    pendingCount,
    dispensingItem,
    loadQueue,
    startDispensing,
    completeDispensing,
    clearCurrent,
  }
})
