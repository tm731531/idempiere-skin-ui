/**
 * Integration Test Helpers — Factory functions for test data
 *
 * All test data uses ITEST_ prefix for identification and cleanup.
 * Factory functions are idempotent: find existing or create new.
 */

import { type TestContext, trackRecord } from './setup'

// ========== Constants ==========

export const TEST_PREFIX = 'ITEST_'

// Unique run ID to avoid collisions with leftover data
const RUN_ID = Date.now().toString(36)

// ========== Lookup Helpers ==========

// Well-known DocType name mapping for common base types
const DOC_TYPE_NAMES: Record<string, string> = {
  'POO': 'Purchase Order',
  'MMR': 'MM Receipt',
  'MMM': 'Material Movement',
}

export async function lookupDocTypeId(ctx: TestContext, docBaseType: string): Promise<number> {
  const preferredName = DOC_TYPE_NAMES[docBaseType]

  const res = await ctx.api.get('/api/v1/models/C_DocType', {
    params: {
      '$filter': `DocBaseType eq '${docBaseType}' and IsActive eq true`,
    },
  })
  const records = res.data.records || []

  // Prefer the standard named DocType
  if (preferredName) {
    const match = records.find((r: any) => r.Name === preferredName)
    if (match) return match.id
  }

  return records[0]?.id || 0
}

