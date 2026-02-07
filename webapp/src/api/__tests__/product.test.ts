/**
 * Product API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProduct, listProductCategories, findProductByBarcode } from '../product'
import { apiClient } from '../client'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../lookup', () => ({
  lookupEachUomId: vi.fn().mockResolvedValue(200),
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createProduct', () => {
  it('sends POST with correct fields, resolves UOM and category', async () => {
    // listProductCategories call (for default category)
    mockGet
      .mockResolvedValueOnce({
        data: {
          records: [
            { id: 50, Name: 'Default Category', IsDefault: true },
            { id: 51, Name: 'Other', IsDefault: false },
          ],
        },
      })
      // lookupDefaultTaxCategory call
      .mockResolvedValueOnce({
        data: {
          records: [
            { id: 300, Name: 'Standard Tax', IsDefault: true },
          ],
        },
      })

    mockPost.mockResolvedValue({
      data: {
        id: 999,
        Name: 'Test Drug',
        Value: 'DRUG001',
      },
    })

    const result = await createProduct({
      name: 'Test Drug',
      value: 'DRUG001',
      orgId: 11,
    })

    expect(result).toEqual({
      id: 999,
      name: 'Test Drug',
      value: 'DRUG001',
    })

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_Product', expect.objectContaining({
      'AD_Org_ID': 11,
      'Name': 'Test Drug',
      'Value': 'DRUG001',
      'M_Product_Category_ID': 50,
      'C_UOM_ID': 200,
      'ProductType': 'I',
      'C_TaxCategory_ID': 300,
    }))
  })

  it('uses provided uomId and categoryId when given', async () => {
    // lookupDefaultTaxCategory call
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 300, Name: 'Standard Tax', IsDefault: true },
        ],
      },
    })

    mockPost.mockResolvedValue({
      data: {
        id: 1000,
        Name: 'Custom Product',
        Value: 'CUSTOM001',
      },
    })

    const result = await createProduct({
      name: 'Custom Product',
      value: 'CUSTOM001',
      orgId: 11,
      productCategoryId: 77,
      uomId: 88,
    })

    expect(result.id).toBe(1000)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_Product', expect.objectContaining({
      'M_Product_Category_ID': 77,
      'C_UOM_ID': 88,
    }))
  })
})

describe('listProductCategories', () => {
  it('returns mapped categories', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 50, Name: 'Default Category', IsDefault: true },
          { id: 51, Name: 'Supplements', IsDefault: false },
        ],
      },
    })

    const result = await listProductCategories()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 50, name: 'Default Category', isDefault: true })
    expect(result[1]).toEqual({ id: 51, name: 'Supplements', isDefault: false })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/M_Product_Category', {
      params: {
        '$filter': 'IsActive eq true',
        '$select': 'M_Product_Category_ID,Name,IsDefault',
        '$orderby': 'IsDefault desc, Name asc',
        '$top': 50,
      },
    })
  })

  it('returns empty array when no records', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await listProductCategories()
    expect(result).toEqual([])
  })
})

describe('findProductByBarcode', () => {
  it('returns product when found', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 100, Name: 'Aspirin', Value: 'MED001' },
        ],
      },
    })

    const result = await findProductByBarcode('MED001')
    expect(result).toEqual({ id: 100, name: 'Aspirin', value: 'MED001' })
  })

  it('returns null when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await findProductByBarcode('NOTEXIST')
    expect(result).toBeNull()
  })

  it('escapes special characters in barcode', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await findProductByBarcode("O'Brien<test>")

    const call = mockGet.mock.calls[0]
    const filter = call[1]?.params?.['$filter']
    // Single quotes escaped to double quotes
    expect(filter).toContain("O''Brien")
    // Angle brackets stripped
    expect(filter).not.toContain('<test>')
    expect(filter).not.toContain('<')
    expect(filter).not.toContain('>')
  })
})
