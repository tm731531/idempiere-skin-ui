/**
 * Integration Test 03: Daily Operations — Full Patient Visit
 *
 * - Create patient
 * - Register (S_ResourceAssignment)
 * - Queue status: WAITING → CALLING → CONSULTING → COMPLETED
 * - Create prescription (AD_SysConfig)
 * - Pharmacy: mark DISPENSED + create stock deduction movement
 * - Checkout: mark PAID
 * - Repeat for second patient
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { getTestContext, getSharedState, updateSharedState, trackRecord, toIdempiereDate, type TestContext } from './setup'
import { createTestPatient, lookupDocTypeId, lookupEachUomId, TEST_PREFIX } from './helpers'

let ctx: TestContext

beforeAll(async () => {
  ctx = await getTestContext()
})

describe('03 - Patient A: Full Visit Cycle', () => {
  let patientId: number
  let assignmentId: number

  it('creates patient ITEST_Patient_Lee', async () => {
    patientId = await createTestPatient(ctx, `${TEST_PREFIX}Patient_Lee`, `${TEST_PREFIX}A123456789`)
    expect(patientId).toBeGreaterThan(0)
    updateSharedState({ patientAId: patientId })
  })

  it('looks up patient by TaxID', async () => {
    const res = await ctx.api.get('/api/v1/models/C_BPartner', {
      params: {
        '$filter': `TaxID eq '${TEST_PREFIX}A123456789' and IsCustomer eq true`,
      },
    })
    expect(res.data.records.length).toBe(1)
    expect(res.data.records[0].Name).toBe(`${TEST_PREFIX}Patient_Lee`)
  })

  it('creates registration (S_ResourceAssignment)', async () => {
    const now = new Date()
    const endTime = new Date(now.getTime() + 30 * 60 * 1000)
    const description = JSON.stringify({
      patientId,
      patientName: `${TEST_PREFIX}Patient_Lee`,
      patientTaxId: `${TEST_PREFIX}A123456789`,
    })

    const state = getSharedState()
    const res = await ctx.api.post('/api/v1/models/S_ResourceAssignment', {
      'AD_Org_ID': ctx.orgId,
      'S_Resource_ID': state.doctorAId,
      'Name': '001',
      'AssignDateFrom': toIdempiereDate(now),
      'AssignDateTo': toIdempiereDate(endTime),
      'Qty': 1,
      'IsConfirmed': false,
      'Description': description,
    })

    assignmentId = res.data.id
    expect(assignmentId).toBeGreaterThan(0)
    updateSharedState({ assignmentAId: assignmentId })
  })

  it('sets status WAITING', async () => {
    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_QUEUE_STATUS_${assignmentId}`,
      'Value': 'WAITING',
      'Description': 'Clinic queue status',
      'ConfigurationLevel': 'S',
    })

    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_QUEUE_STATUS_${assignmentId}'` },
    })
    expect(res.data.records[0].Value).toBe('WAITING')
  })

  it('transitions to CALLING → CONSULTING → COMPLETED', async () => {
    const configName = `CLINIC_QUEUE_STATUS_${assignmentId}`

    // Find the config record
    const findRes = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq '${configName}'` },
    })
    const configId = findRes.data.records[0].id

    // CALLING
    await ctx.api.put(`/api/v1/models/AD_SysConfig/${configId}`, { 'Value': 'CALLING' })

    // CONSULTING
    await ctx.api.put(`/api/v1/models/AD_SysConfig/${configId}`, { 'Value': 'CONSULTING' })

    // Verify CONSULTING
    const res = await ctx.api.get(`/api/v1/models/AD_SysConfig/${configId}`)
    expect(res.data.Value).toBe('CONSULTING')
  })

  it('creates prescription', async () => {
    const state = getSharedState()
    const prescription = {
      patientId,
      patientName: `${TEST_PREFIX}Patient_Lee`,
      diagnosis: 'ITEST headache',
      lines: [
        {
          productId: state.productIds[0],
          productName: state.productNames[0],
          dosage: 1,
          unit: 'tablet',
          frequency: 'TID',
          days: 3,
          totalQuantity: 9,
        },
      ],
      totalDays: 3,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    }

    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_PRESCRIPTION_${assignmentId}`,
      'Value': JSON.stringify(prescription),
      'Description': 'Clinic prescription data',
      'ConfigurationLevel': 'S',
    })

    // Mark queue COMPLETED
    const findRes = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_QUEUE_STATUS_${assignmentId}'` },
    })
    await ctx.api.put(`/api/v1/models/AD_SysConfig/${findRes.data.records[0].id}`, {
      'Value': 'COMPLETED',
    })
  })

  it('pharmacy marks DISPENSED and creates stock deduction', async () => {
    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_DISPENSE_STATUS_${assignmentId}`,
      'Value': 'DISPENSED',
      'Description': 'Clinic dispense status',
      'ConfigurationLevel': 'S',
    })

    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_DISPENSE_STATUS_${assignmentId}'` },
    })
    expect(res.data.records[0].Value).toBe('DISPENSED')

    // Create stock deduction movement (Standard → Counter)
    const state = getSharedState()
    const docTypeId = await lookupDocTypeId(ctx, 'MMM')
    const uomId = await lookupEachUomId(ctx)

    const headerRes = await ctx.api.post('/api/v1/models/M_Movement', {
      'AD_Org_ID': ctx.orgId,
      'C_DocType_ID': docTypeId,
      'MovementDate': new Date().toISOString().slice(0, 10),
      'Description': `${TEST_PREFIX}Dispense for assignment ${assignmentId}`,
    })
    const movementId = headerRes.data.id
    trackRecord(ctx, 'M_Movement', movementId, `${TEST_PREFIX}Dispense_A`)

    // Patient A: 1 product, qty=9
    await ctx.api.post('/api/v1/models/M_MovementLine', {
      'AD_Org_ID': ctx.orgId,
      'M_Movement_ID': movementId,
      'M_Product_ID': state.productIds[0],
      'M_Locator_ID': state.defaultLocatorId,
      'M_LocatorTo_ID': state.counterLocatorId,
      'C_UOM_ID': uomId,
      'MovementQty': 9,
      'QtyEntered': 9,
      'TargetQty': 0,
    })

    // Complete
    await ctx.api.put(`/api/v1/models/M_Movement/${movementId}`, {
      'doc-action': 'CO',
    })

    const mvRes = await ctx.api.get(`/api/v1/models/M_Movement/${movementId}`, {
      params: { '$select': 'DocStatus' },
    })
    const mvStatus = typeof mvRes.data.DocStatus === 'object' ? mvRes.data.DocStatus?.id : mvRes.data.DocStatus
    expect(mvStatus).toBe('CO')
  })

  it('checkout marks PAID', async () => {
    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_CHECKOUT_STATUS_${assignmentId}`,
      'Value': 'PAID',
      'Description': 'Clinic checkout status',
      'ConfigurationLevel': 'S',
    })

    const res = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_CHECKOUT_STATUS_${assignmentId}'` },
    })
    expect(res.data.records[0].Value).toBe('PAID')
  })
})

describe('03 - Patient B: Second Visit (different doctor)', () => {
  let patientId: number
  let assignmentId: number

  it('creates patient ITEST_Patient_Wu', async () => {
    patientId = await createTestPatient(ctx, `${TEST_PREFIX}Patient_Wu`, `${TEST_PREFIX}B987654321`)
    expect(patientId).toBeGreaterThan(0)
    updateSharedState({ patientBId: patientId })
  })

  it('creates registration with doctor B', async () => {
    const now = new Date()
    const state = getSharedState()
    const res = await ctx.api.post('/api/v1/models/S_ResourceAssignment', {
      'AD_Org_ID': ctx.orgId,
      'S_Resource_ID': state.doctorBId,
      'Name': '002',
      'AssignDateFrom': toIdempiereDate(now),
      'AssignDateTo': toIdempiereDate(new Date(now.getTime() + 30 * 60 * 1000)),
      'Qty': 1,
      'IsConfirmed': false,
      'Description': JSON.stringify({
        patientId,
        patientName: `${TEST_PREFIX}Patient_Wu`,
        patientTaxId: `${TEST_PREFIX}B987654321`,
      }),
    })
    assignmentId = res.data.id
    updateSharedState({ assignmentBId: assignmentId })
  })

  it('full cycle: WAITING → prescription → DISPENSED + movement → PAID', async () => {
    const state = getSharedState()

    // Queue status
    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_QUEUE_STATUS_${assignmentId}`,
      'Value': 'COMPLETED',
      'Description': 'Clinic queue status',
      'ConfigurationLevel': 'S',
    })

    // Prescription (2 medications)
    const prescription = {
      patientId,
      patientName: `${TEST_PREFIX}Patient_Wu`,
      diagnosis: 'ITEST flu',
      lines: [
        {
          productId: state.productIds[1],
          productName: state.productNames[1],
          dosage: 1,
          unit: 'tablet',
          frequency: 'BID',
          days: 5,
          totalQuantity: 10,
        },
        {
          productId: state.productIds[2],
          productName: state.productNames[2],
          dosage: 1,
          unit: 'capsule',
          frequency: 'TID',
          days: 7,
          totalQuantity: 21,
        },
      ],
      totalDays: 7,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    }

    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_PRESCRIPTION_${assignmentId}`,
      'Value': JSON.stringify(prescription),
      'Description': 'Clinic prescription data',
      'ConfigurationLevel': 'S',
    })

    // Dispense status
    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_DISPENSE_STATUS_${assignmentId}`,
      'Value': 'DISPENSED',
      'Description': 'Clinic dispense status',
      'ConfigurationLevel': 'S',
    })

    // Stock deduction movement (2 products: Ibuprofen qty=10, Amoxicillin qty=21)
    const docTypeId = await lookupDocTypeId(ctx, 'MMM')
    const uomId = await lookupEachUomId(ctx)

    const headerRes = await ctx.api.post('/api/v1/models/M_Movement', {
      'AD_Org_ID': ctx.orgId,
      'C_DocType_ID': docTypeId,
      'MovementDate': new Date().toISOString().slice(0, 10),
      'Description': `${TEST_PREFIX}Dispense for assignment ${assignmentId}`,
    })
    const movementId = headerRes.data.id
    trackRecord(ctx, 'M_Movement', movementId, `${TEST_PREFIX}Dispense_B`)

    for (const line of prescription.lines) {
      await ctx.api.post('/api/v1/models/M_MovementLine', {
        'AD_Org_ID': ctx.orgId,
        'M_Movement_ID': movementId,
        'M_Product_ID': line.productId,
        'M_Locator_ID': state.defaultLocatorId,
        'M_LocatorTo_ID': state.counterLocatorId,
        'C_UOM_ID': uomId,
        'MovementQty': line.totalQuantity,
        'QtyEntered': line.totalQuantity,
        'TargetQty': 0,
      })
    }

    // Complete movement
    await ctx.api.put(`/api/v1/models/M_Movement/${movementId}`, {
      'doc-action': 'CO',
    })

    // Checkout
    await ctx.api.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': ctx.orgId,
      'Name': `CLINIC_CHECKOUT_STATUS_${assignmentId}`,
      'Value': 'PAID',
      'Description': 'Clinic checkout status',
      'ConfigurationLevel': 'S',
    })

    // Verify all statuses
    const qRes = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_QUEUE_STATUS_${assignmentId}'` },
    })
    expect(qRes.data.records[0].Value).toBe('COMPLETED')

    const dRes = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_DISPENSE_STATUS_${assignmentId}'` },
    })
    expect(dRes.data.records[0].Value).toBe('DISPENSED')

    const cRes = await ctx.api.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq 'CLINIC_CHECKOUT_STATUS_${assignmentId}'` },
    })
    expect(cRes.data.records[0].Value).toBe('PAID')

    // Verify movement completed
    const mvRes = await ctx.api.get(`/api/v1/models/M_Movement/${movementId}`, {
      params: { '$select': 'DocStatus' },
    })
    const mvStatus = typeof mvRes.data.DocStatus === 'object' ? mvRes.data.DocStatus?.id : mvRes.data.DocStatus
    expect(mvStatus).toBe('CO')
  })
})
