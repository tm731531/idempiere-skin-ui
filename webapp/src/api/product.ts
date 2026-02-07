/**
 * Product API Module
 *
 * 產品建立和查詢
 */

import { apiClient } from './client'
import { lookupEachUomId } from './lookup'

function escapeODataString(value: string): string {
  if (!value) return ''
  return value
    .replace(/'/g, "''")
    .replace(/[<>{}|\\^~\[\]`]/g, '')
    .trim()
}

/**
 * Create a new product (M_Product) with minimal required fields.
 */
export async function createProduct(input: {
  name: string
  value: string
  orgId: number
  productCategoryId?: number
  uomId?: number
}): Promise<{ id: number; name: string; value: string }> {
  // Resolve UOM (default to Each)
  const uomId = input.uomId || await lookupEachUomId()

  // Resolve product category (use provided or lookup default)
  let categoryId = input.productCategoryId
  if (!categoryId) {
    const categories = await listProductCategories()
    const defaultCat = categories.find((c: any) => c.isDefault) || categories[0]
    categoryId = defaultCat?.id || 0
  }

  const response = await apiClient.post('/api/v1/models/M_Product', {
    'AD_Org_ID': input.orgId,
    'Name': input.name,
    'Value': input.value,
    'M_Product_Category_ID': categoryId,
    'C_UOM_ID': uomId,
    'ProductType': 'I', // Item
    'C_TaxCategory_ID': await lookupDefaultTaxCategory(),
  })

  return {
    id: response.data.id,
    name: response.data.Name || input.name,
    value: response.data.Value || input.value,
  }
}

/**
 * List product categories (for dropdown).
 */
export async function listProductCategories(): Promise<{ id: number; name: string; isDefault: boolean }[]> {
  const response = await apiClient.get('/api/v1/models/M_Product_Category', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Product_Category_ID,Name,IsDefault',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 50,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name || '',
    isDefault: !!r.IsDefault,
  }))
}

/**
 * Find a product by barcode (Value or UPC field).
 */
export async function findProductByBarcode(barcode: string): Promise<{ id: number; name: string; value: string } | null> {
  const safe = escapeODataString(barcode)
  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': `IsActive eq true and (Value eq '${safe}' or UPC eq '${safe}')`,
      '$select': 'M_Product_ID,Name,Value',
      '$top': 1,
    },
  })

  const records = response.data.records || []
  if (records.length === 0) return null

  return {
    id: records[0].id,
    name: records[0].Name || '',
    value: records[0].Value || '',
  }
}

// ========== Types ==========

export interface Product {
  id: number
  name: string
  value: string
  upc: string
  categoryId: number
  categoryName: string
  uomId: number
  uomName: string
  isActive: boolean
}

// ========== List / Search ==========

/**
 * List products with optional keyword search.
 */
export async function listProducts(keyword?: string): Promise<Product[]> {
  let filter = 'IsActive eq true'
  if (keyword) {
    const safe = escapeODataString(keyword)
    filter += ` and (contains(Name,'${safe}') or contains(Value,'${safe}') or UPC eq '${safe}')`
  }

  const response = await apiClient.get('/api/v1/models/M_Product', {
    params: {
      '$filter': filter,
      '$select': 'M_Product_ID,Value,Name,UPC',
      '$expand': 'M_Product_Category_ID,C_UOM_ID',
      '$orderby': 'Name asc',
      '$top': 100,
    },
  })

  return (response.data.records || []).map((r: any) => {
    const cat = r.M_Product_Category_ID
    const uom = r.C_UOM_ID
    return {
      id: r.id,
      name: r.Name || '',
      value: r.Value || '',
      upc: r.UPC || '',
      categoryId: typeof cat === 'object' ? (cat?.id || 0) : (cat || 0),
      categoryName: typeof cat === 'object' ? (cat?.identifier || cat?.Name || '') : '',
      uomId: typeof uom === 'object' ? (uom?.id || 0) : (uom || 0),
      uomName: typeof uom === 'object' ? (uom?.identifier || uom?.Name || '') : '',
      isActive: true,
    }
  })
}

// ========== Update ==========

/**
 * Update product basic fields.
 */
export async function updateProduct(id: number, data: Record<string, any>): Promise<void> {
  await apiClient.put(`/api/v1/models/M_Product/${id}`, data)
}

// ========== UOM ==========

export interface UomOption {
  id: number
  name: string
  label: string
}

const UOM_LABELS: Record<string, string> = {
  'Each': '顆',
  'Pack': '袋',
  'Bottle': '瓶',
  'Gram': '克',
  'Jar': '罐',
  'Milliliter': 'ml',
  'Dose': '劑',
  'Piece': '片',
}

/**
 * List available UOMs for product creation.
 */
export async function listUoms(): Promise<UomOption[]> {
  const response = await apiClient.get('/api/v1/models/C_UOM', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'C_UOM_ID,Name',
      '$orderby': 'Name asc',
      '$top': 50,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name || '',
    label: UOM_LABELS[r.Name] || r.Name || '',
  }))
}

// ========== Category Create ==========

/**
 * Create a new product category.
 */
export async function createProductCategory(name: string, orgId: number): Promise<{ id: number; name: string }> {
  const response = await apiClient.post('/api/v1/models/M_Product_Category', {
    'AD_Org_ID': orgId,
    'Name': name,
    'Value': name,
    'IsActive': true,
  })
  return { id: response.data.id, name: response.data.Name || name }
}

// ========== Internal ==========

/**
 * Lookup default tax category (required for M_Product).
 */
async function lookupDefaultTaxCategory(): Promise<number> {
  const response = await apiClient.get('/api/v1/models/C_TaxCategory', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'C_TaxCategory_ID,Name,IsDefault',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })

  const records = response.data.records || []
  return records[0]?.id || 0
}
