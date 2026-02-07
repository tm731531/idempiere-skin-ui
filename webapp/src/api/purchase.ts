/**
 * Purchase Order API Module
 *
 * 採購單 API
 * - 供應商: C_BPartner (IsVendor=true)
 * - 採購單: C_Order (IsSOTrx=false)
 * - 採購單明細: C_OrderLine
 */

import { apiClient } from './client'
import {
  lookupDocTypeId,
  lookupEachUomId,
  lookupPurchasePriceListId,
  lookupPOCurrencyId,
  lookupDefaultPaymentTermId,
  lookupDefaultTaxId,
  lookupCurrentUserId,
} from './lookup'

function escapeODataString(value: string): string {
  if (!value) return ''
  return value
    .replace(/'/g, "''")
    .replace(/[<>{}|\\^~\[\]`]/g, '')
    .trim()
}

// ========== Types ==========

export interface Vendor {
  id: number
  name: string
}

export interface PurchaseOrderLineInput {
  productId: number
  productName: string
  quantity: number
  price: number
}

export interface PurchaseOrderInput {
  vendorId: number
  lines: PurchaseOrderLineInput[]
  orgId: number
  warehouseId: number
  username: string
}

// ========== Vendor API ==========

/**
 * List vendors (C_BPartner where IsVendor=true).
 */
export async function listVendors(keyword?: string): Promise<Vendor[]> {
  let filter = 'IsVendor eq true and IsActive eq true'
  if (keyword) {
    const safe = escapeODataString(keyword)
    filter += ` and contains(Name,'${safe}')`
  }

  const response = await apiClient.get('/api/v1/models/C_BPartner', {
    params: {
      '$filter': filter,
      '$select': 'C_BPartner_ID,Name',
      '$orderby': 'Name asc',
      '$top': 50,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name || '',
  }))
}

/**
 * Get vendor's first active location (C_BPartner_Location_ID).
 */
export async function getVendorLocationId(vendorId: number): Promise<number> {
  const response = await apiClient.get('/api/v1/models/C_BPartner_Location', {
    params: {
      '$filter': `C_BPartner_ID eq ${vendorId} and IsActive eq true`,
      '$top': 1,
    },
  })

  const records = response.data.records || []
  return records[0]?.id || 0
}

// ========== Purchase Order API ==========

/**
 * Create a purchase order with lines and complete it.
 * Returns the order ID.
 */
export async function createPurchaseOrder(input: PurchaseOrderInput): Promise<{ id: number; documentNo: string }> {
  // Lookup all required IDs in parallel
  const [poDocTypeId, priceListId, currencyId, paymentTermId, taxId, uomId, userId] = await Promise.all([
    lookupDocTypeId('POO'),
    lookupPurchasePriceListId(),
    lookupPOCurrencyId(),
    lookupDefaultPaymentTermId(),
    lookupDefaultTaxId(),
    lookupEachUomId(),
    lookupCurrentUserId(input.username),
  ])

  // Get vendor location
  const vendorLocationId = await getVendorLocationId(input.vendorId)
  if (!vendorLocationId) {
    throw new Error('供應商尚未設定地址，請先在 iDempiere 中建立供應商地址')
  }

  const today = new Date().toISOString().slice(0, 10)

  // Create C_Order header
  const headerResponse = await apiClient.post('/api/v1/models/C_Order', {
    'AD_Org_ID': input.orgId,
    'C_DocType_ID': poDocTypeId,
    'C_DocTypeTarget_ID': poDocTypeId,
    'IsSOTrx': false,
    'C_BPartner_ID': input.vendorId,
    'C_BPartner_Location_ID': vendorLocationId,
    'M_PriceList_ID': priceListId,
    'C_Currency_ID': currencyId,
    'C_PaymentTerm_ID': paymentTermId,
    'M_Warehouse_ID': input.warehouseId,
    'SalesRep_ID': userId || 100, // Fallback to SuperUser if lookup fails
    'DateOrdered': today,
    'DatePromised': today,
  })

  const orderId = headerResponse.data.id
  const documentNo = headerResponse.data.DocumentNo || ''

  // Create C_OrderLine for each line
  for (const line of input.lines) {
    if (line.quantity <= 0) continue
    await apiClient.post('/api/v1/models/C_OrderLine', {
      'AD_Org_ID': input.orgId,
      'C_Order_ID': orderId,
      'M_Product_ID': line.productId,
      'C_UOM_ID': uomId,
      'QtyEntered': line.quantity,
      'QtyOrdered': line.quantity,
      'PriceEntered': line.price,
      'PriceActual': line.price,
      'PriceList': line.price,
      'C_Tax_ID': taxId,
    })
  }

  // Complete the order
  try {
    await apiClient.put(`/api/v1/models/C_Order/${orderId}`, {
      'doc-action': 'CO',
    })
  } catch (e: any) {
    console.error('PO completion failed:', e.message)
    // Order was created but not completed — return it anyway
  }

  return { id: orderId, documentNo }
}
