<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePurchaseStore } from '@/stores/purchase'
import { findProductByBarcode } from '@/api/product'
import { listProductConversions, type UomConversion } from '@/api/uomConversion'
import BarcodeInput from '@/components/BarcodeInput.vue'

const store = usePurchaseStore()

// Steps: vendor → products → review → done
const step = ref<'vendor' | 'products' | 'review' | 'done'>('vendor')
const vendorSearch = ref('')
const productSearch = ref('')
const addQty = ref(1)
const addPrice = ref(0)
const priceMode = ref<'unit' | 'total'>('unit')
const selectedProduct = ref<{ id: number; name: string; value: string } | null>(null)
const conversions = ref<UomConversion[]>([])
const selectedConversion = ref<UomConversion | null>(null)
const isLoadingConversions = ref(false)
let vendorSearchTimer: ReturnType<typeof setTimeout> | null = null
let productSearchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  store.reset()
  store.loadVendors()
})

// Vendor search
function onVendorSearch() {
  if (vendorSearchTimer) clearTimeout(vendorSearchTimer)
  vendorSearchTimer = setTimeout(() => {
    store.loadVendors(vendorSearch.value || undefined)
  }, 300)
}

function pickVendor(vendor: { id: number; name: string }) {
  store.selectVendor(vendor)
  step.value = 'products'
}

// Product search
function onProductSearch() {
  if (productSearchTimer) clearTimeout(productSearchTimer)
  productSearchTimer = setTimeout(() => {
    store.searchProductsForPO(productSearch.value)
  }, 300)
}

async function pickProduct(product: { id: number; name: string; value: string }) {
  selectedProduct.value = product
  addQty.value = 1
  addPrice.value = 0
  selectedConversion.value = null
  conversions.value = []

  // Load UOM conversions for this product
  isLoadingConversions.value = true
  try {
    conversions.value = await listProductConversions(product.id)
  } catch {
    // Non-critical — just won't show conversion options
  } finally {
    isLoadingConversions.value = false
  }
}

const convertedQty = computed(() => {
  if (!selectedConversion.value || addQty.value <= 0) return null
  return Math.round(addQty.value * selectedConversion.value.divideRate)
})

function confirmAddProduct() {
  if (!selectedProduct.value || addQty.value <= 0) return
  const qty = convertedQty.value || addQty.value
  const unitPrice = priceMode.value === 'total' && qty > 0
    ? Math.round((addPrice.value / qty) * 100) / 100
    : addPrice.value
  store.addLine(selectedProduct.value, qty, unitPrice)
  selectedProduct.value = null
  selectedConversion.value = null
  conversions.value = []
  productSearch.value = ''
  priceMode.value = 'unit'
  store.productSearchResults = []
}

function cancelAddProduct() {
  selectedProduct.value = null
  selectedConversion.value = null
  conversions.value = []
}

async function onBarcodeScan(barcode: string) {
  const product = await findProductByBarcode(barcode)
  if (product) {
    pickProduct(product)
  } else {
    // Not found — fall back to text search
    productSearch.value = barcode
    await store.searchProductsForPO(barcode)
  }
}

// Total
const orderTotal = computed(() => {
  return store.orderLines.reduce((sum, line) => sum + line.quantity * line.price, 0)
})

// Submit
async function handleSubmit() {
  const success = await store.submitOrder()
  if (success) {
    step.value = 'done'
  }
}

function startNew() {
  store.reset()
  step.value = 'vendor'
  vendorSearch.value = ''
  productSearch.value = ''
  store.loadVendors()
}
</script>

