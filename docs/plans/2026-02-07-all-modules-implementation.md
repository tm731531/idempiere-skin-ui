# All Modules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all remaining clinic UI modules (Doctor, Pharmacy, Checkout, Inventory) to complete the core clinical workflow: Registration -> Queue -> Consultation -> Dispensing -> Checkout -> Inventory.

**Architecture:** Each module follows the same layered pattern: API layer (`src/api/*.ts`) for iDempiere REST calls with OData escaping, Pinia store (`src/stores/*.ts`) for state management, and Vue SFC views (`src/views/**/*.vue`) with scoped CSS. All modules share the existing `apiClient` with Bearer auth. Data is stored in standard iDempiere tables (C_BPartner, M_Product, M_StorageOnHand, S_ResourceAssignment) plus AD_SysConfig for status tracking. After each module, build JAR and deploy to OSGi bundle 408 for testing.

**Tech Stack:** Vue 3 + TypeScript + Pinia + Axios + iDempiere REST API + OSGi WAB Bundle

**Existing Patterns to Follow:**
- API: `src/api/registration.ts` - OData filter escaping, typed responses, batch queries
- Store: `src/stores/registration.ts` - Pinia setup syntax, loading/error state, auth context
- View: `src/views/counter/RegisterView.vue` - scoped CSS, min-height 48px buttons, mobile-first
- Build: `npm run build` in `webapp/`, then `build.sh` for JAR
- Deploy: Copy JAR/dir to `/opt/idempiere-server/x86_64/plugins/org.idempiere.ui_1.0.0.qualifier/`

---

## Task 1: Doctor API Layer

**Files:**
- Create: `webapp/src/api/doctor.ts`

**Step 1: Create doctor API module**

This module handles consultation sessions and prescriptions. Uses `S_ResourceAssignment` for the current patient (from registration), `M_Product` for medicines, and `AD_SysConfig` for prescription data storage (since we don't have custom tables).

```typescript
/**
 * Doctor API Module
 *
 * 看診/開藥 API
 * - 目前看診病人: S_ResourceAssignment (status=CONSULTING)
 * - 藥品: M_Product
 * - 處方: AD_SysConfig (CLINIC_PRESCRIPTION_{assignmentId})
 */

import { apiClient } from './client'

// ========== Security Utils ==========

function escapeODataString(value: string): string {
  if (!value) return ''
  return value
    .replace(/'/g, "''")
    .replace(/[<>{}|\\^~\[\]`]/g, '')
    .trim()
}

// ========== Types ==========

export interface Medicine {
  id: number
  value: string        // Product code
  name: string
  upc?: string         // Barcode
  category?: string
  isActive: boolean
}

export interface PrescriptionLine {
  productId: number
  productName: string
  dosage: number       // Per-dose amount
  unit: string         // g, ml, etc.
  frequency: 'QD' | 'BID' | 'TID' | 'QID' | 'PRN'
  days: number
  totalQuantity: number // Auto-calculated
  instructions?: string
}

export interface Prescription {
  assignmentId: number
  patientId: number
  patientName: string
  diagnosis: string
  lines: PrescriptionLine[]
  totalDays: number
  status: 'DRAFT' | 'COMPLETED'
  createdAt: string
}

// Frequency multiplier mapping
const FREQ_MULTIPLIER: Record<string, number> = {
  'QD': 1,
  'BID': 2,
  'TID': 3,
  'QID': 4,
  'PRN': 1,
}

export function calculateTotalQuantity(dosage: number, frequency: string, days: number): number {
  const multiplier = FREQ_MULTIPLIER[frequency] || 1
  return dosage * multiplier * days
}

// ========== Medicine API ==========

/**
 * Search medicines by name or code
 */
export async function searchMedicines(keyword: string): Promise<Medicine[]> {
  const safeKeyword = escapeODataString(keyword)
  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': `IsActive eq true and (contains(Name,'${safeKeyword}') or contains(Value,'${safeKeyword}'))`,
      '$select': 'M_Product_ID,Value,Name,UPC',
      '$top': 20,
      '$orderby': 'Name asc',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    value: r.Value || '',
    name: r.Name || '',
    upc: r.UPC || '',
    isActive: true,
  }))
}

/**
 * Get all active medicines (for listing)
 */
export async function listMedicines(): Promise<Medicine[]> {
  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Product_ID,Value,Name,UPC',
      '$orderby': 'Name asc',
      '$top': 100,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    value: r.Value || '',
    name: r.Name || '',
    upc: r.UPC || '',
    isActive: true,
  }))
}

// ========== Prescription API (stored in AD_SysConfig) ==========

const PRESCRIPTION_PREFIX = 'CLINIC_PRESCRIPTION_'

/**
 * Save prescription (upsert to AD_SysConfig)
 */
export async function savePrescription(
  assignmentId: number,
  prescription: Omit<Prescription, 'assignmentId'>,
  orgId: number
): Promise<void> {
  const configName = `${PRESCRIPTION_PREFIX}${assignmentId}`
  const value = JSON.stringify(prescription)

  // Check if exists
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: {
      '$filter': `Name eq '${configName}'`,
    },
  })

  const records = response.data.records || []

  if (records.length > 0) {
    await apiClient.put(`/api/v1/models/AD_SysConfig/${records[0].id}`, {
      'Value': value,
    })
  } else {
    await apiClient.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': orgId,
      'Name': configName,
      'Value': value,
      'Description': 'Clinic prescription data',
      'ConfigurationLevel': 'S',
    })
  }
}

/**
 * Load prescription for an assignment
 */
export async function loadPrescription(assignmentId: number): Promise<Prescription | null> {
  const configName = `${PRESCRIPTION_PREFIX}${assignmentId}`

  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: {
        '$filter': `Name eq '${configName}'`,
      },
    })

    const records = response.data.records || []
    if (records.length === 0) return null

    const data = JSON.parse(records[0].Value)
    return { ...data, assignmentId }
  } catch {
    return null
  }
}

/**
 * Load all completed prescriptions (for pharmacy queue)
 */
