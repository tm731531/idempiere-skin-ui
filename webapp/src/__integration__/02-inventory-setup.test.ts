/**
 * Integration Test 02: Inventory Setup — Stock the Pharmacy
 *
 * - Create 3 test products
 * - Create purchase order + complete
 * - Create material receipt + complete
 * - Transfer stock to pharmacy locator
 * - Verify stock levels
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { getTestContext, trackRecord, getSharedState, updateSharedState, type TestContext } from './setup'
import {
  createTestProduct,
  lookupDocTypeId,
  lookupEachUomId,
  lookupDefaultLocator,
  lookupPurchasePriceListId,
  lookupCurrencyId,
  lookupPaymentTermId,
  lookupDefaultTaxId,
  lookupUserId,
  TEST_PREFIX,
} from './helpers'

let ctx: TestContext

beforeAll(async () => {
  ctx = await getTestContext()
  const locatorId = await lookupDefaultLocator(ctx, ctx.warehouseId)
  updateSharedState({ defaultLocatorId: locatorId })
})

describe('02 - Create Test Products', () => {
  const products = [
    { name: `${TEST_PREFIX}Aspirin`, value: `${TEST_PREFIX}ASP001` },
    { name: `${TEST_PREFIX}Ibuprofen`, value: `${TEST_PREFIX}IBU001` },
    { name: `${TEST_PREFIX}Amoxicillin`, value: `${TEST_PREFIX}AMX001` },
  ]

  it('creates 3 test products', async () => {
    const ids: number[] = []
    const names: string[] = []

    for (const p of products) {
      const id = await createTestProduct(ctx, p.name, p.value)
      expect(id).toBeGreaterThan(0)
      ids.push(id)
      names.push(p.name)
    }

    updateSharedState({ productIds: ids, productNames: names })
    expect(ids).toHaveLength(3)
  })

  it('products appear in M_Product', async () => {
    const res = await ctx.api.get('/api/v1/models/M_Product', {
      params: {
        '$filter': `contains(Name,'${TEST_PREFIX}') and IsActive eq true`,
      },
    })
    const names = res.data.records.map((r: any) => r.Name)
    expect(names).toContain(`${TEST_PREFIX}Aspirin`)
    expect(names).toContain(`${TEST_PREFIX}Ibuprofen`)
    expect(names).toContain(`${TEST_PREFIX}Amoxicillin`)
  })
})

describe('02 - Create & Complete Purchase Order', () => {
  let orderId: number

  it('creates PO with 3 lines (qty=100 each)', async () => {
    const [poDocTypeId, priceListId, currencyId, paymentTermId, taxId, uomId, userId] = await Promise.all([
      lookupDocTypeId(ctx, 'POO'),
      lookupPurchasePriceListId(ctx),
      lookupCurrencyId(ctx),
      lookupPaymentTermId(ctx),
      lookupDefaultTaxId(ctx),
      lookupEachUomId(ctx),
      lookupUserId(ctx, ctx.username),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const state = getSharedState()

    const headerRes = await ctx.api.post('/api/v1/models/C_Order', {
      'AD_Org_ID': ctx.orgId,
      'C_DocType_ID': poDocTypeId,
      'C_DocTypeTarget_ID': poDocTypeId,
      'IsSOTrx': false,
      'C_BPartner_ID': state.vendorId,
      'C_BPartner_Location_ID': state.vendorLocationId,
      'M_PriceList_ID': priceListId,
      'C_Currency_ID': currencyId,
      'C_PaymentTerm_ID': paymentTermId,
      'M_Warehouse_ID': ctx.warehouseId,
      'SalesRep_ID': userId,
      'DateOrdered': today,
      'DatePromised': today,
      'Description': `${TEST_PREFIX}PO initial stock`,
    })

    orderId = headerRes.data.id
    expect(orderId).toBeGreaterThan(0)
    trackRecord(ctx, 'C_Order', orderId, `${TEST_PREFIX}PO`)

    // Create 3 lines
    for (const productId of state.productIds) {
      await ctx.api.post('/api/v1/models/C_OrderLine', {
        'AD_Org_ID': ctx.orgId,
        'C_Order_ID': orderId,
        'M_Product_ID': productId,
        'C_UOM_ID': uomId,
        'QtyEntered': 100,
        'QtyOrdered': 100,
        'PriceEntered': 10,
        'PriceActual': 10,
        'PriceList': 10,
        'C_Tax_ID': taxId,
      })
    }
  })

  it('completes the PO', async () => {
    await ctx.api.put(`/api/v1/models/C_Order/${orderId}`, {
      'doc-action': 'CO',
    })

    // Verify DocStatus = CO
    const res = await ctx.api.get(`/api/v1/models/C_Order/${orderId}`, {
      params: { '$select': 'DocStatus' },
    })
    const status = typeof res.data.DocStatus === 'object' ? res.data.DocStatus?.id : res.data.DocStatus
    expect(status).toBe('CO')
  })
})

describe('02 - Create & Complete Material Receipt', () => {
  let inOutId: number

  it('creates receipt from PO', async () => {
    const mmrDocTypeId = await lookupDocTypeId(ctx, 'MMR')
    const uomId = await lookupEachUomId(ctx)
    const state = getSharedState()
    const locatorId = state.defaultLocatorId

    // Find the PO we just created
    const poRes = await ctx.api.get('/api/v1/models/C_Order', {
      params: {
        '$filter': `contains(Description,'${TEST_PREFIX}PO') and IsSOTrx eq false`,
        '$orderby': 'Created desc',
        '$top': 1,
      },
    })
    const orderId = poRes.data.records[0].id

    // Get order lines
    const linesRes = await ctx.api.get('/api/v1/models/C_OrderLine', {
      params: {
        '$filter': `C_Order_ID eq ${orderId}`,
        '$expand': 'M_Product_ID',
      },
    })

    // Create M_InOut header
    const headerRes = await ctx.api.post('/api/v1/models/M_InOut', {
      'AD_Org_ID': ctx.orgId,
      'C_BPartner_ID': state.vendorId,
      'C_BPartner_Location_ID': state.vendorLocationId,
      'C_DocType_ID': mmrDocTypeId,
      'C_Order_ID': orderId,
      'M_Warehouse_ID': ctx.warehouseId,
      'MovementDate': new Date().toISOString().slice(0, 10),
      'MovementType': 'V+',
      'IsSOTrx': false,
      'Description': `${TEST_PREFIX}Receipt initial stock`,
    })

    inOutId = headerRes.data.id
    expect(inOutId).toBeGreaterThan(0)
    trackRecord(ctx, 'M_InOut', inOutId, `${TEST_PREFIX}Receipt`)

    // Create receipt lines
    for (const line of linesRes.data.records) {
      await ctx.api.post('/api/v1/models/M_InOutLine', {
        'AD_Org_ID': ctx.orgId,
        'M_InOut_ID': inOutId,
        'C_OrderLine_ID': line.id,
        'M_Product_ID': line.M_Product_ID?.id || line.M_Product_ID,
        'M_Locator_ID': locatorId,
        'M_AttributeSetInstance_ID': 0,
        'C_UOM_ID': uomId,
        'MovementQty': 100,
        'QtyEntered': 100,
      })
    }
  })

  it('completes the receipt', async () => {
    await ctx.api.put(`/api/v1/models/M_InOut/${inOutId}`, {
      'doc-action': 'CO',
    })

    const res = await ctx.api.get(`/api/v1/models/M_InOut/${inOutId}`, {
      params: { '$select': 'DocStatus' },
    })
    const status = typeof res.data.DocStatus === 'object' ? res.data.DocStatus?.id : res.data.DocStatus
    expect(status).toBe('CO')
  })
})

describe('02 - Verify Stock After Receipt', () => {
  it('all 3 products have stock at default locator', async () => {
    const state = getSharedState()
    const locatorId = state.defaultLocatorId

    for (const productId of state.productIds) {
      const res = await ctx.api.get('/api/v1/models/M_StorageOnHand', {
        params: {
          '$filter': `M_Product_ID eq ${productId} and M_Locator_ID eq ${locatorId}`,
        },
      })

      const totalQty = (res.data.records || []).reduce(
        (sum: number, r: any) => sum + (r.QtyOnHand || 0),
        0
      )
      expect(totalQty).toBeGreaterThanOrEqual(100)
    }
  })
})
