<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useInventoryStore } from '@/stores/inventory'

const store = useInventoryStore()

const searchKeyword = ref('')
const selectedProductId = ref<number | null>(null)
const selectedProductName = ref('')
const fromLocatorId = ref<number | null>(null)
const toLocatorId = ref<number | null>(null)
const quantity = ref(0)
const showSearch = ref(false)

onMounted(async () => {
  await store.loadWarehouses()
})

// Flatten all locators for dropdowns
function allLocators() {
  const locs: { id: number; label: string }[] = []
  for (const wh of store.warehouses) {
    for (const loc of wh.locators) {
      locs.push({ id: loc.id, label: `${wh.name} - ${loc.name}` })
    }
  }
  return locs
}

async function onSearch() {
  if (searchKeyword.value.length < 1) return
  await store.searchForTransfer(searchKeyword.value)
}

function selectProduct(product: { id: number; name: string }) {
  selectedProductId.value = product.id
  selectedProductName.value = product.name
  showSearch.value = false
  searchKeyword.value = ''
}

async function doTransfer() {
  if (!selectedProductId.value || !fromLocatorId.value || !toLocatorId.value || quantity.value <= 0) {
    alert('請填寫完整資料')
    return
  }

  if (fromLocatorId.value === toLocatorId.value) {
    alert('來源和目標不能相同')
    return
  }

  const success = await store.executeTransfer(
    selectedProductId.value,
    fromLocatorId.value,
    toLocatorId.value,
    quantity.value
  )

  if (success) {
    alert('調撥完成！')
    selectedProductId.value = null
    selectedProductName.value = ''
    fromLocatorId.value = null
    toLocatorId.value = null
    quantity.value = 0
  }
}
</script>

<template>
  <div class="transfer-view">
    <!-- Product selection -->
    <div class="section">
      <h3>藥品</h3>
      <div v-if="selectedProductId" class="selected-product">
        <span>{{ selectedProductName }}</span>
        <button class="btn btn-text" @click="selectedProductId = null; selectedProductName = ''">✕</button>
      </div>
      <button v-else class="btn btn-select" @click="showSearch = true">
        選擇藥品
      </button>
    </div>

    <!-- From / To -->
    <div class="section" v-if="selectedProductId">
      <div class="form-row">
        <label>從：</label>
        <select v-model="fromLocatorId" class="select">
          <option :value="null" disabled>選擇來源</option>
          <option v-for="loc in allLocators()" :key="loc.id" :value="loc.id">{{ loc.label }}</option>
        </select>
      </div>
      <div class="form-row">
        <label>到：</label>
        <select v-model="toLocatorId" class="select">
          <option :value="null" disabled>選擇目標</option>
          <option v-for="loc in allLocators()" :key="loc.id" :value="loc.id">{{ loc.label }}</option>
        </select>
      </div>
      <div class="form-row">
        <label>數量：</label>
        <input v-model.number="quantity" type="number" min="1" class="input qty-input" placeholder="0" />
      </div>
    </div>

    <!-- Submit -->
    <div v-if="selectedProductId" class="action-bar">
      <button
        class="btn btn-success btn-large"
        @click="doTransfer"
        :disabled="store.isTransferring || !fromLocatorId || !toLocatorId || quantity <= 0"
      >
        {{ store.isTransferring ? '處理中...' : '確認調撥' }}
      </button>
    </div>

    <!-- Search modal -->
    <div v-if="showSearch" class="modal-overlay" @click.self="showSearch = false">
      <div class="modal">
        <div class="modal-header">
          <h3>搜尋藥品</h3>
          <button class="btn btn-text" @click="showSearch = false">✕</button>
        </div>
        <div class="modal-body">
          <input v-model="searchKeyword" type="text" placeholder="輸入藥品名稱..." class="input" @input="onSearch" autofocus />
          <div class="result-list">
            <div v-for="p in store.transferProducts" :key="p.id" class="result-item" @click="selectProduct(p)">
              <div class="result-name">{{ p.name }}</div>
              <div class="result-code">{{ p.value }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.transfer-view { max-width: 600px; margin: 0 auto; }
.section { background: white; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }

.selected-product { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #efebe9; border-radius: 0.5rem; font-weight: 600; }

.btn-select { width: 100%; padding: 0.75rem; border: 2px dashed #ddd; border-radius: 0.5rem; color: #666; background: transparent; }

.form-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.form-row label { min-width: 3rem; font-weight: 500; }
.select { flex: 1; padding: 0.75rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }
.qty-input { width: 8rem; text-align: center; font-size: 1.25rem; font-weight: 700; }

.action-bar { margin-top: 1rem; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: flex-end; }
.modal { background: white; width: 100%; max-height: 80vh; border-radius: 1rem 1rem 0 0; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; }
.modal-body { padding: 1rem; overflow-y: auto; }

.result-list { margin-top: 0.75rem; }
.result-item { padding: 0.75rem; cursor: pointer; border-radius: 0.5rem; }
.result-item:active { background: #f5f5f5; }
.result-name { font-weight: 500; }
.result-code { font-size: 0.75rem; color: #999; }

.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
