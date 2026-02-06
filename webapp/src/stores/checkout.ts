/**
 * Checkout Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import {
  type CheckoutItem,
  listCheckoutItems,
  setCheckoutStatus,
} from '@/api/checkout'

export const useCheckoutStore = defineStore('checkout', () => {
  const authStore = useAuthStore()

  const checkoutItems = ref<CheckoutItem[]>([])
  const currentItem = ref<CheckoutItem | null>(null)
  const receivedAmount = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const pendingCount = computed(() => checkoutItems.value.length)

  const copayment = computed(() => 50) // Fixed copayment for MVP

  const changeAmount = computed(() => {
    const change = receivedAmount.value - copayment.value
    return change > 0 ? change : 0
  })

  async function loadItems(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      checkoutItems.value = await listCheckoutItems()
    } catch (e: any) {
      error.value = e.message || 'Load failed'
    } finally {
      isLoading.value = false
    }
  }

  function selectItem(item: CheckoutItem): void {
    currentItem.value = item
    receivedAmount.value = 0
  }

  async function completeCheckout(): Promise<boolean> {
    if (!currentItem.value) return false
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) return false

    try {
      await setCheckoutStatus(
        currentItem.value.assignmentId,
        'PAID',
        authStore.context!.organizationId
      )

      // Remove from list
      checkoutItems.value = checkoutItems.value.filter(
        i => i.assignmentId !== currentItem.value!.assignmentId
      )
      currentItem.value = null
      receivedAmount.value = 0
      return true
    } catch (e: any) {
      error.value = e.message || 'Checkout failed'
      return false
    }
  }

  function clearCurrent(): void {
    currentItem.value = null
    receivedAmount.value = 0
  }

  return {
    checkoutItems,
    currentItem,
    receivedAmount,
    isLoading,
    error,
    pendingCount,
    copayment,
    changeAmount,
    loadItems,
    selectItem,
    completeCheckout,
    clearCurrent,
  }
})
