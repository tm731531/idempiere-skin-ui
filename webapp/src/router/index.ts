import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  // 使用 hash mode，不需要 server 端支援 SPA routing
  history: createWebHashHistory('/ui/'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    // 櫃檯模組
    {
      path: '/counter',
      name: 'counter',
      component: () => import('@/views/counter/CounterView.vue'),
      meta: { requiresAuth: true, roles: ['counter'] },
      children: [
        {
          path: 'register',
          name: 'register',
          component: () => import('@/views/counter/RegisterView.vue'),
        },
        {
          path: 'queue',
          name: 'queue',
          component: () => import('@/views/counter/QueueView.vue'),
        },
        {
          path: 'checkout',
          name: 'checkout',
          component: () => import('@/views/counter/CheckoutView.vue'),
        },
      ],
    },
    // 醫生模組
    {
      path: '/doctor',
      name: 'doctor',
      component: () => import('@/views/doctor/DoctorView.vue'),
      meta: { requiresAuth: true, roles: ['doctor'] },
      children: [
        {
          path: 'consult',
          name: 'consult',
          component: () => import('@/views/doctor/ConsultView.vue'),
        },
        {
          path: 'prescription',
          name: 'prescription',
          component: () => import('@/views/doctor/PrescriptionView.vue'),
        },
      ],
    },
    // 藥房模組
    {
      path: '/pharmacy',
      name: 'pharmacy',
      component: () => import('@/views/pharmacy/PharmacyView.vue'),
      meta: { requiresAuth: true, roles: ['pharmacy'] },
      children: [
        {
          path: 'dispense',
          name: 'dispense',
          component: () => import('@/views/pharmacy/DispenseView.vue'),
        },
      ],
    },
    // 庫存模組
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/inventory/InventoryView.vue'),
      meta: { requiresAuth: true, roles: ['warehouse', 'purchasing'] },
      children: [
        {
          path: 'stock',
          name: 'stock',
          component: () => import('@/views/inventory/StockView.vue'),
        },
        {
          path: 'transfer',
          name: 'transfer',
          component: () => import('@/views/inventory/TransferView.vue'),
        },
        {
          path: 'receive',
          name: 'receive',
          component: () => import('@/views/inventory/ReceiveView.vue'),
        },
        {
          path: 'count',
          name: 'count',
          component: () => import('@/views/inventory/CountView.vue'),
        },
        {
          path: 'product',
          name: 'product',
          component: () => import('@/views/inventory/ProductView.vue'),
        },
        {
          path: 'history',
          name: 'transfer-history',
          component: () => import('@/views/inventory/TransferHistoryView.vue'),
        },
        {
          path: 'purchase',
          name: 'purchase',
          component: () => import('@/views/inventory/PurchaseView.vue'),
        },
      ],
    },
    // 404
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
})

// 路由守衛
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // 需要登入的頁面
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  // 已登入但訪問登入頁
  if (to.name === 'login' && authStore.isAuthenticated) {
    next({ name: 'home' })
    return
  }

  next()
})

export default router
