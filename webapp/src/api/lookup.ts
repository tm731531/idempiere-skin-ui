/**
 * Lookup API Module
 *
 * 動態查詢 iDempiere reference ID 並快取
 * 取代硬編碼的 C_BP_Group_ID, C_DocType_ID, C_UOM_ID
 */

import { apiClient } from './client'

// In-memory cache: cleared on logout / client change
const cache: Record<string, number> = {}

export function clearLookupCache(): void {
  for (const key of Object.keys(cache)) {
    delete cache[key]
  }
}

/**
 * Lookup C_BP_Group_ID for default customer group in current client.
 * Prefers IsDefault=true, falls back to first active record.
 */
export async function lookupCustomerGroupId(): Promise<number> {
  if (cache['C_BP_Group_ID'] !== undefined) return cache['C_BP_Group_ID']

  const resp = await apiClient.get('/api/v1/models/C_BP_Group', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'C_BP_Group_ID,Name,IsDefault',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 5,
    },
  })

  const records = resp.data.records || []
  const defaultGroup = records.find((r: any) => r.IsDefault) || records[0]
  const id = defaultGroup?.id || 0
  cache['C_BP_Group_ID'] = id
  return id
}

/**
 * Lookup C_DocType_ID by DocBaseType.
 * 'MMM' = Material Movement, 'MMR' = Material Receipt
 */
export async function lookupDocTypeId(docBaseType: string): Promise<number> {
  const cacheKey = `C_DocType_${docBaseType}`
  if (cache[cacheKey] !== undefined) return cache[cacheKey]

  const resp = await apiClient.get('/api/v1/models/C_DocType', {
    params: {
      '$filter': `DocBaseType eq '${docBaseType}' and IsActive eq true`,
      '$select': 'C_DocType_ID,Name',
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  const id = records[0]?.id || 0
  cache[cacheKey] = id
  return id
}

/**
 * Lookup C_DocType_ID for Internal Use Inventory.
 * DocBaseType='MMI' and Name contains 'Internal Use'.
 */
export async function lookupInternalUseDocTypeId(): Promise<number> {
  const cacheKey = 'C_DocType_InternalUse'
  if (cache[cacheKey] !== undefined) return cache[cacheKey]

  const resp = await apiClient.get('/api/v1/models/C_DocType', {
    params: {
      '$filter': "DocBaseType eq 'MMI' and contains(Name,'Internal Use') and IsActive eq true",
      '$select': 'C_DocType_ID,Name',
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  const id = records[0]?.id || 0
  cache[cacheKey] = id
  return id
}

/**
 * Lookup or create C_Charge for clinic dispense (internal use).
 */
export async function lookupDispenseChargeId(orgId: number): Promise<number> {
  const cacheKey = 'C_Charge_Dispense'
  if (cache[cacheKey] !== undefined) return cache[cacheKey]

  // Try to find existing "Clinic Dispense" charge
  const resp = await apiClient.get('/api/v1/models/C_Charge', {
    params: {
      '$filter': "Name eq 'Clinic Dispense' and IsActive eq true",
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  if (records.length > 0) {
    cache[cacheKey] = records[0].id
    return records[0].id
  }

  // Create new charge
  const createResp = await apiClient.post('/api/v1/models/C_Charge', {
    'AD_Org_ID': orgId,
    'Name': 'Clinic Dispense',
    'IsSameTax': false,
    'IsSameCurrency': true,
  })

  const id = createResp.data.id
  cache[cacheKey] = id
  return id
}

/**
 * Lookup C_UOM_ID for 'Each' unit.
 * Queries by X12DE355 = 'EA' (ISO standard code for 'Each').
 */
export async function lookupEachUomId(): Promise<number> {
  if (cache['C_UOM_Each'] !== undefined) return cache['C_UOM_Each']

  const resp = await apiClient.get('/api/v1/models/C_UOM', {
    params: {
      '$filter': "X12DE355 eq 'EA' and IsActive eq true",
      '$select': 'C_UOM_ID,Name',
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  const id = records[0]?.id || 0
  cache['C_UOM_Each'] = id
  return id
}

// ========== Purchase Order Lookups ==========

/**
 * Lookup purchase price list (IsSOPriceList=false).
 */
export async function lookupPurchasePriceListId(): Promise<number> {
  if (cache['M_PriceList_PO'] !== undefined) return cache['M_PriceList_PO']

  const resp = await apiClient.get('/api/v1/models/M_PriceList', {
    params: {
      '$filter': 'IsSOPriceList eq false and IsActive eq true',
      '$select': 'M_PriceList_ID,Name,C_Currency_ID,IsDefault',
      '$orderby': 'IsDefault desc',
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  const id = records[0]?.id || 0
  cache['M_PriceList_PO'] = id
  // Also cache currency from this price list
  if (records[0]?.C_Currency_ID) {
    cache['C_Currency_PO'] = records[0].C_Currency_ID?.id || records[0].C_Currency_ID
  }
  return id
}

/**
 * Lookup currency from PO price list.
 */
export async function lookupPOCurrencyId(): Promise<number> {
  if (cache['C_Currency_PO'] !== undefined) return cache['C_Currency_PO']
  // Trigger price list lookup which caches currency
  await lookupPurchasePriceListId()
  return cache['C_Currency_PO'] || 0
}

/**
 * Lookup default payment term.
 */
export async function lookupDefaultPaymentTermId(): Promise<number> {
  if (cache['C_PaymentTerm'] !== undefined) return cache['C_PaymentTerm']

  const resp = await apiClient.get('/api/v1/models/C_PaymentTerm', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'C_PaymentTerm_ID,Name,IsDefault',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  const id = records[0]?.id || 0
  cache['C_PaymentTerm'] = id
  return id
}

/**
 * Lookup default tax.
 */
export async function lookupDefaultTaxId(): Promise<number> {
  if (cache['C_Tax'] !== undefined) return cache['C_Tax']

  const resp = await apiClient.get('/api/v1/models/C_Tax', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'C_Tax_ID,Name,IsDefault',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  const id = records[0]?.id || 0
  cache['C_Tax'] = id
  return id
}

/**
 * Lookup current user's AD_User_ID by username.
 */
export async function lookupCurrentUserId(username: string): Promise<number> {
  if (cache['AD_User'] !== undefined) return cache['AD_User']

  const safe = username.replace(/'/g, "''")
  const resp = await apiClient.get('/api/v1/models/AD_User', {
    params: {
      '$filter': `Name eq '${safe}' and IsActive eq true`,
      '$select': 'AD_User_ID,Name',
      '$top': 1,
    },
  })

  const records = resp.data.records || []
  const id = records[0]?.id || 0
  cache['AD_User'] = id
  return id
}
