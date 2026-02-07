<script setup lang="ts">
import { ref, onMounted } from 'vue'
import CameraScannerModal from './CameraScannerModal.vue'

const props = withDefaults(defineProps<{
  placeholder?: string
  autofocus?: boolean
  showCameraButton?: boolean
}>(), {
  showCameraButton: true,
})

const emit = defineEmits<{
  scan: [barcode: string]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const value = ref('')
const showCamera = ref(false)

// External barcode scanners simulate keyboard input:
// They type characters rapidly then press Enter.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && value.value.trim()) {
    e.preventDefault()
    emit('scan', value.value.trim())
    value.value = ''
  }
}

function onCameraScan(barcode: string) {
  showCamera.value = false
  emit('scan', barcode)
}

onMounted(() => {
  if (props.autofocus && inputRef.value) {
    inputRef.value.focus()
  }
})

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="barcode-wrapper">
    <input
      ref="inputRef"
      v-model="value"
      type="text"
      :placeholder="placeholder || '掃描條碼或輸入後按 Enter'"
      class="barcode-input"
      @keydown="onKeydown"
    />
    <button
      v-if="showCameraButton"
      class="camera-btn"
      @click="showCamera = true"
      title="開啟相機掃描"
      type="button"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    </button>
  </div>
  <Teleport to="body">
    <CameraScannerModal
      v-if="showCamera"
      @scan="onCameraScan"
      @close="showCamera = false"
    />
  </Teleport>
</template>

<style scoped>
.barcode-wrapper {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.barcode-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
  min-height: 48px;
  box-sizing: border-box;
}

.barcode-input:focus {
  outline: none;
  border-color: #667eea;
}

.camera-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  background: white;
  color: #667eea;
  cursor: pointer;
  flex-shrink: 0;
}

.camera-btn:hover {
  background: #f7f8fc;
  border-color: #667eea;
}

.camera-btn:active {
  background: #eef0fb;
}
</style>
