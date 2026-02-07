/**
 * Purchase API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listVendors, getVendorLocationId, createPurchaseOrder } from '../purchase'
import { apiClient } from '../client'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../lookup', () => ({
  lookupDocTypeId: vi.fn().mockResolvedValue(1000),
  lookupEachUomId: vi.fn().mockResolvedValue(200),
  lookupPurchasePriceListId: vi.fn().mockResolvedValue(300),
  lookupPOCurrencyId: vi.fn().mockResolvedValue(400),
  lookupDefaultPaymentTermId: vi.fn().mockResolvedValue(500),
  lookupDefaultTaxId: vi.fn().mockResolvedValue(600),
  lookupCurrentUserId: vi.fn().mockResolvedValue(700),
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)
const mockPut = vi.mocked(apiClient.put)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listVendors', () => {
  it('returns mapped vendors', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 1000, Name: 'Vendor A' },
          { id: 1001, Name: 'Vendor B' },
        ],
      },
    })

    const result = await listVendors()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 1000, name: 'Vendor A' })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/C_BPartner', expect.objectContaining({
      params: expect.objectContaining({
        '$filter': expect.stringContaining('IsVendor eq true'),
      }),
    }))
  })

  it('filters by keyword', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await listVendors('Pharma')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/C_BPartner', expect.objectContaining({
      params: expect.objectContaining({
        '$filter': expect.stringContaining("contains(Name,'Pharma')"),
      }),
    }))
  })
})

describe('getVendorLocationId', () => {
  it('returns first active location ID', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 109 }] },
    })
    const result = await getVendorLocationId(1000)
    expect(result).toBe(109)
  })

  it('returns 0 when no location found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await getVendorLocationId(1000)
    expect(result).toBe(0)
  })
})

describe('createPurchaseOrder', () => {
  it('creates order header, lines, and attempts completion', async () => {
    // Vendor location
    mockGet.mockResolvedValue({ data: { records: [{ id: 109 }] } })
    // Order header
    mockPost
      .mockResolvedValueOnce({ data: { id: 800, DocumentNo: 'PO-100' } })
      .mockResolvedValueOnce({ data: { id: 801 } }) // line
    mockPut.mockResolvedValue({ data: {} })

    const result = await createPurchaseOrder({
      vendorId: 1000,
      lines: [{ productId: 100, productName: 'Aspirin', quantity: 50, price: 10 }],
      orgId: 11,
      warehouseId: 2000,
      username: 'admin',
    })

    expect(result).toEqual({ id: 800, documentNo: 'PO-100' })

    // Header created with doc-type and vendor info
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/C_Order', expect.objectContaining({
      'AD_Org_ID': 11,
      'C_DocType_ID': 1000,
      'IsSOTrx': false,
      'C_BPartner_ID': 1000,
      'C_BPartner_Location_ID': 109,
      'M_Warehouse_ID': 2000,
    }))

    // Line created
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/C_OrderLine', expect.objectContaining({
      'C_Order_ID': 800,
      'M_Product_ID': 100,
      'QtyOrdered': 50,
      'PriceActual': 10,
      'C_Tax_ID': 600,
    }))

    // Completion with doc-action (lowercase hyphen)
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/C_Order/800', {
      'doc-action': 'CO',
    })
  })

  it('throws when vendor has no location', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })

    await expect(createPurchaseOrder({
      vendorId: 1000,
      lines: [{ productId: 100, productName: 'X', quantity: 1, price: 1 }],
      orgId: 11,
      warehouseId: 2000,
      username: 'admin',
    })).rejects.toThrow('供應商尚未設定地址')
  })

  it('skips lines with quantity <= 0', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 109 }] } })
    mockPost.mockResolvedValueOnce({ data: { id: 800, DocumentNo: 'PO-101' } })
    mockPut.mockResolvedValue({ data: {} })

    await createPurchaseOrder({
      vendorId: 1000,
      lines: [{ productId: 100, productName: 'X', quantity: 0, price: 10 }],
      orgId: 11,
      warehouseId: 2000,
      username: 'admin',
    })

    // Only header created, no lines
    expect(mockPost).toHaveBeenCalledTimes(1)
  })
})
