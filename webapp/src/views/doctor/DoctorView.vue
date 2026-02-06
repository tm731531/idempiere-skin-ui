<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="module-container">
    <header class="module-header">
      <button class="back-btn" @click="router.push('/')">← 返回</button>
      <h1>看診</h1>
    </header>
    <nav class="module-nav">
      <router-link to="/doctor/consult" class="nav-item">診間</router-link>
      <router-link to="/doctor/prescription" class="nav-item">處方</router-link>
    </nav>
    <main class="module-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.module-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.module-header {
  background: #9C27B0;
  color: white;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  cursor: pointer;
  min-height: 44px;
}

.module-header h1 {
  font-size: 1.25rem;
  margin: 0;
}

.module-nav {
  background: white;
  display: flex;
  border-bottom: 1px solid #eee;
}

.nav-item {
  flex: 1;
  text-align: center;
  padding: 1rem;
  text-decoration: none;
  color: #666;
  border-bottom: 2px solid transparent;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-item.router-link-active {
  color: #9C27B0;
  border-bottom-color: #9C27B0;
}

.module-main {
  flex: 1;
  padding: 1rem;
}
</style>
