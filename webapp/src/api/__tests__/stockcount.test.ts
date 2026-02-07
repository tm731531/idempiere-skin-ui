/**
 * Stock Count API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listCountTasks,
  createCountTask,
  updateCountTask,
  completeCountTask,
  deleteCountTask,
  type CountTask,
} from '../stockcount'
import { apiClient } from '../client'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)
const mockPut = vi.mocked(apiClient.put)
const mockDelete = vi.mocked(apiClient.delete)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listCountTasks', () => {
  it('returns parsed tasks from AD_SysConfig', async () => {
    const taskData = {
      name: 'Monthly count',
      warehouseName: 'Main',
      status: 'PENDING',
      lines: [{ productId: 100, productName: 'Aspirin', locatorName: 'L1', systemQty: 50, actualQty: null, variance: 0 }],
      createdAt: '2025-01-01T00:00:00Z',
    }

    mockGet.mockResolvedValue({
      data: {
        records: [{ id: 1, Name: 'CLINIC_COUNT_TASK_123', Value: JSON.stringify(taskData) }],
      },
    })

    const tasks = await listCountTasks()

    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('CLINIC_COUNT_TASK_123')
    expect(tasks[0].configId).toBe(1)
    expect(tasks[0].name).toBe('Monthly count')
    expect(tasks[0].warehouseName).toBe('Main')
    expect(tasks[0].status).toBe('PENDING')
    expect(tasks[0].lines).toHaveLength(1)
  })

  it('skips records with invalid JSON', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 1, Name: 'CLINIC_COUNT_TASK_1', Value: 'invalid json' },
          { id: 2, Name: 'CLINIC_COUNT_TASK_2', Value: JSON.stringify({ name: 'Valid', warehouseName: 'WH', status: 'PENDING', lines: [], createdAt: '' }) },
        ],
      },
    })

    const tasks = await listCountTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].name).toBe('Valid')
  })

  it('returns empty array on API failure', async () => {
    mockGet.mockRejectedValue(new Error('Network'))
    const tasks = await listCountTasks()
    expect(tasks).toEqual([])
  })
})

describe('createCountTask', () => {
  it('creates a task via AD_SysConfig POST', async () => {
    mockPost.mockResolvedValue({ data: { id: 999 } })

    const lines = [{ productId: 100, productName: 'Aspirin', locatorName: 'L1', systemQty: 50, actualQty: null, variance: 0 }]
    const task = await createCountTask('Monthly', 'Main WH', lines, 11)

    expect(task.name).toBe('Monthly')
    expect(task.warehouseName).toBe('Main WH')
    expect(task.status).toBe('PENDING')
    expect(task.configId).toBe(999)
    expect(task.id).toContain('CLINIC_COUNT_TASK_')
    expect(task.lines).toHaveLength(1)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', expect.objectContaining({
      'AD_Org_ID': 11,
      'ConfigurationLevel': 'S',
    }))
  })
})

describe('updateCountTask', () => {
  it('updates by configId when available', async () => {
    mockPut.mockResolvedValue({ data: {} })

    const task: CountTask = {
      id: 'CLINIC_COUNT_TASK_123',
      configId: 999,
      name: 'Test',
      warehouseName: 'WH',
      status: 'IN_PROGRESS',
      lines: [],
      createdAt: '2025-01-01T00:00:00Z',
    }

    await updateCountTask(task)
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/999', expect.any(Object))
  })

  it('looks up by Name when configId is missing', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 888 }] },
    })
    mockPut.mockResolvedValue({ data: {} })

    const task: CountTask = {
      id: 'CLINIC_COUNT_TASK_123',
      name: 'Test',
      warehouseName: 'WH',
      status: 'IN_PROGRESS',
      lines: [],
      createdAt: '2025-01-01T00:00:00Z',
    }

    await updateCountTask(task)
    expect(mockGet).toHaveBeenCalled()
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/888', expect.any(Object))
  })
})

describe('completeCountTask', () => {
  it('sets status to COMPLETED and calls update', async () => {
    mockPut.mockResolvedValue({ data: {} })

    const task: CountTask = {
      id: 'CLINIC_COUNT_TASK_123',
      configId: 999,
      name: 'Test',
      warehouseName: 'WH',
      status: 'IN_PROGRESS',
      lines: [],
      createdAt: '2025-01-01T00:00:00Z',
    }

    await completeCountTask(task)
    expect(task.status).toBe('COMPLETED')
    expect(task.completedAt).toBeDefined()
    expect(mockPut).toHaveBeenCalled()
  })
})

describe('deleteCountTask', () => {
  it('finds and deletes the AD_SysConfig record', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 999 }] },
    })
    mockDelete.mockResolvedValue({ data: {} })

    await deleteCountTask('CLINIC_COUNT_TASK_123')

    expect(mockGet).toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/999')
  })

  it('does nothing if record not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })

    await deleteCountTask('CLINIC_COUNT_TASK_MISSING')
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
