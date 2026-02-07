/**
 * NHI Card Reader API Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readNhiCard, checkNhiService, NhiError } from '../nhi'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readNhiCard', () => {
  const sampleApiResponse = [
    {
      reader_name: 'ACS ACR38U-CCID',
      card_no: '000012345678',
      full_name: '王小明',
      id_no: 'A123456789',
      birth_date: '1990-05-15',
      birth_date_timestamp: 642470400000,
      sex: 'M',
      issue_date: '2020-01-01',
      issue_date_timestamp: 1577836800000,
    },
  ]

  it('returns parsed card data on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleApiResponse),
    })

    const card = await readNhiCard()
    expect(card).toEqual({
      readerName: 'ACS ACR38U-CCID',
      cardNo: '000012345678',
      fullName: '王小明',
      idNo: 'A123456789',
      birthDate: '1990-05-15',
      sex: 'M',
      issueDate: '2020-01-01',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('maps female sex correctly', async () => {
    const femaleCard = [{ ...sampleApiResponse[0], sex: 'F' }]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(femaleCard),
    })

    const card = await readNhiCard()
    expect(card.sex).toBe('F')
  })

  it('handles null reader_name', async () => {
    const noReader = [{ ...sampleApiResponse[0], reader_name: null }]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(noReader),
    })

    const card = await readNhiCard()
    expect(card.readerName).toBeNull()
  })

  it('throws NO_CARD on empty array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await expect(readNhiCard()).rejects.toThrow(NhiError)
    await expect(readNhiCard()).rejects.toMatchObject({ code: 'NO_CARD' })
  })

  it('throws NO_CARD on non-array response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    await expect(readNhiCard()).rejects.toMatchObject({ code: 'NO_CARD' })
  })

  it('throws SERVICE_NOT_RUNNING on network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(readNhiCard()).rejects.toThrow(NhiError)
    await expect(readNhiCard()).rejects.toMatchObject({ code: 'SERVICE_NOT_RUNNING' })
  })

  it('throws TIMEOUT on abort/timeout error', async () => {
    const timeoutError = new DOMException('The operation was aborted', 'TimeoutError')
    mockFetch.mockRejectedValue(timeoutError)

    await expect(readNhiCard()).rejects.toThrow(NhiError)
    await expect(readNhiCard()).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('throws UNKNOWN on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(readNhiCard()).rejects.toThrow(NhiError)
    await expect(readNhiCard()).rejects.toMatchObject({ code: 'UNKNOWN' })
  })

  it('returns first card when multiple detected', async () => {
    const multiCards = [
      sampleApiResponse[0],
      { ...sampleApiResponse[0], id_no: 'B987654321', full_name: '李大華' },
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(multiCards),
    })

    const card = await readNhiCard()
    expect(card.idNo).toBe('A123456789')
    expect(card.fullName).toBe('王小明')
  })
})

describe('checkNhiService', () => {
  it('returns true when service is running', async () => {
    mockFetch.mockResolvedValue({ ok: true })

    const result = await checkNhiService()
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/version',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns false when service is not running', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await checkNhiService()
    expect(result).toBe(false)
  })

  it('returns false on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 })

    const result = await checkNhiService()
    expect(result).toBe(false)
  })
})
