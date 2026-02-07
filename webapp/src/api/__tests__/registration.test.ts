/**
 * Registration API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findPatientByTaxId,
  searchPatients,
  createPatient,
  listDoctors,
  getDoctorResource,
  listDoctorResources,
  getNextQueueNumber,
  callPatient,
  startConsultation,
  completeConsultation,
  cancelRegistration,
  getPatientTags,
  setPatientTags,
} from '../registration'
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

describe('findPatientByTaxId', () => {
  it('returns patient when found', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [{
          id: 1,
          Value: 'P001',
          Name: 'John',
          TaxID: 'A123456789',
          Phone: '0912345678',
          IsActive: true,
        }],
      },
    })

    const result = await findPatientByTaxId('A123456789')
    expect(result).toEqual({
      id: 1,
      value: 'P001',
      name: 'John',
      taxId: 'A123456789',
      phone: '0912345678',
      isActive: true,
    })
  })

  it('returns null when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await findPatientByTaxId('Z999999999')
    expect(result).toBeNull()
  })

  it('escapes single quotes in taxId', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    await findPatientByTaxId("test'injection")
    const filter = mockGet.mock.calls[0][1]?.params?.['$filter']
    expect(filter).toContain("test''injection")
  })
})

describe('searchPatients', () => {
  it('returns mapped patients', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 1, Value: 'P001', Name: 'John', TaxID: 'A123', Phone: '', IsActive: true },
        ],
      },
    })

    const result = await searchPatients('John')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('John')
  })
})

describe('createPatient', () => {
  it('creates patient and returns mapped result', async () => {
    mockPost.mockResolvedValue({ data: { id: 99 } })

    const result = await createPatient({
      name: 'Jane',
      taxId: 'B987654321',
      phone: '0922222222',
      orgId: 11,
    })

    expect(result.id).toBe(99)
    expect(result.name).toBe('Jane')
    expect(result.taxId).toBe('B987654321')
    expect(result.isActive).toBe(true)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/C_BPartner', expect.objectContaining({
      'AD_Org_ID': 11,
      'Name': 'Jane',
      'TaxID': 'B987654321',
      'IsCustomer': true,
    }))
  })
})

describe('listDoctors', () => {
  it('returns mapped doctors', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 10, Name: 'Dr. Smith' },
          { id: 11, Name: 'Dr. Jones' },
        ],
      },
    })

    const result = await listDoctors()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 10, name: 'Dr. Smith' })
  })
})

describe('getDoctorResource', () => {
  it('returns resource ID when found', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 500 }] },
    })

    const result = await getDoctorResource('Dr. Smith')
    expect(result).toBe(500)
  })

  it('returns null when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await getDoctorResource('Dr. Nobody')
    expect(result).toBeNull()
  })
})

describe('listDoctorResources', () => {
  it('returns name-to-id map', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 500, Name: 'Dr. Smith' },
          { id: 501, Name: 'Dr. Jones' },
        ],
      },
    })

    const result = await listDoctorResources()
    expect(result).toEqual({
      'Dr. Smith': 500,
      'Dr. Jones': 501,
    })
  })
})

describe('getNextQueueNumber', () => {
  it('returns 001 when no existing registrations', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await getNextQueueNumber(100)
    expect(result).toBe('001')
  })

  it('returns next number after last', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ Name: '005' }] },
    })
    const result = await getNextQueueNumber(100)
    expect(result).toBe('006')
  })

  it('handles non-numeric last name', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ Name: 'abc' }] },
    })
    const result = await getNextQueueNumber(100)
    expect(result).toBe('001') // NaN || 0 => 0 + 1 = 1
  })
})

describe('status update functions', () => {
  it('callPatient sets status to CALLING', async () => {
    // setRegistrationStatus: get (check exists) then post/put
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await callPatient(100, 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', expect.objectContaining({
      'Value': 'CALLING',
      'Name': 'CLINIC_QUEUE_STATUS_100',
    }))
  })

  it('startConsultation sets CONSULTING and updates IsConfirmed', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })

    await startConsultation(100, 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', expect.objectContaining({
      'Value': 'CONSULTING',
    }))
    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/S_ResourceAssignment/100', {
      'IsConfirmed': true,
    })
  })

  it('completeConsultation sets COMPLETED', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 888 }] } })
    mockPut.mockResolvedValue({ data: {} })

    await completeConsultation(100, 11)

    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/888', {
      'Value': 'COMPLETED',
    })
  })

  it('cancelRegistration sets CANCELLED', async () => {
    mockGet.mockResolvedValue({ data: { records: [{ id: 888 }] } })
    mockPut.mockResolvedValue({ data: {} })

    await cancelRegistration(100, 11)

    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/888', {
      'Value': 'CANCELLED',
    })
  })
})

describe('getPatientTags', () => {
  it('returns parsed tags from AD_SysConfig Value', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { Value: JSON.stringify(['VIP', 'Allergy']) },
        ],
      },
    })

    const result = await getPatientTags(123)
    expect(result).toEqual(['VIP', 'Allergy'])
  })

  it('returns empty array when no record found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const result = await getPatientTags(999)
    expect(result).toEqual([])
  })

  it('returns empty array on API error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))
    const result = await getPatientTags(123)
    expect(result).toEqual([])
  })
})

describe('setPatientTags', () => {
  it('updates existing record when found', async () => {
    mockGet.mockResolvedValue({
      data: { records: [{ id: 555 }] },
    })
    mockPut.mockResolvedValue({ data: {} })

    await setPatientTags(123, ['VIP', 'Chronic'], 11)

    expect(mockPut).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig/555', {
      'Value': JSON.stringify(['VIP', 'Chronic']),
    })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('creates new record when not found', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await setPatientTags(123, ['Allergy'], 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': 11,
      'Name': 'CLINIC_PATIENT_TAGS_123',
      'Value': JSON.stringify(['Allergy']),
      'Description': 'Patient tags',
      'ConfigurationLevel': 'S',
    })
    expect(mockPut).not.toHaveBeenCalled()
  })
})
