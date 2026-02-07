<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { createProduct, listProductCategories } from '@/api/product'

const props = defineProps<{
  prefillValue?: string
}>()

const emit = defineEmits<{
  created: [product: { id: number; name: string; value: string }]
  close: []
}>()

const authStore = useAuthStore()

const name = ref('')
const value = ref(props.prefillValue || '')
const categoryId = ref<number>(0)
const categories = ref<{ id: number; name: string; isDefault: boolean }[]>([])
const isSubmitting = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    categories.value = await listProductCategories()
    const defaultCat = categories.value.find(c => c.isDefault) || categories.value[0]
    if (defaultCat) categoryId.value = defaultCat.id
  } catch (e: any) {
    error.value = '載入產品類別失敗'
  }
})

async function onSubmit() {
  if (!name.value.trim()) {
    error.value = '請輸入產品名稱'
    return
  }
  if (!value.value.trim()) {
    error.value = '請輸入產品編號'
    return
  }
  if (!authStore.context) {
    error.value = '未登入'
    return
  }

  isSubmitting.value = true
  error.value = ''

  try {
    const product = await createProduct({
      name: name.value.trim(),
      value: value.value.trim(),
      orgId: authStore.context.organizationId,
      productCategoryId: categoryId.value || undefined,
    })
    emit('created', product)
  } catch (e: any) {
    error.value = e.response?.data?.detail || e.message || '建立失敗'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>快速建立產品</h3>
        <button class="btn-close" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>產品名稱 *</label>
          <input
            v-model="name"
            type="text"
            class="input"
            placeholder="輸入產品名稱"
            autofocus
          />
        </div>
        <div class="form-group">
          <label>編號 / 條碼 *</label>
          <input
            v-model="value"
            type="text"
            class="input"
            placeholder="輸入產品編號或條碼"
          />
        </div>
        <div class="form-group">
          <label>產品類別</label>
          <select v-model="categoryId" class="select">
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
              {{ cat.name }}{{ cat.isDefault ? ' (預設)' : '' }}
            </option>
          </select>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <button
          class="btn btn-primary btn-large"
          :disabled="isSubmitting || !name.trim() || !value.trim()"
          @click="onSubmit"
        >
          {{ isSubmitting ? '建立中...' : '建立產品' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1001; display: flex; align-items: flex-end; }
.modal { background: white; width: 100%; max-height: 80vh; border-radius: 1rem 1rem 0 0; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; }
.modal-body { padding: 1rem; overflow-y: auto; }

.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; color: #333; }

.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #667eea; }
.select { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; background: white; }

.btn-close { background: transparent; border: none; color: #666; font-size: 1.25rem; cursor: pointer; padding: 0.25rem 0.5rem; }
.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-primary { background: #667eea; color: white; border-color: #667eea; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.error-message { background: #ffebee; color: #c62828; padding: 0.75rem; border-radius: 0.25rem; margin-bottom: 1rem; font-size: 0.875rem; }
</style>
