import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getSysConfigValue,
  getSysConfigRecord,
  upsertSysConfig,
  listSysConfigByPrefix,
  batchGetSysConfig,
  deleteSysConfig,
} from '../sysconfig'
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

describe('getSysConfigValue', () => {
  it('returns value when found', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 1, Name: 'TEST', Value: 'hello' }] } })
    expect(await getSysConfigValue('TEST')).toBe('hello')
  })

  it('returns null when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    expect(await getSysConfigValue('MISSING')).toBeNull()
  })
})

describe('getSysConfigRecord', () => {
  it('returns record when found', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 42, Name: 'KEY', Value: 'val' }] } })
    const record = await getSysConfigRecord('KEY')
    expect(record).toEqual({ id: 42, name: 'KEY', value: 'val' })
  })

  it('returns null when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    expect(await getSysConfigRecord('MISSING')).toBeNull()
  })
})

describe('upsertSysConfig', () => {
  it('updates existing record', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 10 }] } })
    await upsertSysConfig('KEY', 'newval', 11)
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/10', { 'Value': 'newval' })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('creates new record when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await upsertSysConfig('KEY', 'val', 11, 'test desc')
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': 11,
      'Name': 'KEY',
      'Value': 'val',
      'Description': 'test desc',
      'ConfigurationLevel': 'S',
    })
  })

  it('uses name as default description', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await upsertSysConfig('MY_KEY', 'val', 11)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', expect.objectContaining({
      'Description': 'MY_KEY',
    }))
  })
})

describe('listSysConfigByPrefix', () => {
  it('returns mapped records', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 1, Name: 'PREFIX_A', Value: 'va' },
          { id: 2, Name: 'PREFIX_B', Value: 'vb' },
        ],
      },
    })
    const result = await listSysConfigByPrefix('PREFIX_')
    expect(result).toEqual([
      { id: 1, name: 'PREFIX_A', value: 'va' },
      { id: 2, name: 'PREFIX_B', value: 'vb' },
    ])
  })

  it('passes orderBy and top params', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await listSysConfigByPrefix('PFX', 'Name asc', 10)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      params: {
        '$filter': "contains(Name,'PFX')",
        '$orderby': 'Name asc',
        '$top': 10,
      },
    })
  })
})

describe('batchGetSysConfig', () => {
  it('returns empty for empty input', async () => {
    expect(await batchGetSysConfig([])).toEqual({})
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns map of name to value', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { Name: 'A', Value: '1' },
          { Name: 'B', Value: '2' },
        ],
      },
    })
    expect(await batchGetSysConfig(['A', 'B'])).toEqual({ A: '1', B: '2' })
  })

  it('returns empty on error', async () => {
    mockGet.mockRejectedValue(new Error('fail'))
    expect(await batchGetSysConfig(['A'])).toEqual({})
  })
})

describe('deleteSysConfig', () => {
  it('deletes found record', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 99 }] } })
    await deleteSysConfig('KEY')
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/99')
  })

  it('does nothing when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await deleteSysConfig('MISSING')
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
