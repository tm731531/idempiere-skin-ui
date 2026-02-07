/**
 * Checkout API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCheckoutStatus, setCheckoutStatus, listCheckoutItems } from '../checkout'
import { apiClient } from '../client'
import * as pharmacyApi from '../pharmacy'

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../pharmacy', () => ({
  getDispenseStatus: vi.fn(),
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)
const mockPut = vi.mocked(apiClient.put)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getCheckoutStatus', () => {
  it('returns status from SysConfig', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ Value: 'PAID' }] },
    })

    const status = await getCheckoutStatus(100)
    expect(status).toBe('PAID')
  })

  it('returns PENDING when no record', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const status = await getCheckoutStatus(999)
    expect(status).toBe('PENDING')
  })

  it('returns PENDING on error', async () => {
    mockGet.mockRejectedValue(new Error('Network'))
    const status = await getCheckoutStatus(100)
    expect(status).toBe('PENDING')
  })
})

describe('setCheckoutStatus', () => {
  it('creates new SysConfig when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await setCheckoutStatus(100, 'PAID', 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': 11,
      'Name': 'CLINIC_CHECKOUT_STATUS_100',
      'Value': 'PAID',
      'Description': 'Clinic checkout status',
      'ConfigurationLevel': 'S',
    })
  })

  it('updates existing SysConfig when found', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 777 }] } })
    mockPut.mockResolvedValue({ data: {} })

    await setCheckoutStatus(100, 'PAID', 11)

    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/777', {
      'Value': 'PAID',
    })
  })
})

describe('listCheckoutItems', () => {
  it('returns dispensed but unpaid items', async () => {
    const prescription = {
      status: 'COMPLETED',
      diagnosis: 'Cold',
      lines: [{ productName: 'Aspirin', totalQuantity: 10 }],
      patientName: 'John',
    }

    // First call: list prescriptions
    mockGet.mockResolvedValueOnce({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: JSON.stringify(prescription) },
        ],
      },
    })

    // getDispenseStatus call
    vi.mocked(pharmacyApi.getDispenseStatus).mockResolvedValue('DISPENSED')

    // getCheckoutStatus call (inline - the function calls apiClient.get)
    mockGet.mockResolvedValueOnce({
      data: { records: [{ Value: 'PENDING' }] },
    })

    const result = await listCheckoutItems()
    expect(result).toHaveLength(1)
    expect(result[0].assignmentId).toBe(100)
    expect(result[0].dispenseStatus).toBe('DISPENSED')
    expect(result[0].checkoutStatus).toBe('PENDING')
  })

  it('excludes items not yet dispensed', async () => {
    const prescription = { status: 'COMPLETED', lines: [] }

    mockGet.mockResolvedValueOnce({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: JSON.stringify(prescription) },
        ],
      },
    })

    vi.mocked(pharmacyApi.getDispenseStatus).mockResolvedValue('PENDING')

    const result = await listCheckoutItems()
    expect(result).toHaveLength(0)
  })

  it('excludes already paid items', async () => {
    const prescription = { status: 'COMPLETED', lines: [] }

    mockGet.mockResolvedValueOnce({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: JSON.stringify(prescription) },
        ],
      },
    })

    vi.mocked(pharmacyApi.getDispenseStatus).mockResolvedValue('DISPENSED')

    // getCheckoutStatus returns PAID
    mockGet.mockResolvedValueOnce({
      data: { records: [{ Value: 'PAID' }] },
    })

    const result = await listCheckoutItems()
    expect(result).toHaveLength(0)
  })

  it('skips non-completed prescriptions', async () => {
    const prescription = { status: 'DRAFT', lines: [] }

    mockGet.mockResolvedValueOnce({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: JSON.stringify(prescription) },
        ],
      },
    })

    const result = await listCheckoutItems()
    expect(result).toHaveLength(0)
  })
})
