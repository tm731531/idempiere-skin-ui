<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

interface MenuItem {
  title: string
  icon: string
  path: string
  color: string
}

const menuItems: MenuItem[] = [
  { title: '掛號', icon: '📋', path: '/counter/register', color: '#4CAF50' },
  { title: '叫號', icon: '📢', path: '/counter/queue', color: '#2196F3' },
  { title: '看診', icon: '👨‍⚕️', path: '/doctor/consult', color: '#9C27B0' },
  { title: '配藥', icon: '💊', path: '/pharmacy/dispense', color: '#FF9800' },
  { title: '結帳', icon: '💰', path: '/counter/checkout', color: '#F44336' },
  { title: '庫存', icon: '📦', path: '/inventory/stock', color: '#795548' },
  { title: '調撥', icon: '🔄', path: '/inventory/transfer', color: '#607D8B' },
  { title: '入庫', icon: '📥', path: '/inventory/receive', color: '#00BCD4' },
]

function navigateTo(path: string) {
  router.push(path)
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="home-container">
    <header class="home-header">
      <h1>醫療診所系統</h1>
      <div class="user-info">
        <span>{{ authStore.user?.name || '使用者' }}</span>
        <button @click="handleLogout" class="logout-btn">登出</button>
      </div>
    </header>

    <main class="home-main">
      <div class="menu-grid">
        <button
          v-for="item in menuItems"
          :key="item.path"
          class="menu-item"
          :style="{ '--item-color': item.color }"
          @click="navigateTo(item.path)"
        >
          <span class="menu-icon">{{ item.icon }}</span>
          <span class="menu-title">{{ item.title }}</span>
        </button>
      </div>
    </main>

    <footer class="home-footer">
      <p>iDempiere Clinic UI v1.0.0</p>
    </footer>
  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.home-header {
  background: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.home-header h1 {
  font-size: 1.25rem;
  font-weight: bold;
  color: #333;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-info span {
  color: #666;
}

.logout-btn {
  padding: 0.5rem 1rem;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  min-height: 44px;
}

.home-main {
  flex: 1;
  padding: 1rem;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .menu-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
  background: white;
  border: none;
  border-radius: 1rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-height: 120px;
}

.menu-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.menu-item:active {
  transform: scale(0.98);
}

.menu-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.menu-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--item-color);
}

.home-footer {
  background: white;
  padding: 1rem;
  text-align: center;
  color: #999;
  font-size: 0.875rem;
}
</style>
