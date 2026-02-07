/**
 * Inventory API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listStock, searchProducts, createTransfer, listWarehouses, listPurchaseOrders, getOrderLines, createReceipt, getOrderVendorId } from '../inventory'
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
  it('creates header with C_DocType_ID, line with C_UOM_ID, and attempts completion', async () => {
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

    // Header created with C_DocType_ID
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_Movement', expect.objectContaining({
      'AD_Org_ID': 11,
      'C_DocType_ID': 143,
      'Description': 'Clinic transfer',
    }))

    // Line created with C_UOM_ID, QtyEntered, TargetQty
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_MovementLine', expect.objectContaining({
      'M_Movement_ID': 500,
      'M_Product_ID': 100,
      'M_Locator_ID': 200,
      'M_LocatorTo_ID': 201,
      'C_UOM_ID': 100,
      'MovementQty': 10,
      'QtyEntered': 10,
      'TargetQty': 0,
    }))

    // Completion attempted
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/M_Movement/500', {
      'DocAction': 'CO',
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

describe('createReceipt', () => {
  function setupReceiptMocks() {
    // Mock: get order's C_BPartner_Location_ID
    mockGet
      .mockResolvedValueOnce({ data: { C_BPartner_Location_ID: { id: 109 } } }) // order location
      .mockResolvedValueOnce({ data: { records: [{ id: 101 }] } }) // default locator
  }

  it('creates M_InOut header with required fields, lines, and attempts completion', async () => {
    setupReceiptMocks()
    mockPost
      .mockResolvedValueOnce({ data: { id: 600 } }) // header
      .mockResolvedValueOnce({ data: { id: 601 } }) // line 1
      .mockResolvedValueOnce({ data: { id: 602 } }) // line 2
    mockPut.mockResolvedValue({ data: {} })

    const lines = [
      { orderLineId: 400, productId: 100, qtyReceived: 50 },
      { orderLineId: 401, productId: 101, qtyReceived: 100 },
    ]

    const result = await createReceipt(300, 1000, lines, 11, 2000)

    expect(result).toBe(600)

    // Header created with all required fields
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_InOut', expect.objectContaining({
      'AD_Org_ID': 11,
      'C_Order_ID': 300,
      'C_BPartner_ID': 1000,
      'C_BPartner_Location_ID': 109,
      'C_DocType_ID': 122,
      'M_Warehouse_ID': 2000,
      'IsSOTrx': false,
      'MovementType': 'V+',
    }))

    // Lines created with all required fields
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_InOutLine', expect.objectContaining({
      'M_InOut_ID': 600,
      'C_OrderLine_ID': 400,
      'M_Product_ID': 100,
      'M_Locator_ID': 101,
      'M_AttributeSetInstance_ID': 0,
      'C_UOM_ID': 100,
      'MovementQty': 50,
      'QtyEntered': 50,
    }))
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_InOutLine', expect.objectContaining({
      'M_InOut_ID': 600,
      'C_OrderLine_ID': 401,
      'M_Product_ID': 101,
      'MovementQty': 100,
    }))

    // Completion attempted
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/M_InOut/600', {
      'DocAction': 'CO',
    })
  })

  it('falls back to vendor location when order has no location', async () => {
    // Order has no location
    mockGet
      .mockResolvedValueOnce({ data: {} }) // order - no location
      .mockResolvedValueOnce({ data: { records: [{ id: 115 }] } }) // vendor location fallback
      .mockResolvedValueOnce({ data: { records: [{ id: 101 }] } }) // default locator
    mockPost.mockResolvedValueOnce({ data: { id: 600 } }) // header
    mockPut.mockResolvedValue({ data: {} })

    await createReceipt(300, 1000, [], 11, 2000)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_InOut', expect.objectContaining({
      'C_BPartner_Location_ID': 115,
    }))
  })

  it('skips lines with qtyReceived <= 0', async () => {
    setupReceiptMocks()
    mockPost.mockResolvedValueOnce({ data: { id: 600 } })
    mockPut.mockResolvedValue({ data: {} })

    const lines = [
      { orderLineId: 400, productId: 100, qtyReceived: 0 },
      { orderLineId: 401, productId: 101, qtyReceived: -5 },
    ]

    const result = await createReceipt(300, 1000, lines, 11, 2000)

    expect(result).toBe(600)
    // Header created, but no lines
    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  it('still returns inOutId if completion fails', async () => {
    setupReceiptMocks()
    mockPost
      .mockResolvedValueOnce({ data: { id: 600 } })
      .mockResolvedValueOnce({ data: { id: 601 } })
    mockPut.mockRejectedValue(new Error('DocAction not supported'))

    const lines = [
      { orderLineId: 400, productId: 100, qtyReceived: 50 },
    ]

    const result = await createReceipt(300, 1000, lines, 11, 2000)

    expect(result).toBe(600)
  })
})

describe('getOrderVendorId', () => {
  it('returns vendor ID from expanded object', async () => {
    mockGet.mockResolvedValue({
      data: {
        C_BPartner_ID: { id: 1000, identifier: 'Vendor A' },
      },
    })

    const result = await getOrderVendorId(300)
    expect(result).toBe(1000)
  })

  it('returns vendor ID from scalar', async () => {
    mockGet.mockResolvedValue({
      data: {
        C_BPartner_ID: 1000,
      },
    })

    const result = await getOrderVendorId(300)
    expect(result).toBe(1000)
  })
})
