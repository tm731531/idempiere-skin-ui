<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import { useAuthStore } from '@/stores/auth'
import { findProductByBarcode } from '@/api/product'
import ProductCreateModal from '@/components/ProductCreateModal.vue'
import BarcodeInput from '@/components/BarcodeInput.vue'

const authStore = useAuthStore()

const store = useInventoryStore()

// Product create modal
const showCreateProduct = ref(false)
const prefillBarcode = ref('')

// From/To locator selections (persist across adding items)
const fromLocatorId = ref<number | null>(null)
const toLocatorId = ref<number | null>(null)

// Search modal state
const showSearch = ref(false)
const searchKeyword = ref('')
const isSearching = ref(false)
const hasSearched = ref(false)

// Add-item quantity (set in search modal before confirming)
const addQuantity = ref(1)

let searchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  await store.loadWarehouses()
})

function allLocators() {
  const locs: { id: number; label: string }[] = []
  for (const wh of store.warehouses) {
    for (const loc of wh.locators) {
      locs.push({ id: loc.id, label: `${wh.name} - ${loc.name}` })
    }
  }
  return locs
}

function openSearch() {
  searchKeyword.value = ''
  store.transferProducts = []
  hasSearched.value = false
  addQuantity.value = 1
  showSearch.value = true
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  if (searchKeyword.value.length < 1) {
    store.transferProducts = []
    hasSearched.value = false
    return
  }
  isSearching.value = true
  hasSearched.value = false
  searchTimer = setTimeout(async () => {
    await store.searchForTransfer(searchKeyword.value)
    isSearching.value = false
    hasSearched.value = true
  }, 300)
}

function addProduct(product: { id: number; name: string }) {
  const qty = addQuantity.value > 0 ? addQuantity.value : 1
  store.addBatchLine(product, qty)
  // Reset for next item
  addQuantity.value = 1
  searchKeyword.value = ''
  store.transferProducts = []
  hasSearched.value = false
  showSearch.value = false
}

async function onBarcodeScan(barcode: string) {
  // Try to find product by barcode
  const product = await findProductByBarcode(barcode)
  if (product) {
    store.addBatchLine(product, 1)
    showSearch.value = false
  } else {
    // Not found — offer to create, pre-filling barcode as search keyword
    searchKeyword.value = barcode
    await store.searchForTransfer(barcode)
    hasSearched.value = true
  }
}

function openCreateProduct() {
  prefillBarcode.value = searchKeyword.value
  showCreateProduct.value = true
}

function onProductCreated(product: { id: number; name: string; value: string }) {
  showCreateProduct.value = false
  store.addBatchLine(product, 1)
  showSearch.value = false
}

async function doTransfer() {
  if (!fromLocatorId.value || !toLocatorId.value) {
    alert('請選擇來源和目標倉位')
    return
  }
  if (fromLocatorId.value === toLocatorId.value) {
    alert('來源和目標不能相同')
    return
  }
  if (store.batchLines.length === 0) {
    alert('請至少加入一項藥品')
    return
  }

  const success = await store.executeBatchTransfer(
    fromLocatorId.value,
    toLocatorId.value
  )

  if (success) {
    alert('調撥完成！')
  }
}
</script>

