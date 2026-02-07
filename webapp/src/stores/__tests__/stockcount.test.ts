/**
 * Stock Count Store Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStockCountStore } from '../stockcount'
import * as stockcountApi from '@/api/stockcount'

vi.mock('@/api/stockcount', () => ({
  listCountTasks: vi.fn(),
  createCountTask: vi.fn(),
  updateCountTask: vi.fn(),
  completeCountTask: vi.fn(),
  deleteCountTask: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { defaults: { headers: { common: {} } } },
}))

vi.mock('@/config', () => ({
  getApiBaseUrl: () => '',
  getConfig: () => ({ apiBaseUrl: '' }),
  loadConfig: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('Stock Count Store', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const store = useStockCountStore()
      expect(store.tasks).toEqual([])
      expect(store.currentTask).toBeNull()
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  describe('loadTasks', () => {
    it('loads tasks from API', async () => {
      const tasks = [
        { id: 'CLINIC_COUNT_TASK_1', name: 'Task 1', warehouseName: 'WH', status: 'PENDING' as const, lines: [], createdAt: '' },
      ]
      vi.mocked(stockcountApi.listCountTasks).mockResolvedValue(tasks)

      const store = useStockCountStore()
      await store.loadTasks()

      expect(store.tasks).toEqual(tasks)
      expect(store.isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      vi.mocked(stockcountApi.listCountTasks).mockRejectedValue(new Error('Network'))

      const store = useStockCountStore()
      await store.loadTasks()

      expect(store.error).toBe('Network')
    })
  })

  describe('selectTask', () => {
    it('creates deep copy and sets as current', () => {
      const store = useStockCountStore()
      const task = {
        id: 'CLINIC_COUNT_TASK_1',
        name: 'Test',
        warehouseName: 'WH',
        status: 'PENDING' as const,
        lines: [{ productId: 100, productName: 'Aspirin', locatorName: 'L1', systemQty: 50, actualQty: null, variance: 0 }],
        createdAt: '',
      }

      store.selectTask(task)

      expect(store.currentTask).not.toBeNull()
      expect(store.currentTask!.name).toBe('Test')
      // Should be deep copy
      expect(store.currentTask!.lines).not.toBe(task.lines)
      // Auto-set to IN_PROGRESS
      expect(store.currentTask!.status).toBe('IN_PROGRESS')
    })
  })

  describe('updateLine', () => {
    it('updates line actual qty and variance', async () => {
      vi.mocked(stockcountApi.updateCountTask).mockResolvedValue()

      const store = useStockCountStore()
      store.selectTask({
        id: 'CLINIC_COUNT_TASK_1',
        name: 'Test',
        warehouseName: 'WH',
        status: 'PENDING' as const,
        lines: [{ productId: 100, productName: 'Aspirin', locatorName: 'L1', systemQty: 50, actualQty: null, variance: 0 }],
        createdAt: '',
      })

      await store.updateLine(0, 48)

      expect(store.currentTask!.lines[0].actualQty).toBe(48)
      expect(store.currentTask!.lines[0].variance).toBe(-2) // 48 - 50
      expect(stockcountApi.updateCountTask).toHaveBeenCalled()
    })

    it('updates reason when provided', async () => {
      vi.mocked(stockcountApi.updateCountTask).mockResolvedValue()

      const store = useStockCountStore()
      store.selectTask({
        id: 'CLINIC_COUNT_TASK_1',
        name: 'Test',
        warehouseName: 'WH',
        status: 'PENDING' as const,
        lines: [{ productId: 100, productName: 'Aspirin', locatorName: 'L1', systemQty: 50, actualQty: null, variance: 0 }],
        createdAt: '',
      })

      await store.updateLine(0, 48, 'Broken items')

      expect(store.currentTask!.lines[0].reason).toBe('Broken items')
    })
  })

  describe('completeTask', () => {
    it('completes task when all lines counted', async () => {
      vi.mocked(stockcountApi.completeCountTask).mockResolvedValue()

      const store = useStockCountStore()
      store.selectTask({
        id: 'CLINIC_COUNT_TASK_1',
        name: 'Test',
        warehouseName: 'WH',
        status: 'IN_PROGRESS' as const,
        lines: [{ productId: 100, productName: 'Aspirin', locatorName: 'L1', systemQty: 50, actualQty: 50, variance: 0 }],
        createdAt: '',
      })

      store.tasks = [{ ...store.currentTask! }]
      const result = await store.completeTask()

      expect(result).toBe(true)
      expect(store.currentTask).toBeNull()
    })

    it('fails when not all lines counted', async () => {
      const store = useStockCountStore()
      store.selectTask({
        id: 'CLINIC_COUNT_TASK_1',
        name: 'Test',
        warehouseName: 'WH',
        status: 'IN_PROGRESS' as const,
        lines: [{ productId: 100, productName: 'Aspirin', locatorName: 'L1', systemQty: 50, actualQty: null, variance: 0 }],
        createdAt: '',
      })

      const result = await store.completeTask()
      expect(result).toBe(false)
      expect(store.error).toBe('All lines must be counted before completing')
    })

    it('fails when no active task', async () => {
      const store = useStockCountStore()
      const result = await store.completeTask()
      expect(result).toBe(false)
    })
  })

  describe('createNewTask', () => {
    it('creates task and adds to list', async () => {
      const newTask = {
        id: 'CLINIC_COUNT_TASK_new',
        name: 'New Count',
        warehouseName: 'WH',
        status: 'PENDING' as const,
        lines: [],
        createdAt: '',
      }
      vi.mocked(stockcountApi.createCountTask).mockResolvedValue(newTask)

      const store = useStockCountStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 11, warehouseId: 1 }

      const result = await store.createNewTask('New Count', 'WH', [])

      expect(result).toBe(true)
      expect(store.tasks).toHaveLength(1)
      expect(store.tasks[0].name).toBe('New Count')
    })

    it('returns false without org context', async () => {
      const store = useStockCountStore()
      const result = await store.createNewTask('Test', 'WH', [])
      expect(result).toBe(false)
      expect(store.error).toBe('Organization not set')
    })

    it('handles orgId=0 correctly', async () => {
      const newTask = {
        id: 'CLINIC_COUNT_TASK_new',
        name: 'Count',
        warehouseName: 'WH',
        status: 'PENDING' as const,
        lines: [],
        createdAt: '',
      }
      vi.mocked(stockcountApi.createCountTask).mockResolvedValue(newTask)

      const store = useStockCountStore()
      const { useAuthStore } = await import('../auth')
      const authStore = useAuthStore()
      authStore.context = { clientId: 1, roleId: 1, organizationId: 0, warehouseId: 1 }

      const result = await store.createNewTask('Count', 'WH', [])
      expect(result).toBe(true)
    })
  })

  describe('deleteTask', () => {
    it('deletes task and removes from list', async () => {
      vi.mocked(stockcountApi.deleteCountTask).mockResolvedValue()

      const store = useStockCountStore()
      store.tasks = [
        { id: 'CLINIC_COUNT_TASK_1', name: 'Task 1', warehouseName: 'WH', status: 'PENDING', lines: [], createdAt: '' },
        { id: 'CLINIC_COUNT_TASK_2', name: 'Task 2', warehouseName: 'WH', status: 'PENDING', lines: [], createdAt: '' },
      ]

      await store.deleteTask('CLINIC_COUNT_TASK_1')

      expect(store.tasks).toHaveLength(1)
      expect(store.tasks[0].id).toBe('CLINIC_COUNT_TASK_2')
    })

    it('clears current task if deleted', async () => {
      vi.mocked(stockcountApi.deleteCountTask).mockResolvedValue()

      const store = useStockCountStore()
      const task = { id: 'CLINIC_COUNT_TASK_1', name: 'Task 1', warehouseName: 'WH', status: 'PENDING' as const, lines: [], createdAt: '' }
      store.tasks = [task]
      store.selectTask(task)

      await store.deleteTask('CLINIC_COUNT_TASK_1')
      expect(store.currentTask).toBeNull()
    })
  })

  describe('getters', () => {
    it('filters tasks by status', () => {
      const store = useStockCountStore()
      store.tasks = [
        { id: '1', name: 'A', warehouseName: 'W', status: 'PENDING', lines: [], createdAt: '' },
        { id: '2', name: 'B', warehouseName: 'W', status: 'IN_PROGRESS', lines: [], createdAt: '' },
        { id: '3', name: 'C', warehouseName: 'W', status: 'COMPLETED', lines: [], createdAt: '' },
      ]

      expect(store.pendingTasks).toHaveLength(1)
      expect(store.inProgressTasks).toHaveLength(1)
      expect(store.completedTasks).toHaveLength(1)
    })

    it('allLinesCounted returns true when all counted', () => {
      const store = useStockCountStore()
      store.selectTask({
        id: '1', name: 'Test', warehouseName: 'W', status: 'IN_PROGRESS' as const,
        lines: [
          { productId: 1, productName: 'A', locatorName: 'L', systemQty: 10, actualQty: 10, variance: 0 },
          { productId: 2, productName: 'B', locatorName: 'L', systemQty: 20, actualQty: 18, variance: -2 },
        ],
        createdAt: '',
      })

      expect(store.allLinesCounted).toBe(true)
    })

    it('allLinesCounted returns false when some not counted', () => {
      const store = useStockCountStore()
      store.selectTask({
        id: '1', name: 'Test', warehouseName: 'W', status: 'IN_PROGRESS' as const,
        lines: [
          { productId: 1, productName: 'A', locatorName: 'L', systemQty: 10, actualQty: 10, variance: 0 },
          { productId: 2, productName: 'B', locatorName: 'L', systemQty: 20, actualQty: null, variance: 0 },
        ],
        createdAt: '',
      })

      expect(store.allLinesCounted).toBe(false)
    })
  })

  describe('clearCurrent', () => {
    it('clears current task and error', () => {
      const store = useStockCountStore()
      store.selectTask({
        id: '1', name: 'Test', warehouseName: 'W', status: 'PENDING' as const, lines: [], createdAt: '',
      })
      store.error = 'some error'

      store.clearCurrent()
      expect(store.currentTask).toBeNull()
      expect(store.error).toBeNull()
    })
  })
})
