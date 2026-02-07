<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  listTransferHistory,
  getTransferLines,
  getDocStatusLabel,
  type TransferDoc,
  type TransferHistoryLine,
} from '@/api/inventory'

const transfers = ref<TransferDoc[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// Expanded transfer details
const expandedId = ref<number | null>(null)
const expandedLines = ref<TransferHistoryLine[]>([])
const isLoadingLines = ref(false)

onMounted(async () => {
  isLoading.value = true
  error.value = null
  try {
    transfers.value = await listTransferHistory()
  } catch (e: any) {
    error.value = e.message || '載入調撥紀錄失敗'
  } finally {
    isLoading.value = false
  }
})

async function toggleExpand(transfer: TransferDoc) {
  if (expandedId.value === transfer.id) {
    expandedId.value = null
    expandedLines.value = []
    return
  }

  expandedId.value = transfer.id
  expandedLines.value = []
  isLoadingLines.value = true
  try {
    expandedLines.value = await getTransferLines(transfer.id)
  } catch (e: any) {
    error.value = e.message || '載入明細失敗'
  } finally {
    isLoadingLines.value = false
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'CO': return '#4CAF50'
    case 'DR': return '#FF9800'
    case 'VO': return '#F44336'
    default: return '#666'
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}
</script>

<template>
  <div class="history-view">
    <div v-if="isLoading" class="loading">載入中...</div>
    <div v-else-if="transfers.length === 0" class="empty">目前沒有調撥紀錄</div>
    <div v-else class="transfer-list">
      <div
        v-for="transfer in transfers"
        :key="transfer.id"
        class="transfer-card"
        :class="{ expanded: expandedId === transfer.id }"
      >
        <div class="transfer-header" @click="toggleExpand(transfer)">
          <div class="transfer-info">
            <div class="doc-no">{{ transfer.documentNo }}</div>
            <div class="doc-date">{{ formatDate(transfer.movementDate) }}</div>
            <div v-if="transfer.description" class="doc-desc">{{ transfer.description }}</div>
          </div>
          <div class="status-badge" :style="{ background: statusColor(transfer.docStatus) }">
            {{ getDocStatusLabel(transfer.docStatus) }}
          </div>
        </div>

        <!-- Expanded lines -->
        <div v-if="expandedId === transfer.id" class="transfer-lines">
          <div v-if="isLoadingLines" class="loading-sm">載入明細...</div>
          <div v-else-if="expandedLines.length === 0" class="empty-sm">無明細資料</div>
          <div v-else>
            <div v-for="(line, i) in expandedLines" :key="i" class="line-row">
              <div class="line-product">{{ line.productName }}</div>
              <div class="line-detail">
                <span class="line-qty">數量: {{ line.quantity }}</span>
                <span class="line-route">{{ line.fromLocator }} → {{ line.toLocator }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>
  </div>
</template>

<style scoped>
.history-view { max-width: 600px; margin: 0 auto; }

.transfer-list { display: flex; flex-direction: column; gap: 0.5rem; }

.transfer-card { background: white; border-radius: 0.5rem; overflow: hidden; }

.transfer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
}
.transfer-header:active { background: #fafafa; }

.transfer-info { flex: 1; }
.doc-no { font-weight: 600; }
.doc-date { font-size: 0.75rem; color: #999; margin-top: 0.125rem; }
.doc-desc { font-size: 0.75rem; color: #666; margin-top: 0.125rem; }

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.transfer-lines {
  border-top: 1px solid #f0f0f0;
  padding: 0.75rem 1rem;
  background: #fafafa;
}

.line-row {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f0f0f0;
}
.line-row:last-child { border-bottom: none; }

.line-product { font-weight: 500; font-size: 0.875rem; }
.line-detail { display: flex; justify-content: space-between; font-size: 0.75rem; color: #666; margin-top: 0.25rem; }
.line-qty { font-weight: 600; color: #333; }
.line-route { color: #999; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.loading-sm, .empty-sm { text-align: center; padding: 1rem; color: #999; font-size: 0.875rem; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
