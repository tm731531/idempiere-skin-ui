import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listProductConversions,
  createConversion,
  deleteConversion,
} from '../uomConversion'
import { apiClient } from '../client'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)
const mockPut = vi.mocked(apiClient.put)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listProductConversions', () => {
  it('returns product-specific conversions', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: {
          records: [{
            id: 1,
            M_Product_ID: { id: 100 },
            C_UOM_ID: { id: 10, identifier: 'Each' },
            C_UOM_To_ID: { id: 20, identifier: 'Pack' },
            MultiplyRate: 12,
            DivideRate: 0.083,
          }],
        },
      })
      .mockResolvedValueOnce({ data: { records: [] } })

    const result = await listProductConversions(100)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 1,
      productId: 100,
      fromUomId: 10,
      fromUomName: 'Each',
      toUomId: 20,
      toUomName: 'Pack',
      multiplyRate: 12,
      divideRate: 0.083,
    })
  })

  it('merges generic conversions (no overlap)', async () => {
    // Product-specific
    mockGet.mockResolvedValueOnce({
      data: {
        records: [{
          id: 1,
          M_Product_ID: { id: 100 },
          C_UOM_ID: { id: 10, identifier: 'Each' },
          C_UOM_To_ID: { id: 20, identifier: 'Pack' },
          MultiplyRate: 12,
          DivideRate: 0.083,
        }],
      },
    })
    // Generic
    mockGet.mockResolvedValueOnce({
      data: {
        records: [{
          id: 2,
          M_Product_ID: 0,
          C_UOM_ID: { id: 10, identifier: 'Each' },
          C_UOM_To_ID: { id: 30, identifier: 'Gram' },
          MultiplyRate: 1000,
          DivideRate: 0.001,
        }],
      },
    })

    const result = await listProductConversions(100)
    expect(result).toHaveLength(2)
    expect(result.map(c => c.toUomName)).toEqual(['Pack', 'Gram'])
  })

  it('product-specific takes precedence over generic', async () => {
    // Both have same from→to UOM pair
    mockGet
      .mockResolvedValueOnce({
        data: {
          records: [{
            id: 1,
            M_Product_ID: { id: 100 },
            C_UOM_ID: { id: 10, identifier: 'Each' },
            C_UOM_To_ID: { id: 20, identifier: 'Pack' },
            MultiplyRate: 6,
            DivideRate: 0.167,
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          records: [{
            id: 2,
            M_Product_ID: 0,
            C_UOM_ID: { id: 10, identifier: 'Each' },
            C_UOM_To_ID: { id: 20, identifier: 'Pack' },
            MultiplyRate: 12,
            DivideRate: 0.083,
          }],
        },
      })

    const result = await listProductConversions(100)
    expect(result).toHaveLength(1)
    expect(result[0]?.multiplyRate).toBe(6) // Product-specific wins
  })
})

describe('createConversion', () => {
  it('creates conversion with calculated divideRate', async () => {
    mockPost.mockResolvedValue({ data: { id: 42 } })

    const result = await createConversion({
      productId: 100,
      fromUomId: 10,
      toUomId: 20,
      multiplyRate: 12,
      orgId: 11,
    })

    expect(result.id).toBe(42)
    expect(result.divideRate).toBeCloseTo(1 / 12)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/C_UOM_Conversion', expect.objectContaining({
      'M_Product_ID': 100,
      'MultiplyRate': 12,
    }))
  })

  it('handles zero multiplyRate', async () => {
    mockPost.mockResolvedValue({ data: { id: 43 } })

    const result = await createConversion({
      productId: 100,
      fromUomId: 10,
      toUomId: 20,
      multiplyRate: 0,
      orgId: 11,
    })

    expect(result.divideRate).toBe(0)
  })
})

describe('deleteConversion', () => {
  it('deactivates the conversion', async () => {
    await deleteConversion(42)
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/C_UOM_Conversion/42', {
      'IsActive': false,
    })
  })
})
