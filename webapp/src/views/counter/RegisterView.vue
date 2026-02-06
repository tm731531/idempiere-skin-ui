<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api/client'

interface Patient {
  id: number
  Name: string
  Value: string
  Description?: string
}

const patients = ref<Patient[]>([])
const searchQuery = ref('')
const loading = ref(false)
const selectedPatient = ref<Patient | null>(null)

onMounted(async () => {
  await loadPatients()
})

async function loadPatients() {
  loading.value = true
  try {
    const response = await api.getPatients()
    patients.value = response.records || []
  } catch (error) {
    console.error('Failed to load patients:', error)
  } finally {
    loading.value = false
  }
}

function selectPatient(patient: Patient) {
  selectedPatient.value = patient
}

function confirmRegister() {
  if (!selectedPatient.value) return
  // TODO: 呼叫 API 建立掛號記錄
  alert(`已掛號: ${selectedPatient.value.Name}`)
  selectedPatient.value = null
}

// 病人標記對應的圖示
function getPatientTag(description?: string): string {
  const tags: Record<string, string> = {
    'VIP': '❤️',
    'Allergy': '💊',
    'Chronic': '🔄',
    'Attention': '⚠️',
    'Debt': '💰',
  }
  return tags[description || ''] || ''
}
</script>

<template>
  <div class="register-view">
    <!-- 搜尋區 -->
    <div class="search-section">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="🔍 搜尋病人姓名或健保卡號..."
        class="search-input"
      />
    </div>

    <!-- 病人列表 -->
    <div class="patient-list">
      <div v-if="loading" class="loading">載入中...</div>
      <div
        v-else
        v-for="patient in patients"
        :key="patient.id"
        class="patient-item"
        :class="{ selected: selectedPatient?.id === patient.id }"
        @click="selectPatient(patient)"
      >
        <div class="patient-info">
          <span class="patient-name">
            {{ patient.Name }}
            <span v-if="patient.Description" class="patient-tag">
              {{ getPatientTag(patient.Description) }}
            </span>
          </span>
          <span class="patient-id">{{ patient.Value }}</span>
        </div>
        <div class="patient-action">
          <span v-if="selectedPatient?.id === patient.id">✓</span>
        </div>
      </div>
    </div>

    <!-- 確認按鈕 -->
    <div class="action-section">
      <button
        class="register-btn"
        :disabled="!selectedPatient"
        @click="confirmRegister"
      >
        確認掛號
        <span v-if="selectedPatient">- {{ selectedPatient.Name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.register-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-section {
  margin-bottom: 1rem;
}

.search-input {
  width: 100%;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  min-height: 48px;
}

.patient-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.patient-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: white;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 56px; /* 觸控友善 */
}

.patient-item:active {
  background: #f0f0f0;
}

.patient-item.selected {
  background: #e8f5e9;
  border: 2px solid #4CAF50;
}

.patient-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.patient-name {
  font-weight: 600;
  color: #333;
}

.patient-tag {
  margin-left: 0.5rem;
}

.patient-id {
  font-size: 0.875rem;
  color: #666;
}

.patient-action {
  color: #4CAF50;
  font-size: 1.25rem;
}

.action-section {
  padding-top: 1rem;
}

.register-btn {
  width: 100%;
  padding: 1rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 56px;
}

.register-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