export async function lookupEachUomId(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/C_UOM', {
    params: {
      '$filter': "Name eq 'Each' and IsActive eq true",
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupDefaultTaxCategory(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/C_TaxCategory', {
    params: {
      '$filter': 'IsActive eq true',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupDefaultProductCategory(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/M_Product_Category', {
    params: {
      '$filter': 'IsActive eq true',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupDefaultTaxId(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/C_Tax', {
    params: {
      '$filter': 'IsActive eq true',
      '$orderby': 'IsDefault desc, Name asc',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupPurchasePriceListId(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/M_PriceList', {
    params: {
      '$filter': 'IsActive eq true and IsSOPriceList eq false',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupPurchasePriceListVersionId(ctx: TestContext): Promise<number> {
  const priceListId = await lookupPurchasePriceListId(ctx)
  const res = await ctx.api.get('/api/v1/models/M_PriceList_Version', {
    params: {
      '$filter': `M_PriceList_ID eq ${priceListId} and IsActive eq true`,
      '$orderby': 'ValidFrom desc',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupCurrencyId(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/M_PriceList', {
    params: {
      '$filter': 'IsActive eq true and IsSOPriceList eq false',
      '$select': 'C_Currency_ID',
      '$top': 1,
    },
  })
  const currField = res.data.records?.[0]?.C_Currency_ID
  return typeof currField === 'object' ? currField?.id : currField || 0
}

export async function lookupPaymentTermId(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/C_PaymentTerm', {
    params: {
      '$filter': 'IsActive eq true',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupUserId(ctx: TestContext, username: string): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/AD_User', {
    params: {
      '$filter': `Name eq '${username}' and IsActive eq true`,
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 100
}

export async function lookupBPGroupId(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/C_BP_Group', {
    params: {
      '$filter': 'IsActive eq true',
      '$orderby': 'IsDefault desc',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupDefaultLocator(ctx: TestContext, warehouseId: number): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/M_Locator', {
    params: {
      '$filter': `M_Warehouse_ID eq ${warehouseId} and IsActive eq true`,
      '$orderby': 'IsDefault desc',
      '$top': 1,
    },
  })
  return res.data.records?.[0]?.id || 0
}

export async function lookupResourceTypeId(ctx: TestContext): Promise<number> {
  const res = await ctx.api.get('/api/v1/models/S_ResourceType', {
    params: {
      '$filter': 'IsActive eq true',
      '$top': 1,
    },
  })
  if (res.data.records?.length > 0) return res.data.records[0].id

  // Auto-create if none exists (common in fresh Yishou client)
  const [uomId, taxCatId, prodCatId] = await Promise.all([
    lookupEachUomId(ctx),
    lookupDefaultTaxCategory(ctx),
    lookupDefaultProductCategory(ctx),
  ])

  const createRes = await ctx.api.post('/api/v1/models/S_ResourceType', {
    'AD_Org_ID': ctx.orgId,
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
  return createRes.data.id
}

/**
 * Look up Counter warehouse locator (dispensing destination).
 * Finds the first locator in the 'Counter' warehouse.
 */
export async function lookupCounterLocator(ctx: TestContext): Promise<number> {
  // Find Counter warehouse
  const whRes = await ctx.api.get('/api/v1/models/M_Warehouse', {
    params: {
      '$filter': "Name eq 'Counter' and IsActive eq true",
      '$top': 1,
    },
  })
  const counterWhId = whRes.data.records?.[0]?.id
  if (!counterWhId) return 0

  // Find locator in Counter warehouse
  const locRes = await ctx.api.get('/api/v1/models/M_Locator', {
    params: {
      '$filter': `M_Warehouse_ID eq ${counterWhId} and IsActive eq true`,
      '$top': 1,
    },
  })
  return locRes.data.records?.[0]?.id || 0
}

// ========== Factory Functions (find-or-create) ==========

export async function createTestVendor(ctx: TestContext, name: string): Promise<{ id: number; locationId: number }> {
  // Check if vendor already exists
  const existing = await ctx.api.get('/api/v1/models/C_BPartner', {
    params: {
      '$filter': `Name eq '${name}' and IsVendor eq true and IsActive eq true`,
      '$top': 1,
    },
  })
  if (existing.data.records?.length > 0) {
    const vendorId = existing.data.records[0].id
    // Find existing location
    const locRes = await ctx.api.get('/api/v1/models/C_BPartner_Location', {
      params: { '$filter': `C_BPartner_ID eq ${vendorId} and IsActive eq true`, '$top': 1 },
    })
    return { id: vendorId, locationId: locRes.data.records?.[0]?.id || 0 }
  }

  const bpGroupId = await lookupBPGroupId(ctx)

  const bpRes = await ctx.api.post('/api/v1/models/C_BPartner', {
    'AD_Org_ID': ctx.orgId,
    'Value': `${name}_${RUN_ID}`,
    'Name': name,
    'C_BP_Group_ID': bpGroupId,
    'IsVendor': true,
    'IsCustomer': false,
    'IsActive': true,
  })
  const vendorId = bpRes.data.id
  trackRecord(ctx, 'C_BPartner', vendorId, name)

  // Create location + BPartner location
  const locRes = await ctx.api.post('/api/v1/models/C_Location', {
    'AD_Org_ID': ctx.orgId,
    'C_Country_ID': 316, // Taiwan
    'Address1': 'ITEST address',
  })
  const locationId = locRes.data.id

  const bplRes = await ctx.api.post('/api/v1/models/C_BPartner_Location', {
    'AD_Org_ID': ctx.orgId,
    'C_BPartner_ID': vendorId,
    'C_Location_ID': locationId,
    'Name': 'Default',
    'IsBillTo': true,
    'IsShipTo': true,
    'IsPayFrom': true,
    'IsRemitTo': true,
  })

  return { id: vendorId, locationId: bplRes.data.id }
}

export async function createTestProduct(
  ctx: TestContext,
  name: string,
  value: string,
): Promise<number> {
  // Check if product already exists by name
  const existing = await ctx.api.get('/api/v1/models/M_Product', {
    params: {
      '$filter': `Name eq '${name}' and IsActive eq true`,
      '$top': 1,
    },
  })
  if (existing.data.records?.length > 0) {
    return existing.data.records[0].id
  }

  const [uomId, taxCatId, prodCatId] = await Promise.all([
    lookupEachUomId(ctx),
    lookupDefaultTaxCategory(ctx),
    lookupDefaultProductCategory(ctx),
  ])

  const res = await ctx.api.post('/api/v1/models/M_Product', {
    'AD_Org_ID': ctx.orgId,
    'Name': name,
    'Value': `${value}_${RUN_ID}`,
    'M_Product_Category_ID': prodCatId,
    'C_UOM_ID': uomId,
    'C_TaxCategory_ID': taxCatId,
    'ProductType': 'I',
  })
  const productId = res.data.id

  // Add to purchase price list so PO lines can reference this product
  const plvId = await lookupPurchasePriceListVersionId(ctx)
  if (plvId > 0) {
    await ctx.api.post('/api/v1/models/M_ProductPrice', {
      'M_PriceList_Version_ID': plvId,
      'M_Product_ID': productId,
      'PriceList': 10,
      'PriceStd': 10,
      'PriceLimit': 10,
    })
  }

  trackRecord(ctx, 'M_Product', productId, name)
  return productId
}

export async function createTestPatient(
  ctx: TestContext,
  name: string,
  taxId: string,
): Promise<number> {
  // Check if patient with this TaxID already exists
  const existing = await ctx.api.get('/api/v1/models/C_BPartner', {
    params: {
      '$filter': `TaxID eq '${taxId}' and IsCustomer eq true and IsActive eq true`,
      '$top': 1,
    },
  })
  if (existing.data.records?.length > 0) {
    return existing.data.records[0].id
  }

  const bpGroupId = await lookupBPGroupId(ctx)

  const res = await ctx.api.post('/api/v1/models/C_BPartner', {
    'AD_Org_ID': ctx.orgId,
    'Value': `${TEST_PREFIX}${Date.now()}`,
    'Name': name,
    'TaxID': taxId,
    'C_BP_Group_ID': bpGroupId,
    'IsCustomer': true,
    'IsVendor': false,
    'IsActive': true,
  })

  trackRecord(ctx, 'C_BPartner', res.data.id, name)
  return res.data.id
}

export async function createTestResource(
  ctx: TestContext,
  name: string,
): Promise<number> {
  // Check if resource already exists
  const existing = await ctx.api.get('/api/v1/models/S_Resource', {
    params: {
      '$filter': `Name eq '${name}' and IsActive eq true`,
      '$top': 1,
    },
  })
  if (existing.data.records?.length > 0) {
    return existing.data.records[0].id
  }

  const resourceTypeId = await lookupResourceTypeId(ctx)

  const res = await ctx.api.post('/api/v1/models/S_Resource', {
    'AD_Org_ID': ctx.orgId,
    'S_ResourceType_ID': resourceTypeId,
    'Name': name,
    'Value': `${name}_${RUN_ID}`,
    'M_Warehouse_ID': ctx.warehouseId,
    'PercentUtilization': 100,
    'IsAvailable': true,
  })

  trackRecord(ctx, 'S_Resource', res.data.id, name)
  return res.data.id
}
