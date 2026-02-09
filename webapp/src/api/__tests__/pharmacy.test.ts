/**
 * Pharmacy API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDispenseStatus, setDispenseStatus, listPendingDispense, getProductStock, listAllStock, createStockDeduction, saveDispenseRecord, listDispenseRecords } from '../pharmacy'
import { apiClient } from '../client'
import * as doctorApi from '../doctor'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../lookup', () => ({
  lookupInternalUseDocTypeId: vi.fn().mockResolvedValue(200000),
  lookupDispenseChargeId: vi.fn().mockResolvedValue(300),
}))

vi.mock('../doctor', () => ({
  listCompletedPrescriptions: vi.fn(),
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)
const mockPut = vi.mocked(apiClient.put)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getDispenseStatus', () => {
  it('returns status from SysConfig', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ Value: 'DISPENSING' }] },
    })

    const status = await getDispenseStatus(100)
    expect(status).toBe('DISPENSING')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      params: { '$filter': "Name eq 'CLINIC_DISPENSE_STATUS_100'" },
    })
  })

  it('returns PENDING when no record found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const status = await getDispenseStatus(999)
    expect(status).toBe('PENDING')
  })

  it('returns PENDING on error', async () => {
    mockGet.mockRejectedValue(new Error('Network'))
    const status = await getDispenseStatus(100)
    expect(status).toBe('PENDING')
  })
})

describe('setDispenseStatus', () => {
  it('creates new SysConfig when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await setDispenseStatus(100, 'DISPENSING', 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': 11,
      'Name': 'CLINIC_DISPENSE_STATUS_100',
      'Value': 'DISPENSING',
      'Description': 'Clinic dispense status',
      'ConfigurationLevel': 'S',
    })
  })

  it('updates existing SysConfig when found', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 555 }] },
    })
    mockPut.mockResolvedValue({ data: {} })

    await setDispenseStatus(100, 'DISPENSED', 11)

    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/555', {
      'Value': 'DISPENSED',
    })
  })
})

describe('listPendingDispense', () => {
  it('returns prescriptions that are not yet dispensed', async () => {
    const rx = {
      assignmentId: 100,
      patientName: 'John',
      diagnosis: 'Cold',
      lines: [],
      status: 'COMPLETED',
      createdAt: '2025-01-01',
      patientId: 1,
      totalDays: 7,
    }

    vi.mocked(doctorApi.listCompletedPrescriptions).mockResolvedValue([rx as any])

    // getDispenseStatus call
    mockGet.mockResolvedValue({ data: { records: [{ Value: 'PENDING' }] } })

    const result = await listPendingDispense()
    expect(result).toHaveLength(1)
    expect(result[0].assignmentId).toBe(100)
    expect(result[0].status).toBe('PENDING')
  })

  it('excludes already dispensed items', async () => {
    const rx = {
      assignmentId: 100,
      patientName: 'John',
      diagnosis: 'Cold',
      lines: [],
      status: 'COMPLETED',
      createdAt: '2025-01-01',
      patientId: 1,
      totalDays: 7,
    }

    vi.mocked(doctorApi.listCompletedPrescriptions).mockResolvedValue([rx as any])
    mockGet.mockResolvedValue({ data: { records: [{ Value: 'DISPENSED' }] } })

    const result = await listPendingDispense()
    expect(result).toHaveLength(0)
  })
})

describe('getProductStock', () => {
  it('returns mapped stock records', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { QtyOnHand: 50, M_Locator_ID: { identifier: 'WH1-L1' } },
          { QtyOnHand: 30, M_Locator_ID: { identifier: 'WH2-L1' } },
        ],
      },
    })

    const result = await getProductStock(100)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      productId: 100,
      productName: '',
      qtyOnHand: 50,
      warehouseName: 'WH1-L1',
    })
  })

  it('returns empty array when no stock', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await getProductStock(999)
    expect(result).toEqual([])
  })
})

describe('listAllStock', () => {
  it('returns all stock with expanded fields', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          {
            id: 1,
            M_Product_ID: { id: 100, identifier: 'Aspirin' },
            M_Locator_ID: { id: 200, identifier: 'WH1' },
            QtyOnHand: 50,
          },
        ],
      },
    })

    const result = await listAllStock()
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 1,
      productId: 100,
      productName: 'Aspirin',
      locatorId: 200,
      locatorName: 'WH1',
      qtyOnHand: 50,
    })
  })
})

describe('createStockDeduction', () => {
  it('returns early with error for empty lines', async () => {
    const result = await createStockDeduction([], 103, 11)
    expect(result).toEqual({ inventoryId: 0, completed: false, error: 'No lines to deduct' })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('returns error when no locator found', async () => {
    // lookupDefaultLocator returns 0
    mockGet.mockResolvedValue({ data: { records: [] } })

    const lines = [{ productId: 10, productName: 'Aspirin', totalQuantity: 9 }]
    const result = await createStockDeduction(lines, 103, 11)

    expect(result.completed).toBe(false)
    expect(result.error).toContain('庫位')
  })

  it('creates inventory header, lines, and completes', async () => {
    // lookupDefaultLocator
    mockGet.mockResolvedValue({ data: { records: [{ id: 101 }] } })
    // POST inventory header, then lines
    mockPost
      .mockResolvedValueOnce({ data: { id: 600 } }) // M_Inventory header
      .mockResolvedValueOnce({ data: { id: 601 } }) // M_InventoryLine 1
      .mockResolvedValueOnce({ data: { id: 602 } }) // M_InventoryLine 2
    // PUT doc-action
    mockPut.mockResolvedValue({ data: {} })

    const lines = [
      { productId: 10, productName: 'Aspirin', totalQuantity: 9 },
      { productId: 20, productName: 'Ibuprofen', totalQuantity: 10 },
    ]

    const result = await createStockDeduction(lines, 103, 11, 'Test dispense')
    expect(result).toEqual({ inventoryId: 600, completed: true })

    // Verify header
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_Inventory', expect.objectContaining({
      'AD_Org_ID': 11,
      'C_DocType_ID': 200000,
      'M_Warehouse_ID': 103,
      'Description': 'Test dispense',
    }))

    // Verify lines use QtyInternalUse and C_Charge_ID
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_InventoryLine', expect.objectContaining({
      'M_Inventory_ID': 600,
      'M_Product_ID': 10,
      'M_Locator_ID': 101,
      'QtyInternalUse': 9,
      'C_Charge_ID': 300,
    }))
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/M_InventoryLine', expect.objectContaining({
      'M_Product_ID': 20,
      'QtyInternalUse': 10,
    }))

    // Verify doc-action
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/M_Inventory/600', {
      'doc-action': 'CO',
    })
  })

  it('skips lines with zero quantity', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 101 }] } })
    mockPost
      .mockResolvedValueOnce({ data: { id: 600 } }) // header
      .mockResolvedValueOnce({ data: { id: 601 } }) // only 1 line
    mockPut.mockResolvedValue({ data: {} })

    const lines = [
      { productId: 10, productName: 'Aspirin', totalQuantity: 9 },
      { productId: 20, productName: 'Zero', totalQuantity: 0 },
    ]

    await createStockDeduction(lines, 103, 11)

    // header + 1 line = 2 POST calls (not 3)
    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it('returns error when completion fails', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 101 }] } })
    mockPost.mockResolvedValue({ data: { id: 600 } })
    mockPut.mockRejectedValue({ response: { data: { detail: 'Completion failed' } } })

    const lines = [{ productId: 10, productName: 'A', totalQuantity: 5 }]
    const result = await createStockDeduction(lines, 103, 11)

    expect(result.inventoryId).toBe(600)
    expect(result.completed).toBe(false)
    expect(result.error).toBe('Completion failed')
  })
})

describe('saveDispenseRecord', () => {
  it('saves record to SysConfig', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await saveDispenseRecord(100, {
      patientName: 'John',
      dispensedAt: '2026-02-08T10:00:00Z',
      lines: [{ productId: 10, productName: 'Aspirin', totalQuantity: 9, unit: 'g' }],
      inventoryId: 600,
    }, 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', expect.objectContaining({
      'Name': 'CLINIC_DISPENSE_RECORD_100',
    }))
    const value = JSON.parse(mockPost.mock.calls[0][1]['Value'])
    expect(value.patientName).toBe('John')
    expect(value.lines[0].productName).toBe('Aspirin')
    expect(value.inventoryId).toBe(600)
  })
})

describe('listDispenseRecords', () => {
  it('returns parsed records', async () => {
    const record = {
      patientName: 'John',
      dispensedAt: '2026-02-08T10:00:00Z',
      lines: [{ productId: 10, productName: 'Aspirin', totalQuantity: 9, unit: 'g' }],
    }
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 1, Name: 'CLINIC_DISPENSE_RECORD_100', Value: JSON.stringify(record) },
        ],
      },
    })

    const result = await listDispenseRecords()
    expect(result).toHaveLength(1)
    expect(result[0].assignmentId).toBe(100)
    expect(result[0].patientName).toBe('John')
  })

  it('returns empty array on error', async () => {
    mockGet.mockRejectedValue(new Error('fail'))
    const result = await listDispenseRecords()
    expect(result).toEqual([])
  })
})
