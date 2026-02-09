<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRegistrationStore } from '@/stores/registration'
import { TAG_DISPLAY, TYPE_DISPLAY } from '@/api/registration'

const store = useRegistrationStore()

// 選擇的醫師篩選
const selectedResourceId = ref<number | null>(null)

// 自動更新間隔
let refreshInterval: number | null = null

onMounted(async () => {
  await store.loadDoctors()
  await store.loadTodayRegistrations()
  loadAllTags()

  // 每 10 秒自動更新
  refreshInterval = window.setInterval(() => {
    store.loadTodayRegistrations(selectedResourceId.value || undefined)
  }, 10000)
})

// Load tags for all patients in today's registrations
function loadAllTags() {
  const patientIds = new Set(store.todayRegistrations.map(r => r.patientId).filter(id => id > 0))
  for (const id of patientIds) {
    store.loadPatientTags(id)
  }
}

// Get tags for a specific patient
function getPatientTags(patientId: number) {
  return store.patientTags[patientId] || []
}

// 清理
import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

// 篩選後的候診清單
const filteredWaiting = computed(() => {
  if (!selectedResourceId.value) return store.waitingList
  return store.waitingList.filter(r => r.resourceId === selectedResourceId.value)
})

const filteredCalling = computed(() => {
  if (!selectedResourceId.value) return store.callingList
  return store.callingList.filter(r => r.resourceId === selectedResourceId.value)
})

const filteredConsulting = computed(() => {
  if (!selectedResourceId.value) return store.consultingList
  return store.consultingList.filter(r => r.resourceId === selectedResourceId.value)
})

// 叫下一位
async function callNext() {
  await store.callNext(selectedResourceId.value || undefined)
}

// 開始看診
async function startConsult(id: number) {
  await store.startConsult(id)
}

// 完成看診
async function complete(id: number) {
  await store.completeConsult(id)
}

// 取消
async function cancel(id: number) {
  if (confirm('確定要取消此掛號嗎？')) {
    await store.cancel(id)
  }
}

// 手動刷新
async function refresh() {
  await store.loadTodayRegistrations(selectedResourceId.value || undefined)
}

// 可用醫師
const availableDoctors = computed(() => store.doctors)

</script>

