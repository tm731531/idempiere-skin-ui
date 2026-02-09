<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDoctorStore } from '@/stores/doctor'

const doctorStore = useDoctorStore()

// Tab state
const activeTab = ref<'history' | 'templates'>('history')

// Expanded history card tracking
const expandedId = ref<number | null>(null)

// Template save form (from active consultation)
const showTemplateSave = ref(false)
const templateName = ref('')

// Editor: medicine search modal
const showEditorSearch = ref(false)
const editorSearchKeyword = ref('')

// Editor: line editing
const editorEditingIndex = ref<number | null>(null)
const editorEditDosage = ref(3)
const editorEditFrequency = ref('TID')
const editorEditDays = ref(7)

onMounted(async () => {
  await Promise.all([
    doctorStore.loadHistory(),
    doctorStore.loadTemplateList(),
    doctorStore.loadMedicines(),
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

// ========== Editor functions ==========

async function onEditorSearch() {
  await doctorStore.searchMedicine(editorSearchKeyword.value)
}

function editorAddMed(med: any) {
  doctorStore.editorAddMedicine(med)
  showEditorSearch.value = false
  editorSearchKeyword.value = ''
  doctorStore.searchResults = []
}

function openEditorEdit(index: number) {
  const line = doctorStore.editorLines[index]
  if (!line) return
  editorEditingIndex.value = index
  editorEditDosage.value = line.dosage
  editorEditFrequency.value = line.frequency
  editorEditDays.value = line.days
}

function saveEditorEdit() {
  if (editorEditingIndex.value === null) return
  doctorStore.editorUpdateLine(editorEditingIndex.value, {
    dosage: editorEditDosage.value,
    frequency: editorEditFrequency.value as any,
    days: editorEditDays.value,
  })
  editorEditingIndex.value = null
}

function cancelEditorEdit() {
  editorEditingIndex.value = null
}
</script>

<template>
  <div class="prescription-view">
    <!-- Hint banner -->
    <div class="hint-banner">
      處方在「看診」頁面建立。請先到看診頁面選擇病人開始看診，即可在看診中開藥。此頁面用於查看歷史處方和管理常用處方範本。
    </div>

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
      <!-- New template button -->
      <div v-if="!doctorStore.isEditorOpen" class="section">
        <button class="btn btn-primary btn-full" @click="doctorStore.openTemplateEditor()">
          + 新增範本
        </button>
      </div>

      <!-- ===== Template Editor ===== -->
      <div v-if="doctorStore.isEditorOpen" class="section editor-section">
        <h3>{{ doctorStore.editingTemplateId ? '編輯範本' : '新增範本' }}</h3>

        <!-- Template name -->
        <input
          v-model="doctorStore.editorName"
          type="text"
          placeholder="範本名稱（如：冬天感冒方）"
          class="input"
        />

        <!-- Days selector -->
        <div class="editor-days-row">
          <span>天數:</span>
          <select v-model.number="doctorStore.editorTotalDays" @change="doctorStore.editorSetTotalDays(doctorStore.editorTotalDays)" class="days-select">
            <option v-for="d in [1,2,3,5,7,10,14,21,28]" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>

        <!-- Editor prescription lines -->
        <div v-if="doctorStore.editorLines.length === 0" class="empty-editor-lines">
          尚未加入藥品
        </div>
        <div v-else class="editor-lines">
          <div v-for="(line, i) in doctorStore.editorLines" :key="i" class="editor-line-item">
            <!-- Editing mode -->
            <div v-if="editorEditingIndex === i" class="edit-form">
              <div class="edit-header">{{ line.productName }}</div>
              <div class="edit-row">
                <label>劑量:</label>
                <input v-model.number="editorEditDosage" type="number" step="0.5" min="0.5" class="input-sm" /> g
              </div>
              <div class="edit-row">
                <label>頻率:</label>
                <div class="freq-options">
                  <button v-for="f in ['QD','BID','TID','QID']" :key="f"
                    class="freq-btn" :class="{ active: editorEditFrequency === f }"
                    @click="editorEditFrequency = f">{{ f }}</button>
                </div>
              </div>
              <div class="edit-row">
                <label>天數:</label>
                <input v-model.number="editorEditDays" type="number" min="1" max="28" class="input-sm" /> 天
              </div>
              <div class="edit-actions">
                <button class="btn btn-sm" @click="cancelEditorEdit">取消</button>
                <button class="btn btn-sm btn-primary" @click="saveEditorEdit">確認</button>
              </div>
            </div>
            <!-- Display mode -->
            <div v-else class="line-display" @click="openEditorEdit(i)">
              <div class="line-info">
                <div class="line-name">{{ line.productName }}</div>
                <div class="line-detail">
                  {{ line.dosage }}{{ line.unit }} {{ line.frequency }} x {{ line.days }}天 = {{ line.totalQuantity }}{{ line.unit }}
                </div>
              </div>
              <button class="btn btn-text btn-remove" @click.stop="doctorStore.editorRemoveMedicine(i)">✕</button>
            </div>
          </div>
        </div>

        <!-- Add medicine button -->
        <button class="btn btn-add" @click="showEditorSearch = true">
          + 新增藥品
        </button>

        <!-- Editor action buttons -->
        <div class="editor-actions">
          <button class="btn" @click="doctorStore.closeTemplateEditor()">取消</button>
          <button
            class="btn btn-primary"
            :disabled="doctorStore.isSaving || !doctorStore.editorName.trim() || doctorStore.editorLines.length === 0"
            @click="doctorStore.saveTemplateFromEditor()"
          >
            {{ doctorStore.isSaving ? '儲存中...' : '儲存範本' }}
          </button>
        </div>
      </div>

      <!-- ===== Template list ===== -->
      <div v-if="!doctorStore.isEditorOpen && doctorStore.templates.length === 0" class="empty-state">
        <p>尚無處方範本</p>
        <p class="hint">點擊上方「新增範本」建立常用處方組合</p>
      </div>

      <div v-if="!doctorStore.isEditorOpen && doctorStore.templates.length > 0" class="card-list">
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
                class="btn btn-sm btn-edit"
                @click="doctorStore.openTemplateEditor(tmpl)"
              >
                編輯
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

      <!-- Save current prescription as template (from active consultation) -->
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

    <!-- ==================== Medicine Search Modal (for editor) ==================== -->
    <div v-if="showEditorSearch" class="modal-overlay" @click.self="showEditorSearch = false">
      <div class="modal">
        <div class="modal-header">
          <h3>搜尋藥品</h3>
          <button class="btn btn-text" @click="showEditorSearch = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="search-input">
            <input
              v-model="editorSearchKeyword"
              type="text"
              placeholder="輸入藥品名稱或代碼..."
              class="input"
              @input="onEditorSearch"
              autofocus
            />
          </div>

          <div v-if="doctorStore.isSearching" class="loading-sm">搜尋中...</div>
          <div v-else-if="editorSearchKeyword && doctorStore.searchResults.length === 0" class="empty-sm">
            找不到「{{ editorSearchKeyword }}」
          </div>
          <div v-else-if="doctorStore.searchResults.length > 0" class="medicine-list">
            <div
              v-for="med in doctorStore.searchResults"
              :key="med.id"
              class="medicine-item"
              @click="editorAddMed(med)"
            >
              <div class="med-name">{{ med.name }}</div>
              <div class="med-code">{{ med.value }}</div>
            </div>
          </div>

          <div v-else-if="!editorSearchKeyword && doctorStore.medicines.length > 0">
            <div class="section-label">全部藥品</div>
            <div class="medicine-list">
              <div
                v-for="med in doctorStore.medicines"
                :key="med.id"
                class="medicine-item"
                @click="editorAddMed(med)"
              >
                <div class="med-name">{{ med.name }}</div>
                <div class="med-code">{{ med.value }}</div>
              </div>
            </div>
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

.hint-banner {
  background: #e3f2fd;
  color: #1565c0;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 1rem;
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

/* ===== Template Editor ===== */
.editor-section h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: #333;
}

.editor-days-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #666;
}

.days-select {
  padding: 0.375rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  min-height: 36px;
}

.empty-editor-lines {
  text-align: center;
  color: #999;
  font-size: 0.875rem;
  padding: 1.5rem 0;
}

.editor-lines {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  border: 1px solid #eee;
  border-radius: 0.5rem;
  overflow: hidden;
}

.editor-line-item {
  border-bottom: 1px solid #eee;
}

.editor-line-item:last-child {
  border-bottom: none;
}

/* ===== Line edit form ===== */
.edit-form { padding: 0.75rem; background: #f9f9f9; }
.edit-header { font-weight: 600; margin-bottom: 0.75rem; }
.edit-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.edit-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; }
.input-sm { width: 4rem; padding: 0.375rem; border: 1px solid #ddd; border-radius: 0.25rem; font-size: 0.875rem; text-align: center; }

/* ===== Frequency buttons ===== */
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

/* ===== Line display ===== */
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

/* ===== Add medicine / Editor actions ===== */
.btn-add {
  width: 100%;
  padding: 0.75rem;
  border: 2px dashed #ddd;
  border-radius: 0.5rem;
  color: #666;
  font-size: 0.875rem;
  background: transparent;
  cursor: pointer;
  margin-top: 0.75rem;
}
.btn-add:active { background: #f5f5f5; }

.editor-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.btn-edit {
  background: white;
  color: #9C27B0;
  border-color: #9C27B0;
}
.btn-edit:active { background: #F3E5F5; }

/* ===== Modal ===== */
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

/* ===== Search & Medicine list ===== */
.search-input { margin-bottom: 1rem; }
.loading-sm, .empty-sm { text-align: center; padding: 2rem; color: #666; }

.medicine-list { display: flex; flex-direction: column; gap: 0.25rem; }

.medicine-item {
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
}

.medicine-item:active { background: #f5f5f5; }

.med-name { font-weight: 500; }
.med-code { font-size: 0.75rem; color: #999; }
.section-label { font-size: 0.75rem; color: #999; margin-bottom: 0.5rem; }
</style>
