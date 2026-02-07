/**
 * Integration Test 04: Inventory Cycle — Restock
 *
 * - Check current stock levels (reduced from dispensing in test 03)
 * - Create restock PO (qty=200)
 * - Create material receipt + complete
 * - Verify stock levels updated
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { getTestContext, trackRecord, getSharedState, updateSharedState, type TestContext } from './setup'
import {
  lookupDocTypeId,
  lookupEachUomId,
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
})

describe('04 - Snapshot Current Stock', () => {
  it('records stock levels for all 3 products', async () => {
    const state = getSharedState()
    const locatorId = state.defaultLocatorId
    const stockBefore: Record<number, number> = {}

    for (const productId of state.productIds) {
      const res = await ctx.api.get('/api/v1/models/M_StorageOnHand', {
        params: {
          '$filter': `M_Product_ID eq ${productId} and M_Locator_ID eq ${locatorId}`,
        },
      })

      const totalQty = (res.data.records || []).reduce(
        (sum: number, r: any) => sum + (r.QtyOnHand || 0),
        0,
      )
      stockBefore[productId] = totalQty
    }

    updateSharedState({ stockBefore })

    // All products should still have stock from test 02 receipt
    for (const productId of state.productIds) {
      expect(stockBefore[productId]).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('04 - Create & Complete Restock PO', () => {
  let orderId: number

  it('creates restock PO with 3 lines (qty=200 each)', async () => {
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
      'Description': `${TEST_PREFIX}PO restock`,
    })

    orderId = headerRes.data.id
    expect(orderId).toBeGreaterThan(0)
    trackRecord(ctx, 'C_Order', orderId, `${TEST_PREFIX}PO_restock`)

    // Create 3 lines
    for (const productId of state.productIds) {
      await ctx.api.post('/api/v1/models/C_OrderLine', {
        'AD_Org_ID': ctx.orgId,
        'C_Order_ID': orderId,
        'M_Product_ID': productId,
        'C_UOM_ID': uomId,
        'QtyEntered': 200,
        'QtyOrdered': 200,
        'PriceEntered': 10,
        'PriceActual': 10,
        'PriceList': 10,
        'C_Tax_ID': taxId,
      })
    }
  })

  it('completes the restock PO', async () => {
    await ctx.api.put(`/api/v1/models/C_Order/${orderId}`, {
      'doc-action': 'CO',
    })

    const res = await ctx.api.get(`/api/v1/models/C_Order/${orderId}`, {
      params: { '$select': 'DocStatus' },
    })
    const status = typeof res.data.DocStatus === 'object' ? res.data.DocStatus?.id : res.data.DocStatus
    expect(status).toBe('CO')
  })
})

describe('04 - Receive Restock Goods', () => {
  let inOutId: number

  it('creates material receipt for restock PO', async () => {
    const mmrDocTypeId = await lookupDocTypeId(ctx, 'MMR')
    const uomId = await lookupEachUomId(ctx)
    const state = getSharedState()
    const locatorId = state.defaultLocatorId

    // Find the restock PO
    const poRes = await ctx.api.get('/api/v1/models/C_Order', {
      params: {
        '$filter': `contains(Description,'${TEST_PREFIX}PO restock') and IsSOTrx eq false`,
        '$orderby': 'Created desc',
        '$top': 1,
      },
    })
    const orderId = poRes.data.records[0].id

    // Get order lines
    const linesRes = await ctx.api.get('/api/v1/models/C_OrderLine', {
      params: { '$filter': `C_Order_ID eq ${orderId}` },
    })

    // Create receipt header
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
      'Description': `${TEST_PREFIX}Receipt restock`,
    })

    inOutId = headerRes.data.id
    expect(inOutId).toBeGreaterThan(0)
    trackRecord(ctx, 'M_InOut', inOutId, `${TEST_PREFIX}Receipt_restock`)

    // Create receipt lines
    for (const line of linesRes.data.records) {
      const productField = line.M_Product_ID
      const productId = typeof productField === 'object' ? productField?.id : productField

      await ctx.api.post('/api/v1/models/M_InOutLine', {
        'AD_Org_ID': ctx.orgId,
        'M_InOut_ID': inOutId,
        'C_OrderLine_ID': line.id,
        'M_Product_ID': productId,
        'M_Locator_ID': locatorId,
        'M_AttributeSetInstance_ID': 0,
        'C_UOM_ID': uomId,
        'MovementQty': 200,
        'QtyEntered': 200,
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

describe('04 - Verify Restock Levels', () => {
  it('stock increased by 200 for all 3 products', async () => {
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
        0,
      )

      const before = state.stockBefore[productId] || 0
      expect(totalQty).toBeGreaterThanOrEqual(before + 200)
    }
  })
})
