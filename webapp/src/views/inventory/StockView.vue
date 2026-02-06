<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useInventoryStore } from '@/stores/inventory'

const store = useInventoryStore()
const searchKeyword = ref('')

onMounted(async () => {
  await store.loadStock()
})

async function onSearch() {
  await store.loadStock(searchKeyword.value || undefined)
}

// Group stock by product
const groupedStock = computed(() => {
  const groups: Record<number, { productName: string; locations: { name: string; qty: number }[]; total: number }> = {}

  for (const item of store.stockItems) {
    if (!groups[item.productId]) {
      groups[item.productId] = { productName: item.productName, locations: [], total: 0 }
    }
    groups[item.productId].locations.push({ name: item.locatorName, qty: item.qtyOnHand })
    groups[item.productId].total += item.qtyOnHand
  }

  return Object.values(groups).sort((a, b) => a.productName.localeCompare(b.productName))
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
        @input="onSearch"
      />
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
        <div class="location-list">
          <div v-for="loc in group.locations" :key="loc.name" class="location-row">
            <span class="loc-name">{{ loc.name }}</span>
            <span class="loc-qty">{{ loc.qty }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.stock-view { max-width: 600px; margin: 0 auto; }
.search-bar { margin-bottom: 1rem; }
.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }
.input:focus { outline: none; border-color: #795548; }

.stock-list { display: flex; flex-direction: column; gap: 0.5rem; }
.stock-card { background: white; border-radius: 0.5rem; overflow: hidden; }
.stock-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #f0f0f0; }
.product-name { font-weight: 600; }
.total-qty { font-size: 1.25rem; font-weight: 700; color: #795548; }
.location-list { padding: 0.5rem 1rem; }
.location-row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.875rem; }
.loc-name { color: #666; }
.loc-qty { color: #333; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
