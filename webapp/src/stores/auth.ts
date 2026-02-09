import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/api/client'
import { clearLookupCache } from '@/api/lookup'

interface User {
  id: number
  name: string
  role: string
}

interface AuthContext {
  clientId: number
  clientName: string
  roleId: number
  roleName: string
  organizationId: number
  organizationName: string
  warehouseId: number
  warehouseName: string
}

export type LoginStep = 'credentials' | 'client' | 'role' | 'org' | 'warehouse' | 'done'

interface SelectionItem {
  id: number
  name: string
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<User | null>(null)
  const context = ref<AuthContext | null>(null)

  // Login flow state
  const loginStep = ref<LoginStep>('credentials')
  const loginError = ref('')
  const loginLoading = ref(false)
  const availableClients = ref<SelectionItem[]>([])
  const availableRoles = ref<SelectionItem[]>([])
  const availableOrgs = ref<SelectionItem[]>([])
  const availableWarehouses = ref<SelectionItem[]>([])

  // Internal: track selections during login flow
  let pendingUsername = ''
  let pendingClientId = 0
  let pendingClientName = ''
  let pendingRoleId = 0
  let pendingRoleName = ''
  let pendingOrgId = 0
  let pendingOrgName = ''

  // Getters
  const isAuthenticated = computed(() => !!token.value && loginStep.value === 'done')

  // Actions

  /**
   * Step 1: Authenticate with username/password
   * Returns true if authentication succeeded (may need further selection steps)
   */
  async function authenticate(username: string, password: string): Promise<boolean> {
    loginLoading.value = true
    loginError.value = ''

    try {
      const loginResponse = await apiClient.post('/api/v1/auth/tokens', {
        userName: username,
        password: password,
      })

      const initialToken = loginResponse.data.token
      const clients = loginResponse.data.clients || []

      if (!initialToken || clients.length === 0) {
        loginError.value = '登入失敗'
        return false
      }

      pendingUsername = username
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`
      availableClients.value = clients.map((c: any) => ({ id: c.id, name: c.name || '' }))

      // Auto-skip if only one client
      if (clients.length === 1) {
        await selectClient(clients[0].id)
      } else {
        loginStep.value = 'client'
      }

      return true
    } catch {
      loginError.value = '登入失敗，請檢查帳號密碼'
      return false
    } finally {
      loginLoading.value = false
    }
  }

  /**
   * Step 2: Select client → fetch roles
   */
  async function selectClient(clientId: number): Promise<void> {
    loginLoading.value = true
    loginError.value = ''

    try {
      pendingClientId = clientId
      pendingClientName = availableClients.value.find(c => c.id === clientId)?.name || ''

      const rolesResponse = await apiClient.get(`/api/v1/auth/roles?client=${clientId}`)
      const roles = rolesResponse.data.roles || []

      if (roles.length === 0) {
        loginError.value = '此公司無可用角色'
        return
      }

      availableRoles.value = roles.map((r: any) => ({ id: r.id, name: r.name || '' }))

      if (roles.length === 1) {
        await selectRole(roles[0].id)
      } else {
        loginStep.value = 'role'
      }
    } catch {
      loginError.value = '載入角色失敗'
    } finally {
      loginLoading.value = false
    }
  }

  /**
   * Step 3: Select role → fetch organizations
   */
  async function selectRole(roleId: number): Promise<void> {
    loginLoading.value = true
    loginError.value = ''

    try {
      pendingRoleId = roleId
      pendingRoleName = availableRoles.value.find(r => r.id === roleId)?.name || ''

      const orgsResponse = await apiClient.get(`/api/v1/auth/organizations?client=${pendingClientId}&role=${roleId}`)
      const orgs = orgsResponse.data.organizations || []

      availableOrgs.value = orgs.map((o: any) => ({ id: o.id, name: o.name || '' }))

      if (orgs.length <= 1) {
        // 0 or 1 org: auto-select
        await selectOrg(orgs[0]?.id || 0)
      } else {
        loginStep.value = 'org'
      }
    } catch {
      loginError.value = '載入組織失敗'
    } finally {
      loginLoading.value = false
    }
  }

  /**
   * Step 4: Select organization → fetch warehouses
   */
  async function selectOrg(orgId: number): Promise<void> {
    loginLoading.value = true
    loginError.value = ''

    try {
      pendingOrgId = orgId
      pendingOrgName = availableOrgs.value.find(o => o.id === orgId)?.name || (orgId === 0 ? '*' : '')

      const whResponse = await apiClient.get(`/api/v1/auth/warehouses?client=${pendingClientId}&role=${pendingRoleId}&organization=${orgId}`)
      const warehouses = whResponse.data.warehouses || []

      availableWarehouses.value = warehouses.map((w: any) => ({ id: w.id, name: w.name || '' }))

      if (warehouses.length <= 1) {
        await selectWarehouse(warehouses[0]?.id || 0)
      } else {
        loginStep.value = 'warehouse'
      }
    } catch {
      loginError.value = '載入倉庫失敗'
    } finally {
      loginLoading.value = false
    }
  }

  /**
   * Step 5: Select warehouse → finalize login (PUT /auth/tokens)
   */
  async function selectWarehouse(warehouseId: number): Promise<void> {
    loginLoading.value = true
    loginError.value = ''

    try {
      const whName = availableWarehouses.value.find(w => w.id === warehouseId)?.name || ''

      const contextResponse = await apiClient.put('/api/v1/auth/tokens', {
        clientId: pendingClientId,
        roleId: pendingRoleId,
        organizationId: pendingOrgId,
        warehouseId: warehouseId,
      })

      const finalToken = contextResponse.data.token

      // Save authentication
      token.value = finalToken
      localStorage.setItem('token', finalToken)
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${finalToken}`

      context.value = {
        clientId: pendingClientId,
        clientName: pendingClientName,
        roleId: pendingRoleId,
        roleName: pendingRoleName,
        organizationId: pendingOrgId,
        organizationName: pendingOrgName,
        warehouseId: warehouseId,
        warehouseName: whName,
      }

      user.value = {
        id: 0,
        name: pendingUsername,
        role: pendingRoleName || 'user',
      }

      loginStep.value = 'done'

      // Persist to localStorage for page refresh
      localStorage.setItem('auth_context', JSON.stringify(context.value))
      localStorage.setItem('auth_user', JSON.stringify(user.value))
      localStorage.setItem('auth_clients', JSON.stringify(availableClients.value))
      localStorage.setItem('auth_orgs', JSON.stringify(availableOrgs.value))
    } catch {
      loginError.value = '設定環境失敗'
    } finally {
      loginLoading.value = false
    }
  }

