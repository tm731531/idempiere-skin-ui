/**
 * Integration Test 05: Final Verification
 *
 * - All POs have DocStatus=CO
 * - All receipts have DocStatus=CO
 * - Dispense movements have DocStatus=CO
 * - Stock levels consistent (no negatives, reflect dispensing)
 * - All clinic statuses correct
 * - Print summary report
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { getTestContext, getSharedState, type TestContext } from './setup'
import { TEST_PREFIX } from './helpers'

let ctx: TestContext

beforeAll(async () => {
  ctx = await getTestContext()
})

describe('05 - Document Status Verification', () => {
  it('all ITEST purchase orders are completed (CO)', async () => {
    const res = await ctx.api.get('/api/v1/models/C_Order', {
      params: {
        '$filter': `contains(Description,'${TEST_PREFIX}') and IsSOTrx eq false`,
        '$select': 'DocumentNo,DocStatus,Description',
      },
    })

    const records = res.data.records || []
    expect(records.length).toBeGreaterThanOrEqual(2) // initial + restock

    for (const r of records) {
      const status = typeof r.DocStatus === 'object' ? r.DocStatus?.id : r.DocStatus
      expect(status).toBe('CO')
    }
  })

  it('all ITEST material receipts are completed (CO)', async () => {
    const res = await ctx.api.get('/api/v1/models/M_InOut', {
      params: {
        '$filter': `contains(Description,'${TEST_PREFIX}') and IsSOTrx eq false`,
        '$select': 'DocumentNo,DocStatus,Description',
      },
    })

    const records = res.data.records || []
    expect(records.length).toBeGreaterThanOrEqual(2) // initial + restock

    for (const r of records) {
      const status = typeof r.DocStatus === 'object' ? r.DocStatus?.id : r.DocStatus
      expect(status).toBe('CO')
    }
  })

  it('all ITEST dispense movements are completed (CO)', async () => {
    const res = await ctx.api.get('/api/v1/models/M_Movement', {
      params: {
        '$filter': `contains(Description,'${TEST_PREFIX}Dispense')`,
        '$select': 'DocumentNo,DocStatus,Description',
      },
    })

    const records = res.data.records || []
    expect(records.length).toBeGreaterThanOrEqual(2) // Patient A + Patient B

    for (const r of records) {
      const status = typeof r.DocStatus === 'object' ? r.DocStatus?.id : r.DocStatus
      expect(status).toBe('CO')
    }
  })
})

describe('05 - Stock Consistency', () => {
  it('all ITEST products have non-negative stock at default locator', async () => {
    const state = getSharedState()

    for (const productId of state.productIds) {
      const res = await ctx.api.get('/api/v1/models/M_StorageOnHand', {
        params: {
          '$filter': `M_Product_ID eq ${productId} and M_Locator_ID eq ${state.defaultLocatorId}`,
        },
      })

      const totalQty = (res.data.records || []).reduce(
        (sum: number, r: any) => sum + (r.QtyOnHand || 0),
        0,
      )

      expect(totalQty).toBeGreaterThanOrEqual(0)
    }
  })

  it('total stock per product reflects receipts minus dispensing', async () => {
    const state = getSharedState()

    // Received: 100 (initial) + 200 (restock) = 300 per product
    // Dispensed from default locator:
    //   Product[0] (Aspirin):     9 (Patient A)
    //   Product[1] (Ibuprofen):  10 (Patient B)
    //   Product[2] (Amoxicillin): 21 (Patient B)
    // Expected at default locator: 300 - dispensed
    const ids = state.productIds
    const dispensed: Record<number, number> = {}
    dispensed[ids[0]!] = 9
    dispensed[ids[1]!] = 10
    dispensed[ids[2]!] = 21

    for (const productId of state.productIds) {
      // Check total across all locators (should still be 300 — moved, not destroyed)
      const allRes = await ctx.api.get('/api/v1/models/M_StorageOnHand', {
        params: {
          '$filter': `M_Product_ID eq ${productId}`,
        },
      })

      const totalQty = (allRes.data.records || []).reduce(
        (sum: number, r: any) => sum + (r.QtyOnHand || 0),
        0,
      )

      // Total across all locators should be 300 (movements just relocate stock)
      expect(totalQty).toBeGreaterThanOrEqual(300)

      // Check default locator (reduced by dispensing)
      const defaultRes = await ctx.api.get('/api/v1/models/M_StorageOnHand', {
        params: {
          '$filter': `M_Product_ID eq ${productId} and M_Locator_ID eq ${state.defaultLocatorId}`,
        },
      })

      const defaultQty = (defaultRes.data.records || []).reduce(
        (sum: number, r: any) => sum + (r.QtyOnHand || 0),
        0,
      )

      const expectedDefault = 300 - (dispensed[productId] || 0)
      expect(defaultQty).toBe(expectedDefault)
    }
  })

  it('counter locator has dispensed quantities', async () => {
    const state = getSharedState()
    const ids = state.productIds
    const dispensed: Record<number, number> = {}
    dispensed[ids[0]!] = 9
    dispensed[ids[1]!] = 10
    dispensed[ids[2]!] = 21

    for (const productId of state.productIds) {
      const res = await ctx.api.get('/api/v1/models/M_StorageOnHand', {
        params: {
          '$filter': `M_Product_ID eq ${productId} and M_Locator_ID eq ${state.counterLocatorId}`,
        },
      })

      const counterQty = (res.data.records || []).reduce(
        (sum: number, r: any) => sum + (r.QtyOnHand || 0),
        0,
      )

      expect(counterQty).toBe(dispensed[productId] || 0)
    }
  })
})

describe('05 - Clinic Status Verification', () => {
  it('Patient A: queue COMPLETED', async () => {
    const state = getSharedState()
    const assignmentId = state.assignmentAId
    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_QUEUE_STATUS_${assignmentId}'` },
    })
    expect(res.data.records.length).toBeGreaterThanOrEqual(1)
    expect(res.data.records[0].Value).toBe('COMPLETED')
  })

  it('Patient A: prescription exists', async () => {
    const state = getSharedState()
    const assignmentId = state.assignmentAId
    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_PRESCRIPTION_${assignmentId}'` },
    })
    expect(res.data.records.length).toBe(1)

    const prescription = JSON.parse(res.data.records[0].Value)
    expect(prescription.status).toBe('COMPLETED')
    expect(prescription.lines.length).toBeGreaterThanOrEqual(1)
  })

  it('Patient A: dispensed', async () => {
    const state = getSharedState()
    const assignmentId = state.assignmentAId
    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_DISPENSE_STATUS_${assignmentId}'` },
    })
    expect(res.data.records.length).toBe(1)
    expect(res.data.records[0].Value).toBe('DISPENSED')
  })

  it('Patient A: checked out (PAID)', async () => {
    const state = getSharedState()
    const assignmentId = state.assignmentAId
    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_CHECKOUT_STATUS_${assignmentId}'` },
    })
    expect(res.data.records.length).toBe(1)
    expect(res.data.records[0].Value).toBe('PAID')
  })

  it('Patient B: queue COMPLETED', async () => {
    const state = getSharedState()
    const assignmentId = state.assignmentBId
    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_QUEUE_STATUS_${assignmentId}'` },
    })
    expect(res.data.records.length).toBe(1)
    expect(res.data.records[0].Value).toBe('COMPLETED')
  })

  it('Patient B: dispensed and paid', async () => {
    const state = getSharedState()
    const assignmentId = state.assignmentBId

    const dRes = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_DISPENSE_STATUS_${assignmentId}'` },
    })
    expect(dRes.data.records[0].Value).toBe('DISPENSED')

    const cRes = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_CHECKOUT_STATUS_${assignmentId}'` },
    })
    expect(cRes.data.records[0].Value).toBe('PAID')
  })
})

describe('05 - Summary Report', () => {
  it('prints test data summary', async () => {
    // Count test data
    const [bpRes, prodRes, poRes, receiptRes, moveRes, assignRes, configRes] = await Promise.all([
      ctx.api.get('/api/v1/models/C_BPartner', {
        params: { '$filter': `contains(Name,'${TEST_PREFIX}')` },
      }),
      ctx.api.get('/api/v1/models/M_Product', {
        params: { '$filter': `contains(Name,'${TEST_PREFIX}')` },
      }),
      ctx.api.get('/api/v1/models/C_Order', {
        params: { '$filter': `contains(Description,'${TEST_PREFIX}') and IsSOTrx eq false` },
      }),
      ctx.api.get('/api/v1/models/M_InOut', {
        params: { '$filter': `contains(Description,'${TEST_PREFIX}')` },
      }),
      ctx.api.get('/api/v1/models/M_Movement', {
        params: { '$filter': `contains(Description,'${TEST_PREFIX}')` },
      }),
      ctx.api.get('/api/v1/models/S_ResourceAssignment', {
        params: { '$filter': `contains(Description,'${TEST_PREFIX}')` },
      }),
      ctx.api.get('/api/v1/models/AD_SysConfig', {
        params: { '$filter': `contains(Name,'CLINIC_')` },
      }),
    ])

    const summary = {
      'Business Partners (patients+vendor)': bpRes.data.records?.length || 0,
      'Products': prodRes.data.records?.length || 0,
      'Purchase Orders': poRes.data.records?.length || 0,
      'Material Receipts': receiptRes.data.records?.length || 0,
      'Movements (dispense)': moveRes.data.records?.length || 0,
      'Resource Assignments': assignRes.data.records?.length || 0,
      'Clinic SysConfig entries': configRes.data.records?.length || 0,
    }

    // Log summary (visible in test output)
    console.log('\n=== INTEGRATION TEST DATA SUMMARY ===')
    for (const [key, value] of Object.entries(summary)) {
      console.log(`  ${key}: ${value}`)
    }
    console.log('=====================================\n')

    // Basic sanity: we should have created some data
    expect(summary['Business Partners (patients+vendor)']).toBeGreaterThanOrEqual(3)
    expect(summary['Products']).toBeGreaterThanOrEqual(3)
    expect(summary['Purchase Orders']).toBeGreaterThanOrEqual(2)
    expect(summary['Material Receipts']).toBeGreaterThanOrEqual(2)
    expect(summary['Movements (dispense)']).toBeGreaterThanOrEqual(2)
    expect(summary['Resource Assignments']).toBeGreaterThanOrEqual(2)
    expect(summary['Clinic SysConfig entries']).toBeGreaterThanOrEqual(6)
  })
})
