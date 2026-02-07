import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ensureResourceType,
  listResources,
  createResource,
  deleteResource,
} from '../resource'
import { apiClient } from '../client'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../lookup', () => ({
  lookupEachUomId: vi.fn().mockResolvedValue(100),
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)
const mockPut = vi.mocked(apiClient.put)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ensureResourceType', () => {
  it('returns existing resource type id', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 5, Name: 'Doctor' }] } })
    expect(await ensureResourceType(11)).toBe(5)
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('creates resource type when none exists', async () => {
    // First call: no existing resource types
    mockGet
      .mockResolvedValueOnce({ data: { records: [] } })
      // lookupDefaultTaxCategory
      .mockResolvedValueOnce({ data: { records: [{ id: 50 }] } })
      // lookupDefaultProductCategory
      .mockResolvedValueOnce({ data: { records: [{ id: 60 }] } })

    mockPost.mockResolvedValue({ data: { id: 99 } })

    expect(await ensureResourceType(11)).toBe(99)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/S_ResourceType', expect.objectContaining({
      'Name': 'Doctor',
      'AD_Org_ID': 11,
    }))
  })
})

describe('listResources', () => {
  it('returns mapped doctor resources', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          {
            id: 1,
            Name: 'Dr. Wang',
            Value: 'Dr. Wang',
            M_Warehouse_ID: { id: 10, identifier: 'Main WH' },
            IsAvailable: true,
          },
          {
            id: 2,
            Name: 'Dr. Chen',
            Value: 'Dr. Chen',
            M_Warehouse_ID: { id: 10, identifier: 'Main WH' },
            IsAvailable: false,
          },
        ],
      },
    })

    const result = await listResources()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 1,
      name: 'Dr. Wang',
      value: 'Dr. Wang',
      warehouseId: 10,
      warehouseName: 'Main WH',
      isAvailable: true,
    })
    expect(result[1]?.isAvailable).toBe(false)
  })

  it('returns empty array when no resources', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    expect(await listResources()).toEqual([])
  })
})

describe('createResource', () => {
  it('creates a resource with auto-resolved warehouse', async () => {
    // ensureResourceType: existing
    mockGet.mockResolvedValueOnce({ data: { records: [{ id: 5 }] } })
    // lookupDefaultWarehouse
    mockGet.mockResolvedValueOnce({ data: { records: [{ id: 10 }] } })

    mockPost.mockResolvedValue({ data: { id: 42 } })

    const result = await createResource({ name: 'Dr. Test', orgId: 11 })
    expect(result.id).toBe(42)
    expect(result.name).toBe('Dr. Test')
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/S_Resource', expect.objectContaining({
      'Name': 'Dr. Test',
      'S_ResourceType_ID': 5,
      'M_Warehouse_ID': 10,
    }))
  })
})

describe('deleteResource', () => {
  it('deactivates the resource', async () => {
    await deleteResource(42)
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/S_Resource/42', {
      'IsActive': false,
    })
  })
})
