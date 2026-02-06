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
