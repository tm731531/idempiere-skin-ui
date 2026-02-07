/**
 * Inventory API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listStock, searchProducts, createTransfer, listWarehouses, listPurchaseOrders, getOrderLines } from '../inventory'
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

describe('listStock', () => {
  it('returns mapped stock items', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          {
            M_Product_ID: { id: 100, identifier: 'Aspirin' },
            M_Locator_ID: { id: 200, identifier: 'WH1-L1' },
            QtyOnHand: 50,
          },
        ],
      },
    })

    const result = await listStock()
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      productId: 100,
      productName: 'Aspirin',
      productCode: '',
      locatorId: 200,
      locatorName: 'WH1-L1',
      qtyOnHand: 50,
    })
  })

  it('filters by keyword (client-side)', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          {
            M_Product_ID: { id: 100, identifier: 'Aspirin' },
            M_Locator_ID: { id: 200, identifier: 'WH1' },
            QtyOnHand: 50,
          },
          {
            M_Product_ID: { id: 101, identifier: 'Ibuprofen' },
            M_Locator_ID: { id: 200, identifier: 'WH1' },
            QtyOnHand: 30,
          },
        ],
      },
    })

    const result = await listStock('aspir')
    expect(result).toHaveLength(1)
    expect(result[0].productName).toBe('Aspirin')
  })

  it('returns empty array when no records', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await listStock()
    expect(result).toEqual([])
  })

  it('handles missing expanded objects gracefully', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { M_Product_ID: 100, M_Locator_ID: 200, QtyOnHand: 10 },
        ],
      },
    })

    const result = await listStock()
    expect(result[0].productId).toBe(100)
    expect(result[0].productName).toBe('')
    expect(result[0].locatorId).toBe(200)
    expect(result[0].locatorName).toBe('')
  })
})

describe('searchProducts', () => {
  it('returns mapped products', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 100, Name: 'Aspirin', Value: 'MED001' },
        ],
      },
    })

    const result = await searchProducts('asp')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 100, name: 'Aspirin', value: 'MED001' })
  })

  it('escapes special characters in keyword', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await searchProducts("O'Brien<script>")
    const call = mockGet.mock.calls[0]
    const filter = call[1]?.params?.['$filter']
    expect(filter).toContain("O''Brien")
    expect(filter).not.toContain('<script>')
  })
})

describe('createTransfer', () => {
  it('creates header, line, and attempts completion', async () => {
    mockPost
      .mockResolvedValueOnce({ data: { id: 500 } }) // header
      .mockResolvedValueOnce({ data: { id: 501 } }) // line
    mockPut.mockResolvedValue({ data: {} })

    const result = await createTransfer({
      productId: 100,
      fromLocatorId: 200,
      toLocatorId: 201,
      quantity: 10,
      orgId: 11,
    })

    expect(result).toBe(500)

    // Header created
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_Movement', expect.objectContaining({
      'AD_Org_ID': 11,
      'Description': 'Clinic transfer',
    }))

    // Line created
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_MovementLine', expect.objectContaining({
      'M_Movement_ID': 500,
      'M_Product_ID': 100,
      'M_Locator_ID': 200,
      'M_LocatorTo_ID': 201,
      'MovementQty': 10,
    }))

    // Completion attempted
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/M_Movement/500', {
      'DocAction': 'CO',
      'DocStatus': 'CO',
    })
  })

  it('still returns movementId even if completion fails', async () => {
    mockPost
      .mockResolvedValueOnce({ data: { id: 500 } })
      .mockResolvedValueOnce({ data: { id: 501 } })
    mockPut.mockRejectedValue(new Error('DocAction not supported'))

    const result = await createTransfer({
      productId: 100,
      fromLocatorId: 200,
      toLocatorId: 201,
      quantity: 5,
      orgId: 11,
    })

    expect(result).toBe(500)
  })
})

describe('listWarehouses', () => {
  it('returns warehouses with locators', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: { records: [{ id: 10, Name: 'Main Warehouse' }] },
      })
      .mockResolvedValueOnce({
        data: { records: [{ id: 20, Value: 'Row-1-1' }] },
      })

    const result = await listWarehouses()
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 10,
      name: 'Main Warehouse',
      locators: [{ id: 20, name: 'Row-1-1' }],
    })
  })

  it('returns empty array when no warehouses', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await listWarehouses()
    expect(result).toEqual([])
  })
})

describe('listPurchaseOrders', () => {
  it('returns mapped purchase orders', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          {
            id: 300,
            DocumentNo: 'PO-001',
            DateOrdered: '2025-01-01',
            C_BPartner_ID: { identifier: 'Vendor A' },
          },
        ],
      },
    })

    const result = await listPurchaseOrders()
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 300,
      documentNo: 'PO-001',
      dateOrdered: '2025-01-01',
      vendorName: 'Vendor A',
    })
  })
})

describe('getOrderLines', () => {
  it('returns mapped order lines', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          {
            id: 400,
            M_Product_ID: { id: 100, identifier: 'Aspirin' },
            QtyOrdered: 100,
            QtyDelivered: 50,
          },
        ],
      },
    })

    const result = await getOrderLines(300)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 400,
      productId: 100,
      productName: 'Aspirin',
      qtyOrdered: 100,
      qtyDelivered: 50,
    })
  })
})
