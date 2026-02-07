/**
 * Purchase Store
 *
 * Purchase order state management
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import {
  type Vendor,
  type PurchaseOrderLineInput,
  listVendors,
  createPurchaseOrder,
} from '@/api/purchase'
import { searchProducts } from '@/api/inventory'

export const usePurchaseStore = defineStore('purchase', () => {
  const authStore = useAuthStore()

  // State
  const vendors = ref<Vendor[]>([])
  const selectedVendor = ref<Vendor | null>(null)
  const orderLines = ref<PurchaseOrderLineInput[]>([])
  const isLoadingVendors = ref(false)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)
  const lastOrderNo = ref<string | null>(null)

  // Product search
  const productSearchResults = ref<{ id: number; name: string; value: string }[]>([])
  const isSearchingProducts = ref(false)

  // Actions

  async function loadVendors(keyword?: string): Promise<void> {
    isLoadingVendors.value = true
    error.value = null
    try {
      vendors.value = await listVendors(keyword)
    } catch (e: any) {
      error.value = e.message || '載入供應商失敗'
    } finally {
      isLoadingVendors.value = false
    }
  }

  function selectVendor(vendor: Vendor): void {
    selectedVendor.value = vendor
  }

  async function searchProductsForPO(keyword: string): Promise<void> {
    if (!keyword || keyword.length < 1) {
      productSearchResults.value = []
      return
    }
    isSearchingProducts.value = true
    try {
      productSearchResults.value = await searchProducts(keyword)
    } catch (e: any) {
      error.value = e.message || '搜尋產品失敗'
      productSearchResults.value = []
    } finally {
      isSearchingProducts.value = false
    }
  }

  function addLine(product: { id: number; name: string }, quantity: number, price: number): void {
    orderLines.value.push({
      productId: product.id,
      productName: product.name,
      quantity,
      price,
    })
  }

  function removeLine(index: number): void {
    orderLines.value.splice(index, 1)
  }

  function updateLine(index: number, updates: Partial<PurchaseOrderLineInput>): void {
    const line = orderLines.value[index]
    if (line) Object.assign(line, updates)
  }

  async function submitOrder(): Promise<boolean> {
    if (!selectedVendor.value) {
      error.value = '請選擇供應商'
      return false
    }
    if (orderLines.value.length === 0) {
      error.value = '請至少加入一項產品'
      return false
    }
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = '請先登入以設定組織環境'
      return false
    }
    if (!authStore.context?.warehouseId && authStore.context?.warehouseId !== 0) {
      error.value = '請先登入以設定倉庫環境'
      return false
    }

    isSubmitting.value = true
    error.value = null

    try {
      const result = await createPurchaseOrder({
        vendorId: selectedVendor.value.id,
        lines: orderLines.value,
        orgId: authStore.context!.organizationId,
        warehouseId: authStore.context!.warehouseId,
        username: authStore.user?.name || '',
      })
      lastOrderNo.value = result.documentNo
      return true
    } catch (e: any) {
      error.value = e.message || '建立採購單失敗'
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  function reset(): void {
    selectedVendor.value = null
    orderLines.value = []
    error.value = null
    lastOrderNo.value = null
    productSearchResults.value = []
  }

  return {
    vendors,
    selectedVendor,
    orderLines,
    isLoadingVendors,
    isSubmitting,
    error,
    lastOrderNo,
    productSearchResults,
    isSearchingProducts,
    loadVendors,
    selectVendor,
    searchProductsForPO,
    addLine,
    removeLine,
    updateLine,
    submitOrder,
    reset,
  }
})