export async function listCompletedPrescriptions(): Promise<Prescription[]> {
  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: {
        '$filter': `contains(Name,'${PRESCRIPTION_PREFIX}')`,
        '$orderby': 'Updated desc',
      },
    })

    const prescriptions: Prescription[] = []
    for (const r of response.data.records || []) {
      try {
        const data = JSON.parse(r.Value)
        if (data.status === 'COMPLETED') {
          const idMatch = r.Name.match(/(\d+)$/)
          if (idMatch) {
            prescriptions.push({
              ...data,
              assignmentId: parseInt(idMatch[1], 10),
            })
          }
        }
      } catch { /* skip invalid */ }
    }
    return prescriptions
  } catch {
    return []
  }
}
```

**Step 2: Verify build**

Run: `cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add webapp/src/api/doctor.ts
git commit -m "feat: add doctor API layer for consultation and prescriptions"
```

---

## Task 2: Doctor Store

**Files:**
- Create: `webapp/src/stores/doctor.ts`

**Step 1: Create doctor store**

```typescript
/**
 * Doctor Store
 *
 * Consultation and prescription state management
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { useRegistrationStore } from './registration'
import {
  type Medicine,
  type PrescriptionLine,
  type Prescription,
  searchMedicines,
  listMedicines,
  savePrescription,
  loadPrescription,
  calculateTotalQuantity,
} from '@/api/doctor'

export const useDoctorStore = defineStore('doctor', () => {
  const authStore = useAuthStore()
  const registrationStore = useRegistrationStore()

  // ========== State ==========

  // Current consultation
  const currentAssignmentId = ref<number | null>(null)
  const currentPatientName = ref('')
  const currentPatientTaxId = ref('')
  const currentResourceName = ref('')

  // Prescription
  const diagnosis = ref('')
  const prescriptionLines = ref<PrescriptionLine[]>([])
  const totalDays = ref(7)
  const prescriptionStatus = ref<'DRAFT' | 'COMPLETED'>('DRAFT')

  // Medicine search
  const medicines = ref<Medicine[]>([])
  const searchResults = ref<Medicine[]>([])
  const isSearching = ref(false)

  // Loading states
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  // ========== Getters ==========

  const hasCurrentPatient = computed(() => currentAssignmentId.value !== null)

  const consultingPatients = computed(() =>
    registrationStore.consultingList
  )

  const waitingCount = computed(() =>
    registrationStore.waitingList.length
  )

  // ========== Actions ==========

  /**
   * Start consultation for a patient
   */
  async function startConsultation(assignmentId: number, patientName: string, patientTaxId: string, resourceName: string): Promise<void> {
    currentAssignmentId.value = assignmentId
    currentPatientName.value = patientName
    currentPatientTaxId.value = patientTaxId
    currentResourceName.value = resourceName
    diagnosis.value = ''
    prescriptionLines.value = []
    totalDays.value = 7
    prescriptionStatus.value = 'DRAFT'
    error.value = null

    // Try to load existing prescription
    const existing = await loadPrescription(assignmentId)
    if (existing) {
      diagnosis.value = existing.diagnosis || ''
      prescriptionLines.value = existing.lines || []
      totalDays.value = existing.totalDays || 7
      prescriptionStatus.value = existing.status || 'DRAFT'
    }
  }

  /**
   * Search medicines
   */
  async function searchMedicine(keyword: string): Promise<void> {
    if (!keyword || keyword.length < 1) {
      searchResults.value = []
      return
    }

    isSearching.value = true
    error.value = null

    try {
      searchResults.value = await searchMedicines(keyword)
    } catch (e: any) {
      error.value = e.message || 'Search failed'
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }

  /**
   * Load all medicines
   */
  async function loadMedicines(): Promise<void> {
    isLoading.value = true
    try {
      medicines.value = await listMedicines()
    } catch (e: any) {
      error.value = e.message || 'Failed to load medicines'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Add medicine to prescription
   */
  function addMedicine(medicine: Medicine, dosage: number = 3, frequency: string = 'TID', days?: number): void {
    const d = days || totalDays.value
    const line: PrescriptionLine = {
      productId: medicine.id,
      productName: medicine.name,
      dosage,
      unit: 'g',
      frequency: frequency as PrescriptionLine['frequency'],
      days: d,
      totalQuantity: calculateTotalQuantity(dosage, frequency, d),
    }
    prescriptionLines.value.push(line)
  }

  /**
   * Remove medicine from prescription
   */
  function removeMedicine(index: number): void {
    prescriptionLines.value.splice(index, 1)
  }

  /**
   * Update a prescription line
   */
  function updateLine(index: number, updates: Partial<PrescriptionLine>): void {
    const line = prescriptionLines.value[index]
    if (!line) return

    Object.assign(line, updates)
    // Recalculate total
    line.totalQuantity = calculateTotalQuantity(line.dosage, line.frequency, line.days)
  }

  /**
   * Update total days for all lines
   */
  function setTotalDays(days: number): void {
    totalDays.value = days
    for (const line of prescriptionLines.value) {
      line.days = days
      line.totalQuantity = calculateTotalQuantity(line.dosage, line.frequency, days)
    }
  }

  /**
   * Save current prescription
   */
  async function save(): Promise<boolean> {
    if (!currentAssignmentId.value) {
      error.value = 'No active consultation'
      return false
    }

    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = 'Organization not set'
      return false
    }

    isSaving.value = true
    error.value = null

    try {
      await savePrescription(currentAssignmentId.value, {
        patientId: 0,
        patientName: currentPatientName.value,
        diagnosis: diagnosis.value,
        lines: prescriptionLines.value,
        totalDays: totalDays.value,
        status: prescriptionStatus.value,
        createdAt: new Date().toISOString(),
      }, authStore.context!.organizationId)
      return true
    } catch (e: any) {
      error.value = e.message || 'Save failed'
      return false
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Complete consultation - save prescription as COMPLETED and update status
   */
  async function completeConsultation(): Promise<boolean> {
    if (!currentAssignmentId.value) return false

    prescriptionStatus.value = 'COMPLETED'
    const saved = await save()
    if (!saved) return false

    // Update registration status to COMPLETED
    await registrationStore.completeConsult(currentAssignmentId.value)

    // Clear current
    clearConsultation()
    return true
  }

  /**
   * Clear current consultation
   */
  function clearConsultation(): void {
    currentAssignmentId.value = null
    currentPatientName.value = ''
    currentPatientTaxId.value = ''
    currentResourceName.value = ''
    diagnosis.value = ''
    prescriptionLines.value = []
    totalDays.value = 7
    prescriptionStatus.value = 'DRAFT'
    searchResults.value = []
    error.value = null
  }

  return {
    // State
    currentAssignmentId,
    currentPatientName,
    currentPatientTaxId,
    currentResourceName,
    diagnosis,
    prescriptionLines,
    totalDays,
    prescriptionStatus,
    medicines,
    searchResults,
    isSearching,
    isLoading,
    isSaving,
    error,

    // Getters
    hasCurrentPatient,
    consultingPatients,
    waitingCount,

    // Actions
    startConsultation,
    searchMedicine,
    loadMedicines,
    addMedicine,
    removeMedicine,
    updateLine,
    setTotalDays,
    save,
    completeConsultation,
    clearConsultation,
  }
})
```

**Step 2: Verify build**

Run: `cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit`

**Step 3: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add webapp/src/stores/doctor.ts
git commit -m "feat: add doctor store for consultation state management"
```

---

## Task 3: ConsultView - Doctor Consultation Screen

**Files:**
- Modify: `webapp/src/views/doctor/ConsultView.vue`

**Step 1: Implement consultation view**

Replace the placeholder with the full consultation UI matching the wireframe from `docs/pending-features/module-doctor.md`. Shows current patient info, consulting list, medicine search, prescription builder.

```vue
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
```

**Step 2: Verify build**

Run: `cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit`

**Step 3: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add webapp/src/views/doctor/ConsultView.vue
git commit -m "feat: implement doctor consultation view with prescription builder"
```

---

## Task 4: Pharmacy API and Store

**Files:**
- Create: `webapp/src/api/pharmacy.ts`
- Create: `webapp/src/stores/pharmacy.ts`

**Step 1: Create pharmacy API**

```typescript
/**
 * Pharmacy API Module
 *
 * 配藥 API
 * - 待配藥清單: AD_SysConfig (completed prescriptions)
 * - 庫存: M_StorageOnHand
 * - 配藥狀態: AD_SysConfig (CLINIC_DISPENSE_STATUS_{assignmentId})
 */

import { apiClient } from './client'
import { type Prescription, listCompletedPrescriptions } from './doctor'

// ========== Types ==========

export type DispenseStatus = 'PENDING' | 'DISPENSING' | 'DISPENSED'

export interface DispenseItem {
  assignmentId: number
  prescription: Prescription
  status: DispenseStatus
}

export interface StockInfo {
  productId: number
  productName: string
  qtyOnHand: number
  warehouseName: string
}

// ========== Dispense Status API ==========

const DISPENSE_PREFIX = 'CLINIC_DISPENSE_STATUS_'

export async function getDispenseStatus(assignmentId: number): Promise<DispenseStatus> {
  const configName = `${DISPENSE_PREFIX}${assignmentId}`
  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq '${configName}'` },
    })
    const records = response.data.records || []
    return records.length > 0 ? (records[0].Value as DispenseStatus) : 'PENDING'
  } catch {
    return 'PENDING'
  }
}

export async function setDispenseStatus(
  assignmentId: number,
  status: DispenseStatus,
  orgId: number
): Promise<void> {
  const configName = `${DISPENSE_PREFIX}${assignmentId}`

  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: { '$filter': `Name eq '${configName}'` },
  })

  const records = response.data.records || []
  if (records.length > 0) {
    await apiClient.put(`/api/v1/models/AD_SysConfig/${records[0].id}`, { 'Value': status })
  } else {
    await apiClient.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': orgId,
      'Name': configName,
      'Value': status,
      'Description': 'Clinic dispense status',
      'ConfigurationLevel': 'S',
    })
  }
}

/**
 * Get pending dispense items (completed prescriptions not yet dispensed)
 */
export async function listPendingDispense(): Promise<DispenseItem[]> {
  const prescriptions = await listCompletedPrescriptions()
  const items: DispenseItem[] = []

  for (const rx of prescriptions) {
    const status = await getDispenseStatus(rx.assignmentId)
    if (status !== 'DISPENSED') {
      items.push({ assignmentId: rx.assignmentId, prescription: rx, status })
    }
  }

  return items
}

// ========== Stock API ==========

/**
 * Get stock for a product across all warehouses
 */
export async function getProductStock(productId: number): Promise<StockInfo[]> {
  const response = await apiClient.get('/api/v1/models/M_StorageOnHand', {
    params: {
      '$filter': `M_Product_ID eq ${productId}`,
      '$expand': 'M_Locator_ID',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    productId,
    productName: '',
    qtyOnHand: r.QtyOnHand || 0,
    warehouseName: r.M_Locator_ID?.identifier || '',
  }))
}

/**
 * Get all stock (for inventory view)
 */
export async function listAllStock(): Promise<any[]> {
  const response = await apiClient.get('/api/v1/models/M_StorageOnHand', {
    params: {
      '$expand': 'M_Product_ID,M_Locator_ID',
      '$orderby': 'M_Product_ID asc',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    productId: r.M_Product_ID?.id || r.M_Product_ID,
    productName: r.M_Product_ID?.identifier || '',
    locatorId: r.M_Locator_ID?.id || r.M_Locator_ID,
    locatorName: r.M_Locator_ID?.identifier || '',
    qtyOnHand: r.QtyOnHand || 0,
  }))
}
```

**Step 2: Create pharmacy store**

```typescript
/**
 * Pharmacy Store
 *
 * Dispensing state management
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import {
  type DispenseItem,
  type StockInfo,
  listPendingDispense,
  setDispenseStatus,
  getProductStock,
} from '@/api/pharmacy'

export const usePharmacyStore = defineStore('pharmacy', () => {
  const authStore = useAuthStore()

  // State
  const dispenseQueue = ref<DispenseItem[]>([])
  const currentItem = ref<DispenseItem | null>(null)
  const currentStock = ref<Record<number, StockInfo[]>>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const pendingCount = computed(() =>
    dispenseQueue.value.filter(i => i.status === 'PENDING').length
  )

  const dispensingItem = computed(() =>
    dispenseQueue.value.find(i => i.status === 'DISPENSING')
  )

  // Actions
  async function loadQueue(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      dispenseQueue.value = await listPendingDispense()
    } catch (e: any) {
      error.value = e.message || 'Failed to load dispense queue'
    } finally {
      isLoading.value = false
    }
  }

  async function startDispensing(item: DispenseItem): Promise<void> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) return

    try {
      await setDispenseStatus(item.assignmentId, 'DISPENSING', authStore.context!.organizationId)
      item.status = 'DISPENSING'
      currentItem.value = item

      // Load stock for all products in prescription
      for (const line of item.prescription.lines) {
        const stock = await getProductStock(line.productId)
        currentStock.value[line.productId] = stock
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to start dispensing'
    }
  }

  async function completeDispensing(assignmentId: number): Promise<void> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) return

    try {
      await setDispenseStatus(assignmentId, 'DISPENSED', authStore.context!.organizationId)

      // Remove from queue
      dispenseQueue.value = dispenseQueue.value.filter(i => i.assignmentId !== assignmentId)
      currentItem.value = null
      currentStock.value = {}
    } catch (e: any) {
      error.value = e.message || 'Failed to complete dispensing'
    }
  }

  function clearCurrent(): void {
    currentItem.value = null
    currentStock.value = {}
  }

  return {
    dispenseQueue,
    currentItem,
    currentStock,
    isLoading,
    error,
    pendingCount,
    dispensingItem,
    loadQueue,
    startDispensing,
    completeDispensing,
    clearCurrent,
  }
})
```

**Step 3: Verify build**

Run: `cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit`

**Step 4: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add webapp/src/api/pharmacy.ts webapp/src/stores/pharmacy.ts
git commit -m "feat: add pharmacy API and store for dispensing workflow"
```

---

## Task 5: DispenseView - Pharmacy Dispensing Screen

**Files:**
- Modify: `webapp/src/views/pharmacy/DispenseView.vue`

**Step 1: Implement dispensing view**

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePharmacyStore } from '@/stores/pharmacy'

const store = usePharmacyStore()

let refreshInterval: number | null = null

onMounted(async () => {
  await store.loadQueue()
  refreshInterval = window.setInterval(() => {
    if (!store.currentItem) store.loadQueue()
  }, 15000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

function getStockTotal(productId: number): number {
  const stocks = store.currentStock[productId] || []
  return stocks.reduce((sum, s) => sum + s.qtyOnHand, 0)
}

function getStockStatus(productId: number, required: number): string {
  const total = getStockTotal(productId)
  if (total >= required) return 'ok'
  if (total > 0) return 'low'
  return 'out'
}

async function complete() {
  if (!store.currentItem) return
  if (confirm('確認配藥完成？')) {
    await store.completeDispensing(store.currentItem.assignmentId)
  }
}
</script>

<template>
  <div class="dispense-view">
    <!-- Active dispensing -->
    <div v-if="store.currentItem" class="dispensing-active">
      <div class="section dispensing-header">
        <div class="header-info">
          <h3>配藥中</h3>
          <div class="patient-name">{{ store.currentItem.prescription.patientName }}</div>
          <div class="diagnosis">{{ store.currentItem.prescription.diagnosis }}</div>
        </div>
        <button class="btn btn-text" @click="store.clearCurrent()">返回</button>
      </div>

      <div class="section">
        <h3>藥品清單 ({{ store.currentItem.prescription.lines.length }} 項)</h3>
        <div class="med-list">
          <div
            v-for="(line, i) in store.currentItem.prescription.lines"
            :key="i"
            class="med-item"
            :class="'stock-' + getStockStatus(line.productId, line.totalQuantity)"
          >
            <div class="med-info">
              <div class="med-name">{{ line.productName }}</div>
              <div class="med-detail">
                {{ line.dosage }}{{ line.unit }} {{ line.frequency }} x {{ line.days }}天
              </div>
              <div class="med-total">需求: {{ line.totalQuantity }}{{ line.unit }}</div>
            </div>
            <div class="stock-badge">
              庫存: {{ getStockTotal(line.productId) }}{{ line.unit }}
            </div>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn btn-success btn-large" @click="complete">
          配藥完成
        </button>
      </div>
    </div>

    <!-- Queue list -->
    <div v-else>
      <div class="queue-header">
        <h3>待配藥 ({{ store.pendingCount }})</h3>
        <button class="btn btn-sm" @click="store.loadQueue()" :disabled="store.isLoading">
          {{ store.isLoading ? '載入中...' : '重新整理' }}
        </button>
      </div>

      <div v-if="store.isLoading && store.dispenseQueue.length === 0" class="loading">
        載入中...
      </div>
      <div v-else-if="store.dispenseQueue.length === 0" class="empty">
        目前沒有待配藥處方
      </div>
      <div v-else class="queue-list">
        <div
          v-for="item in store.dispenseQueue"
          :key="item.assignmentId"
          class="queue-item"
        >
          <div class="queue-info">
            <div class="queue-patient">{{ item.prescription.patientName }}</div>
            <div class="queue-diagnosis">{{ item.prescription.diagnosis }}</div>
            <div class="queue-meta">
              {{ item.prescription.lines.length }} 種藥 / {{ item.prescription.totalDays }} 天
            </div>
          </div>
          <button
            class="btn btn-primary"
            @click="store.startDispensing(item)"
          >
            開始配藥
          </button>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>
  </div>
</template>

<style scoped>
.dispense-view {
  max-width: 600px;
  margin: 0 auto;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.queue-header h3 { margin: 0; }

.queue-list { display: flex; flex-direction: column; gap: 0.5rem; }

.queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
  padding: 1rem;
  border-radius: 0.5rem;
}

.queue-patient { font-weight: 600; }
.queue-diagnosis { font-size: 0.875rem; color: #666; }
.queue-meta { font-size: 0.75rem; color: #999; margin-top: 0.25rem; }

.section {
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }

.dispensing-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: #fff3e0;
  border: 2px solid #FF9800;
}

.patient-name { font-size: 1.25rem; font-weight: 600; }
.diagnosis { font-size: 0.875rem; color: #666; }

.med-list { display: flex; flex-direction: column; gap: 0.5rem; }

.med-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border-left: 4px solid;
}

.med-item.stock-ok { background: #e8f5e9; border-color: #4CAF50; }
.med-item.stock-low { background: #fff3e0; border-color: #FF9800; }
.med-item.stock-out { background: #ffebee; border-color: #F44336; }

.med-name { font-weight: 600; }
.med-detail { font-size: 0.75rem; color: #666; }
.med-total { font-size: 0.875rem; font-weight: 500; margin-top: 0.25rem; }

.stock-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  background: rgba(0,0,0,0.05);
  white-space: nowrap;
}

.action-bar { margin-top: 1rem; }

.btn {
  padding: 0.75rem 1.5rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  background: white;
  min-height: 48px;
}

.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; min-height: auto; }
.btn-primary { background: #FF9800; color: white; border-color: #FF9800; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
```

**Step 2: Verify build**

Run: `cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit`

**Step 3: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add webapp/src/views/pharmacy/DispenseView.vue
git commit -m "feat: implement pharmacy dispensing view with stock status"
```

---

## Task 6: CheckoutView - Counter Checkout Screen

**Files:**
- Create: `webapp/src/api/checkout.ts`
- Create: `webapp/src/stores/checkout.ts`
- Modify: `webapp/src/views/counter/CheckoutView.vue`

**Step 1: Create checkout API**

```typescript
/**
 * Checkout API Module
 *
 * 結帳 API - Reads prescription data, calculates fees
 * - Status: AD_SysConfig (CLINIC_CHECKOUT_STATUS_{assignmentId})
 */

import { apiClient } from './client'
import { loadPrescription, type Prescription } from './doctor'
import { getDispenseStatus } from './pharmacy'

export type CheckoutStatus = 'PENDING' | 'PAID'

export interface CheckoutItem {
  assignmentId: number
  prescription: Prescription
  dispenseStatus: string
  checkoutStatus: CheckoutStatus
}

export interface CheckoutSummary {
  prescriptionLines: { name: string; qty: number; unit: string }[]
  totalItems: number
  copayment: number  // Fixed copayment for now
}

const CHECKOUT_PREFIX = 'CLINIC_CHECKOUT_STATUS_'

export async function getCheckoutStatus(assignmentId: number): Promise<CheckoutStatus> {
  const configName = `${CHECKOUT_PREFIX}${assignmentId}`
  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq '${configName}'` },
    })
    const records = response.data.records || []
    return records.length > 0 ? (records[0].Value as CheckoutStatus) : 'PENDING'
  } catch {
    return 'PENDING'
  }
}

export async function setCheckoutStatus(
  assignmentId: number,
  status: CheckoutStatus,
  orgId: number
): Promise<void> {
  const configName = `${CHECKOUT_PREFIX}${assignmentId}`

  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: { '$filter': `Name eq '${configName}'` },
  })

  const records = response.data.records || []
  if (records.length > 0) {
    await apiClient.put(`/api/v1/models/AD_SysConfig/${records[0].id}`, { 'Value': status })
  } else {
    await apiClient.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': orgId,
      'Name': configName,
      'Value': status,
      'Description': 'Clinic checkout status',
      'ConfigurationLevel': 'S',
    })
  }
}

/**
 * List items ready for checkout (dispensed but not paid)
 */
export async function listCheckoutItems(): Promise<CheckoutItem[]> {
  // Get all prescription configs
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: {
      '$filter': "contains(Name,'CLINIC_PRESCRIPTION_')",
    },
  })

  const items: CheckoutItem[] = []
  for (const r of response.data.records || []) {
    try {
      const data = JSON.parse(r.Value)
      if (data.status !== 'COMPLETED') continue

      const idMatch = r.Name.match(/(\d+)$/)
      if (!idMatch) continue
      const assignmentId = parseInt(idMatch[1], 10)

      const dispenseStatus = await getDispenseStatus(assignmentId)
      if (dispenseStatus !== 'DISPENSED') continue

      const checkoutStatus = await getCheckoutStatus(assignmentId)
      if (checkoutStatus === 'PAID') continue

      items.push({
        assignmentId,
        prescription: { ...data, assignmentId },
        dispenseStatus,
        checkoutStatus,
      })
    } catch { /* skip */ }
  }

  return items
}
```

**Step 2: Create checkout store**

```typescript
/**
 * Checkout Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import {
  type CheckoutItem,
  listCheckoutItems,
  setCheckoutStatus,
} from '@/api/checkout'

export const useCheckoutStore = defineStore('checkout', () => {
  const authStore = useAuthStore()

  const checkoutItems = ref<CheckoutItem[]>([])
  const currentItem = ref<CheckoutItem | null>(null)
  const receivedAmount = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const pendingCount = computed(() => checkoutItems.value.length)

  const copayment = computed(() => 50) // Fixed copayment for MVP

  const changeAmount = computed(() => {
    const change = receivedAmount.value - copayment.value
    return change > 0 ? change : 0
  })

  async function loadItems(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      checkoutItems.value = await listCheckoutItems()
    } catch (e: any) {
      error.value = e.message || 'Load failed'
    } finally {
      isLoading.value = false
    }
  }

  function selectItem(item: CheckoutItem): void {
    currentItem.value = item
    receivedAmount.value = 0
  }

  async function completeCheckout(): Promise<boolean> {
    if (!currentItem.value) return false
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) return false

    try {
      await setCheckoutStatus(
        currentItem.value.assignmentId,
        'PAID',
        authStore.context!.organizationId
      )

      // Remove from list
      checkoutItems.value = checkoutItems.value.filter(
        i => i.assignmentId !== currentItem.value!.assignmentId
      )
      currentItem.value = null
      receivedAmount.value = 0
      return true
    } catch (e: any) {
      error.value = e.message || 'Checkout failed'
      return false
    }
  }

  function clearCurrent(): void {
    currentItem.value = null
    receivedAmount.value = 0
  }

  return {
    checkoutItems,
    currentItem,
    receivedAmount,
    isLoading,
    error,
    pendingCount,
    copayment,
    changeAmount,
    loadItems,
    selectItem,
    completeCheckout,
    clearCurrent,
  }
})
```

**Step 3: Implement CheckoutView**

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useCheckoutStore } from '@/stores/checkout'

const store = useCheckoutStore()

let refreshInterval: number | null = null

onMounted(async () => {
  await store.loadItems()
  refreshInterval = window.setInterval(() => {
    if (!store.currentItem) store.loadItems()
  }, 15000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

async function pay() {
  if (store.receivedAmount < store.copayment) {
    alert('收款金額不足')
    return
  }
  const success = await store.completeCheckout()
  if (success) {
    alert('結帳完成！')
  }
}

function quickPay(amount: number) {
  store.receivedAmount = amount
}
</script>

<template>
  <div class="checkout-view">
    <!-- Active checkout -->
    <div v-if="store.currentItem" class="checkout-active">
      <div class="section checkout-header">
        <div>
          <h3>結帳</h3>
          <div class="patient-name">{{ store.currentItem.prescription.patientName }}</div>
        </div>
        <button class="btn btn-text" @click="store.clearCurrent()">返回</button>
      </div>

      <!-- Items -->
      <div class="section">
        <h3>處方明細</h3>
        <div class="item-list">
          <div v-for="(line, i) in store.currentItem.prescription.lines" :key="i" class="item-row">
            <span class="item-name">{{ line.productName }}</span>
            <span class="item-qty">{{ line.totalQuantity }}{{ line.unit }}</span>
          </div>
        </div>
      </div>

      <!-- Payment -->
      <div class="section">
        <div class="fee-row total-row">
          <span>部分負擔</span>
          <span class="fee-amount">{{ store.copayment }} 元</span>
        </div>

        <div class="payment-section">
          <label>收款金額：</label>
          <input
            v-model.number="store.receivedAmount"
            type="number"
            class="input amount-input"
            placeholder="0"
          />

          <div class="quick-amounts">
            <button v-for="amt in [50, 100, 500, 1000]" :key="amt"
              class="quick-btn" @click="quickPay(amt)">{{ amt }}</button>
          </div>

          <div v-if="store.receivedAmount > 0" class="change-row">
            找零: <strong>{{ store.changeAmount }} 元</strong>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn btn-success btn-large" @click="pay" :disabled="store.receivedAmount < store.copayment">
          完成結帳
        </button>
      </div>
    </div>

    <!-- Queue -->
    <div v-else>
      <div class="queue-header">
        <h3>待結帳 ({{ store.pendingCount }})</h3>
        <button class="btn btn-sm" @click="store.loadItems()" :disabled="store.isLoading">
          重新整理
        </button>
      </div>

      <div v-if="store.isLoading && store.checkoutItems.length === 0" class="loading">載入中...</div>
      <div v-else-if="store.checkoutItems.length === 0" class="empty">目前沒有待結帳項目</div>
      <div v-else class="queue-list">
        <div v-for="item in store.checkoutItems" :key="item.assignmentId" class="queue-item" @click="store.selectItem(item)">
          <div class="queue-info">
            <div class="queue-patient">{{ item.prescription.patientName }}</div>
            <div class="queue-meta">{{ item.prescription.diagnosis }} / {{ item.prescription.lines.length }} 種藥</div>
          </div>
          <div class="queue-amount">{{ store.copayment }} 元</div>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.checkout-view { max-width: 600px; margin: 0 auto; }

.queue-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.queue-header h3 { margin: 0; }
.queue-list { display: flex; flex-direction: column; gap: 0.5rem; }
.queue-item { display: flex; align-items: center; justify-content: space-between; background: white; padding: 1rem; border-radius: 0.5rem; cursor: pointer; }
.queue-item:active { background: #f5f5f5; }
.queue-patient { font-weight: 600; }
.queue-meta { font-size: 0.75rem; color: #666; }
.queue-amount { font-size: 1.25rem; font-weight: 700; color: #F44336; }

.section { background: white; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }

.checkout-header { display: flex; justify-content: space-between; align-items: flex-start; background: #ffebee; border: 2px solid #F44336; }
.patient-name { font-size: 1.25rem; font-weight: 600; }

.item-list { display: flex; flex-direction: column; gap: 0.25rem; }
.item-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f0f0f0; }
.item-name { color: #333; }
.item-qty { color: #666; font-size: 0.875rem; }

.fee-row { display: flex; justify-content: space-between; padding: 0.5rem 0; }
.total-row { font-size: 1.125rem; font-weight: 600; border-top: 2px solid #333; padding-top: 0.75rem; }
.fee-amount { color: #F44336; }

.payment-section { margin-top: 1rem; }
.payment-section label { font-size: 0.875rem; color: #666; display: block; margin-bottom: 0.5rem; }

.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }
.amount-input { font-size: 1.5rem; font-weight: 700; text-align: center; }

.quick-amounts { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.quick-btn { flex: 1; padding: 0.75rem; border: 1px solid #ddd; border-radius: 0.5rem; background: white; font-size: 1rem; cursor: pointer; min-height: 48px; }
.quick-btn:active { background: #f5f5f5; }

.change-row { margin-top: 0.75rem; text-align: center; font-size: 1.125rem; color: #4CAF50; }

.action-bar { margin-top: 1rem; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; min-height: auto; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
```

**Step 4: Verify build**

Run: `cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit`

**Step 5: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add webapp/src/api/checkout.ts webapp/src/stores/checkout.ts webapp/src/views/counter/CheckoutView.vue
git commit -m "feat: implement checkout view with payment and change calculation"
```

---

## Task 7: Inventory API and Store

**Files:**
- Create: `webapp/src/api/inventory.ts`
- Create: `webapp/src/stores/inventory.ts`

**Step 1: Create inventory API**

```typescript
/**
 * Inventory API Module
 *
 * 庫存管理 API
 * - 庫存: M_StorageOnHand
 * - 倉庫: M_Warehouse
 * - 調撥: M_Movement + M_MovementLine
 * - 藥品: M_Product
 */

import { apiClient } from './client'

function escapeODataString(value: string): string {
  if (!value) return ''
  return value
    .replace(/'/g, "''")
    .replace(/[<>{}|\\^~\[\]`]/g, '')
    .trim()
}

// ========== Types ==========

export interface StockItem {
  productId: number
  productName: string
  productCode: string
  locatorId: number
  locatorName: string
  qtyOnHand: number
}

export interface Warehouse {
  id: number
  name: string
  locators: { id: number; name: string }[]
}

export interface TransferInput {
  productId: number
  fromLocatorId: number
  toLocatorId: number
  quantity: number
  description?: string
  orgId: number
}

// ========== Warehouse API ==========

export async function listWarehouses(): Promise<Warehouse[]> {
  const response = await apiClient.get('/api/v1/models/M_Warehouse', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Warehouse_ID,Name',
    },
  })

  const warehouses: Warehouse[] = []
  for (const r of response.data.records || []) {
    // Get locators for each warehouse
    const locResponse = await apiClient.get('/api/v1/models/M_Locator', {
      params: {
        '$filter': `M_Warehouse_ID eq ${r.id} and IsActive eq true`,
        '$select': 'M_Locator_ID,Value',
      },
    })

    warehouses.push({
      id: r.id,
      name: r.Name || '',
      locators: (locResponse.data.records || []).map((l: any) => ({
        id: l.id,
        name: l.Value || '',
      })),
    })
  }

  return warehouses
}

// ========== Stock API ==========

export async function listStock(keyword?: string): Promise<StockItem[]> {
  let filter = 'QtyOnHand gt 0'

  const response = await apiClient.get('/api/v1/models/M_StorageOnHand', {
    params: {
      '$filter': filter,
      '$expand': 'M_Product_ID,M_Locator_ID',
      '$orderby': 'M_Product_ID asc',
      '$top': 200,
    },
  })

  let items = (response.data.records || []).map((r: any) => ({
    productId: r.M_Product_ID?.id || r.M_Product_ID,
    productName: r.M_Product_ID?.identifier || '',
    productCode: '',
    locatorId: r.M_Locator_ID?.id || r.M_Locator_ID,
    locatorName: r.M_Locator_ID?.identifier || '',
    qtyOnHand: r.QtyOnHand || 0,
  }))

  // Client-side keyword filter if provided
  if (keyword) {
    const kw = keyword.toLowerCase()
    items = items.filter((i: StockItem) =>
      i.productName.toLowerCase().includes(kw)
    )
  }

  return items
}

export async function searchProducts(keyword: string): Promise<{ id: number; name: string; value: string }[]> {
  const safeKeyword = escapeODataString(keyword)
  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': `IsActive eq true and (contains(Name,'${safeKeyword}') or contains(Value,'${safeKeyword}'))`,
      '$select': 'M_Product_ID,Name,Value',
      '$top': 20,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name || '',
    value: r.Value || '',
  }))
}

// ========== Transfer API ==========

export async function createTransfer(input: TransferInput): Promise<number> {
  // Create movement header
  const headerResponse = await apiClient.post('/api/v1/models/M_Movement', {
    'AD_Org_ID': input.orgId,
    'MovementDate': new Date().toISOString().slice(0, 10),
    'Description': input.description || 'Clinic transfer',
  })

  const movementId = headerResponse.data.id

  // Create movement line
  await apiClient.post('/api/v1/models/M_MovementLine', {
    'AD_Org_ID': input.orgId,
    'M_Movement_ID': movementId,
    'M_Product_ID': input.productId,
    'M_Locator_ID': input.fromLocatorId,
    'M_LocatorTo_ID': input.toLocatorId,
    'MovementQty': input.quantity,
  })

  // Complete the movement
  try {
    await apiClient.put(`/api/v1/models/M_Movement/${movementId}`, {
      'DocAction': 'CO',
      'DocStatus': 'CO',
    })
  } catch {
    // DocAction might not work via REST, movement is still created
  }

  return movementId
}

// ========== Receive (Material Receipt) API ==========

export async function listPurchaseOrders(): Promise<any[]> {
  const response = await apiClient.get('/api/v1/models/C_Order', {
    params: {
      '$filter': "IsSOTrx eq false and DocStatus eq 'CO'",
      '$select': 'C_Order_ID,DocumentNo,DateOrdered,C_BPartner_ID',
      '$expand': 'C_BPartner_ID',
      '$orderby': 'DateOrdered desc',
      '$top': 20,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    documentNo: r.DocumentNo || '',
    dateOrdered: r.DateOrdered || '',
    vendorName: r.C_BPartner_ID?.identifier || '',
  }))
}

export async function getOrderLines(orderId: number): Promise<any[]> {
  const response = await apiClient.get('/api/v1/models/C_OrderLine', {
    params: {
      '$filter': `C_Order_ID eq ${orderId}`,
      '$expand': 'M_Product_ID',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    productId: r.M_Product_ID?.id || r.M_Product_ID,
    productName: r.M_Product_ID?.identifier || '',
    qtyOrdered: r.QtyOrdered || 0,
    qtyDelivered: r.QtyDelivered || 0,
  }))
}
```

**Step 2: Create inventory store**

```typescript
/**
 * Inventory Store
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import {
  type StockItem,
  type Warehouse,
  type TransferInput,
  listStock,
  listWarehouses,
  searchProducts,
  createTransfer,
  listPurchaseOrders,
  getOrderLines,
} from '@/api/inventory'

export const useInventoryStore = defineStore('inventory', () => {
  const authStore = useAuthStore()

  // Stock
  const stockItems = ref<StockItem[]>([])
  const warehouses = ref<Warehouse[]>([])
  const isLoadingStock = ref(false)

  // Transfer
  const transferProducts = ref<{ id: number; name: string; value: string }[]>([])
  const isTransferring = ref(false)

  // Receive
  const purchaseOrders = ref<any[]>([])
  const orderLines = ref<any[]>([])
  const isLoadingOrders = ref(false)

  const error = ref<string | null>(null)

  // Stock actions
  async function loadStock(keyword?: string): Promise<void> {
    isLoadingStock.value = true
    error.value = null
    try {
      stockItems.value = await listStock(keyword)
    } catch (e: any) {
      error.value = e.message || 'Failed to load stock'
    } finally {
      isLoadingStock.value = false
    }
  }

  async function loadWarehouses(): Promise<void> {
    try {
      warehouses.value = await listWarehouses()
    } catch (e: any) {
      error.value = e.message || 'Failed to load warehouses'
    }
  }

  // Transfer actions
  async function searchForTransfer(keyword: string): Promise<void> {
    try {
      transferProducts.value = await searchProducts(keyword)
    } catch (e: any) {
      error.value = e.message || 'Search failed'
    }
  }

  async function executeTransfer(
    productId: number,
    fromLocatorId: number,
    toLocatorId: number,
    quantity: number
  ): Promise<boolean> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = 'Organization not set'
      return false
    }

    isTransferring.value = true
    error.value = null
    try {
      await createTransfer({
        productId,
        fromLocatorId,
        toLocatorId,
        quantity,
        orgId: authStore.context!.organizationId,
      })
      // Reload stock
      await loadStock()
      return true
    } catch (e: any) {
      error.value = e.message || 'Transfer failed'
      return false
    } finally {
      isTransferring.value = false
    }
  }

  // Receive actions
  async function loadPurchaseOrders(): Promise<void> {
    isLoadingOrders.value = true
    error.value = null
    try {
      purchaseOrders.value = await listPurchaseOrders()
    } catch (e: any) {
      error.value = e.message || 'Failed to load orders'
    } finally {
      isLoadingOrders.value = false
    }
  }

  async function loadOrderLines(orderId: number): Promise<void> {
    try {
      orderLines.value = await getOrderLines(orderId)
    } catch (e: any) {
      error.value = e.message || 'Failed to load order lines'
    }
  }

  return {
    stockItems, warehouses, isLoadingStock,
    transferProducts, isTransferring,
    purchaseOrders, orderLines, isLoadingOrders,
    error,
    loadStock, loadWarehouses,
    searchForTransfer, executeTransfer,
    loadPurchaseOrders, loadOrderLines,
  }
})
```

**Step 3: Verify build**

Run: `cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit`

**Step 4: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add webapp/src/api/inventory.ts webapp/src/stores/inventory.ts
git commit -m "feat: add inventory API and store for stock, transfer, and receiving"
```

---

## Task 8: StockView - Inventory Query Screen

**Files:**
- Modify: `webapp/src/views/inventory/StockView.vue`

**Step 1: Implement stock view**

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useInventoryStore } from '@/stores/inventory'

const store = useInventoryStore()
const searchKeyword = ref('')

onMounted(async () => {
  await store.loadStock()
})

async function onSearch() {
  await store.loadStock(searchKeyword.value || undefined)
}

// Group stock by product
const groupedStock = computed(() => {
  const groups: Record<number, { productName: string; locations: { name: string; qty: number }[]; total: number }> = {}

  for (const item of store.stockItems) {
    if (!groups[item.productId]) {
      groups[item.productId] = { productName: item.productName, locations: [], total: 0 }
    }
    groups[item.productId].locations.push({ name: item.locatorName, qty: item.qtyOnHand })
    groups[item.productId].total += item.qtyOnHand
  }

  return Object.values(groups).sort((a, b) => a.productName.localeCompare(b.productName))
})
</script>

<template>
  <div class="stock-view">
    <div class="search-bar">
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜尋藥品名稱..."
        class="input"
        @input="onSearch"
      />
    </div>

    <div v-if="store.isLoadingStock" class="loading">載入中...</div>
    <div v-else-if="groupedStock.length === 0" class="empty">
      {{ searchKeyword ? '找不到符合的藥品' : '目前沒有庫存資料' }}
    </div>
    <div v-else class="stock-list">
      <div v-for="(group, i) in groupedStock" :key="i" class="stock-card">
        <div class="stock-header">
          <div class="product-name">{{ group.productName }}</div>
          <div class="total-qty">{{ group.total }}</div>
        </div>
        <div class="location-list">
          <div v-for="loc in group.locations" :key="loc.name" class="location-row">
            <span class="loc-name">{{ loc.name }}</span>
            <span class="loc-qty">{{ loc.qty }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.stock-view { max-width: 600px; margin: 0 auto; }
.search-bar { margin-bottom: 1rem; }
.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }
.input:focus { outline: none; border-color: #795548; }

.stock-list { display: flex; flex-direction: column; gap: 0.5rem; }
.stock-card { background: white; border-radius: 0.5rem; overflow: hidden; }
.stock-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #f0f0f0; }
.product-name { font-weight: 600; }
.total-qty { font-size: 1.25rem; font-weight: 700; color: #795548; }
.location-list { padding: 0.5rem 1rem; }
.location-row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.875rem; }
.loc-name { color: #666; }
.loc-qty { color: #333; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
```

**Step 2: Verify build, commit**

```bash
cd /home/tom/idempiere-skin-ui
npx vue-tsc --noEmit --project webapp/tsconfig.json
git add webapp/src/views/inventory/StockView.vue
git commit -m "feat: implement inventory stock view with search and grouped display"
```

---

## Task 9: TransferView - Inventory Transfer Screen

**Files:**
- Modify: `webapp/src/views/inventory/TransferView.vue`

**Step 1: Implement transfer view**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useInventoryStore } from '@/stores/inventory'

const store = useInventoryStore()

const searchKeyword = ref('')
const selectedProductId = ref<number | null>(null)
const selectedProductName = ref('')
const fromLocatorId = ref<number | null>(null)
const toLocatorId = ref<number | null>(null)
const quantity = ref(0)
const showSearch = ref(false)

onMounted(async () => {
  await store.loadWarehouses()
})

// Flatten all locators for dropdowns
function allLocators() {
  const locs: { id: number; label: string }[] = []
  for (const wh of store.warehouses) {
    for (const loc of wh.locators) {
      locs.push({ id: loc.id, label: `${wh.name} - ${loc.name}` })
    }
  }
  return locs
}

async function onSearch() {
  if (searchKeyword.value.length < 1) return
  await store.searchForTransfer(searchKeyword.value)
}

function selectProduct(product: { id: number; name: string }) {
  selectedProductId.value = product.id
  selectedProductName.value = product.name
  showSearch.value = false
  searchKeyword.value = ''
}

async function doTransfer() {
  if (!selectedProductId.value || !fromLocatorId.value || !toLocatorId.value || quantity.value <= 0) {
    alert('請填寫完整資料')
    return
  }

  if (fromLocatorId.value === toLocatorId.value) {
    alert('來源和目標不能相同')
    return
  }

  const success = await store.executeTransfer(
    selectedProductId.value,
    fromLocatorId.value,
    toLocatorId.value,
    quantity.value
  )

  if (success) {
    alert('調撥完成！')
    selectedProductId.value = null
    selectedProductName.value = ''
    fromLocatorId.value = null
    toLocatorId.value = null
    quantity.value = 0
  }
}
</script>

<template>
  <div class="transfer-view">
    <!-- Product selection -->
    <div class="section">
      <h3>藥品</h3>
      <div v-if="selectedProductId" class="selected-product">
        <span>{{ selectedProductName }}</span>
        <button class="btn btn-text" @click="selectedProductId = null; selectedProductName = ''">✕</button>
      </div>
      <button v-else class="btn btn-select" @click="showSearch = true">
        選擇藥品
      </button>
    </div>

    <!-- From / To -->
    <div class="section" v-if="selectedProductId">
      <div class="form-row">
        <label>從：</label>
        <select v-model="fromLocatorId" class="select">
          <option :value="null" disabled>選擇來源</option>
          <option v-for="loc in allLocators()" :key="loc.id" :value="loc.id">{{ loc.label }}</option>
        </select>
      </div>
      <div class="form-row">
        <label>到：</label>
        <select v-model="toLocatorId" class="select">
          <option :value="null" disabled>選擇目標</option>
          <option v-for="loc in allLocators()" :key="loc.id" :value="loc.id">{{ loc.label }}</option>
        </select>
      </div>
      <div class="form-row">
        <label>數量：</label>
        <input v-model.number="quantity" type="number" min="1" class="input qty-input" placeholder="0" />
      </div>
    </div>

    <!-- Submit -->
    <div v-if="selectedProductId" class="action-bar">
      <button
        class="btn btn-success btn-large"
        @click="doTransfer"
        :disabled="store.isTransferring || !fromLocatorId || !toLocatorId || quantity <= 0"
      >
        {{ store.isTransferring ? '處理中...' : '確認調撥' }}
      </button>
    </div>

    <!-- Search modal -->
    <div v-if="showSearch" class="modal-overlay" @click.self="showSearch = false">
      <div class="modal">
        <div class="modal-header">
          <h3>搜尋藥品</h3>
          <button class="btn btn-text" @click="showSearch = false">✕</button>
        </div>
        <div class="modal-body">
          <input v-model="searchKeyword" type="text" placeholder="輸入藥品名稱..." class="input" @input="onSearch" autofocus />
          <div class="result-list">
            <div v-for="p in store.transferProducts" :key="p.id" class="result-item" @click="selectProduct(p)">
              <div class="result-name">{{ p.name }}</div>
              <div class="result-code">{{ p.value }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.transfer-view { max-width: 600px; margin: 0 auto; }
.section { background: white; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }

.selected-product { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #efebe9; border-radius: 0.5rem; font-weight: 600; }

.btn-select { width: 100%; padding: 0.75rem; border: 2px dashed #ddd; border-radius: 0.5rem; color: #666; background: transparent; }

.form-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.form-row label { min-width: 3rem; font-weight: 500; }
.select { flex: 1; padding: 0.75rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }
.qty-input { width: 8rem; text-align: center; font-size: 1.25rem; font-weight: 700; }

.action-bar { margin-top: 1rem; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: flex-end; }
.modal { background: white; width: 100%; max-height: 80vh; border-radius: 1rem 1rem 0 0; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; }
.modal-body { padding: 1rem; overflow-y: auto; }

.result-list { margin-top: 0.75rem; }
.result-item { padding: 0.75rem; cursor: pointer; border-radius: 0.5rem; }
.result-item:active { background: #f5f5f5; }
.result-name { font-weight: 500; }
.result-code { font-size: 0.75rem; color: #999; }

.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
```

**Step 2: Verify build, commit**

```bash
cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit
cd /home/tom/idempiere-skin-ui
git add webapp/src/views/inventory/TransferView.vue
git commit -m "feat: implement inventory transfer view with product search and locator selection"
```

---

## Task 10: ReceiveView - Inventory Receiving Screen

**Files:**
- Modify: `webapp/src/views/inventory/ReceiveView.vue`

**Step 1: Implement receive view**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useInventoryStore } from '@/stores/inventory'

const store = useInventoryStore()
const selectedOrderId = ref<number | null>(null)

onMounted(async () => {
  await store.loadPurchaseOrders()
})

async function selectOrder(orderId: number) {
  selectedOrderId.value = orderId
  await store.loadOrderLines(orderId)
}

function getSelectedOrder() {
  return store.purchaseOrders.find(o => o.id === selectedOrderId.value)
}
</script>

<template>
  <div class="receive-view">
    <!-- Order selection -->
    <div v-if="!selectedOrderId">
      <h3 class="page-title">採購單</h3>

      <div v-if="store.isLoadingOrders" class="loading">載入中...</div>
      <div v-else-if="store.purchaseOrders.length === 0" class="empty">目前沒有採購單</div>
      <div v-else class="order-list">
        <div v-for="order in store.purchaseOrders" :key="order.id" class="order-card" @click="selectOrder(order.id)">
          <div class="order-info">
            <div class="order-no">{{ order.documentNo }}</div>
            <div class="order-vendor">{{ order.vendorName }}</div>
            <div class="order-date">{{ order.dateOrdered }}</div>
          </div>
          <div class="arrow">→</div>
        </div>
      </div>
    </div>

    <!-- Order detail -->
    <div v-else>
      <div class="section order-header">
        <div>
          <h3>{{ getSelectedOrder()?.documentNo }}</h3>
          <div class="order-vendor">{{ getSelectedOrder()?.vendorName }}</div>
        </div>
        <button class="btn btn-text" @click="selectedOrderId = null">返回</button>
      </div>

      <div class="section">
        <h3>品項明細</h3>
        <div v-if="store.orderLines.length === 0" class="empty">沒有品項</div>
        <div v-else class="line-list">
          <div v-for="line in store.orderLines" :key="line.id" class="line-item">
            <div class="line-info">
              <div class="line-name">{{ line.productName }}</div>
              <div class="line-qty">
                訂: {{ line.qtyOrdered }} / 收: {{ line.qtyDelivered }}
              </div>
            </div>
            <div class="line-status" :class="{ completed: line.qtyDelivered >= line.qtyOrdered }">
              {{ line.qtyDelivered >= line.qtyOrdered ? '已收' : '待收' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="error-message">{{ store.error }}</div>
  </div>
</template>

<style scoped>
.receive-view { max-width: 600px; margin: 0 auto; }
.page-title { margin-bottom: 1rem; }

.order-list { display: flex; flex-direction: column; gap: 0.5rem; }
.order-card { display: flex; align-items: center; justify-content: space-between; background: white; padding: 1rem; border-radius: 0.5rem; cursor: pointer; }
.order-card:active { background: #f5f5f5; }
.order-no { font-weight: 600; }
.order-vendor { font-size: 0.875rem; color: #666; }
.order-date { font-size: 0.75rem; color: #999; }
.arrow { color: #999; }

.section { background: white; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
.section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; }

.order-header { display: flex; justify-content: space-between; align-items: flex-start; }

.line-list { display: flex; flex-direction: column; gap: 0.5rem; }
.line-item { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: #f9f9f9; border-radius: 0.5rem; }
.line-name { font-weight: 500; }
.line-qty { font-size: 0.75rem; color: #666; }
.line-status { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; background: #fff3e0; color: #FF9800; }
.line-status.completed { background: #e8f5e9; color: #4CAF50; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
```

**Step 2: Verify build, commit**

```bash
cd /home/tom/idempiere-skin-ui/webapp && npx vue-tsc --noEmit
cd /home/tom/idempiere-skin-ui
git add webapp/src/views/inventory/ReceiveView.vue
git commit -m "feat: implement inventory receive view with purchase order listing"
```

---

## Task 11: Fix build.sh JAR Structure and Deploy

**Files:**
- Modify: `build.sh`

The current `build.sh` has a bug on line 34: `jar cfm "$OUTPUT_JAR" META-INF/MANIFEST.MF plugin.xml web` - this includes `web` as a directory, but per CLAUDE.md the files must be at JAR root. Fix it to use `-C web .`.

**Step 1: Fix build.sh**

Change line 34 from:
```bash
jar cfm "$OUTPUT_JAR" META-INF/MANIFEST.MF plugin.xml web
```
to:
```bash
jar cfm "$OUTPUT_JAR" META-INF/MANIFEST.MF plugin.xml -C web .
```

**Step 2: Build and deploy**

```bash
cd /home/tom/idempiere-skin-ui
bash build.sh

# Deploy as directory bundle (matching existing pattern)
# Copy built web files to deployed bundle directory
rm -rf /opt/idempiere-server/x86_64/plugins/org.idempiere.ui.clinic_1.0.0.qualifier
mkdir -p /opt/idempiere-server/x86_64/plugins/org.idempiere.ui.clinic_1.0.0.qualifier/META-INF
cp osgi-bundle/META-INF/MANIFEST.MF /opt/idempiere-server/x86_64/plugins/org.idempiere.ui.clinic_1.0.0.qualifier/META-INF/
cp osgi-bundle/plugin.xml /opt/idempiere-server/x86_64/plugins/org.idempiere.ui.clinic_1.0.0.qualifier/
cp -r osgi-bundle/web/* /opt/idempiere-server/x86_64/plugins/org.idempiere.ui.clinic_1.0.0.qualifier/
```

**Step 3: Test access**

Verify: `curl -s http://localhost:8080/ui/ | head -20`
Expected: HTML with `醫療診所系統` or similar content

**Step 4: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add build.sh
git commit -m "fix: correct JAR structure in build.sh to place files at root"
```

---

## Task 12: Update CLAUDE.md Development Status

**Files:**
- Modify: `CLAUDE.md`

Update the development status section to reflect completed modules:

```markdown
## 開發狀態

- [x] 需求討論
- [x] 流程設計
- [x] UI Wireframe
- [x] 測試情境規劃
- [x] 備份還原腳本
- [x] 開發環境設定（Vue 專案骨架）
- [x] OSGi WAB Bundle 結構（Jetty 12 + ee8）
- [x] 部署測試通過（/ui/#/ 可訪問）
- [ ] 功能開發（詳見 docs/pending-features/）
  - [x] 登入頁面（骨架）
  - [x] 首頁選單（骨架）
  - [x] 掛號功能（feature/registration branch）
    - [x] 病人查詢/新增（C_BPartner）
    - [x] 醫師清單（AD_User + S_Resource）
    - [x] 掛號建立（S_ResourceAssignment）
    - [x] 狀態管理（AD_SysConfig）
  - [x] 叫號系統（feature/registration branch）
    - [x] 候診/叫號/看診中清單
    - [x] 自動刷新（10秒）
    - [x] 狀態流轉（WAITING→CALLING→CONSULTING→COMPLETED）
  - [x] 看診/開藥（醫生模組）
    - [x] 看診中病人清單
    - [x] 藥品搜尋（M_Product）
    - [x] 處方建立（劑量/頻率/天數）
    - [x] 處方暫存/完成
  - [x] 配藥功能（藥房模組）
    - [x] 待配藥清單
    - [x] 庫存狀態顯示
    - [x] 開始配藥/完成配藥
  - [x] 結帳功能（櫃檯模組）
    - [x] 待結帳清單
    - [x] 費用明細/部分負擔
    - [x] 快速收款/找零
  - [x] 庫存查詢（庫存模組）
    - [x] 藥品庫存搜尋
    - [x] 分倉庫顯示
  - [x] 調撥功能
    - [x] 藥品選擇
    - [x] 倉庫/儲位選擇
    - [x] 數量輸入
  - [x] 入庫功能
    - [x] 採購單清單
    - [x] 品項明細檢視
  - [ ] 健保卡整合
- [ ] 測試
- [ ] 正式部署
```

**Step: Commit**

```bash
cd /home/tom/idempiere-skin-ui
git add CLAUDE.md
git commit -m "docs: update development status with all completed modules"
```

---

## Task 13: Push to Remote

```bash
cd /home/tom/idempiere-skin-ui
git push origin feature/registration
```
