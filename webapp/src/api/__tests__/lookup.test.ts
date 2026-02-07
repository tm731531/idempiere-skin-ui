/**
 * Lookup API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lookupCustomerGroupId, lookupDocTypeId, lookupEachUomId, clearLookupCache } from '../lookup'
import { apiClient } from '../client'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const mockGet = vi.mocked(apiClient.get)

beforeEach(() => {
  vi.clearAllMocks()
  clearLookupCache()
})

describe('lookupCustomerGroupId', () => {
  it('returns first record id', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 101, Name: 'Standard', IsDefault: false },
        ],
      },
    })

    const id = await lookupCustomerGroupId()
    expect(id).toBe(101)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/C_BP_Group', {
      params: {
        '$filter': 'IsActive eq true',
        '$select': 'C_BP_Group_ID,Name,IsDefault',
        '$orderby': 'IsDefault desc, Name asc',
        '$top': 5,
      },
    })
  })

  it('prefers IsDefault=true record', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 200, Name: 'Default Group', IsDefault: true },
          { id: 101, Name: 'Standard', IsDefault: false },
        ],
      },
    })

    const id = await lookupCustomerGroupId()
    expect(id).toBe(200)
  })

  it('uses cache on second call', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 101, Name: 'Standard', IsDefault: false },
        ],
      },
    })

    const id1 = await lookupCustomerGroupId()
    const id2 = await lookupCustomerGroupId()
    expect(id1).toBe(101)
    expect(id2).toBe(101)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('returns 0 when no records', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const id = await lookupCustomerGroupId()
    expect(id).toBe(0)
  })
})

describe('lookupDocTypeId', () => {
  it('returns correct id for MMM', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 143, Name: 'MM Movement' },
        ],
      },
    })

    const id = await lookupDocTypeId('MMM')
    expect(id).toBe(143)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/C_DocType', {
      params: {
        '$filter': "DocBaseType eq 'MMM' and IsActive eq true",
        '$select': 'C_DocType_ID,Name',
        '$top': 1,
      },
    })
  })

  it('caches by docBaseType', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { records: [{ id: 143, Name: 'MM Movement' }] } })
      .mockResolvedValueOnce({ data: { records: [{ id: 122, Name: 'MM Receipt' }] } })

    const mmm1 = await lookupDocTypeId('MMM')
    const mmm2 = await lookupDocTypeId('MMM')
    const mmr = await lookupDocTypeId('MMR')

    expect(mmm1).toBe(143)
    expect(mmm2).toBe(143)
    expect(mmr).toBe(122)
    // First call for MMM + first call for MMR = 2
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('returns 0 when no records', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const id = await lookupDocTypeId('ZZZ')
    expect(id).toBe(0)
  })
})

describe('lookupEachUomId', () => {
  it('returns correct id', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 100, Name: 'Each' },
        ],
      },
    })

    const id = await lookupEachUomId()
    expect(id).toBe(100)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/C_UOM', {
      params: {
        '$filter': "X12DE355 eq 'EA' and IsActive eq true",
        '$select': 'C_UOM_ID,Name',
        '$top': 1,
      },
    })
  })

  it('caches on second call', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 100, Name: 'Each' },
        ],
      },
    })

    const id1 = await lookupEachUomId()
    const id2 = await lookupEachUomId()
    expect(id1).toBe(100)
    expect(id2).toBe(100)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('returns 0 when no records', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const id = await lookupEachUomId()
    expect(id).toBe(0)
  })
})

describe('clearLookupCache', () => {
  it('clears the cache so next call re-queries', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 100, Name: 'Each' },
        ],
      },
    })

    // First call populates cache
    await lookupEachUomId()
    expect(mockGet).toHaveBeenCalledTimes(1)

    // Second call uses cache
    await lookupEachUomId()
    expect(mockGet).toHaveBeenCalledTimes(1)

    // Clear cache
    clearLookupCache()

    // Third call re-queries
    await lookupEachUomId()
    expect(mockGet).toHaveBeenCalledTimes(2)
  })
})
