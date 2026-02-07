<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

interface MenuItem {
  title: string
  icon: string
  path: string
  color: string
  roles?: string[]
}

const allMenuItems: MenuItem[] = [
  { title: '掛號', icon: '📋', path: '/counter/register', color: '#4CAF50', roles: ['counter', 'admin'] },
  { title: '叫號', icon: '📢', path: '/counter/queue', color: '#2196F3', roles: ['counter', 'admin'] },
  { title: '看診', icon: '👨‍⚕️', path: '/doctor/consult', color: '#9C27B0', roles: ['doctor', 'admin'] },
  { title: '處方', icon: '📝', path: '/doctor/prescription', color: '#7B1FA2', roles: ['doctor', 'admin'] },
  { title: '配藥', icon: '💊', path: '/pharmacy/dispense', color: '#FF9800', roles: ['pharmacy', 'admin'] },
  { title: '結帳', icon: '💰', path: '/counter/checkout', color: '#F44336', roles: ['counter', 'admin'] },
  { title: '庫存', icon: '📦', path: '/inventory/stock', color: '#795548', roles: ['warehouse', 'admin'] },
  { title: '調撥', icon: '🔄', path: '/inventory/transfer', color: '#607D8B', roles: ['warehouse', 'admin'] },
  { title: '入庫', icon: '📥', path: '/inventory/receive', color: '#00BCD4', roles: ['warehouse', 'admin'] },
  { title: '盤點', icon: '📊', path: '/inventory/count', color: '#5D4037', roles: ['warehouse', 'admin'] },
]

// Role keyword to category mapping
const ROLE_MAP: Record<string, string> = {
  'counter': 'counter',
  'clerk': 'counter',
  '櫃檯': 'counter',
  'doctor': 'doctor',
  '醫師': 'doctor',
  'pharmacy': 'pharmacy',
  '藥師': 'pharmacy',
  'warehouse': 'warehouse',
  '倉庫': 'warehouse',
  'admin': 'admin',
  'superuser': 'admin',
  'system administrator': 'admin',
}

function getUserRoleCategory(): string | null {
  const roleName = (authStore.user?.role || '').toLowerCase()
  for (const [keyword, category] of Object.entries(ROLE_MAP)) {
    if (roleName.includes(keyword)) return category
  }
  return null // Unknown role → show all
}

const menuItems = computed(() => {
  const category = getUserRoleCategory()
  if (!category) return allMenuItems
  return allMenuItems.filter(item => !item.roles || item.roles.includes(category))
})

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
        <span>{{ authStore.user?.name || '使用者' }}
          <span v-if="authStore.user?.role" class="role-badge">{{ authStore.user.role }}</span>
        </span>
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

.role-badge {
  display: inline-block;
  background: #e3f2fd;
  color: #1565c0;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  margin-left: 0.25rem;
}
</style>
