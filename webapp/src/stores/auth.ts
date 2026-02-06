import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/api/client'

interface User {
  id: number
  name: string
  role: string
}

interface AuthContext {
  clientId: number
  roleId: number
  organizationId: number
  warehouseId: number
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<User | null>(null)
  const context = ref<AuthContext | null>(null)

  // Getters
  const isAuthenticated = computed(() => !!token.value)

  // Actions
  async function login(username: string, password: string): Promise<boolean> {
    try {
      // Step 1: 取得初始 Token
      const loginResponse = await apiClient.post('/api/v1/auth/tokens', {
        userName: username,
        password: password,
      })

      const initialToken = loginResponse.data.token
      const clients = loginResponse.data.clients

      if (!initialToken || !clients?.length) {
        throw new Error('登入失敗')
      }

      // Step 2: 設定 Context (使用第一個 Client)
      const clientId = clients[0].id

      // 取得 Roles
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`
      const rolesResponse = await apiClient.get(`/api/v1/auth/roles?client=${clientId}`)
      const roles = rolesResponse.data.roles

      if (!roles?.length) {
        throw new Error('無可用角色')
      }

      const roleId = roles[0].id

      // 取得 Organizations
      const orgsResponse = await apiClient.get(`/api/v1/auth/organizations?client=${clientId}&role=${roleId}`)
      const orgs = orgsResponse.data.organizations
      const orgId = orgs?.[0]?.id || 0

      // 取得 Warehouses
      const whResponse = await apiClient.get(`/api/v1/auth/warehouses?client=${clientId}&role=${roleId}&organization=${orgId}`)
      const warehouses = whResponse.data.warehouses
      const whId = warehouses?.[0]?.id || 0

      // Step 3: 設定 Context 並取得最終 Token
      const contextResponse = await apiClient.put('/api/v1/auth/tokens', {
        clientId: clientId,
        roleId: roleId,
        organizationId: orgId,
        warehouseId: whId,
      })

      const finalToken = contextResponse.data.token

      // 儲存
      token.value = finalToken
      localStorage.setItem('token', finalToken)
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${finalToken}`

      context.value = {
        clientId,
        roleId,
        organizationId: orgId,
        warehouseId: whId,
      }

      user.value = {
        id: 0,
        name: username,
        role: roles[0].name || 'user',
      }

      return true
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  function logout() {
    token.value = null
    user.value = null
    context.value = null
    localStorage.removeItem('token')
    delete apiClient.defaults.headers.common['Authorization']
  }

  // 初始化：如果有 token，設定 header
  if (token.value) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
  }

  return {
    token,
    user,
    context,
    isAuthenticated,
    login,
    logout,
  }
})
