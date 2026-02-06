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
