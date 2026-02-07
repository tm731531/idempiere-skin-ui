<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listProducts, createProduct, updateProduct, listProductCategories, listUoms, createProductCategory, type Product, type UomOption } from '@/api/product'
import { listProductConversions, createConversion, deleteConversion, type UomConversion } from '@/api/uomConversion'
import { useAuthStore } from '@/stores/auth'
import BarcodeInput from '@/components/BarcodeInput.vue'

const authStore = useAuthStore()

const products = ref<Product[]>([])
const categories = ref<{ id: number; name: string; isDefault: boolean }[]>([])
const uoms = ref<UomOption[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const searchKeyword = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

// Create form
const showCreateForm = ref(false)
const newName = ref('')
const newValue = ref('')
const newCategoryId = ref<number>(0)
const newUomId = ref<number>(0)
const isCreating = ref(false)

// Inline category create
const showNewCategory = ref(false)
const newCategoryName = ref('')
const isCreatingCategory = ref(false)

// Edit
const editingId = ref<number | null>(null)
const editName = ref('')
const editValue = ref('')
const editUpc = ref('')
const editCategoryId = ref<number>(0)
const editUomId = ref<number>(0)
const isSaving = ref(false)

// UOM Conversions (in edit mode)
const editConversions = ref<UomConversion[]>([])
const showAddConversion = ref(false)
const convFromUomId = ref<number>(0)
const convToUomId = ref<number>(0)
const convRate = ref<number>(1)
const isAddingConversion = ref(false)

onMounted(async () => {
  await loadProducts()
  const [cats, uomList] = await Promise.all([listProductCategories(), listUoms()])
  categories.value = cats
  uoms.value = uomList
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
      uomId: newUomId.value || undefined,
    })
    newName.value = ''
    newValue.value = ''
    newCategoryId.value = 0
    newUomId.value = 0
    showCreateForm.value = false
    await loadProducts(searchKeyword.value || undefined)
  } catch (e: any) {
    error.value = e.message || '建立產品失敗'
  } finally {
    isCreating.value = false
  }
}

async function handleCreateCategory() {
  if (!newCategoryName.value.trim()) return
  if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
    error.value = '請先登入以設定組織環境'
    return
  }
  isCreatingCategory.value = true
  error.value = null
  try {
    const cat = await createProductCategory(newCategoryName.value.trim(), authStore.context!.organizationId)
    categories.value.push({ id: cat.id, name: cat.name, isDefault: false })
    newCategoryId.value = cat.id
    newCategoryName.value = ''
    showNewCategory.value = false
  } catch (e: any) {
    error.value = e.message || '建立分類失敗'
  } finally {
    isCreatingCategory.value = false
  }
}

async function startEdit(product: Product) {
  editingId.value = product.id
  editName.value = product.name
  editValue.value = product.value
  editUpc.value = product.upc
  editCategoryId.value = product.categoryId || 0
  editUomId.value = product.uomId || 0
  showAddConversion.value = false
  editConversions.value = []

  // Load conversions in background
  try {
    editConversions.value = await listProductConversions(product.id)
  } catch {
    // Non-critical
  }
}

function cancelEdit() {
  editingId.value = null
}

async function handleAddConversion() {
  if (!editingId.value || !convFromUomId.value || !convToUomId.value || convRate.value <= 0) return
  if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
    error.value = '請先登入以設定組織環境'
    return
  }

  isAddingConversion.value = true
  error.value = null
  try {
    await createConversion({
      productId: editingId.value,
      fromUomId: convFromUomId.value,
      toUomId: convToUomId.value,
      multiplyRate: convRate.value,
      orgId: authStore.context!.organizationId,
    })
    // Re-fetch to get full UOM names
    editConversions.value = await listProductConversions(editingId.value)
    showAddConversion.value = false
    convFromUomId.value = 0
    convToUomId.value = 0
    convRate.value = 1
  } catch (e: any) {
    error.value = e.message || '建立單位轉換失敗'
  } finally {
    isAddingConversion.value = false
  }
}

async function handleDeleteConversion(convId: number) {
  if (!editingId.value) return
  try {
    await deleteConversion(convId)
    editConversions.value = editConversions.value.filter(c => c.id !== convId)
  } catch (e: any) {
    error.value = e.message || '刪除單位轉換失敗'
  }
}

