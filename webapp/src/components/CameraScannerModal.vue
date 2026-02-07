<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Html5Qrcode } from 'html5-qrcode'

const emit = defineEmits<{
  scan: [barcode: string]
  close: []
}>()

const error = ref('')
const isStarting = ref(true)
let scanner: Html5Qrcode | null = null
const readerId = 'camera-reader-' + Math.random().toString(36).slice(2, 8)

onMounted(async () => {
  try {
    scanner = new Html5Qrcode(readerId)
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        emit('scan', decodedText)
        stopScanner()
        emit('close')
      },
      () => {
        // Ignore: no code in frame
      }
    )
    isStarting.value = false
  } catch (e: any) {
    isStarting.value = false
    error.value = e?.message || '無法開啟相機'
  }
})

onUnmounted(() => {
  stopScanner()
})

function stopScanner() {
  if (scanner) {
    try {
      scanner.stop().catch(() => {})
    } catch {
      // ignore
    }
    scanner = null
  }
}
</script>

<template>
  <div class="scanner-overlay" @click.self="emit('close')">
    <div class="scanner-modal">
      <div class="scanner-header">
        <h3>掃描條碼 / QR Code</h3>
        <button class="btn-close" @click="emit('close')" type="button">✕</button>
      </div>
      <div class="scanner-body">
        <div v-if="isStarting" class="scanner-loading">啟動相機中...</div>
        <div :id="readerId" class="scanner-viewport"></div>
        <div v-if="error" class="scanner-error">{{ error }}</div>
        <p class="scanner-hint">將條碼或 QR Code 對準框內</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scanner-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1002;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scanner-modal {
  background: white;
  width: 90%;
  max-width: 400px;
  border-radius: 1rem;
  overflow: hidden;
}

.scanner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.scanner-header h3 {
  margin: 0;
  font-size: 1.125rem;
}

.btn-close {
  background: transparent;
  border: none;
  color: #666;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
}

.scanner-body {
  padding: 1rem;
}

.scanner-viewport {
  width: 100%;
  min-height: 250px;
}

.scanner-loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.scanner-error {
  background: #ffebee;
  color: #c62828;
  padding: 0.75rem;
  border-radius: 0.25rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.scanner-hint {
  text-align: center;
  color: #999;
  font-size: 0.875rem;
  margin-top: 0.75rem;
  margin-bottom: 0;
}
</style>