<template>
  <div class="transfer-view">
    <div v-if="!authStore.context" class="error-banner">請先重新登入以設定組織環境</div>

    <!-- From / To (always visible at top) -->
    <div class="section">
      <h3>調撥設定</h3>
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
    </div>

    <!-- Batch lines -->
    <div class="section">
      <div class="section-header">
        <h3>藥品清單 ({{ store.batchLines.length }})</h3>
        <button v-if="store.batchLines.length > 0" class="btn btn-text btn-small" @click="store.clearBatchLines()">
          清空
        </button>
      </div>

      <div v-if="store.batchLines.length === 0" class="empty-hint">
        尚未加入藥品，請點擊下方按鈕新增
      </div>

      <div v-else class="batch-list">
        <div v-for="(line, idx) in store.batchLines" :key="line.productId" class="batch-item">
          <div class="batch-info">
            <div class="batch-name">{{ line.productName }}</div>
            <div class="batch-qty">x {{ line.quantity }}</div>
          </div>
          <button class="btn btn-text" @click="store.removeBatchLine(idx)">✕</button>
        </div>
      </div>

      <button class="btn btn-add" @click="openSearch">
        ＋ 新增藥品
      </button>
    </div>

    <!-- Submit -->
    <div class="action-bar">
      <button
        class="btn btn-success btn-large"
        @click="doTransfer"
        :disabled="store.isTransferring || !fromLocatorId || !toLocatorId || store.batchLines.length === 0"
      >
        {{ store.isTransferring ? '處理中...' : `確認調撥 (${store.batchLines.length} 項)` }}
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
          <!-- Barcode scan input (keyboard + camera) -->
          <div class="barcode-row">
            <BarcodeInput
              placeholder="掃描條碼或輸入藥品名稱..."
              :autofocus="true"
              @scan="onBarcodeScan"
            />
          </div>
          <div class="barcode-row">
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜尋藥品名稱..."
              class="input"
              @input="onSearchInput"
            />
          </div>
          <div v-if="isSearching" class="search-status">搜尋中...</div>
          <div v-else-if="hasSearched && store.transferProducts.length === 0" class="search-status">
            找不到符合的藥品
            <button class="btn btn-link" @click="openCreateProduct">快速建立產品</button>
          </div>
          <div class="result-list">
            <div v-for="p in store.transferProducts" :key="p.id" class="result-item" @click="addProduct(p)">
              <div class="result-info">
                <div class="result-name">{{ p.name }}</div>
                <div class="result-code">{{ p.value }}</div>
              </div>
              <div class="result-action">
                <input
                  v-model.number="addQuantity"
                  type="number"
                  min="1"
                  class="qty-inline"
                  @click.stop
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Product create modal -->
    <ProductCreateModal
      v-if="showCreateProduct"
      :prefill-value="prefillBarcode"
      @created="onProductCreated"
      @close="showCreateProduct = false"
    />

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.transfer-view { max-width: 600px; margin: 0 auto; }
.section { background: white; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.section-header h3 { margin: 0; }

.form-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.form-row label { min-width: 3rem; font-weight: 500; }
.select { flex: 1; padding: 0.75rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }

.empty-hint { text-align: center; padding: 1.5rem; color: #999; font-size: 0.875rem; }

.batch-list { margin-bottom: 0.75rem; }
.batch-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #f5f5f5; border-radius: 0.5rem; margin-bottom: 0.5rem; }
.batch-info { flex: 1; }
.batch-name { font-weight: 500; }
.batch-qty { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }

.btn-add { width: 100%; padding: 0.75rem; border: 2px dashed #667eea; border-radius: 0.5rem; color: #667eea; background: transparent; font-size: 1rem; font-weight: 500; cursor: pointer; min-height: 48px; }
.btn-add:active { background: #f0f0ff; }

.action-bar { margin-top: 0.5rem; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; padding: 0.25rem 0.5rem; }
.btn-small { font-size: 0.875rem; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-link { background: none; border: none; color: #667eea; text-decoration: underline; font-size: 0.875rem; cursor: pointer; padding: 0.25rem; min-height: auto; display: block; margin: 0.5rem auto 0; }

.barcode-row { margin-bottom: 0.5rem; }

.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; box-sizing: border-box; }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: flex-end; }
.modal { background: white; width: 100%; max-height: 80vh; border-radius: 1rem 1rem 0 0; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; }
.modal-body { padding: 1rem; overflow-y: auto; }

.search-status { text-align: center; padding: 1rem; color: #999; font-size: 0.875rem; }
.result-list { margin-top: 0.75rem; }
.result-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; cursor: pointer; border-radius: 0.5rem; }
.result-item:active { background: #f5f5f5; }
.result-info { flex: 1; }
.result-name { font-weight: 500; }
.result-code { font-size: 0.75rem; color: #999; }
.result-action { margin-left: 0.75rem; }
.qty-inline { width: 4rem; padding: 0.5rem; border: 1px solid #ddd; border-radius: 0.25rem; text-align: center; font-size: 1rem; }

.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
.error-banner { background: #fff3e0; color: #e65100; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 0.75rem; text-align: center; font-size: 0.875rem; }
</style>
