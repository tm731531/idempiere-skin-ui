<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useInventoryStore } from '@/stores/inventory'

const store = useInventoryStore()
const selectedOrderId = ref<number | null>(null)
const receiveQty = ref<Record<number, number>>({})

onMounted(async () => {
  await store.loadPurchaseOrders()
})

async function selectOrder(orderId: number) {
  selectedOrderId.value = orderId
  receiveQty.value = {}
  await store.loadOrderLines(orderId)
  // Initialize receive quantities with remaining
  for (const line of store.orderLines) {
    const remaining = line.qtyOrdered - line.qtyDelivered
    receiveQty.value[line.id] = remaining > 0 ? remaining : 0
  }
}

function getSelectedOrder() {
  return store.purchaseOrders.find(o => o.id === selectedOrderId.value)
}

const hasReceivableLines = computed(() =>
  store.orderLines.some(l => l.qtyOrdered > l.qtyDelivered)
)

const totalToReceive = computed(() =>
  Object.values(receiveQty.value).reduce((sum, q) => sum + (q > 0 ? q : 0), 0)
)

async function handleReceive() {
  if (!selectedOrderId.value) return
  const lines = store.orderLines
    .filter(l => (receiveQty.value[l.id] || 0) > 0)
    .map(l => ({
      orderLineId: l.id,
      productId: l.productId,
      qtyReceived: receiveQty.value[l.id] || 0,
    }))

  if (lines.length === 0) {
    alert('請輸入收貨數量')
    return
  }

  const ok = await store.executeReceive(selectedOrderId.value, lines)
  if (ok) {
    alert('收貨完成！')
    receiveQty.value = {}
  }
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
          <div class="arrow">&rarr;</div>
        </div>
      </div>
    </div>

    <!-- Order detail with receive -->
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
                訂: {{ line.qtyOrdered }} / 已收: {{ line.qtyDelivered }}
              </div>
            </div>
            <div v-if="line.qtyDelivered >= line.qtyOrdered" class="line-status completed">
              已收齊
            </div>
            <div v-else class="receive-input">
              <input
                v-model.number="receiveQty[line.id]"
                type="number"
                min="0"
                :max="line.qtyOrdered - line.qtyDelivered"
                class="qty-input"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Receive action -->
      <div v-if="hasReceivableLines" class="action-bar">
        <button
          class="btn btn-success btn-large"
          @click="handleReceive"
          :disabled="store.isReceiving || totalToReceive === 0"
        >
          {{ store.isReceiving ? '處理中...' : `確認收貨 (${totalToReceive} 項)` }}
        </button>
      </div>
      <div v-else class="all-received">
        全部品項已收齊
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

.receive-input { display: flex; align-items: center; }
.qty-input { width: 4rem; padding: 0.5rem; border: 1px solid #ddd; border-radius: 0.25rem; font-size: 1rem; text-align: center; min-height: 40px; }

.action-bar { margin-top: 1rem; }
.all-received { text-align: center; padding: 1rem; color: #4CAF50; font-weight: 600; }

.btn { padding: 0.75rem 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; background: white; min-height: 48px; }
.btn-success { background: #4CAF50; color: white; border-color: #4CAF50; }
.btn-text { background: transparent; border: none; color: #666; min-height: auto; }
.btn-large { width: 100%; font-size: 1.125rem; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.loading, .empty { text-align: center; padding: 3rem; color: #666; }
.error-message { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; }
</style>