<template>
  <div class="purchase-view">
    <!-- Step indicator -->
    <div class="steps">
      <div class="step" :class="{ active: step === 'vendor', done: step !== 'vendor' }">1. 供應商</div>
      <div class="step" :class="{ active: step === 'products', done: step === 'review' || step === 'done' }">2. 商品</div>
      <div class="step" :class="{ active: step === 'review', done: step === 'done' }">3. 確認</div>
    </div>

    <!-- Step 1: Vendor selection -->
    <div v-if="step === 'vendor'" class="step-content">
      <div class="search-bar">
        <input
          v-model="vendorSearch"
          type="text"
          placeholder="搜尋供應商名稱..."
          class="input"
          @input="onVendorSearch"
        />
      </div>

      <div v-if="store.isLoadingVendors" class="loading">載入中...</div>
      <div v-else-if="store.vendors.length === 0" class="empty">找不到供應商</div>
      <div v-else class="vendor-list">
        <div
          v-for="vendor in store.vendors"
          :key="vendor.id"
          class="vendor-item"
          @click="pickVendor(vendor)"
        >
          <div class="vendor-name">{{ vendor.name }}</div>
        </div>
      </div>
    </div>

    <!-- Step 2: Add products -->
    <div v-if="step === 'products'" class="step-content">
      <div class="selected-vendor">
        供應商: <strong>{{ store.selectedVendor?.name }}</strong>
        <button class="btn btn-text btn-sm" @click="step = 'vendor'">更換</button>
      </div>

      <!-- Product search -->
      <div v-if="!selectedProduct" class="search-bar">
        <BarcodeInput
          placeholder="掃描條碼..."
          @scan="onBarcodeScan"
        />
        <input
          v-model="productSearch"
          type="text"
          placeholder="搜尋產品名稱或代碼..."
          class="input"
          @input="onProductSearch"
        />
      </div>

      <!-- Search results -->
      <div v-if="!selectedProduct && store.isSearchingProducts" class="loading-sm">搜尋中...</div>
      <div v-else-if="!selectedProduct && productSearch && store.productSearchResults.length === 0" class="empty-sm">
        找不到「{{ productSearch }}」
      </div>
      <div v-else-if="!selectedProduct && store.productSearchResults.length > 0" class="product-results">
        <div
          v-for="p in store.productSearchResults"
          :key="p.id"
          class="product-result-item"
          @click="pickProduct(p)"
        >
          <div class="result-name">{{ p.name }}</div>
          <div class="result-code">{{ p.value }}</div>
        </div>
      </div>

      <!-- Add product form -->
      <div v-if="selectedProduct" class="add-product-form">
        <div class="add-header">{{ selectedProduct.name }}</div>

        <!-- UOM conversion selector -->
        <div v-if="isLoadingConversions" class="conversion-loading">載入單位轉換...</div>
        <div v-else-if="conversions.length > 0" class="conversion-section">
          <label>單位轉換</label>
          <div class="conversion-options">
            <div
              class="conversion-option"
              :class="{ selected: !selectedConversion }"
              @click="selectedConversion = null"
            >
              基本單位
            </div>
            <div
              v-for="conv in conversions"
              :key="conv.id"
              class="conversion-option"
              :class="{ selected: selectedConversion?.id === conv.id }"
              @click="selectedConversion = conv"
            >
              {{ conv.fromUomName }} → {{ conv.toUomName }} (1:{{ conv.divideRate }})
            </div>
          </div>
        </div>

        <div class="add-row">
          <label>{{ selectedConversion ? selectedConversion.fromUomName : '數量' }}</label>
          <input v-model.number="addQty" type="number" min="1" class="input input-sm" />
        </div>
        <div v-if="convertedQty" class="conversion-result">
          = {{ convertedQty }} {{ selectedConversion?.toUomName }}
        </div>
        <div class="price-mode-toggle">
          <button
            class="toggle-btn"
            :class="{ active: priceMode === 'unit' }"
            @click="priceMode = 'unit'; addPrice = 0"
          >單價</button>
          <button
            class="toggle-btn"
            :class="{ active: priceMode === 'total' }"
            @click="priceMode = 'total'; addPrice = 0"
          >總價</button>
        </div>
        <div class="add-row">
          <label>{{ priceMode === 'unit' ? '單價' : '總價' }}</label>
          <input v-model.number="addPrice" type="number" min="0" step="0.01" class="input input-sm" />
        </div>
        <div v-if="priceMode === 'total' && addPrice > 0 && (convertedQty || addQty) > 0" class="price-calc">
          單價 ≈ ${{ (addPrice / (convertedQty || addQty)).toFixed(2) }}
        </div>
        <div class="add-actions">
          <button class="btn btn-sm" @click="cancelAddProduct">取消</button>
          <button class="btn btn-sm btn-primary" @click="confirmAddProduct" :disabled="addQty <= 0">加入</button>
        </div>
      </div>

      <!-- Current order lines -->
      <div v-if="store.orderLines.length > 0" class="order-lines">
        <h3>已加入的商品 ({{ store.orderLines.length }})</h3>
        <div v-for="(line, i) in store.orderLines" :key="i" class="order-line">
          <div class="line-info">
            <div class="line-name">{{ line.productName }}</div>
            <div class="line-detail">{{ line.quantity }} x ${{ line.price }} = ${{ (line.quantity * line.price).toFixed(2) }}</div>
          </div>
          <button class="btn btn-text btn-remove" @click="store.removeLine(i)">✕</button>
        </div>
      </div>

      <!-- Next button -->
      <div class="action-bar">
        <button class="btn" @click="step = 'vendor'">上一步</button>
        <button
          class="btn btn-primary btn-large"
          @click="step = 'review'"
          :disabled="store.orderLines.length === 0"
        >
          下一步：確認
        </button>
      </div>
    </div>

    <!-- Step 3: Review -->
    <div v-if="step === 'review'" class="step-content">
      <div class="review-section">
        <h3>採購單摘要</h3>
        <div class="review-row">
          <span>供應商</span>
          <strong>{{ store.selectedVendor?.name }}</strong>
        </div>
        <div class="review-row">
          <span>品項數</span>
          <strong>{{ store.orderLines.length }}</strong>
        </div>
        <div class="review-row">
          <span>總金額</span>
          <strong>${{ orderTotal.toFixed(2) }}</strong>
        </div>
      </div>

      <div class="review-lines">
        <div v-for="(line, i) in store.orderLines" :key="i" class="review-line">
          <span>{{ line.productName }}</span>
          <span>{{ line.quantity }} x ${{ line.price }}</span>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn" @click="step = 'products'">上一步</button>
        <button
          class="btn btn-success btn-large"
          @click="handleSubmit"
          :disabled="store.isSubmitting"
        >
          {{ store.isSubmitting ? '送出中...' : '送出採購單' }}
        </button>
      </div>
    </div>

    <!-- Step 4: Done -->
    <div v-if="step === 'done'" class="step-content done-content">
      <div class="done-icon">✓</div>
      <h2>採購單已建立</h2>
      <p v-if="store.lastOrderNo">單號: {{ store.lastOrderNo }}</p>
      <button class="btn btn-primary" @click="startNew">建立新採購單</button>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.purchase-view { max-width: 600px; margin: 0 auto; }

