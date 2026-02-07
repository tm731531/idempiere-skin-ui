<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useStockCountStore } from '@/stores/stockcount'
import { useInventoryStore } from '@/stores/inventory'
import type { CountLine } from '@/api/stockcount'

const countStore = useStockCountStore()
const inventoryStore = useInventoryStore()

// Create task modal
const showCreateModal = ref(false)
const newTaskName = ref('')
const newTaskWarehouse = ref('')

onMounted(async () => {
  await countStore.loadTasks()
  await inventoryStore.loadStock()
  await inventoryStore.loadWarehouses()
})

// Warehouse names for the create modal
const warehouseNames = computed(() =>
  inventoryStore.warehouses.map(w => w.name)
)

// Format date for display
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// Status display labels
function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    'PENDING': '待盤點',
    'IN_PROGRESS': '盤點中',
    'COMPLETED': '已完成',
  }
  return labels[status] || status
}

// Create new task from current stock data
async function onCreate() {
  if (!newTaskName.value.trim()) return

  const warehouseName = newTaskWarehouse.value || '全部'

  // Build lines from current stock data
  const lines: CountLine[] = inventoryStore.stockItems
    .filter(item => warehouseName === '全部' || item.locatorName.includes(warehouseName))
    .map(item => ({
      productId: item.productId,
      productName: item.productName,
      locatorName: item.locatorName,
      systemQty: item.qtyOnHand,
      actualQty: null,
      variance: 0,
    }))

  const success = await countStore.createNewTask(newTaskName.value.trim(), warehouseName, lines)
  if (success) {
    showCreateModal.value = false
    newTaskName.value = ''
    newTaskWarehouse.value = ''
  }
}

// Handle qty input per line
function onQtyInput(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  const val = target.value === '' ? null : parseFloat(target.value)
  if (val !== null && !isNaN(val)) {
    countStore.updateLine(index, val)
  }
}

// Handle reason input per line
function onReasonInput(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  if (countStore.currentTask) {
    const line = countStore.currentTask.lines[index]
    if (line && line.actualQty !== null) {
      countStore.updateLine(index, line.actualQty, target.value)
    }
  }
}

// Complete the task
async function onComplete() {
  const success = await countStore.completeTask()
  if (success) {
    await countStore.loadTasks()
  }
}

// Delete a task
async function onDelete(id: string) {
  if (confirm('確定要刪除此盤點任務？')) {
    await countStore.deleteTask(id)
  }
}

// Count lines with filled actual qty
function countedLines(lines: CountLine[]): number {
  return lines.filter(l => l.actualQty !== null).length
}
</script>

<template>
  <div class="count-view">

    <!-- ========== Task List (no task selected) ========== -->
    <template v-if="!countStore.currentTask">
      <div class="section-header">
        <h2>庫存盤點</h2>
        <button class="btn btn-primary" @click="showCreateModal = true">建立盤點</button>
      </div>

      <div v-if="countStore.isLoading" class="loading">載入中...</div>

      <div v-else-if="countStore.tasks.length === 0" class="empty">
        目前沒有盤點任務
      </div>

      <div v-else class="task-list">
        <div
          v-for="task in countStore.tasks"
          :key="task.id"
          class="task-card"
          @click="task.status !== 'COMPLETED' ? countStore.selectTask(task) : undefined"
          :class="{ 'task-completed': task.status === 'COMPLETED' }"
        >
          <div class="task-top">
            <div class="task-name">{{ task.name }}</div>
            <span class="task-status" :class="`status-${task.status.toLowerCase()}`">
              {{ statusLabel(task.status) }}
            </span>
          </div>
          <div class="task-meta">
            <span>{{ task.warehouseName }}</span>
            <span>{{ countedLines(task.lines) }}/{{ task.lines.length }} 項</span>
            <span>{{ formatDate(task.createdAt) }}</span>
          </div>
          <div class="task-actions" @click.stop>
            <button
              v-if="task.status !== 'COMPLETED'"
              class="btn btn-text btn-delete"
              @click="onDelete(task.id)"
            >刪除</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ========== Task Detail (task selected) ========== -->
    <template v-else>
      <div class="detail-header">
        <button class="btn btn-text btn-back" @click="countStore.clearCurrent">&larr; 返回</button>
        <div class="detail-title">
          <h2>{{ countStore.currentTask.name }}</h2>
          <span class="detail-warehouse">{{ countStore.currentTask.warehouseName }}</span>
        </div>
      </div>

      <div v-if="countStore.currentTask.lines.length === 0" class="empty">
        此任務沒有盤點項目
      </div>

      <div v-else class="line-list">
        <div
          v-for="(line, index) in countStore.currentTask.lines"
          :key="index"
          class="line-card"
        >
          <div class="line-header">
            <div class="line-product">{{ line.productName }}</div>
            <div class="line-locator">{{ line.locatorName }}</div>
          </div>
          <div class="line-body">
            <div class="line-system">
              <span class="label">系統量</span>
              <span class="value">{{ line.systemQty }}</span>
            </div>
            <div class="line-actual">
              <span class="label">實際量</span>
              <input
                type="number"
                class="input qty-input"
                :value="line.actualQty"
                placeholder="-"
                min="0"
                @change="onQtyInput(index, $event)"
              />
            </div>
            <div class="line-variance" :class="{ 'variance-ok': line.actualQty !== null && line.variance === 0, 'variance-diff': line.actualQty !== null && line.variance !== 0 }">
              <span class="label">差異</span>
              <span class="value">{{ line.actualQty !== null ? (line.variance > 0 ? '+' : '') + line.variance : '-' }}</span>
            </div>
          </div>
          <div v-if="line.actualQty !== null && line.variance !== 0" class="line-reason">
            <input
              type="text"
              class="input reason-input"
              :value="line.reason || ''"
              placeholder="差異原因..."
              @change="onReasonInput(index, $event)"
            />
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button
          class="btn btn-complete btn-large"
          :disabled="!countStore.allLinesCounted"
          @click="onComplete"
        >
          完成盤點
        </button>
      </div>
    </template>

    <!-- ========== Create Task Modal ========== -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>建立盤點任務</h3>
          <button class="btn btn-text" @click="showCreateModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>任務名稱</label>
            <input
              v-model="newTaskName"
              type="text"
              class="input"
              placeholder="例：每月盤點"
              autofocus
            />
          </div>
          <div class="form-group">
            <label>倉庫</label>
            <select v-model="newTaskWarehouse" class="select">
              <option value="">全部</option>
              <option v-for="name in warehouseNames" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="form-group">
            <span class="hint">將自動載入庫存資料作為盤點項目</span>
          </div>
          <button
            class="btn btn-primary btn-large"
            :disabled="!newTaskName.trim()"
            @click="onCreate"
          >
            建立
          </button>
        </div>
      </div>
    </div>

    <!-- ========== Error ========== -->
    <div v-if="countStore.error" class="error-message">{{ countStore.error }}</div>
  </div>
