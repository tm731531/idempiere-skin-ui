<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listResources, createResource, deleteResource, type DoctorResource } from '@/api/resource'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()

const authStore = useAuthStore()

const doctors = ref<DoctorResource[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const successMsg = ref<string | null>(null)

// Create form
const showCreateForm = ref(false)
const newName = ref('')
const isCreating = ref(false)

onMounted(async () => {
  isLoading.value = true
  error.value = null
  try {
    doctors.value = await listResources()
  } catch (e: any) {
    error.value = e.message || '載入失敗'
  } finally {
    isLoading.value = false
  }
})

async function handleCreate() {
  if (!newName.value.trim()) return
  if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
    error.value = '請先登入以設定組織環境'
    return
  }

  isCreating.value = true
  error.value = null
  successMsg.value = null
  try {
    const doc = await createResource({
      name: newName.value.trim(),
      orgId: authStore.context!.organizationId,
    })
    doctors.value = await listResources()
    newName.value = ''
    showCreateForm.value = false
    successMsg.value = `醫師「${doc.name}」已建立`
    setTimeout(() => { successMsg.value = null }, 3000)
  } catch (e: any) {
    error.value = e.message || '建立醫師失敗'
  } finally {
    isCreating.value = false
  }
}

async function handleDelete(doctor: DoctorResource) {
  if (!confirm(`確定要停用「${doctor.name}」嗎？`)) return
  error.value = null
  try {
    await deleteResource(doctor.id)
    doctors.value = doctors.value.filter(d => d.id !== doctor.id)
    successMsg.value = `醫師「${doctor.name}」已停用`
    setTimeout(() => { successMsg.value = null }, 3000)
  } catch (e: any) {
    error.value = e.message || '停用失敗'
  }
}
</script>

<template>
  <div class="doctor-manage">
    <div class="page-header">
      <button class="btn-back" @click="router.push('/')">← 返回</button>
      <h2>醫師管理</h2>
    </div>
    <p class="hint">建立醫師資源，讓掛號時可以選擇醫師</p>

    <!-- Create button / form -->
    <div class="create-section">
      <button v-if="!showCreateForm" class="btn btn-primary" @click="showCreateForm = true">
        + 新增醫師
      </button>
      <div v-else class="create-form">
        <h3>新增醫師</h3>
        <div class="form-row">
          <label>醫師名稱</label>
          <input v-model="newName" type="text" class="input" placeholder="例如: 王醫師" />
        </div>
        <div class="form-actions">
          <button class="btn" @click="showCreateForm = false">取消</button>
          <button class="btn btn-primary" @click="handleCreate" :disabled="isCreating || !newName.trim()">
            {{ isCreating ? '建立中...' : '建立' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Doctor list -->
    <div v-if="isLoading" class="loading">載入中...</div>
    <div v-else-if="doctors.length === 0" class="empty">
      目前沒有醫師資源，請先新增
    </div>
    <div v-else class="doctor-list">
      <div v-for="doc in doctors" :key="doc.id" class="doctor-card">
        <div class="doctor-info">
          <div class="doctor-name">{{ doc.name }}</div>
          <div class="doctor-detail">
            <span :class="['status', doc.isAvailable ? 'available' : 'unavailable']">
              {{ doc.isAvailable ? '可用' : '停用' }}
            </span>
          </div>
        </div>
        <button class="btn btn-text btn-danger" @click="handleDelete(doc)">停用</button>
      </div>
    </div>

    <div v-if="successMsg" class="success-message">{{ successMsg }}</div>
    <div v-if="error" class="error-message">{{ error }}</div>
  </div>
</template>

<style scoped>
.doctor-manage { max-width: 600px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem; }
.page-header h2 { font-size: 1.25rem; margin: 0; }
.btn-back { background: none; border: none; font-size: 1rem; color: #795548; cursor: pointer; padding: 0.25rem; }
.hint { font-size: 0.875rem; color: #999; margin-bottom: 1rem; }

.create-section { margin-bottom: 1rem; }
.create-form { background: white; padding: 1rem; border-radius: 0.5rem; }
.create-form h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }
.form-row { margin-bottom: 0.75rem; }
.form-row label { display: block; font-size: 0.875rem; color: #666; margin-bottom: 0.25rem; }
.form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #795548; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-primary { background: #795548; color: white; border-color: #795548; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-text { border: none; background: none; padding: 0.5rem; min-height: auto; font-size: 0.875rem; }
.btn-danger { color: #f44336; }

.doctor-list { display: flex; flex-direction: column; gap: 0.5rem; }
.doctor-card { background: white; border-radius: 0.5rem; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; }
.doctor-name { font-weight: 600; }
.doctor-detail { font-size: 0.75rem; color: #666; margin-top: 0.25rem; display: flex; gap: 0.75rem; }
.status { padding: 0 0.375rem; border-radius: 0.25rem; }
.available { background: #e8f5e9; color: #2e7d32; }
.unavailable { background: #ffebee; color: #c62828; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
.success-message { background: #e8f5e9; color: #2e7d32; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
