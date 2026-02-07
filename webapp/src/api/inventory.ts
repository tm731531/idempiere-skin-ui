/**
 * Inventory API Module
 *
 * 庫存管理 API
 * - 庫存: M_StorageOnHand
 * - 倉庫: M_Warehouse
 * - 調撥: M_Movement + M_MovementLine
 * - 藥品: M_Product
 */

import { apiClient } from './client'

function escapeODataString(value: string): string {
  if (!value) return ''
  return value
    .replace(/'/g, "''")
    .replace(/[<>{}|\\^~\[\]`]/g, '')
    .trim()
}

// ========== Types ==========

export interface StockItem {
  productId: number
  productName: string
  productCode: string
  locatorId: number
  locatorName: string
  qtyOnHand: number
}

export interface Warehouse {
  id: number
  name: string
  locators: { id: number; name: string }[]
}

export interface TransferInput {
  productId: number
  fromLocatorId: number
  toLocatorId: number
  quantity: number
  description?: string
  orgId: number
}

// ========== Warehouse API ==========

export async function listWarehouses(): Promise<Warehouse[]> {
  const response = await apiClient.get('/api/v1/models/M_Warehouse', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Warehouse_ID,Name',
    },
  })

  const warehouses: Warehouse[] = []
  for (const r of response.data.records || []) {
    // Get locators for each warehouse
    const locResponse = await apiClient.get('/api/v1/models/M_Locator', {
      params: {
        '$filter': `M_Warehouse_ID eq ${r.id} and IsActive eq true`,
        '$select': 'M_Locator_ID,Value',
      },
    })

    warehouses.push({
      id: r.id,
      name: r.Name || '',
      locators: (locResponse.data.records || []).map((l: any) => ({
        id: l.id,
        name: l.Value || '',
      })),
    })
  }

  return warehouses
}

// ========== Stock API ==========

export async function listStock(keyword?: string): Promise<StockItem[]> {
  let filter = 'QtyOnHand gt 0'

  const response = await apiClient.get('/api/v1/models/M_StorageOnHand', {
    params: {
      '$filter': filter,
      '$expand': 'M_Product_ID,M_Locator_ID',
      '$orderby': 'M_Product_ID asc',
      '$top': 200,
    },
  })

  let items = (response.data.records || []).map((r: any) => ({
    productId: r.M_Product_ID?.id || r.M_Product_ID,
    productName: r.M_Product_ID?.identifier || '',
    productCode: '',
    locatorId: r.M_Locator_ID?.id || r.M_Locator_ID,
    locatorName: r.M_Locator_ID?.identifier || '',
    qtyOnHand: r.QtyOnHand || 0,
  }))

  // Client-side keyword filter if provided
  if (keyword) {
    const kw = keyword.toLowerCase()
    items = items.filter((i: StockItem) =>
      i.productName.toLowerCase().includes(kw)
    )
  }

  return items
}

export async function searchProducts(keyword: string): Promise<{ id: number; name: string; value: string }[]> {
  const safeKeyword = escapeODataString(keyword)
  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': `IsActive eq true and (contains(Name,'${safeKeyword}') or contains(Value,'${safeKeyword}'))`,
      '$select': 'M_Product_ID,Name,Value',
      '$top': 20,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name || '',
    value: r.Value || '',
  }))
}

// ========== Transfer API ==========

export async function createTransfer(input: TransferInput): Promise<number> {
  // Create movement header
  const headerResponse = await apiClient.post('/api/v1/models/M_Movement', {
    'AD_Org_ID': input.orgId,
    'C_DocType_ID': 143, // Material Movement
    'MovementDate': new Date().toISOString().slice(0, 10),
    'Description': input.description || 'Clinic transfer',
  })

  const movementId = headerResponse.data.id

  // Create movement line
  await apiClient.post('/api/v1/models/M_MovementLine', {
    'AD_Org_ID': input.orgId,
    'M_Movement_ID': movementId,
    'M_Product_ID': input.productId,
    'M_Locator_ID': input.fromLocatorId,
    'M_LocatorTo_ID': input.toLocatorId,
    'C_UOM_ID': 100, // Each
    'MovementQty': input.quantity,
    'QtyEntered': input.quantity,
    'TargetQty': 0,
  })

  // Complete the movement
  try {
    await apiClient.put(`/api/v1/models/M_Movement/${movementId}`, {
      'DocAction': 'CO',
    })
  } catch {
    // DocAction might not work via REST, movement is still created
  }

  return movementId
}

// ========== Receive (Material Receipt) API ==========

export async function listPurchaseOrders(): Promise<any[]> {
  const response = await apiClient.get('/api/v1/models/C_Order', {
    params: {
      '$filter': "IsSOTrx eq false and DocStatus eq 'CO'",
      '$select': 'C_Order_ID,DocumentNo,DateOrdered,C_BPartner_ID',
      '$expand': 'C_BPartner_ID',
      '$orderby': 'DateOrdered desc',
      '$top': 20,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    documentNo: r.DocumentNo || '',
    dateOrdered: r.DateOrdered || '',
    vendorName: r.C_BPartner_ID?.identifier || '',
  }))
}

export async function getOrderLines(orderId: number): Promise<any[]> {
  const response = await apiClient.get('/api/v1/models/C_OrderLine', {
    params: {
      '$filter': `C_Order_ID eq ${orderId}`,
      '$expand': 'M_Product_ID',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    productId: r.M_Product_ID?.id || r.M_Product_ID,
    productName: r.M_Product_ID?.identifier || '',
    qtyOrdered: r.QtyOrdered || 0,
    qtyDelivered: r.QtyDelivered || 0,
  }))
}

// ========== Material Receipt API ==========

export interface ReceiptLine {
  orderLineId: number
  productId: number
  qtyReceived: number
}

export async function createReceipt(
  orderId: number,
  vendorId: number,
  lines: ReceiptLine[],
  orgId: number,
  warehouseId: number
): Promise<number> {
  // Look up C_BPartner_Location_ID from the order
  const orderResponse = await apiClient.get(`/api/v1/models/C_Order/${orderId}`, {
    params: { '$select': 'C_BPartner_Location_ID' },
  })
  let bpLocationId = orderResponse.data.C_BPartner_Location_ID?.id || orderResponse.data.C_BPartner_Location_ID

  // Fallback: look up vendor's first active location
  if (!bpLocationId) {
    const locResponse = await apiClient.get('/api/v1/models/C_BPartner_Location', {
      params: {
        '$filter': `C_BPartner_ID eq ${vendorId} and IsActive eq true`,
        '$top': 1,
      },
    })
    const locRecords = locResponse.data.records || []
    if (locRecords.length > 0) bpLocationId = locRecords[0].id
  }

  // Look up default locator for the warehouse
  const locatorResponse = await apiClient.get('/api/v1/models/M_Locator', {
    params: {
      '$filter': `M_Warehouse_ID eq ${warehouseId} and IsDefault eq true and IsActive eq true`,
      '$top': 1,
    },
  })
  const defaultLocatorId = locatorResponse.data.records?.[0]?.id || 0

  // Create M_InOut header (Material Receipt)
  const headerResponse = await apiClient.post('/api/v1/models/M_InOut', {
    'AD_Org_ID': orgId,
    'C_BPartner_ID': vendorId,
    'C_BPartner_Location_ID': bpLocationId,
    'C_DocType_ID': 122, // MM Receipt
    'C_Order_ID': orderId,
    'M_Warehouse_ID': warehouseId,
    'MovementDate': new Date().toISOString().slice(0, 10),
    'MovementType': 'V+', // Vendor Receipts
    'IsSOTrx': false,
  })

  const inOutId = headerResponse.data.id

  // Create lines
  for (const line of lines) {
    if (line.qtyReceived <= 0) continue
    await apiClient.post('/api/v1/models/M_InOutLine', {
      'AD_Org_ID': orgId,
      'M_InOut_ID': inOutId,
      'C_OrderLine_ID': line.orderLineId,
      'M_Product_ID': line.productId,
      'M_Locator_ID': defaultLocatorId,
      'M_AttributeSetInstance_ID': 0,
      'C_UOM_ID': 100, // Each
      'MovementQty': line.qtyReceived,
      'QtyEntered': line.qtyReceived,
    })
  }

  // Try to complete
  try {
    await apiClient.put(`/api/v1/models/M_InOut/${inOutId}`, {
      'DocAction': 'CO',
    })
  } catch {
    // DocAction may not work via REST
  }

  return inOutId
}

/**
 * Get vendor ID from order (for receipt creation)
 */
export async function getOrderVendorId(orderId: number): Promise<number> {
  const response = await apiClient.get(`/api/v1/models/C_Order/${orderId}`, {
    params: { '$select': 'C_BPartner_ID' },
  })
  return response.data.C_BPartner_ID?.id || response.data.C_BPartner_ID || 0
}

