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
import { lookupDocTypeId, lookupEachUomId } from './lookup'

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
  warehouseId: number
  warehouseName: string
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

export interface BatchTransferLine {
  productId: number
  productName: string
  quantity: number
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
  // Build locator → warehouse mapping
  const locatorWarehouseMap: Record<number, { warehouseId: number; warehouseName: string }> = {}
  const whResponse = await apiClient.get('/api/v1/models/M_Locator', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Locator_ID,Value',
      '$expand': 'M_Warehouse_ID',
      '$top': 200,
    },
  })
  for (const loc of whResponse.data.records || []) {
    locatorWarehouseMap[loc.id] = {
      warehouseId: loc.M_Warehouse_ID?.id || 0,
      warehouseName: loc.M_Warehouse_ID?.identifier || loc.M_Warehouse_ID?.Name || '',
    }
  }

  const response = await apiClient.get('/api/v1/models/M_StorageOnHand', {
    params: {
      '$filter': 'QtyOnHand gt 0',
      '$expand': 'M_Product_ID,M_Locator_ID',
      '$orderby': 'M_Product_ID asc',
      '$top': 200,
    },
  })

  let items = (response.data.records || []).map((r: any) => {
    const locId = r.M_Locator_ID?.id || r.M_Locator_ID
    const whInfo = locatorWarehouseMap[locId] || { warehouseId: 0, warehouseName: '' }
    return {
      productId: r.M_Product_ID?.id || r.M_Product_ID,
      productName: r.M_Product_ID?.identifier || r.M_Product_ID?.Name || '',
      productCode: '',
      locatorId: locId,
      locatorName: r.M_Locator_ID?.identifier || r.M_Locator_ID?.Value || '',
      warehouseId: whInfo.warehouseId,
      warehouseName: whInfo.warehouseName,
      qtyOnHand: r.QtyOnHand || 0,
    }
  })

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
  const docTypeId = await lookupDocTypeId('MMM')
  const uomId = await lookupEachUomId()

  // Create movement header
  const headerResponse = await apiClient.post('/api/v1/models/M_Movement', {
    'AD_Org_ID': input.orgId,
    'C_DocType_ID': docTypeId,
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
    'C_UOM_ID': uomId,
    'MovementQty': input.quantity,
    'QtyEntered': input.quantity,
    'TargetQty': 0,
  })

  // Complete the movement (doc-action is the REST API key, not DocAction)
  try {
    await apiClient.put(`/api/v1/models/M_Movement/${movementId}`, {
      'doc-action': 'CO',
    })
  } catch (e: any) {
    console.error('Movement completion failed:', e.message)
  }

  return movementId
}

// ========== Batch Transfer API ==========

export async function createBatchTransfer(input: {
  fromLocatorId: number
  toLocatorId: number
  lines: BatchTransferLine[]
  orgId: number
  description?: string
}): Promise<number> {
  const docTypeId = await lookupDocTypeId('MMM')
  const uomId = await lookupEachUomId()

  // Create movement header
  const headerResponse = await apiClient.post('/api/v1/models/M_Movement', {
    'AD_Org_ID': input.orgId,
    'C_DocType_ID': docTypeId,
    'MovementDate': new Date().toISOString().slice(0, 10),
    'Description': input.description || 'Clinic batch transfer',
  })

  const movementId = headerResponse.data.id

  // Create movement lines
  for (const line of input.lines) {
    await apiClient.post('/api/v1/models/M_MovementLine', {
      'AD_Org_ID': input.orgId,
      'M_Movement_ID': movementId,
      'M_Product_ID': line.productId,
      'M_Locator_ID': input.fromLocatorId,
      'M_LocatorTo_ID': input.toLocatorId,
      'C_UOM_ID': uomId,
      'MovementQty': line.quantity,
      'QtyEntered': line.quantity,
      'TargetQty': 0,
    })
  }

  // Complete the movement
  try {
    await apiClient.put(`/api/v1/models/M_Movement/${movementId}`, {
      'doc-action': 'CO',
    })
  } catch (e: any) {
    console.error('Batch movement completion failed:', e.message)
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
    vendorName: r.C_BPartner_ID?.identifier || r.C_BPartner_ID?.Name || '',
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
    productName: r.M_Product_ID?.identifier || r.M_Product_ID?.Name || '',
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

  const docTypeId = await lookupDocTypeId('MMR')
  const uomId = await lookupEachUomId()

  // Create M_InOut header (Material Receipt)
  const headerResponse = await apiClient.post('/api/v1/models/M_InOut', {
    'AD_Org_ID': orgId,
    'C_BPartner_ID': vendorId,
    'C_BPartner_Location_ID': bpLocationId,
    'C_DocType_ID': docTypeId,
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
      'C_UOM_ID': uomId,
      'MovementQty': line.qtyReceived,
      'QtyEntered': line.qtyReceived,
    })
  }

  // Complete the receipt (doc-action is the REST API key, not DocAction)
  try {
    await apiClient.put(`/api/v1/models/M_InOut/${inOutId}`, {
      'doc-action': 'CO',
    })
  } catch (e: any) {
    console.error('Receipt completion failed:', e.message)
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

// ========== Transfer History API ==========

export interface TransferDoc {
  id: number
  documentNo: string
  movementDate: string
  docStatus: string
  description: string
}

export interface TransferHistoryLine {
  productName: string
  quantity: number
  fromLocator: string
  toLocator: string
}

const DOC_STATUS_LABEL: Record<string, string> = {
  'DR': '草稿',
  'CO': '已完成',
  'VO': '已作廢',
  'CL': '已關閉',
}

export function getDocStatusLabel(status: string): string {
  return DOC_STATUS_LABEL[status] || status
}

/**
 * List recent transfer (M_Movement) documents.
 */
export async function listTransferHistory(): Promise<TransferDoc[]> {
  const docTypeId = await lookupDocTypeId('MMM')

  let filter = 'IsActive eq true'
  if (docTypeId) {
    filter += ` and C_DocType_ID eq ${docTypeId}`
  }

  const response = await apiClient.get('/api/v1/models/M_Movement', {
    params: {
      '$filter': filter,
      '$select': 'M_Movement_ID,DocumentNo,MovementDate,DocStatus,Description',
      '$orderby': 'MovementDate desc, Created desc',
      '$top': 30,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    documentNo: r.DocumentNo || '',
    movementDate: r.MovementDate || '',
    docStatus: r.DocStatus || 'DR',
    description: r.Description || '',
  }))
}

/**
 * Get lines for a specific transfer document.
 */
export async function getTransferLines(movementId: number): Promise<TransferHistoryLine[]> {
  const response = await apiClient.get('/api/v1/models/M_MovementLine', {
    params: {
      '$filter': `M_Movement_ID eq ${movementId}`,
      '$expand': 'M_Product_ID,M_Locator_ID,M_LocatorTo_ID',
    },
  })

  return (response.data.records || []).map((r: any) => ({
    productName: r.M_Product_ID?.identifier || r.M_Product_ID?.Name || '',
    quantity: r.MovementQty || 0,
    fromLocator: r.M_Locator_ID?.identifier || r.M_Locator_ID?.Value || '',
    toLocator: r.M_LocatorTo_ID?.identifier || r.M_LocatorTo_ID?.Value || '',
  }))
}

