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

    try {
      await setDispenseStatus(assignmentId, 'DISPENSED', authStore.context!.organizationId)

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