</template>

<style scoped>
.count-view { max-width: 600px; margin: 0 auto; }

/* Section header */
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.section-header h2 { margin: 0; font-size: 1.25rem; }

/* Task list */
.task-list { display: flex; flex-direction: column; gap: 0.5rem; }
.task-card { background: white; border-radius: 0.5rem; padding: 0.75rem 1rem; cursor: pointer; }
.task-card:active { background: #fafafa; }
.task-card.task-completed { opacity: 0.6; cursor: default; }
.task-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.task-name { font-weight: 600; font-size: 1rem; }
.task-status { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 500; }
.status-pending { background: #fff3e0; color: #e65100; }
.status-in_progress { background: #e3f2fd; color: #1565c0; }
.status-completed { background: #e8f5e9; color: #2e7d32; }
.task-meta { display: flex; gap: 1rem; font-size: 0.8rem; color: #666; }
.task-actions { margin-top: 0.5rem; text-align: right; }

/* Detail header */
.detail-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.detail-title h2 { margin: 0; font-size: 1.125rem; }
.detail-warehouse { font-size: 0.8rem; color: #795548; }

/* Line list */
.line-list { display: flex; flex-direction: column; gap: 0.5rem; }
.line-card { background: white; border-radius: 0.5rem; padding: 0.75rem 1rem; }
.line-header { margin-bottom: 0.5rem; }
.line-product { font-weight: 600; }
.line-locator { font-size: 0.8rem; color: #666; }
.line-body { display: flex; align-items: center; gap: 0.75rem; }
.line-body .label { display: block; font-size: 0.7rem; color: #999; margin-bottom: 0.15rem; }
.line-body .value { font-size: 1rem; font-weight: 600; }
.line-system { flex: 1; text-align: center; }
.line-actual { flex: 1; text-align: center; }
.line-variance { flex: 1; text-align: center; }
.variance-ok .value { color: #4CAF50; }
.variance-diff .value { color: #c62828; }
.line-reason { margin-top: 0.5rem; }

/* Inputs */
.input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #795548; }
.qty-input { width: 5rem; text-align: center; font-size: 1.125rem; font-weight: 700; padding: 0.5rem; }
.reason-input { font-size: 0.875rem; min-height: 40px; padding: 0.5rem 0.75rem; }
.select { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; min-height: 48px; background: white; }

/* Buttons */
.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #795548; color: white; border-color: #795548; }
.btn-complete { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; padding: 0.5rem; }
.btn-back { font-size: 1rem; color: #795548; font-weight: 500; }
.btn-delete { color: #c62828; font-size: 0.8rem; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }

/* Action bar */
.action-bar { margin-top: 1rem; padding-bottom: 1rem; }

/* Modal */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: flex-end; }
.modal { background: white; width: 100%; max-height: 80vh; border-radius: 1rem 1rem 0 0; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; }
.modal-body { padding: 1rem; overflow-y: auto; }
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; }
.hint { font-size: 0.8rem; color: #999; }

/* Common states */
.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