async function saveEdit() {
  if (editingId.value === null) return
  isSaving.value = true
  error.value = null
  try {
    const data: Record<string, any> = {
      Name: editName.value.trim(),
      Value: editValue.value.trim(),
      UPC: editUpc.value.trim(),
    }
    if (editCategoryId.value) data['M_Product_Category_ID'] = editCategoryId.value
    if (editUomId.value) data['C_UOM_ID'] = editUomId.value
    await updateProduct(editingId.value, data)
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
          <label>單位</label>
          <select v-model="newUomId" class="input">
            <option :value="0">預設 (顆)</option>
            <option v-for="uom in uoms" :key="uom.id" :value="uom.id">{{ uom.label }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>分類</label>
          <div class="category-row">
            <select v-model="newCategoryId" class="input category-select">
              <option :value="0">預設</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
            <button class="btn btn-sm" @click="showNewCategory = !showNewCategory" type="button">
              {{ showNewCategory ? '取消' : '+ 新增' }}
            </button>
          </div>
          <div v-if="showNewCategory" class="new-category-row">
            <input v-model="newCategoryName" type="text" class="input" placeholder="新分類名稱" />
            <button class="btn btn-sm btn-primary" @click="handleCreateCategory" :disabled="isCreatingCategory || !newCategoryName.trim()">
              {{ isCreatingCategory ? '...' : '建立' }}
            </button>
          </div>
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
            <label>代碼</label>
            <input v-model="editValue" type="text" class="input" />
          </div>
          <div class="form-row">
            <label>條碼 (UPC)</label>
            <input v-model="editUpc" type="text" class="input" />
          </div>
          <div class="form-row">
            <label>單位</label>
            <select v-model="editUomId" class="input">
              <option :value="0">不變更</option>
              <option v-for="uom in uoms" :key="uom.id" :value="uom.id">{{ uom.label }}</option>
            </select>
          </div>
          <div class="form-row">
            <label>分類</label>
            <select v-model="editCategoryId" class="input">
              <option :value="0">不變更</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
          </div>
          <!-- UOM Conversions -->
          <div class="conversion-manage">
            <div class="conversion-header">
              <label>單位轉換</label>
              <button class="btn btn-sm" @click="showAddConversion = !showAddConversion" type="button">
                {{ showAddConversion ? '取消' : '+ 新增' }}
              </button>
            </div>
            <div v-if="editConversions.length > 0" class="conversion-list">
              <div v-for="conv in editConversions" :key="conv.id" class="conversion-item">
                <span>{{ conv.fromUomName }} → {{ conv.toUomName }} (1:{{ conv.divideRate }})</span>
                <button class="btn btn-text btn-remove" @click="handleDeleteConversion(conv.id)">✕</button>
              </div>
            </div>
            <div v-else class="conversion-empty">尚無單位轉換設定</div>
            <div v-if="showAddConversion" class="add-conversion-form">
              <div class="conv-row">
                <select v-model="convFromUomId" class="input conv-select">
                  <option :value="0" disabled>來源單位</option>
                  <option v-for="uom in uoms" :key="uom.id" :value="uom.id">{{ uom.label }}</option>
                </select>
                <span class="conv-arrow">→</span>
                <select v-model="convToUomId" class="input conv-select">
                  <option :value="0" disabled>目標單位</option>
                  <option v-for="uom in uoms" :key="uom.id" :value="uom.id">{{ uom.label }}</option>
                </select>
              </div>
              <div class="conv-row">
                <label>倍率 (1來源 = ?目標)</label>
                <input v-model.number="convRate" type="number" min="0.01" step="0.01" class="input conv-input" />
              </div>
              <button
                class="btn btn-sm btn-primary"
                @click="handleAddConversion"
                :disabled="isAddingConversion || !convFromUomId || !convToUomId || convRate <= 0"
              >
                {{ isAddingConversion ? '...' : '建立轉換' }}
              </button>
            </div>
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
              <span v-if="product.uomName" class="product-uom">{{ product.uomName }}</span>
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
.category-row { display: flex; gap: 0.5rem; align-items: center; }
.category-select { flex: 1; }
.new-category-row { display: flex; gap: 0.5rem; margin-top: 0.5rem; align-items: center; }
.new-category-row .input { flex: 1; }

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
.product-uom { background: #e3f2fd; color: #1565c0; padding: 0 0.375rem; border-radius: 0.25rem; }
.product-category { background: #f0f0f0; padding: 0 0.375rem; border-radius: 0.25rem; }
.edit-hint { font-size: 0.75rem; color: #999; }

.edit-form { padding: 0.75rem 1rem; background: #fafafa; }

.conversion-manage { margin-bottom: 0.75rem; border-top: 1px solid #e0e0e0; padding-top: 0.75rem; }
.conversion-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.conversion-header label { font-size: 0.875rem; color: #666; font-weight: 500; }
.conversion-list { margin-bottom: 0.5rem; }
.conversion-item { display: flex; justify-content: space-between; align-items: center; padding: 0.375rem 0; font-size: 0.875rem; }
.conversion-empty { font-size: 0.75rem; color: #999; margin-bottom: 0.5rem; }
.add-conversion-form { background: #f5f5f5; padding: 0.75rem; border-radius: 0.375rem; margin-top: 0.5rem; }
.conv-row { display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.5rem; }
.conv-row label { font-size: 0.75rem; color: #666; white-space: nowrap; }
.conv-select { flex: 1; min-height: 36px; padding: 0.375rem; font-size: 0.875rem; }
.conv-arrow { font-size: 0.875rem; color: #999; }
.conv-input { width: 5rem; min-height: 36px; padding: 0.375rem; font-size: 0.875rem; text-align: center; }
.btn-remove { color: #f44336 !important; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
