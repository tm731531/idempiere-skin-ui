<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRegistrationStore } from '@/stores/registration'
import { TAG_DISPLAY, type PatientTag } from '@/api/registration'

const store = useRegistrationStore()

// 本地狀態
const taxIdInput = ref('')
const nameInput = ref('')
const phoneInput = ref('')
const showNewPatientForm = ref(false)

// Patient tags
const showTagEditor = ref(false)
const editingTags = ref<PatientTag[]>([])
const allTags: PatientTag[] = ['WARNING', 'ALLERGY', 'VIP', 'CHRONIC', 'DEBT']

// Load tags when patient is found
watch(() => store.currentPatient, async (patient) => {
  if (patient) {
    await store.loadPatientTags(patient.id)
  }
})

const currentTags = computed(() => {
  if (!store.currentPatient) return []
  return store.patientTags[store.currentPatient.id] || []
})

function openTagEditor() {
  editingTags.value = [...currentTags.value]
  showTagEditor.value = true
}

function toggleTag(tag: PatientTag) {
  const idx = editingTags.value.indexOf(tag)
  if (idx >= 0) {
    editingTags.value.splice(idx, 1)
  } else {
    editingTags.value.push(tag)
  }
}

async function saveTagEdits() {
  if (!store.currentPatient) return
  await store.updatePatientTags(store.currentPatient.id, editingTags.value)
  showTagEditor.value = false
}

// 載入醫師清單
onMounted(async () => {
  await store.loadDoctors()
  await store.loadTodayRegistrations()
})

// 搜尋病人
async function searchPatient() {
  if (taxIdInput.value.length < 2) return

  const patient = await store.findPatient(taxIdInput.value)
  if (!patient) {
    // 找不到，顯示新增表單
    showNewPatientForm.value = true
    nameInput.value = ''
    phoneInput.value = ''
  } else {
    showNewPatientForm.value = false
  }
}

// 新增病人
async function createPatient() {
  if (!nameInput.value || !taxIdInput.value) {
    alert('請填寫姓名和身分證')
    return
  }

  const patient = await store.addPatient({
    name: nameInput.value,
    taxId: taxIdInput.value,
    phone: phoneInput.value,
  })

  if (patient) {
    showNewPatientForm.value = false
  }
}

// 選擇醫師
function selectDoctor(doctor: any) {
  store.selectDoctor(doctor)
}

// 確認掛號
async function confirmRegister() {
  const registration = await store.register()
  if (registration) {
    alert(`掛號成功！\n號碼: ${registration.queueNumber}\n病人: ${registration.patientName}`)
    taxIdInput.value = ''
    showNewPatientForm.value = false
  }
}

// 清除
function clearAll() {
  store.clearPatient()
  store.selectDoctor(null as any)
  taxIdInput.value = ''
  nameInput.value = ''
  phoneInput.value = ''
  showNewPatientForm.value = false
}

// 可用醫師（有 resourceId 的）
const availableDoctors = computed(() =>
  store.doctors.filter(d => d.resourceId)
)
</script>

