<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>找不到頁面</p>
    <button @click="goHome">回首頁</button>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.not-found h1 {
  font-size: 6rem;
  color: #ccc;
  margin: 0;
}

.not-found p {
  font-size: 1.5rem;
  color: #666;
  margin: 1rem 0 2rem;
}

.not-found button {
  padding: 1rem 2rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  min-height: 48px;
}
</style>
