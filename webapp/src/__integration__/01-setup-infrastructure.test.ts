/**
 * Integration Test 01: Setup Infrastructure
 *
 * - Authenticate to iDempiere REST API
 * - Verify warehouses and locators exist
 * - Create test doctor resources
 * - Create test vendor
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { getTestContext, getSharedState, saveSharedState, updateSharedState, type TestContext } from './setup'
import { createTestVendor, createTestResource, lookupDefaultLocator, lookupCounterLocator, TEST_PREFIX } from './helpers'

// Shared state across tests in this file
let ctx: TestContext

beforeAll(async () => {
  ctx = await getTestContext()
})

describe('01 - Authentication', () => {
  it('authenticates successfully', () => {
    expect(ctx.token).toBeTruthy()
    expect(ctx.clientId).toBeGreaterThan(0)
    expect(ctx.roleId).toBeGreaterThan(0)
  })

  it('API responds to authenticated requests', async () => {
    const res = await ctx.api.get('/api/v1/models/AD_Client', {
      params: { '$top': 1 },
    })
    expect(res.status).toBe(200)
    expect(res.data.records).toBeDefined()
  })
})

describe('01 - Warehouses & Locators', () => {
  it('has at least one warehouse', async () => {
    const res = await ctx.api.get('/api/v1/models/M_Warehouse', {
      params: { '$filter': 'IsActive eq true' },
    })
    expect(res.data.records.length).toBeGreaterThan(0)
  })

  it('default warehouse has at least one locator', async () => {
    const locatorId = await lookupDefaultLocator(ctx, ctx.warehouseId)
    expect(locatorId).toBeGreaterThan(0)
  })
})

describe('01 - Create Test Doctors', () => {
  it('creates ITEST_Dr_Wang', async () => {
    const id = await createTestResource(ctx, `${TEST_PREFIX}Dr_Wang`)
    expect(id).toBeGreaterThan(0)

    // Initialize shared state file
    saveSharedState({
      doctorAId: id,
      doctorBId: 0,
      vendorId: 0,
      vendorLocationId: 0,
      warehouseId: 0,
      defaultLocatorId: 0,
      counterLocatorId: 0,
      productIds: [],
      productNames: [],
      patientAId: 0,
      patientBId: 0,
      assignmentAId: 0,
      assignmentBId: 0,
      stockBefore: {},
    })
  })

  it('creates ITEST_Dr_Chen', async () => {
    const id = await createTestResource(ctx, `${TEST_PREFIX}Dr_Chen`)
    expect(id).toBeGreaterThan(0)
    updateSharedState({ doctorBId: id })
  })

  it('both doctors appear in S_Resource list', async () => {
    const res = await ctx.api.get('/api/v1/models/S_Resource', {
      params: {
        '$filter': `IsActive eq true and contains(Name,'${TEST_PREFIX}')`,
      },
    })
    const names = res.data.records.map((r: any) => r.Name)
    expect(names).toContain(`${TEST_PREFIX}Dr_Wang`)
    expect(names).toContain(`${TEST_PREFIX}Dr_Chen`)
  })
})

describe('01 - Create Test Vendor', () => {
  it('creates ITEST_Pharma_Supply', async () => {
    const vendor = await createTestVendor(ctx, `${TEST_PREFIX}Pharma_Supply`)
    expect(vendor.id).toBeGreaterThan(0)
    expect(vendor.locationId).toBeGreaterThan(0)

    updateSharedState({ vendorId: vendor.id, vendorLocationId: vendor.locationId })
  })

  it('vendor appears in C_BPartner with IsVendor=true', async () => {
    const res = await ctx.api.get('/api/v1/models/C_BPartner', {
      params: {
        '$filter': `Name eq '${TEST_PREFIX}Pharma_Supply' and IsVendor eq true`,
      },
    })
    expect(res.data.records.length).toBe(1)
  })
})

describe('01 - Save infrastructure IDs', () => {
  it('looks up locator IDs', async () => {
    const defaultLocatorId = await lookupDefaultLocator(ctx, ctx.warehouseId)
    const counterLocatorId = await lookupCounterLocator(ctx)

    updateSharedState({
      warehouseId: ctx.warehouseId,
      defaultLocatorId,
      counterLocatorId,
    })

    expect(defaultLocatorId).toBeGreaterThan(0)
    expect(counterLocatorId).toBeGreaterThan(0)
  })

  it('all IDs are set', () => {
    const state = getSharedState()
    expect(state.doctorAId).toBeGreaterThan(0)
    expect(state.doctorBId).toBeGreaterThan(0)
    expect(state.vendorId).toBeGreaterThan(0)
    expect(state.vendorLocationId).toBeGreaterThan(0)
    expect(state.warehouseId).toBeGreaterThan(0)
    expect(state.defaultLocatorId).toBeGreaterThan(0)
    expect(state.counterLocatorId).toBeGreaterThan(0)
  })
})