/* Steps indicator */
.steps { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.step {
  flex: 1;
  text-align: center;
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  background: #e0e0e0;
  color: #999;
}
.step.active { background: #795548; color: white; font-weight: 600; }
.step.done { background: #4CAF50; color: white; }

.step-content { }

/* Vendor */
.search-bar { margin-bottom: 1rem; }
.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #795548; }
.input-sm { width: auto; min-height: auto; padding: 0.5rem; }

.vendor-list { display: flex; flex-direction: column; gap: 0.25rem; }
.vendor-item { padding: 0.75rem 1rem; background: white; border-radius: 0.5rem; cursor: pointer; }
.vendor-item:active { background: #f5f5f5; }
.vendor-name { font-weight: 500; }

.selected-vendor {
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Product results */
.product-results { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; }
.product-result-item { padding: 0.75rem; background: white; border-radius: 0.5rem; cursor: pointer; }
.product-result-item:active { background: #f5f5f5; }
.result-name { font-weight: 500; }
.result-code { font-size: 0.75rem; color: #999; }

/* Add product form */
.add-product-form { background: white; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; }
.add-header { font-weight: 600; margin-bottom: 0.75rem; }
.add-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.add-row label { min-width: 3rem; font-size: 0.875rem; color: #666; }
.add-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; }
.conversion-loading { font-size: 0.75rem; color: #999; margin-bottom: 0.5rem; }
.conversion-section { margin-bottom: 0.75rem; }
.conversion-section label { display: block; font-size: 0.875rem; color: #666; margin-bottom: 0.375rem; }
.conversion-options { display: flex; gap: 0.375rem; flex-wrap: wrap; }
.conversion-option { padding: 0.375rem 0.75rem; border: 1px solid #ddd; border-radius: 1rem; font-size: 0.75rem; cursor: pointer; background: white; }
.conversion-option.selected { background: #795548; color: white; border-color: #795548; }
.conversion-result { font-size: 0.875rem; color: #4CAF50; font-weight: 600; margin-bottom: 0.5rem; padding-left: 3.5rem; }
.price-mode-toggle { display: flex; gap: 0; margin-bottom: 0.5rem; border: 1px solid #ddd; border-radius: 0.5rem; overflow: hidden; }
.toggle-btn { flex: 1; padding: 0.5rem; border: none; background: white; font-size: 0.875rem; cursor: pointer; }
.toggle-btn.active { background: #795548; color: white; }
.price-calc { font-size: 0.75rem; color: #666; margin-bottom: 0.5rem; padding-left: 3.5rem; }

/* Order lines */
.order-lines { margin: 1rem 0; }
.order-lines h3 { font-size: 0.875rem; color: #666; margin-bottom: 0.5rem; }
.order-line {
  display: flex;
  align-items: center;
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 0.25rem;
}
.line-info { flex: 1; }
.line-name { font-weight: 500; }
.line-detail { font-size: 0.75rem; color: #666; }

/* Buttons */
.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; min-height: auto; }
.btn-primary { background: #795548; color: white; border-color: #795548; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; padding: 0.25rem; min-height: auto; }
.btn-large { flex: 1; font-weight: 600; }
.btn-remove { color: #f44336 !important; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.action-bar { display: flex; gap: 0.75rem; margin-top: 1rem; }

/* Review */
.review-section { background: white; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; }
.review-section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }
.review-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f0f0f0; }
.review-row:last-child { border-bottom: none; }
.review-lines { background: white; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; }
.review-line { display: flex; justify-content: space-between; padding: 0.375rem 0; font-size: 0.875rem; }

/* Done */
.done-content { text-align: center; padding: 3rem 1rem; }
.done-icon { font-size: 4rem; color: #4CAF50; margin-bottom: 1rem; }
.done-content h2 { color: #333; margin-bottom: 0.5rem; }
.done-content p { color: #666; margin-bottom: 1.5rem; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.loading-sm, .empty-sm { text-align: center; padding: 1rem; color: #999; font-size: 0.875rem; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