  /**
   * Go back one step in the login flow
   */
  function loginGoBack(): void {
    loginError.value = ''
    switch (loginStep.value) {
      case 'client': loginStep.value = 'credentials'; break
      case 'role': loginStep.value = 'client'; break
      case 'org': loginStep.value = 'role'; break
      case 'warehouse': loginStep.value = 'org'; break
    }
  }

  /**
   * Legacy login: auto-selects everything (for backward compatibility / tests)
   */
  async function login(username: string, password: string): Promise<boolean> {
    try {
      const loginResponse = await apiClient.post('/api/v1/auth/tokens', {
        userName: username,
        password: password,
      })

      const initialToken = loginResponse.data.token
      const clients = loginResponse.data.clients

      if (!initialToken || !clients?.length) {
        return false
      }

      const clientId = clients[0].id
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`

      const rolesResponse = await apiClient.get(`/api/v1/auth/roles?client=${clientId}`)
      const roles = rolesResponse.data.roles
      if (!roles?.length) return false
      const roleId = roles[0].id

      const orgsResponse = await apiClient.get(`/api/v1/auth/organizations?client=${clientId}&role=${roleId}`)
      const orgs = orgsResponse.data.organizations
      const orgId = orgs?.[0]?.id || 0

      const whResponse = await apiClient.get(`/api/v1/auth/warehouses?client=${clientId}&role=${roleId}&organization=${orgId}`)
      const warehouses = whResponse.data.warehouses
      const whId = warehouses?.[0]?.id || 0

      const contextResponse = await apiClient.put('/api/v1/auth/tokens', {
        clientId, roleId, organizationId: orgId, warehouseId: whId,
      })

      const finalToken = contextResponse.data.token
      token.value = finalToken
      localStorage.setItem('token', finalToken)
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${finalToken}`

      context.value = {
        clientId, clientName: clients[0].name || '',
        roleId, roleName: roles[0].name || '',
        organizationId: orgId, organizationName: orgs?.[0]?.name || '*',
        warehouseId: whId, warehouseName: warehouses?.[0]?.name || '',
      }

      user.value = { id: 0, name: username, role: roles[0].name || 'user' }
      loginStep.value = 'done'

      // Persist to localStorage for page refresh
      localStorage.setItem('auth_context', JSON.stringify(context.value))
      localStorage.setItem('auth_user', JSON.stringify(user.value))

      return true
    } catch {
      return false
    }
  }

  /**
   * Switch context: keep token but re-select client/role/org/warehouse.
   * If clients list is empty (after page refresh), falls back to full re-login.
   */
  function switchContext(): void {
    context.value = null
    user.value = null
    loginError.value = ''
    localStorage.removeItem('auth_context')
    localStorage.removeItem('auth_user')
    clearLookupCache()

    if (availableClients.value.length > 0) {
      loginStep.value = 'client'
    } else {
      // No cached clients → must re-authenticate
      logout()
    }
  }

  function logout() {
    token.value = null
    user.value = null
    context.value = null
    loginStep.value = 'credentials'
    availableClients.value = []
    availableRoles.value = []
    availableOrgs.value = []
    availableWarehouses.value = []
    loginError.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('auth_context')
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_clients')
    localStorage.removeItem('auth_orgs')
    delete apiClient.defaults.headers.common['Authorization']
    clearLookupCache()
  }

  // 初始化：如果有 token + context，還原登入狀態
  if (token.value) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
    const savedContext = localStorage.getItem('auth_context')
    const savedUser = localStorage.getItem('auth_user')
    const savedClients = localStorage.getItem('auth_clients')
    if (savedContext && savedUser) {
      try {
        context.value = JSON.parse(savedContext)
        user.value = JSON.parse(savedUser)
        if (savedClients) {
          availableClients.value = JSON.parse(savedClients)
        }
        const savedOrgs = localStorage.getItem('auth_orgs')
        if (savedOrgs) {
          availableOrgs.value = JSON.parse(savedOrgs)
        }
        loginStep.value = 'done'
      } catch {
        // 損壞資料 → 強制重新登入
        localStorage.removeItem('token')
        localStorage.removeItem('auth_context')
        localStorage.removeItem('auth_user')
        localStorage.removeItem('auth_clients')
        localStorage.removeItem('auth_orgs')
        token.value = null
      }
    } else {
      // Token 存在但缺 context → stale session → 強制重新登入
      localStorage.removeItem('token')
      token.value = null
    }
  }

  return {
    token,
    user,
    context,
    isAuthenticated,
    loginStep,
    loginError,
    loginLoading,
    availableClients,
    availableRoles,
    availableOrgs,
    availableWarehouses,
    authenticate,
    selectClient,
    selectRole,
    selectOrg,
    selectWarehouse,
    loginGoBack,
    login,
    switchContext,
    logout,
  }
})
