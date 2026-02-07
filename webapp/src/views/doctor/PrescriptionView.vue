<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDoctorStore } from '@/stores/doctor'

const doctorStore = useDoctorStore()

// Tab state
const activeTab = ref<'history' | 'templates'>('history')

// Expanded history card tracking
const expandedId = ref<number | null>(null)

// Template save form
const showTemplateSave = ref(false)
const templateName = ref('')

onMounted(async () => {
  await Promise.all([
    doctorStore.loadHistory(),
    doctorStore.loadTemplateList(),
  ])
})

function toggleExpand(assignmentId: number) {
  expandedId.value = expandedId.value === assignmentId ? null : assignmentId
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

function statusLabel(status: string): string {
  switch (status) {
    case 'DRAFT': return '草稿'
    case 'COMPLETED': return '已完成'
    default: return status
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'DRAFT': return 'badge-draft'
    case 'COMPLETED': return 'badge-completed'
    default: return ''
  }
}

async function applyTemplate(template: any) {
  await doctorStore.applyTemplate(template)
}

async function removeTemplate(id: string) {
  if (!confirm('確定要刪除此範本嗎？')) return
  await doctorStore.removeTemplate(id)
}

async function saveAsTemplate() {
  const name = templateName.value.trim()
  if (!name) return
  await doctorStore.saveCurrentAsTemplate(name)
  templateName.value = ''
  showTemplateSave.value = false
}
</script>

<template>
  <div class="prescription-view">
    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        處方歷史
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'templates' }"
        @click="activeTab = 'templates'"
      >
        處方範本
      </button>
    </div>

    <!-- Error -->
    <div v-if="doctorStore.error" class="error-message">
      {{ doctorStore.error }}
    </div>

    <!-- ==================== History Tab ==================== -->
    <div v-if="activeTab === 'history'">
      <div v-if="doctorStore.isLoadingHistory" class="loading">載入中...</div>

      <div v-else-if="doctorStore.prescriptionHistory.length === 0" class="empty-state">
        <p>尚無處方歷史紀錄</p>
      </div>

      <div v-else class="card-list">
        <div
          v-for="rx in doctorStore.prescriptionHistory"
          :key="rx.assignmentId"
          class="section card"
          @click="toggleExpand(rx.assignmentId)"
        >
          <!-- Card summary -->
          <div class="card-header">
            <div class="card-main">
              <div class="card-title-row">
                <span class="card-title">{{ rx.patientName }}</span>
                <span class="badge" :class="statusClass(rx.status)">
                  {{ statusLabel(rx.status) }}
                </span>
              </div>
              <div v-if="rx.diagnosis" class="card-subtitle">{{ rx.diagnosis }}</div>
              <div class="card-meta">
                <span>{{ rx.lines.length }} 項藥品</span>
                <span class="meta-sep">|</span>
                <span>{{ rx.totalDays }} 天</span>
                <span class="meta-sep">|</span>
                <span>{{ formatDate(rx.createdAt) }}</span>
              </div>
            </div>
            <div class="expand-icon">{{ expandedId === rx.assignmentId ? '&#9650;' : '&#9660;' }}</div>
          </div>

          <!-- Expanded lines detail -->
          <div v-if="expandedId === rx.assignmentId" class="card-detail" @click.stop>
            <div class="detail-divider"></div>
            <div v-if="rx.lines.length === 0" class="detail-empty">此處方無藥品明細</div>
            <div v-else class="detail-lines">
              <div v-for="(line, i) in rx.lines" :key="i" class="detail-line">
                <div class="detail-line-name">{{ line.productName }}</div>
                <div class="detail-line-info">
                  {{ line.dosage }}{{ line.unit }} {{ line.frequency }} x {{ line.days }}天 = {{ line.totalQuantity }}{{ line.unit }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== Templates Tab ==================== -->
    <div v-if="activeTab === 'templates'">
      <div v-if="doctorStore.templates.length === 0" class="empty-state">
        <p>尚無處方範本</p>
        <p class="hint">可在看診開藥後儲存為範本</p>
      </div>

      <div v-else class="card-list">
        <div
          v-for="tmpl in doctorStore.templates"
          :key="tmpl.id"
          class="section card"
        >
          <div class="card-header">
            <div class="card-main">
              <div class="card-title">{{ tmpl.name }}</div>
              <div class="card-meta">
                <span>{{ tmpl.lines.length }} 項藥品</span>
                <span class="meta-sep">|</span>
                <span>{{ tmpl.totalDays }} 天</span>
              </div>
            </div>
            <div class="card-actions">
              <button
                class="btn btn-sm btn-primary"
                :disabled="!doctorStore.hasCurrentPatient"
                @click="applyTemplate(tmpl)"
              >
                套用
              </button>
              <button
                class="btn btn-sm btn-danger"
                @click="removeTemplate(tmpl.id)"
              >
                刪除
              </button>
            </div>
          </div>

          <!-- Template lines preview -->
          <div class="template-lines">
            <div v-for="(line, i) in tmpl.lines" :key="i" class="detail-line">
              <div class="detail-line-name">{{ line.productName }}</div>
              <div class="detail-line-info">
                {{ line.dosage }}{{ line.unit }} {{ line.frequency }} x {{ line.days }}天
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Save current prescription as template -->
      <div
        v-if="doctorStore.hasCurrentPatient && doctorStore.prescriptionLines.length > 0"
        class="section save-template-section"
      >
        <div v-if="!showTemplateSave">
          <button class="btn btn-primary btn-full" @click="showTemplateSave = true">
            儲存目前處方為範本
          </button>
        </div>
        <div v-else class="save-template-form">
          <h3>儲存為範本</h3>
          <input
            v-model="templateName"
            type="text"
            placeholder="輸入範本名稱（如：感冒常用方）"
            class="input"
            @keyup.enter="saveAsTemplate"
          />
          <div class="save-template-actions">
            <button class="btn btn-sm" @click="showTemplateSave = false; templateName = ''">取消</button>
            <button
              class="btn btn-sm btn-primary"
              :disabled="!templateName.trim()"
              @click="saveAsTemplate"
            >
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prescription-view {
  max-width: 800px;
  margin: 0 auto;
}

/* ===== Tab bar ===== */
.tab-bar {
  display: flex;
  margin-bottom: 1rem;
  background: white;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid #ddd;
}

.tab-btn {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  background: white;
  font-size: 1rem;
  cursor: pointer;
  color: #666;
  min-height: 48px;
  transition: background 0.2s, color 0.2s;
}

.tab-btn.active {
  background: #9C27B0;
  color: white;
  font-weight: 600;
}

.tab-btn:not(.active):active {
  background: #f5f5f5;
}

/* ===== Section / Card ===== */
.section {
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.card-list {
  display: flex;
  flex-direction: column;
}

.card {
  cursor: pointer;
}

.card:active {
  background: #fafafa;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-title {
  font-weight: 600;
  font-size: 1rem;
  color: #333;
}

.card-subtitle {
  font-size: 0.875rem;
  color: #666;
  margin-top: 0.25rem;
}

.card-meta {
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.375rem;
}

.meta-sep {
  margin: 0 0.375rem;
  color: #ddd;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
  align-items: flex-start;
}

.expand-icon {
  font-size: 0.625rem;
  color: #999;
  flex-shrink: 0;
  padding-top: 0.25rem;
}

/* ===== Badge ===== */
.badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.badge-draft {
  background: #FFF3E0;
  color: #E65100;
}

.badge-completed {
  background: #E8F5E9;
  color: #2E7D32;
}

/* ===== Card detail (expanded lines) ===== */
.card-detail {
  margin-top: 0.75rem;
}

.detail-divider {
  height: 1px;
  background: #eee;
  margin-bottom: 0.75rem;
}

.detail-empty {
  text-align: center;
  color: #999;
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.detail-lines {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-line {
  padding: 0.5rem 0.75rem;
  background: #fafafa;
  border-radius: 0.375rem;
}

.detail-line-name {
  font-weight: 500;
  font-size: 0.875rem;
  color: #333;
}

.detail-line-info {
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.125rem;
}

/* ===== Template lines preview ===== */
.template-lines {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

/* ===== Save template section ===== */
.save-template-section {
  margin-top: 0.5rem;
}

.save-template-form h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: #333;
}

.save-template-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.75rem;
}

/* ===== Buttons ===== */
.btn {
  padding: 0.75rem 1.5rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  background: white;
  min-height: 48px;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  min-height: auto;
}

.btn-primary {
  background: #9C27B0;
  color: white;
  border-color: #9C27B0;
}

.btn-danger {
  background: white;
  color: #F44336;
  border-color: #F44336;
}

.btn-danger:active {
  background: #FFEBEE;
}

.btn-text {
  background: transparent;
  border: none;
  color: #666;
}

.btn-full {
  width: 100%;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== Input ===== */
.input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  min-height: 48px;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #9C27B0;
}

/* ===== States ===== */
.loading {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.hint {
  font-size: 0.875rem;
  color: #999;
  margin-top: 0.5rem;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
}
</style>
