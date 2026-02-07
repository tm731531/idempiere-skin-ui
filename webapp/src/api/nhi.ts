/**
 * NHI Card Reader API Module
 *
 * Communicates with tw-nhi-icc-service (local HTTP service)
 * that reads Taiwan NHI IC cards via PC/SC smart card readers.
 *
 * Service: https://github.com/magiclen/tw-nhi-icc-service
 * Default URL: http://127.0.0.1:8000
 */

const NHI_SERVICE_URL = 'http://127.0.0.1:8000'

// ========== Types ==========

export interface NhiCard {
  readerName: string | null
  cardNo: string
  fullName: string
  idNo: string         // National ID (身分證字號)
  birthDate: string    // "1990-05-15"
  sex: 'M' | 'F'
  issueDate: string    // "2020-01-01"
}

export class NhiError extends Error {
  code: 'SERVICE_NOT_RUNNING' | 'NO_CARD' | 'TIMEOUT' | 'UNKNOWN'

  constructor(
    message: string,
    code: 'SERVICE_NOT_RUNNING' | 'NO_CARD' | 'TIMEOUT' | 'UNKNOWN',
  ) {
    super(message)
    this.name = 'NhiError'
    this.code = code
  }
}

// ========== API ==========

/**
 * Read NHI card data from the local card reader service.
 * Returns the first detected card's data.
 */
export async function readNhiCard(): Promise<NhiCard> {
  let response: Response
  try {
    response = await fetch(`${NHI_SERVICE_URL}/`, {
      signal: AbortSignal.timeout(5000),
    })
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new NhiError('讀取逾時，請確認讀卡機已連接', 'TIMEOUT')
    }
    throw new NhiError('讀卡服務未啟動，請先安裝並執行健保讀卡服務', 'SERVICE_NOT_RUNNING')
  }

  if (!response.ok) {
    throw new NhiError(`讀卡服務回應錯誤 (${response.status})`, 'UNKNOWN')
  }

  const cards: any[] = await response.json()
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new NhiError('未偵測到健保卡，請確認卡片已插入讀卡機', 'NO_CARD')
  }

  const card = cards[0]
  return {
    readerName: card.reader_name || null,
    cardNo: card.card_no || '',
    fullName: card.full_name || '',
    idNo: card.id_no || '',
    birthDate: card.birth_date || '',
    sex: card.sex === 'F' ? 'F' : 'M',
    issueDate: card.issue_date || '',
  }
}

/**
 * Check if the NHI card reader service is running.
 */
export async function checkNhiService(): Promise<boolean> {
  try {
    const response = await fetch(`${NHI_SERVICE_URL}/version`, {
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}
