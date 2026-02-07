/**
 * Doctor API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateTotalQuantity, searchMedicines, listMedicines, savePrescription, loadPrescription, listCompletedPrescriptions, listPrescriptionHistory, listTemplates, saveTemplate, deleteTemplate } from '../doctor'
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

// ========== Pure Functions ==========

describe('calculateTotalQuantity', () => {
  it('calculates QD correctly (1x per day)', () => {
    expect(calculateTotalQuantity(3, 'QD', 7)).toBe(21) // 3 * 1 * 7
  })

  it('calculates BID correctly (2x per day)', () => {
    expect(calculateTotalQuantity(2, 'BID', 5)).toBe(20) // 2 * 2 * 5
  })

  it('calculates TID correctly (3x per day)', () => {
    expect(calculateTotalQuantity(3, 'TID', 7)).toBe(63) // 3 * 3 * 7
  })

  it('calculates QID correctly (4x per day)', () => {
    expect(calculateTotalQuantity(1, 'QID', 3)).toBe(12) // 1 * 4 * 3
  })

  it('calculates PRN correctly (1x per day)', () => {
    expect(calculateTotalQuantity(5, 'PRN', 7)).toBe(35) // 5 * 1 * 7
  })

  it('defaults to multiplier 1 for unknown frequency', () => {
    expect(calculateTotalQuantity(2, 'UNKNOWN', 3)).toBe(6) // 2 * 1 * 3
  })

  it('handles zero dosage', () => {
    expect(calculateTotalQuantity(0, 'TID', 7)).toBe(0)
  })

  it('handles zero days', () => {
    expect(calculateTotalQuantity(3, 'TID', 0)).toBe(0)
  })
})

// ========== API Functions ==========

describe('searchMedicines', () => {
  it('returns mapped medicines from API', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 100, Value: 'MED001', Name: 'Aspirin', UPC: '123456' },
          { id: 101, Value: 'MED002', Name: 'Ibuprofen', UPC: '' },
        ],
      },
    })

    const result = await searchMedicines('asp')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 100,
      value: 'MED001',
      name: 'Aspirin',
      upc: '123456',
      isActive: true,
    })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/M_Product', {
      params: expect.objectContaining({
        '$top': 20,
        '$orderby': 'Name asc',
      }),
    })
  })

  it('returns empty array when no records', async () => {
    mockGet.mockResolvedValue({ data: {} })
    const result = await searchMedicines('xyz')
    expect(result).toEqual([])
  })

  it('escapes single quotes in keyword', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await searchMedicines("O'Brien")
    const call = mockGet.mock.calls[0]
    expect(call[1]?.params?.['$filter']).toContain("O''Brien")
  })
})

describe('listMedicines', () => {
  it('returns all active medicines', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 100, Value: 'MED001', Name: 'Aspirin', UPC: '' },
        ],
      },
    })

    const result = await listMedicines()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(100)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/M_Product', {
      params: expect.objectContaining({
        '$filter': 'IsActive eq true',
        '$top': 100,
      }),
    })
  })
})

describe('savePrescription', () => {
  const prescription = {
    patientId: 1,
    patientName: 'John',
    diagnosis: 'Cold',
    lines: [],
    totalDays: 7,
    status: 'DRAFT' as const,
    createdAt: '2025-01-01',
  }

  it('creates new SysConfig when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await savePrescription(123, prescription, 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': 11,
      'Name': 'CLINIC_PRESCRIPTION_123',
      'Value': JSON.stringify(prescription),
      'Description': 'Clinic prescription data',
      'ConfigurationLevel': 'S',
    })
  })

  it('updates existing SysConfig when found', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 999 }] },
    })
    mockPut.mockResolvedValue({ data: {} })

    await savePrescription(123, prescription, 11)

    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/999', {
      'Value': JSON.stringify(prescription),
    })
    expect(mockPost).not.toHaveBeenCalled()
  })
})

describe('loadPrescription', () => {
  it('returns prescription when found', async () => {
    const data = { diagnosis: 'Cold', lines: [], status: 'DRAFT' }
    mockGet.mockResolvedValue({
      data: { records: [{ Value: JSON.stringify(data) }] },
    })

    const result = await loadPrescription(123)
    expect(result).toEqual({ ...data, assignmentId: 123 })
  })

  it('returns null when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await loadPrescription(999)
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))
    const result = await loadPrescription(123)
    expect(result).toBeNull()
  })
})

describe('listCompletedPrescriptions', () => {
  it('returns only completed prescriptions', async () => {
    const completed = { status: 'COMPLETED', diagnosis: 'Flu', lines: [] }
    const draft = { status: 'DRAFT', diagnosis: 'Cold', lines: [] }

    mockGet.mockResolvedValue({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: JSON.stringify(completed) },
          { Name: 'CLINIC_PRESCRIPTION_101', Value: JSON.stringify(draft) },
        ],
      },
    })

    const result = await listCompletedPrescriptions()
    expect(result).toHaveLength(1)
    expect(result[0].assignmentId).toBe(100)
    expect(result[0].status).toBe('COMPLETED')
  })

  it('skips entries with invalid JSON', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: 'invalid-json' },
        ],
      },
    })

    const result = await listCompletedPrescriptions()
    expect(result).toEqual([])
  })

  it('returns empty array on error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))
    const result = await listCompletedPrescriptions()
    expect(result).toEqual([])
  })
})

describe('listPrescriptionHistory', () => {
  it('parses prescriptions from AD_SysConfig records', async () => {
    const prescription = {
      diagnosis: 'Cold',
      lines: [{ productId: 1, productName: 'Aspirin', dosage: 3, unit: 'g', frequency: 'TID', days: 7, totalQuantity: 63 }],
      status: 'COMPLETED',
      createdAt: '2025-01-01',
    }

    mockGet.mockResolvedValue({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: JSON.stringify(prescription) },
        ],
      },
    })

    const result = await listPrescriptionHistory(123)
    expect(result).toHaveLength(1)
    expect(result[0].diagnosis).toBe('Cold')
    expect(result[0].lines).toHaveLength(1)
  })

  it('skips invalid JSON', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { Name: 'CLINIC_PRESCRIPTION_100', Value: 'invalid-json' },
          { Name: 'CLINIC_PRESCRIPTION_101', Value: JSON.stringify({ diagnosis: 'Flu', lines: [], status: 'COMPLETED' }) },
        ],
      },
    })

    const result = await listPrescriptionHistory(123)
    expect(result).toHaveLength(1)
    expect(result[0].diagnosis).toBe('Flu')
  })

  it('returns empty array on API error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))
    const result = await listPrescriptionHistory(123)
    expect(result).toEqual([])
  })
})

describe('listTemplates', () => {
  it('parses templates from AD_SysConfig', async () => {
    const template = {
      name: 'Cold combo',
      lines: [{ productId: 1, productName: 'Aspirin', dosage: 3, unit: 'g', frequency: 'TID', days: 7, totalQuantity: 63 }],
    }

    mockGet.mockResolvedValue({
      data: {
        records: [
          { Name: 'CLINIC_TEMPLATE_cold', Value: JSON.stringify(template) },
        ],
      },
    })

    const result = await listTemplates()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Cold combo')
    expect(result[0].lines).toHaveLength(1)
  })

  it('returns empty array on error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))
    const result = await listTemplates()
    expect(result).toEqual([])
  })
})

describe('saveTemplate', () => {
  const lines = [{ productId: 1, productName: 'Aspirin', dosage: 3, unit: 'g', frequency: 'TID', days: 7, totalQuantity: 63 }]

  it('updates existing when record found', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 777 }] },
    })
    mockPut.mockResolvedValue({ data: {} })

    await saveTemplate('cold', lines, 7, 11)

    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/777', {
      'Value': JSON.stringify({ name: 'cold', lines, totalDays: 7 }),
    })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('creates new when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await saveTemplate('cold', lines, 7, 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': 11,
      'Name': 'CLINIC_TEMPLATE_cold',
      'Value': JSON.stringify({ name: 'cold', lines, totalDays: 7 }),
      'Description': 'Prescription template: cold',
      'ConfigurationLevel': 'S',
    })
    expect(mockPut).not.toHaveBeenCalled()
  })
})

describe('deleteTemplate', () => {
  const mockDelete = vi.fn()

  beforeEach(() => {
    // Add delete to apiClient mock
    ;(apiClient as any).delete = mockDelete
    mockDelete.mockClear()
  })

  it('finds and deletes record', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 777 }] },
    })
    mockDelete.mockResolvedValue({ data: {} })

    await deleteTemplate('CLINIC_TEMPLATE_cold')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      params: expect.objectContaining({
        '$filter': "Name eq 'CLINIC_TEMPLATE_cold'",
      }),
    })
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/777')
  })

  it('does nothing when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })

    await deleteTemplate('CLINIC_TEMPLATE_nonexistent')

    expect(mockDelete).not.toHaveBeenCalled()
  })
})
