<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="module-container">
    <header class="module-header">
      <button class="back-btn" @click="router.push('/')">← 返回</button>
      <h1>庫存管理</h1>
    </header>
    <nav class="module-nav">
      <router-link to="/inventory/stock" class="nav-item">庫存</router-link>
      <router-link to="/inventory/transfer" class="nav-item">調撥</router-link>
      <router-link to="/inventory/receive" class="nav-item">入庫</router-link>
      <router-link to="/inventory/count" class="nav-item">盤點</router-link>
      <router-link to="/inventory/product" class="nav-item">產品</router-link>
      <router-link to="/inventory/history" class="nav-item">紀錄</router-link>
      <router-link to="/inventory/purchase" class="nav-item">採購</router-link>
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
  background: #795548;
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
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.nav-item {
  flex: 0 0 auto;
  text-align: center;
  padding: 0.75rem 1rem;
  text-decoration: none;
  color: #666;
  border-bottom: 2px solid transparent;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 0.875rem;
}

.nav-item.router-link-active {
  color: #795548;
  border-bottom-color: #795548;
}

.module-main {
  flex: 1;
  padding: 1rem;
}
</style>
