/**
 * Registration API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findPatientByTaxId,
  searchPatients,
  createPatient,
  listDoctors,
  getNextQueueNumber,
  createRegistration,
  listRegistrationsByDate,
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

vi.mock('../lookup', () => ({
  lookupCustomerGroupId: vi.fn().mockResolvedValue(999),
  clearLookupCache: vi.fn(),
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
  it('creates patient with all required fields', async () => {
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
      'C_BP_Group_ID': 999,
      'IsCustomer': true,
      'IsVendor': false,
      'IsEmployee': false,
      'IsSalesRep': false,
      'IsSummary': false,
      'IsOneTime': false,
      'SendEMail': false,
    }))
  })
})

describe('listDoctors', () => {
  it('returns doctors from S_Resource', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 500, Name: 'Dr. Smith' },
          { id: 501, Name: 'Dr. Jones' },
        ],
      },
    })

    const result = await listDoctors()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 500, name: 'Dr. Smith' })
    expect(result[1]).toEqual({ id: 501, name: 'Dr. Jones' })

    // Verify it queries S_Resource (not AD_User)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/models/S_Resource', expect.objectContaining({
      params: expect.objectContaining({
        '$filter': 'IsActive eq true',
      }),
    }))
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

  it('startConsultation sets CONSULTING', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    mockPost.mockResolvedValue({ data: {} })

    await startConsultation(100, 11)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/models/AD_SysConfig', expect.objectContaining({
      'Value': 'CONSULTING',
    }))
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

describe('getNextQueueNumber with date param', () => {
  it('uses provided date for filtering', async () => {
    mockGet.mockResolvedValue({ data: { records: [] } })
    const targetDate = new Date(2026, 1, 15) // Feb 15

    await getNextQueueNumber(100, targetDate)

    const filter = mockGet.mock.calls[0][1]?.params?.['$filter']
    // Should filter by Feb 15 start/end
    expect(filter).toContain('2026-02-15')
  })
})

describe('createRegistration', () => {
  it('creates walk-in registration with type in description', async () => {
    mockPost.mockResolvedValue({ data: { id: 555 } })
    // Mock for setRegistrationStatus
    mockGet.mockResolvedValue({ data: { records: [] } })

    const result = await createRegistration({
      resourceId: 100,
      patientId: 200,
      patientName: 'John',
      patientTaxId: 'A123',
      queueNumber: '001',
      orgId: 11,
      type: 'WALK_IN',
    })

    expect(result.id).toBe(555)
    expect(result.type).toBe('WALK_IN')

    // Check that Description JSON includes type
    const postBody = mockPost.mock.calls[0][1]
    const desc = JSON.parse(postBody['Description'])
    expect(desc.type).toBe('WALK_IN')
    expect(desc.patientId).toBe(200)
  })

  it('creates appointment registration with future date', async () => {
    mockPost.mockResolvedValue({ data: { id: 556 } })
    mockGet.mockResolvedValue({ data: { records: [] } })

    const futureDate = new Date(2026, 1, 20)
    const result = await createRegistration({
      resourceId: 100,
      patientId: 200,
      patientName: 'Jane',
      patientTaxId: 'B456',
      queueNumber: '001',
      orgId: 11,
      type: 'APPOINTMENT',
      appointmentDate: futureDate,
    })

    expect(result.type).toBe('APPOINTMENT')

    // Check that date uses 09:00 of the appointment day
    const postBody = mockPost.mock.calls[0][1]
    expect(postBody['AssignDateFrom']).toContain('2026-02-20')
  })
})

describe('listRegistrationsByDate', () => {
  it('parses type from description JSON', async () => {
    const desc = JSON.stringify({ patientId: 100, patientName: 'John', patientTaxId: 'A123', type: 'APPOINTMENT' })
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 1, S_Resource_ID: { id: 101, identifier: 'Dr. A' }, Name: '001', AssignDateFrom: '2026-02-08T09:00:00Z', AssignDateTo: '2026-02-08T09:30:00Z', IsConfirmed: false, Description: desc },
        ],
      },
    })

    const result = await listRegistrationsByDate()

    expect(result[0].type).toBe('APPOINTMENT')
    expect(result[0].patientName).toBe('John')
  })

  it('defaults type to WALK_IN for old records without type', async () => {
    const desc = JSON.stringify({ patientId: 100, patientName: 'Old', patientTaxId: 'X' })
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 2, S_Resource_ID: { id: 101, identifier: 'Dr. A' }, Name: '002', AssignDateFrom: '2026-02-08T09:00:00Z', AssignDateTo: '2026-02-08T09:30:00Z', IsConfirmed: false, Description: desc },
        ],
      },
    })

    const result = await listRegistrationsByDate()
    expect(result[0].type).toBe('WALK_IN')
  })

  it('handles old-format description (non-JSON)', async () => {
    mockGet.mockResolvedValue({
      data: {
        records: [
          { id: 3, S_Resource_ID: { id: 101, identifier: 'Dr. A' }, Name: '003', AssignDateFrom: '2026-02-08T09:00:00Z', AssignDateTo: '2026-02-08T09:30:00Z', IsConfirmed: false, Description: '王小明 (A123456789) #100' },
        ],
      },
    })

    const result = await listRegistrationsByDate()
    expect(result[0].patientName).toBe('王小明')
    expect(result[0].patientTaxId).toBe('A123456789')
    expect(result[0].patientId).toBe(100)
    expect(result[0].type).toBe('WALK_IN')
  })
})
