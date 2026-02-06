<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useDoctorStore } from '@/stores/doctor'
import { useRegistrationStore } from '@/stores/registration'

const doctorStore = useDoctorStore()
const regStore = useRegistrationStore()

// Medicine search
const searchKeyword = ref('')
const showMedicineSearch = ref(false)

// Edit line modal
const editingIndex = ref<number | null>(null)
const editDosage = ref(3)
const editFrequency = ref('TID')
const editDays = ref(7)

// Auto-refresh registrations
let refreshInterval: number | null = null

onMounted(async () => {
  await regStore.loadDoctors()
  await regStore.loadTodayRegistrations()
  await doctorStore.loadMedicines()

  refreshInterval = window.setInterval(() => {
    regStore.loadTodayRegistrations()
  }, 10000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

// Waiting count color
const waitingColor = computed(() => {
  const count = doctorStore.waitingCount
  if (count <= 3) return '#4CAF50'
  if (count <= 10) return '#FF9800'
  return '#F44336'
})

// Select a consulting patient to work on
async function selectPatient(reg: any) {
  await doctorStore.startConsultation(
    reg.id,
    reg.patientName,
    reg.patientTaxId,
    reg.resourceName
  )
}

// Medicine search
async function onSearch() {
  await doctorStore.searchMedicine(searchKeyword.value)
}

function addMedicine(med: any) {
  doctorStore.addMedicine(med)
  showMedicineSearch.value = false
  searchKeyword.value = ''
  doctorStore.searchResults = []
}

// Edit line
function openEdit(index: number) {
  const line = doctorStore.prescriptionLines[index]
  if (!line) return
  editingIndex.value = index
  editDosage.value = line.dosage
  editFrequency.value = line.frequency
  editDays.value = line.days
}

function saveEdit() {
  if (editingIndex.value === null) return
  doctorStore.updateLine(editingIndex.value, {
    dosage: editDosage.value,
    frequency: editFrequency.value as any,
    days: editDays.value,
  })
  editingIndex.value = null
}

function cancelEdit() {
  editingIndex.value = null
}

// Complete
async function complete() {
  if (doctorStore.prescriptionLines.length === 0 && !doctorStore.diagnosis) {
    if (!confirm('尚未開藥，確定完成看診嗎？')) return
  }
  const success = await doctorStore.completeConsultation()
  if (success) {
    alert('看診完成！處方已送藥房')
  }
}

// Save draft
async function saveDraft() {
  const success = await doctorStore.save()
  if (success) {
    alert('處方已暫存')
  }
}

// Call next from queue
async function callNext() {
  await regStore.callNext()
}
</script>

<template>
  <div class="consult-view">
    <!-- Status bar -->
    <div class="status-bar">
      <span>候診: <strong :style="{ color: waitingColor }">{{ doctorStore.waitingCount }} 人</strong></span>
      <button class="btn btn-sm" @click="callNext" :disabled="regStore.waitingList.length === 0">
        叫下一位
      </button>
    </div>

    <!-- No patient selected -->
    <div v-if="!doctorStore.hasCurrentPatient" class="no-patient">
      <div v-if="regStore.consultingList.length === 0" class="empty-state">
        <p>目前沒有看診中的病人</p>
        <p class="hint">請從叫號管理叫號後進入看診</p>
      </div>
      <div v-else>
        <h3>看診中的病人</h3>
        <div class="patient-list">
          <div
            v-for="reg in regStore.consultingList"
            :key="reg.id"
            class="patient-card clickable"
            @click="selectPatient(reg)"
          >
            <div class="queue-num">{{ reg.queueNumber }}</div>
            <div class="patient-info">
              <div class="name">{{ reg.patientName }}</div>
              <div class="detail">{{ reg.patientTaxId }}</div>
            </div>
            <div class="arrow">→</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active consultation -->
    <div v-else class="consultation">
      <!-- Patient info -->
      <div class="section patient-header">
        <div class="patient-main">
          <div class="patient-name">{{ doctorStore.currentPatientName }}</div>
          <div class="patient-id">{{ doctorStore.currentPatientTaxId }}</div>
        </div>
        <button class="btn btn-text" @click="doctorStore.clearConsultation()">✕</button>
      </div>

      <!-- Diagnosis -->
      <div class="section">
        <h3>診斷</h3>
        <input
          v-model="doctorStore.diagnosis"
          type="text"
          placeholder="輸入診斷（如：感冒、腸胃炎）"
          class="input"
        />
      </div>

      <!-- Prescription -->
      <div class="section">
        <div class="section-header">
          <h3>處方</h3>
          <div class="days-control">
            <span>天數:</span>
            <select v-model.number="doctorStore.totalDays" @change="doctorStore.setTotalDays(doctorStore.totalDays)" class="days-select">
              <option v-for="d in [1,2,3,5,7,10,14,21,28]" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
        </div>

        <!-- Prescription lines -->
        <div v-if="doctorStore.prescriptionLines.length === 0" class="empty-prescription">
          尚未開藥，請點擊下方「新增藥品」
        </div>
        <div v-else class="prescription-list">
          <div v-for="(line, i) in doctorStore.prescriptionLines" :key="i" class="prescription-item">
            <!-- Edit mode -->
            <div v-if="editingIndex === i" class="edit-form">
              <div class="edit-header">{{ line.productName }}</div>
              <div class="edit-row">
                <label>劑量:</label>
                <input v-model.number="editDosage" type="number" step="0.5" min="0.5" class="input-sm" /> g
              </div>
              <div class="edit-row">
                <label>頻率:</label>
                <div class="freq-options">
                  <button v-for="f in ['QD','BID','TID','QID']" :key="f"
                    class="freq-btn" :class="{ active: editFrequency === f }"
                    @click="editFrequency = f">{{ f }}</button>
                </div>
              </div>
              <div class="edit-row">
                <label>天數:</label>
                <input v-model.number="editDays" type="number" min="1" max="28" class="input-sm" /> 天
              </div>
              <div class="edit-actions">
                <button class="btn btn-sm" @click="cancelEdit">取消</button>
                <button class="btn btn-sm btn-primary" @click="saveEdit">確認</button>
              </div>
            </div>
            <!-- Display mode -->
            <div v-else class="line-display" @click="openEdit(i)">
              <div class="line-info">
                <div class="line-name">{{ line.productName }}</div>
                <div class="line-detail">
                  {{ line.dosage }}{{ line.unit }} {{ line.frequency }} x {{ line.days }}天 = {{ line.totalQuantity }}{{ line.unit }}
                </div>
              </div>
              <button class="btn btn-text btn-remove" @click.stop="doctorStore.removeMedicine(i)">✕</button>
            </div>
          </div>
        </div>

        <!-- Add medicine button -->
        <button class="btn btn-add" @click="showMedicineSearch = true">
          + 新增藥品
        </button>
      </div>

      <!-- Action buttons -->
      <div class="action-bar">
        <button class="btn" @click="saveDraft" :disabled="doctorStore.isSaving">暫存</button>
        <button class="btn btn-success btn-large" @click="complete" :disabled="doctorStore.isSaving">
          {{ doctorStore.isSaving ? '處理中...' : '完成看診' }}
        </button>
      </div>
    </div>

    <!-- Medicine search modal -->
    <div v-if="showMedicineSearch" class="modal-overlay" @click.self="showMedicineSearch = false">
      <div class="modal">
        <div class="modal-header">
          <h3>搜尋藥品</h3>
          <button class="btn btn-text" @click="showMedicineSearch = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="search-input">
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="輸入藥品名稱或代碼..."
              class="input"
              @input="onSearch"
              autofocus
            />
          </div>

          <!-- Search results -->
          <div v-if="doctorStore.isSearching" class="loading">搜尋中...</div>
          <div v-else-if="searchKeyword && doctorStore.searchResults.length === 0" class="empty">
            找不到「{{ searchKeyword }}」
          </div>
          <div v-else-if="doctorStore.searchResults.length > 0" class="medicine-list">
            <div
              v-for="med in doctorStore.searchResults"
              :key="med.id"
              class="medicine-item"
              @click="addMedicine(med)"
            >
              <div class="med-name">{{ med.name }}</div>
              <div class="med-code">{{ med.value }}</div>
            </div>
          </div>

          <!-- All medicines (when no search) -->
          <div v-else-if="!searchKeyword && doctorStore.medicines.length > 0">
            <div class="section-label">全部藥品</div>
            <div class="medicine-list">
              <div
                v-for="med in doctorStore.medicines"
                :key="med.id"
                class="medicine-item"
                @click="addMedicine(med)"
              >
                <div class="med-name">{{ med.name }}</div>
                <div class="med-code">{{ med.value }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="doctorStore.error" class="error-message">
      {{ doctorStore.error }}
    </div>
  </div>
</template>

<style scoped>
.consult-view {
  max-width: 800px;
  margin: 0 auto;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.no-patient { padding: 1rem; }

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.hint { font-size: 0.875rem; color: #999; margin-top: 0.5rem; }

.patient-list { display: flex; flex-direction: column; gap: 0.5rem; }

.patient-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: white;
  padding: 1rem;
  border-radius: 0.5rem;
}

.patient-card.clickable { cursor: pointer; }
.patient-card.clickable:active { background: #f0f0f0; }

.queue-num {
  font-size: 1.5rem;
  font-weight: 700;
  color: #9C27B0;
  min-width: 3rem;
  text-align: center;
}

.patient-info { flex: 1; }
.name { font-weight: 600; }
.detail { font-size: 0.75rem; color: #666; }
.arrow { color: #999; font-size: 1.25rem; }

.section {
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; color: #333; }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.section-header h3 { margin: 0; }

.days-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.days-select {
  padding: 0.375rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.patient-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f3e5f5;
  border: 2px solid #9C27B0;
}

.patient-main .patient-name { font-size: 1.25rem; font-weight: 600; }
.patient-main .patient-id { font-size: 0.75rem; color: #666; }

.input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  min-height: 48px;
}

.input:focus { outline: none; border-color: #9C27B0; }

.empty-prescription {
  text-align: center;
  padding: 1.5rem;
  color: #999;
  font-size: 0.875rem;
}

.prescription-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }

.prescription-item {
  border: 1px solid #eee;
  border-radius: 0.5rem;
  overflow: hidden;
}

.line-display {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  cursor: pointer;
}

.line-display:active { background: #fafafa; }

.line-info { flex: 1; }
.line-name { font-weight: 600; color: #333; }
.line-detail { font-size: 0.75rem; color: #666; margin-top: 0.25rem; }

.btn-remove { color: #f44336 !important; min-height: auto !important; padding: 0.25rem; }

.edit-form { padding: 0.75rem; background: #f9f9f9; }
.edit-header { font-weight: 600; margin-bottom: 0.75rem; }
.edit-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.edit-row label { min-width: 3rem; font-size: 0.875rem; color: #666; }
.input-sm { width: 4rem; padding: 0.375rem; border: 1px solid #ddd; border-radius: 0.25rem; font-size: 0.875rem; text-align: center; }

.freq-options { display: flex; gap: 0.25rem; }
.freq-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  background: white;
  font-size: 0.75rem;
  cursor: pointer;
  min-height: auto;
}
.freq-btn.active { background: #9C27B0; color: white; border-color: #9C27B0; }

.edit-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; }

.btn-add {
  width: 100%;
  padding: 0.75rem;
  border: 2px dashed #ddd;
  border-radius: 0.5rem;
  color: #666;
  font-size: 0.875rem;
  background: transparent;
}

.btn-add:active { background: #f5f5f5; }

.action-bar {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
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

.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; min-height: auto; }
.btn-primary { background: #9C27B0; color: white; border-color: #9C27B0; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; padding: 0.5rem; min-height: auto; }
.btn-large { flex: 1; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Modal */
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
  max-height: 80vh;
  border-radius: 1rem 1rem 0 0;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.modal-header h3 { margin: 0; }

.modal-body { padding: 1rem; overflow-y: auto; flex: 1; }

.search-input { margin-bottom: 1rem; }

.section-label { font-size: 0.75rem; color: #999; margin-bottom: 0.5rem; text-transform: uppercase; }

.medicine-list { display: flex; flex-direction: column; gap: 0.25rem; }

.medicine-item {
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
}

.medicine-item:active { background: #f5f5f5; }

.med-name { font-weight: 500; }
.med-code { font-size: 0.75rem; color: #999; }

.loading, .empty { text-align: center; padding: 2rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
