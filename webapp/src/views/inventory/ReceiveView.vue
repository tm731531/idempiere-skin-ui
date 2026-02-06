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
