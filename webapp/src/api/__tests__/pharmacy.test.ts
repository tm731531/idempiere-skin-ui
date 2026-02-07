/**
 * Pharmacy API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDispenseStatus, setDispenseStatus, listPendingDispense, getProductStock, listAllStock } from '../pharmacy'
import { apiClient } from '../client'
import * as doctorApi from '../doctor'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
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
