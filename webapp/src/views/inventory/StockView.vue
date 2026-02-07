<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useInventoryStore } from '@/stores/inventory'

const store = useInventoryStore()
const searchKeyword = ref('')
const showZeroStock = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  await store.loadStock()
})

function onToggleZeroStock() {
  store.showZeroStock = showZeroStock.value
  store.loadStock(searchKeyword.value || undefined)
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    await store.loadStock(searchKeyword.value || undefined)
  }, 300)
}

// Group stock by product → warehouse
interface WarehouseGroup {
  warehouseName: string
  qty: number
}

interface ProductGroup {
  productName: string
  warehouses: WarehouseGroup[]
  total: number
}

const groupedStock = computed(() => {
  const products: Record<number, { productName: string; warehouseMap: Record<string, number>; total: number }> = {}

  for (const item of store.stockItems) {
    if (!products[item.productId]) {
      products[item.productId] = { productName: item.productName, warehouseMap: {}, total: 0 }
    }
    const p = products[item.productId]!
    const whName = item.warehouseName || item.locatorName || '未知倉庫'
    p.warehouseMap[whName] = (p.warehouseMap[whName] || 0) + item.qtyOnHand
    p.total += item.qtyOnHand
  }

  const result: ProductGroup[] = []
  for (const p of Object.values(products)) {
    result.push({
      productName: p.productName,
      warehouses: Object.entries(p.warehouseMap).map(([name, qty]) => ({ warehouseName: name, qty })),
      total: p.total,
    })
  }

  return result.sort((a, b) => a.productName.localeCompare(b.productName))
})
</script>

<template>
  <div class="stock-view">
    <div class="search-bar">
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜尋藥品名稱..."
        class="input"
        @input="onSearchInput"
      />
    </div>
    <div class="toggle-bar">
      <label class="toggle-label">
        <input type="checkbox" v-model="showZeroStock" @change="onToggleZeroStock" />
        <span>顯示零庫存產品</span>
      </label>
    </div>

    <div v-if="store.isLoadingStock" class="loading">載入中...</div>
    <div v-else-if="groupedStock.length === 0" class="empty">
      {{ searchKeyword ? '找不到符合的藥品' : '目前沒有庫存資料' }}
    </div>
    <div v-else class="stock-list">
      <div v-for="(group, i) in groupedStock" :key="i" class="stock-card">
        <div class="stock-header">
          <div class="product-name">{{ group.productName }}</div>
          <div class="total-qty">{{ group.total }}</div>
        </div>
        <div class="warehouse-list">
          <div v-for="wh in group.warehouses" :key="wh.warehouseName" class="warehouse-row">
            <span class="wh-name">{{ wh.warehouseName }}</span>
            <span class="wh-qty">{{ wh.qty }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.stock-view { max-width: 600px; margin: 0 auto; }
.search-bar { margin-bottom: 0.5rem; }
.toggle-bar { margin-bottom: 1rem; }
.toggle-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: #666; cursor: pointer; }
.toggle-label input[type="checkbox"] { width: 18px; height: 18px; accent-color: #795548; }
.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #795548; }

.stock-list { display: flex; flex-direction: column; gap: 0.5rem; }
.stock-card { background: white; border-radius: 0.5rem; overflow: hidden; }
.stock-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #f0f0f0; }
.product-name { font-weight: 600; }
.total-qty { font-size: 1.25rem; font-weight: 700; color: #795548; }
.warehouse-list { padding: 0.5rem 1rem; }
.warehouse-row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.875rem; }
.wh-name { color: #666; }
.wh-qty { color: #333; font-weight: 500; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