<template>
  <div class="register-view">
    <!-- Step 1: 輸入身分證 -->
    <div class="section">
      <h3>1. 輸入身分證</h3>
      <div class="input-group">
        <input
          v-model="taxIdInput"
          type="text"
          placeholder="請輸入身分證號碼"
          class="input"
          maxlength="10"
          @keyup.enter="searchPatient"
        />
        <button class="btn btn-primary" @click="searchPatient" :disabled="store.isSearchingPatient">
          {{ store.isSearchingPatient ? '搜尋中...' : '查詢' }}
        </button>
      </div>
    </div>

    <!-- Step 2: 病人資訊 -->
    <div class="section" v-if="store.currentPatient || showNewPatientForm">
      <h3>2. 病人資訊</h3>

      <!-- 已找到病人 -->
      <div v-if="store.currentPatient" class="patient-card">
        <div class="patient-info">
          <div class="patient-name">
            {{ store.currentPatient.name }}
            <span
              v-for="tag in currentTags"
              :key="tag"
              class="tag-badge"
              :title="TAG_DISPLAY[tag].label"
            >{{ TAG_DISPLAY[tag].icon }}</span>
          </div>
          <div class="patient-detail">
            <span>身分證: {{ store.currentPatient.taxId }}</span>
            <span v-if="store.currentPatient.phone">電話: {{ store.currentPatient.phone }}</span>
          </div>
          <div class="patient-id">
            病歷號: {{ store.currentPatient.value }}
            <button class="btn-tag-edit" @click="openTagEditor">標記</button>
          </div>
        </div>
        <button class="btn btn-text" @click="clearAll">✕</button>
      </div>

      <!-- 新病人表單 -->
      <div v-else-if="showNewPatientForm" class="new-patient-form">
        <div class="form-notice">找不到此身分證，請填寫新病人資料：</div>
        <input
          v-model="nameInput"
          type="text"
          placeholder="姓名 *"
          class="input"
        />
        <input
          v-model="phoneInput"
          type="tel"
          placeholder="電話（選填）"
          class="input"
        />
        <div class="form-actions">
          <button class="btn" @click="showNewPatientForm = false">取消</button>
          <button class="btn btn-primary" @click="createPatient">建立病人</button>
        </div>
      </div>
    </div>

    <!-- Step 3: 選擇醫師 -->
    <div class="section" v-if="store.currentPatient">
      <h3>3. 選擇醫師</h3>
      <div v-if="store.isLoadingDoctors" class="loading">載入中...</div>
      <div v-else-if="availableDoctors.length === 0" class="empty">
        沒有可用的醫師資源，請先在 iDempiere 設定 S_Resource
      </div>
      <div v-else class="doctor-list">
        <div
          v-for="doctor in availableDoctors"
          :key="doctor.id"
          class="doctor-item"
          :class="{ selected: store.selectedDoctor?.id === doctor.id }"
          @click="selectDoctor(doctor)"
        >
          <div class="doctor-name">{{ doctor.name }}</div>
          <div class="doctor-waiting">
            候診: {{ store.waitingCountByDoctor[doctor.resourceId!] || 0 }} 人
          </div>
        </div>
      </div>
    </div>

    <!-- 確認掛號 -->
    <div class="action-section" v-if="store.currentPatient && store.selectedDoctor">
      <button
        class="btn btn-success btn-large"
        @click="confirmRegister"
        :disabled="store.isRegistering"
      >
        {{ store.isRegistering ? '掛號中...' : '確認掛號' }}
      </button>
    </div>

    <!-- 錯誤訊息 -->
    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>

    <!-- 今日統計 -->
    <div class="section stats">
      <div class="stat-item">
        <div class="stat-value">{{ store.todayRegistrations.length }}</div>
        <div class="stat-label">今日掛號</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ store.waitingList.length }}</div>
        <div class="stat-label">候診中</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ store.completedList.length }}</div>
        <div class="stat-label">已完成</div>
      </div>
    </div>

    <!-- Tag editor modal -->
    <div v-if="showTagEditor" class="modal-overlay" @click.self="showTagEditor = false">
      <div class="modal">
        <div class="modal-header">
          <h3>編輯病人標記</h3>
          <button class="btn btn-text" @click="showTagEditor = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="tag-grid">
            <button
              v-for="tag in allTags"
              :key="tag"
              class="tag-option"
              :class="{ active: editingTags.includes(tag) }"
              @click="toggleTag(tag)"
            >
              <span class="tag-icon">{{ TAG_DISPLAY[tag].icon }}</span>
              <span class="tag-label">{{ TAG_DISPLAY[tag].label }}</span>
            </button>
          </div>
          <button class="btn btn-primary btn-full" @click="saveTagEdits">儲存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-view {
  padding: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.section {
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.section h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #333;
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

.input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  min-height: 48px;
}

.input:focus {
  outline: none;
  border-color: #4CAF50;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  background: white;
  min-height: 48px;
}

.btn-primary {
  background: #2196F3;
  color: white;
  border-color: #2196F3;
}

.btn-success {
  background: #4CAF50;
  color: white;
  border-color: #4CAF50;
}

.btn-text {
  background: transparent;
  border: none;
  color: #666;
  padding: 0.5rem;
  min-height: auto;
}

.btn-large {
  width: 100%;
  padding: 1rem;
  font-size: 1.125rem;
  font-weight: 600;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.patient-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem;
  background: #e8f5e9;
  border-radius: 0.5rem;
  border: 2px solid #4CAF50;
}

.patient-name {
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
}

.patient-detail {
  display: flex;
  gap: 1rem;
  color: #666;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.patient-id {
  color: #999;
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.new-patient-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-notice {
  color: #f57c00;
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.doctor-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
}

.doctor-item {
  padding: 1rem;
  border: 2px solid #ddd;
  border-radius: 0.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.doctor-item:active {
  background: #f5f5f5;
}

.doctor-item.selected {
  border-color: #4CAF50;
  background: #e8f5e9;
}

.doctor-name {
  font-weight: 600;
  color: #333;
}

.doctor-waiting {
  font-size: 0.875rem;
  color: #666;
  margin-top: 0.25rem;
}

.action-section {
  margin-top: 1rem;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-top: 1rem;
}

.loading, .empty {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.stats {
  display: flex;
  justify-content: space-around;
  background: #f5f5f5;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
}

.stat-label {
  font-size: 0.75rem;
  color: #666;
}

/* Tag badges */
.tag-badge {
  font-size: 0.875rem;
  margin-left: 0.25rem;
}

.btn-tag-edit {
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  color: #666;
  cursor: pointer;
  margin-left: 0.5rem;
}

.btn-tag-edit:active {
  background: #eee;
}

/* Tag editor modal */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.modal {
  background: white;
  width: 100%;
  border-radius: 1rem 1rem 0 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.modal-header h3 { margin: 0; }

.modal-body { padding: 1rem; }

.tag-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tag-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  border: 2px solid #ddd;
  border-radius: 0.5rem;
  background: white;
  cursor: pointer;
  min-height: 60px;
  justify-content: center;
}

.tag-option.active {
  border-color: #4CAF50;
  background: #e8f5e9;
}

.tag-icon { font-size: 1.5rem; }
.tag-label { font-size: 0.75rem; color: #666; margin-top: 0.25rem; }

.btn-full { width: 100%; }
</style>