<template>
  <div class="queue-view">
    <!-- 頂部篩選 -->
    <div class="filter-bar">
      <button
        class="filter-btn"
        :class="{ active: !selectedResourceId }"
        @click="selectedResourceId = null"
      >
        全部
      </button>
      <button
        v-for="doctor in availableDoctors"
        :key="doctor.id"
        class="filter-btn"
        :class="{ active: selectedResourceId === doctor.id }"
        @click="selectedResourceId = doctor.id || null"
      >
        {{ doctor.name }}
        <span class="badge">{{ store.waitingCountByDoctor[doctor.id] || 0 }}</span>
      </button>
      <button class="refresh-btn" @click="refresh" :disabled="store.isLoadingRegistrations">
        🔄
      </button>
    </div>

    <!-- 叫號中 -->
    <div class="section calling-section" v-if="filteredCalling.length > 0">
      <h3>🔔 叫號中</h3>
      <div class="queue-list">
        <div
          v-for="reg in filteredCalling"
          :key="reg.id"
          class="queue-item calling"
        >
          <div class="queue-number">{{ reg.queueNumber }}</div>
          <div class="queue-info">
            <div class="patient-name">
              {{ reg.patientName }}
              <span class="reg-type-badge" :style="{ background: TYPE_DISPLAY[reg.type].color }">{{ TYPE_DISPLAY[reg.type].label }}</span>
              <span v-for="tag in getPatientTags(reg.patientId)" :key="tag" class="tag-badge" :title="TAG_DISPLAY[tag].label">{{ TAG_DISPLAY[tag].icon }}</span>
            </div>
            <div class="resource-name">{{ reg.resourceName }}</div>
          </div>
          <div class="queue-actions">
            <button class="btn btn-sm btn-primary" @click="startConsult(reg.id)">
              進入看診
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 看診中 -->
    <div class="section consulting-section" v-if="filteredConsulting.length > 0">
      <h3>👨‍⚕️ 看診中</h3>
      <div class="queue-list">
        <div
          v-for="reg in filteredConsulting"
          :key="reg.id"
          class="queue-item consulting"
        >
          <div class="queue-number">{{ reg.queueNumber }}</div>
          <div class="queue-info">
            <div class="patient-name">
              {{ reg.patientName }}
              <span class="reg-type-badge" :style="{ background: TYPE_DISPLAY[reg.type].color }">{{ TYPE_DISPLAY[reg.type].label }}</span>
              <span v-for="tag in getPatientTags(reg.patientId)" :key="tag" class="tag-badge" :title="TAG_DISPLAY[tag].label">{{ TAG_DISPLAY[tag].icon }}</span>
            </div>
            <div class="resource-name">{{ reg.resourceName }}</div>
          </div>
          <div class="queue-actions">
            <button class="btn btn-sm btn-success" @click="complete(reg.id)">
              完成
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 候診清單 -->
    <div class="section waiting-section">
      <div class="section-header">
        <h3>⏳ 候診中 ({{ filteredWaiting.length }})</h3>
        <button
          class="btn btn-primary"
          @click="callNext"
          :disabled="filteredWaiting.length === 0"
        >
          叫下一位
        </button>
      </div>

      <div v-if="store.isLoadingRegistrations" class="loading">
        載入中...
      </div>
      <div v-else-if="filteredWaiting.length === 0" class="empty">
        目前沒有候診病人
      </div>
      <div v-else class="queue-list">
        <div
          v-for="reg in filteredWaiting"
          :key="reg.id"
          class="queue-item waiting"
        >
          <div class="queue-number">{{ reg.queueNumber }}</div>
          <div class="queue-info">
            <div class="patient-name">
              {{ reg.patientName }}
              <span class="reg-type-badge" :style="{ background: TYPE_DISPLAY[reg.type].color }">{{ TYPE_DISPLAY[reg.type].label }}</span>
              <span v-for="tag in getPatientTags(reg.patientId)" :key="tag" class="tag-badge" :title="TAG_DISPLAY[tag].label">{{ TAG_DISPLAY[tag].icon }}</span>
            </div>
            <div class="patient-id">{{ reg.patientTaxId }}</div>
            <div class="resource-name">{{ reg.resourceName }}</div>
          </div>
          <div class="queue-actions">
            <button class="btn btn-sm" @click="store.call(reg.id)">叫號</button>
            <button class="btn btn-sm btn-danger" @click="cancel(reg.id)">取消</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 錯誤訊息 -->
    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>
  </div>
</template>

<style scoped>
.queue-view {
  padding: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.filter-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 2rem;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-btn.active {
  background: #2196f3;
  color: white;
  border-color: #2196f3;
}

.badge {
  background: rgba(0,0,0,0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.75rem;
}

.filter-btn.active .badge {
  background: rgba(255,255,255,0.3);
}

.refresh-btn {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  background: white;
  cursor: pointer;
  margin-left: auto;
}

.refresh-btn:disabled {
  opacity: 0.5;
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
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h3 {
  margin: 0;
}

.calling-section {
  background: #fff3e0;
  border: 2px solid #ff9800;
}

.consulting-section {
  background: #e3f2fd;
  border: 2px solid #2196f3;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.queue-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  background: #f5f5f5;
  border-radius: 0.5rem;
  gap: 1rem;
}

.queue-item.calling {
  background: #ffe0b2;
}

.queue-item.consulting {
  background: #bbdefb;
}

.queue-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
  min-width: 3rem;
  text-align: center;
}

.queue-info {
  flex: 1;
}

.patient-name {
  font-weight: 600;
  color: #333;
}

.patient-id {
  font-size: 0.75rem;
  color: #666;
}

.resource-name {
  font-size: 0.75rem;
  color: #999;
}

.queue-actions {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: #2196f3;
  color: white;
  border-color: #2196f3;
}

.btn-success {
  background: #4caf50;
  color: white;
  border-color: #4caf50;
}

.btn-danger {
  background: #f44336;
  color: white;
  border-color: #f44336;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading, .empty {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-top: 1rem;
}

.tag-badge {
  font-size: 0.75rem;
  margin-left: 0.125rem;
}

.reg-type-badge {
  display: inline-block;
  font-size: 0.625rem;
  color: white;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  margin-left: 0.375rem;
  vertical-align: middle;
  font-weight: 500;
}
</style>
