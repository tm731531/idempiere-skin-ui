/**
 * Resource API Module
 *
 * Manages S_ResourceType and S_Resource for doctor scheduling.
 * S_Resource is required for registration (S_ResourceAssignment).
 */

import { apiClient } from './client'
import { lookupEachUomId } from './lookup'

// ========== Types ==========

export interface DoctorResource {
  id: number
  name: string
  value: string
  warehouseId: number
  warehouseName: string
  isAvailable: boolean
}

// ========== S_ResourceType ==========

/**
 * Ensure a "Doctor" resource type exists. Creates one if none found.
 * Returns the S_ResourceType_ID.
 */
export async function ensureResourceType(orgId: number): Promise<number> {
  // Check existing
  const response = await apiClient.get('/api/v1/models/S_ResourceType', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'S_ResourceType_ID,Name',
      '$top': 1,
    },
  })

  const existing = response.data.records || []
  if (existing.length > 0) {
    return existing[0].id
  }

  // Create new resource type with sensible defaults
  const [uomId, taxCatId, prodCatId] = await Promise.all([
    lookupEachUomId(),
    lookupDefaultTaxCategory(),
    lookupDefaultProductCategory(),
  ])

  const createResponse = await apiClient.post('/api/v1/models/S_ResourceType', {
    'AD_Org_ID': orgId,
    'Name': 'Doctor',
    'Value': 'Doctor',
    'C_UOM_ID': uomId,
    'C_TaxCategory_ID': taxCatId,
    'M_Product_Category_ID': prodCatId,
    'IsDateSlot': false,
    'IsTimeSlot': false,
    'IsSingleAssignment': false,
    'AllowUoMFractions': false,
    'OnMonday': true,
    'OnTuesday': true,
    'OnWednesday': true,
    'OnThursday': true,
    'OnFriday': true,
    'OnSaturday': true,
    'OnSunday': false,
  })

  return createResponse.data.id
}

// ========== S_Resource ==========

/**
 * List all active doctor resources.
 */
export async function listResources(): Promise<DoctorResource[]> {
  const response = await apiClient.get('/api/v1/models/S_Resource', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'S_Resource_ID,Name,Value,M_Warehouse_ID,IsAvailable',
      '$expand': 'M_Warehouse_ID',
      '$orderby': 'Name asc',
      '$top': 50,
    },
  })

  return (response.data.records || []).map((r: any) => {
    const wh = r.M_Warehouse_ID
    return {
      id: r.id,
      name: r.Name || '',
      value: r.Value || '',
      warehouseId: typeof wh === 'object' ? (wh?.id || 0) : (wh || 0),
      warehouseName: typeof wh === 'object' ? (wh?.identifier || wh?.Name || '') : '',
      isAvailable: r.IsAvailable !== false,
    }
  })
}

/**
 * Create a new doctor resource.
 * Warehouse is auto-resolved (first active warehouse).
 */
export async function createResource(input: {
  name: string
  orgId: number
}): Promise<DoctorResource> {
  const [resourceTypeId, warehouseId] = await Promise.all([
    ensureResourceType(input.orgId),
    lookupDefaultWarehouse(),
  ])

  const response = await apiClient.post('/api/v1/models/S_Resource', {
    'AD_Org_ID': input.orgId,
    'S_ResourceType_ID': resourceTypeId,
    'Name': input.name,
    'Value': input.name,
    'M_Warehouse_ID': warehouseId,
    'PercentUtilization': 100,
    'IsAvailable': true,
  })

  return {
    id: response.data.id,
    name: input.name,
    value: input.name,
    warehouseId,
    warehouseName: '',
    isAvailable: true,
  }
}

/**
 * Delete (deactivate) a doctor resource.
 */
export async function deleteResource(resourceId: number): Promise<void> {
  await apiClient.put(`/api/v1/models/S_Resource/${resourceId}`, {
    'IsActive': false,
  })
}

// ========== Internal Lookups ==========

async function lookupDefaultWarehouse(): Promise<number> {
  const response = await apiClient.get('/api/v1/models/M_Warehouse', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Warehouse_ID,Name',
      '$top': 1,
    },
  })
  const records = response.data.records || []
  if (records.length === 0) throw new Error('找不到倉庫，請先在 iDempiere 建立倉庫')
  return records[0].id
}

async function lookupDefaultTaxCategory(): Promise<number> {
  const response = await apiClient.get('/api/v1/models/C_TaxCategory', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'C_TaxCategory_ID,Name,IsDefault',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })
  return (response.data.records || [])[0]?.id || 0
}

async function lookupDefaultProductCategory(): Promise<number> {
  const response = await apiClient.get('/api/v1/models/M_Product_Category', {
    params: {
      '$filter': 'IsActive eq true',
      '$select': 'M_Product_Category_ID,Name,IsDefault',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })
  return (response.data.records || [])[0]?.id || 0
}
