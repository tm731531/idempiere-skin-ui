/**
 * UOM Conversion API Module
 *
 * 單位轉換 — C_UOM_Conversion
 */

import { apiClient } from './client'

export interface UomConversion {
  id: number
  productId: number | null
  fromUomId: number
  fromUomName: string
  toUomId: number
  toUomName: string
  multiplyRate: number
  divideRate: number
}

/**
 * List UOM conversions for a specific product.
 * Returns both product-specific and generic conversions.
 */
export async function listProductConversions(productId: number): Promise<UomConversion[]> {
  // Product-specific conversions
  const [specificRes, genericRes] = await Promise.all([
    apiClient.get('/api/v1/models/C_UOM_Conversion', {
      params: {
        '$filter': `IsActive eq true and M_Product_ID eq ${productId}`,
        '$select': 'C_UOM_Conversion_ID,M_Product_ID,MultiplyRate,DivideRate',
        '$expand': 'C_UOM_ID,C_UOM_To_ID',
        '$top': 50,
      },
    }),
    apiClient.get('/api/v1/models/C_UOM_Conversion', {
      params: {
        '$filter': 'IsActive eq true and M_Product_ID eq 0',
        '$select': 'C_UOM_Conversion_ID,M_Product_ID,MultiplyRate,DivideRate',
        '$expand': 'C_UOM_ID,C_UOM_To_ID',
        '$top': 50,
      },
    }),
  ])

  const specific = mapConversions(specificRes.data.records || [])
  const generic = mapConversions(genericRes.data.records || [])

  // Product-specific take precedence; add generic that don't overlap
  const seen = new Set(specific.map(c => `${c.fromUomId}-${c.toUomId}`))
  for (const g of generic) {
    if (!seen.has(`${g.fromUomId}-${g.toUomId}`)) {
      specific.push(g)
    }
  }

  return specific
}

function mapConversions(records: any[]): UomConversion[] {
  return records.map((r: any) => {
    const fromUom = r.C_UOM_ID
    const toUom = r.C_UOM_To_ID
    return {
      id: r.id,
      productId: typeof r.M_Product_ID === 'object' ? (r.M_Product_ID?.id || null) : (r.M_Product_ID || null),
      fromUomId: typeof fromUom === 'object' ? (fromUom?.id || 0) : (fromUom || 0),
      fromUomName: typeof fromUom === 'object' ? (fromUom?.identifier || '') : '',
      toUomId: typeof toUom === 'object' ? (toUom?.id || 0) : (toUom || 0),
      toUomName: typeof toUom === 'object' ? (toUom?.identifier || '') : '',
      multiplyRate: r.MultiplyRate || 0,
      divideRate: r.DivideRate || 0,
    }
  })
}

/**
 * Create a new UOM conversion for a product.
 */
export async function createConversion(input: {
  productId: number
  fromUomId: number
  toUomId: number
  multiplyRate: number
  orgId: number
}): Promise<UomConversion> {
  const divideRate = input.multiplyRate > 0 ? (1 / input.multiplyRate) : 0

  const response = await apiClient.post('/api/v1/models/C_UOM_Conversion', {
    'AD_Org_ID': input.orgId,
    'M_Product_ID': input.productId,
    'C_UOM_ID': input.fromUomId,
    'C_UOM_To_ID': input.toUomId,
    'MultiplyRate': input.multiplyRate,
    'DivideRate': divideRate,
  })

  return {
    id: response.data.id,
    productId: input.productId,
    fromUomId: input.fromUomId,
    fromUomName: '',
    toUomId: input.toUomId,
    toUomName: '',
    multiplyRate: input.multiplyRate,
    divideRate,
  }
}

/**
 * Delete (deactivate) a UOM conversion.
 */
export async function deleteConversion(conversionId: number): Promise<void> {
  await apiClient.put(`/api/v1/models/C_UOM_Conversion/${conversionId}`, {
    'IsActive': false,
  })
}
