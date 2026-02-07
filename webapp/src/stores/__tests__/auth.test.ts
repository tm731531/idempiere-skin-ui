/**
 * Auth Store Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/client', () => ({
  apiClient: {
    defaults: { headers: { common: {} } },
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('@/api/lookup', () => ({
  clearLookupCache: vi.fn(),
}))

vi.mock('@/config', () => ({
  getApiBaseUrl: () => '',
  getConfig: () => ({ apiBaseUrl: '' }),
  loadConfig: vi.fn(),
}))

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    _getStore: () => store,
    _setStore: (s: Record<string, string>) => { store = s },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

describe('Auth Store', () => {
  describe('context persistence', () => {
    it('saves context and user to localStorage on selectWarehouse', async () => {
      setActivePinia(createPinia())
      const { useAuthStore } = await import('../auth')
      const { apiClient } = await import('@/api/client')

      const store = useAuthStore()

      // Set up pending state (simulate earlier login steps)
      vi.mocked(apiClient.put).mockResolvedValue({
        data: { token: 'final-token-123' },
      })

      // Manually set availableWarehouses so name lookup works
      store.availableWarehouses = [{ id: 10, name: 'Main WH' }]

      // Need to set pending fields via internal state — call selectWarehouse directly
      await store.selectWarehouse(10)

      expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'final-token-123')
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'auth_context',
        expect.any(String)
      )
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'auth_user',
        expect.any(String)
      )

      // Verify stored context is valid JSON
      const contextCall = localStorageMock.setItem.mock.calls.find(
        (c: any) => c[0] === 'auth_context'
      )
      const parsed = JSON.parse(contextCall![1])
      expect(parsed).toHaveProperty('warehouseId', 10)
      expect(parsed).toHaveProperty('warehouseName', 'Main WH')
    })

    it('clears all auth data on logout', async () => {
      setActivePinia(createPinia())
      const { useAuthStore } = await import('../auth')
      const store = useAuthStore()

      store.logout()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_context')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
    })

    it('restores context from localStorage on init when token + context exist', async () => {
      const contextData = {
        clientId: 1, clientName: 'Test',
        roleId: 2, roleName: 'Admin',
        organizationId: 11, organizationName: 'Org',
        warehouseId: 10, warehouseName: 'WH',
      }
      const userData = { id: 0, name: 'testuser', role: 'Admin' }

      localStorageMock._setStore({
        token: 'saved-token',
        auth_context: JSON.stringify(contextData),
        auth_user: JSON.stringify(userData),
      })

      // Re-import to trigger init block with fresh localStorage
      vi.resetModules()
      const pinia = createPinia()
      setActivePinia(pinia)
      const { useAuthStore } = await import('../auth')
      const store = useAuthStore()

      expect(store.token).toBe('saved-token')
      expect(store.loginStep).toBe('done')
      expect(store.context).toEqual(contextData)
      expect(store.user).toEqual(userData)
      expect(store.isAuthenticated).toBe(true)
    })

    it('clears stale token when context is missing', async () => {
      localStorageMock._setStore({
        token: 'stale-token',
        // No auth_context or auth_user
      })

      vi.resetModules()
      const pinia = createPinia()
      setActivePinia(pinia)
      const { useAuthStore } = await import('../auth')
      const store = useAuthStore()

      expect(store.token).toBeNull()
      expect(store.loginStep).toBe('credentials')
      expect(store.isAuthenticated).toBe(false)
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token')
    })

    it('clears corrupted context data', async () => {
      localStorageMock._setStore({
        token: 'some-token',
        auth_context: 'invalid-json{{{',
        auth_user: 'also-invalid',
      })

      vi.resetModules()
      const pinia = createPinia()
      setActivePinia(pinia)
      const { useAuthStore } = await import('../auth')
      const store = useAuthStore()

      expect(store.token).toBeNull()
      expect(store.loginStep).toBe('credentials')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_context')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
    })
  })

  describe('authenticate', () => {
    it('shows client selection when multiple clients', async () => {
      setActivePinia(createPinia())
      const { useAuthStore } = await import('../auth')
      const { apiClient } = await import('@/api/client')
      const store = useAuthStore()

      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          token: 'initial-token',
          clients: [
            { id: 1, name: 'Client A' },
            { id: 2, name: 'Client B' },
          ],
        },
      })

      await store.authenticate('user', 'pass')

      expect(store.loginStep).toBe('client')
      expect(store.availableClients).toHaveLength(2)
    })

    it('auto-skips client selection with single client', async () => {
      setActivePinia(createPinia())
      const { useAuthStore } = await import('../auth')
      const { apiClient } = await import('@/api/client')
      const store = useAuthStore()

      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          token: 'initial-token',
          clients: [{ id: 1, name: 'Only Client' }],
        },
      })

      // Mock the cascade: selectClient → selectRole → selectOrg → selectWarehouse
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({ data: { roles: [{ id: 10, name: 'Admin' }] } }) // roles
        .mockResolvedValueOnce({ data: { organizations: [{ id: 11, name: 'Org' }] } }) // orgs
        .mockResolvedValueOnce({ data: { warehouses: [{ id: 20, name: 'WH' }] } }) // warehouses

      vi.mocked(apiClient.put).mockResolvedValue({ data: { token: 'final-token' } })

      await store.authenticate('user', 'pass')

      expect(store.loginStep).toBe('done')
      expect(store.isAuthenticated).toBe(true)
    })

    it('returns false on invalid credentials', async () => {
      setActivePinia(createPinia())
      const { useAuthStore } = await import('../auth')
      const { apiClient } = await import('@/api/client')
      const store = useAuthStore()

      vi.mocked(apiClient.post).mockRejectedValue(new Error('401'))

      const result = await store.authenticate('bad', 'bad')

      expect(result).toBe(false)
      expect(store.loginError).toBeTruthy()
    })
  })

  describe('loginGoBack', () => {
    it('goes back through steps', async () => {
      setActivePinia(createPinia())
      const { useAuthStore } = await import('../auth')
      const store = useAuthStore()

      store.loginStep = 'warehouse'
      store.loginGoBack()
      expect(store.loginStep).toBe('org')

      store.loginGoBack()
      expect(store.loginStep).toBe('role')

      store.loginGoBack()
      expect(store.loginStep).toBe('client')

      store.loginGoBack()
      expect(store.loginStep).toBe('credentials')
    })
  })
})
