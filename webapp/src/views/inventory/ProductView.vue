<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listProducts, createProduct, updateProduct, listProductCategories, type Product } from '@/api/product'
import { useAuthStore } from '@/stores/auth'
import BarcodeInput from '@/components/BarcodeInput.vue'

const authStore = useAuthStore()

const products = ref<Product[]>([])
const categories = ref<{ id: number; name: string; isDefault: boolean }[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const searchKeyword = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

// Create form
const showCreateForm = ref(false)
const newName = ref('')
const newValue = ref('')
const newCategoryId = ref<number>(0)
const isCreating = ref(false)

// Edit
const editingId = ref<number | null>(null)
const editName = ref('')
const editUpc = ref('')
const isSaving = ref(false)

onMounted(async () => {
  await loadProducts()
  categories.value = await listProductCategories()
})

async function loadProducts(keyword?: string) {
  isLoading.value = true
  error.value = null
  try {
    products.value = await listProducts(keyword)
  } catch (e: any) {
    error.value = e.message || '載入產品失敗'
  } finally {
    isLoading.value = false
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadProducts(searchKeyword.value || undefined)
  }, 300)
}

function onBarcodeScan(barcode: string) {
  searchKeyword.value = barcode
  loadProducts(barcode)
}

async function handleCreate() {
  if (!newName.value.trim() || !newValue.value.trim()) return
  if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
    error.value = '請先登入以設定組織環境'
    return
  }

  isCreating.value = true
  error.value = null
  try {
    await createProduct({
      name: newName.value.trim(),
      value: newValue.value.trim(),
      orgId: authStore.context!.organizationId,
      productCategoryId: newCategoryId.value || undefined,
    })
    newName.value = ''
    newValue.value = ''
    newCategoryId.value = 0
    showCreateForm.value = false
    await loadProducts(searchKeyword.value || undefined)
  } catch (e: any) {
    error.value = e.message || '建立產品失敗'
  } finally {
    isCreating.value = false
  }
}

function startEdit(product: Product) {
  editingId.value = product.id
  editName.value = product.name
  editUpc.value = product.upc
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit() {
  if (editingId.value === null) return
  isSaving.value = true
  error.value = null
  try {
    await updateProduct(editingId.value, {
      Name: editName.value.trim(),
      UPC: editUpc.value.trim(),
    })
    editingId.value = null
    await loadProducts(searchKeyword.value || undefined)
  } catch (e: any) {
    error.value = e.message || '更新產品失敗'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="product-view">
    <!-- Search -->
    <div class="search-bar">
      <BarcodeInput
        placeholder="搜尋產品名稱或掃描條碼..."
        @scan="onBarcodeScan"
      />
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜尋產品名稱或代碼..."
        class="input"
        @input="onSearchInput"
      />
    </div>

    <!-- Create button / form -->
    <div class="create-section">
      <button v-if="!showCreateForm" class="btn btn-primary" @click="showCreateForm = true">
        + 建立產品
      </button>
      <div v-else class="create-form">
        <h3>建立新產品</h3>
        <div class="form-row">
          <label>名稱</label>
          <input v-model="newName" type="text" class="input" placeholder="產品名稱" />
        </div>
        <div class="form-row">
          <label>代碼/條碼</label>
          <input v-model="newValue" type="text" class="input" placeholder="產品代碼或條碼" />
        </div>
        <div class="form-row">
          <label>分類</label>
          <select v-model="newCategoryId" class="input">
            <option :value="0">預設</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-actions">
          <button class="btn" @click="showCreateForm = false">取消</button>
          <button class="btn btn-primary" @click="handleCreate" :disabled="isCreating || !newName.trim() || !newValue.trim()">
            {{ isCreating ? '建立中...' : '建立' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Product list -->
    <div v-if="isLoading" class="loading">載入中...</div>
    <div v-else-if="products.length === 0" class="empty">
      {{ searchKeyword ? '找不到符合的產品' : '目前沒有產品資料' }}
    </div>
    <div v-else class="product-list">
      <div v-for="product in products" :key="product.id" class="product-card">
        <!-- Edit mode -->
        <div v-if="editingId === product.id" class="edit-form">
          <div class="form-row">
            <label>名稱</label>
            <input v-model="editName" type="text" class="input" />
          </div>
          <div class="form-row">
            <label>條碼 (UPC)</label>
            <input v-model="editUpc" type="text" class="input" />
          </div>
          <div class="form-actions">
            <button class="btn btn-sm" @click="cancelEdit">取消</button>
            <button class="btn btn-sm btn-primary" @click="saveEdit" :disabled="isSaving">
              {{ isSaving ? '儲存中...' : '儲存' }}
            </button>
          </div>
        </div>
        <!-- Display mode -->
        <div v-else class="product-display" @click="startEdit(product)">
          <div class="product-info">
            <div class="product-name">{{ product.name }}</div>
            <div class="product-detail">
              <span>{{ product.value }}</span>
              <span v-if="product.upc" class="product-upc">UPC: {{ product.upc }}</span>
              <span v-if="product.categoryName" class="product-category">{{ product.categoryName }}</span>
            </div>
          </div>
          <div class="edit-hint">編輯</div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>
  </div>
</template>

<style scoped>
.product-view { max-width: 600px; margin: 0 auto; }
.search-bar { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #795548; }

.create-section { margin-bottom: 1rem; }
.create-form { background: white; padding: 1rem; border-radius: 0.5rem; }
.create-form h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }
.form-row { margin-bottom: 0.75rem; }
.form-row label { display: block; font-size: 0.875rem; color: #666; margin-bottom: 0.25rem; }
.form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; min-height: auto; }
.btn-primary { background: #795548; color: white; border-color: #795548; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.product-list { display: flex; flex-direction: column; gap: 0.5rem; }
.product-card { background: white; border-radius: 0.5rem; overflow: hidden; }

.product-display { display: flex; align-items: center; padding: 0.75rem 1rem; cursor: pointer; }
.product-display:active { background: #fafafa; }
.product-info { flex: 1; }
.product-name { font-weight: 600; }
.product-detail { font-size: 0.75rem; color: #666; margin-top: 0.25rem; display: flex; gap: 0.75rem; flex-wrap: wrap; }
.product-upc { color: #999; }
.product-category { background: #f0f0f0; padding: 0 0.375rem; border-radius: 0.25rem; }
.edit-hint { font-size: 0.75rem; color: #999; }

.edit-form { padding: 0.75rem 1rem; background: #fafafa; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
