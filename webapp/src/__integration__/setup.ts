/**
 * Integration Test Setup
 *
 * Authenticates against live iDempiere REST API and provides shared context.
 * Uses file-based shared state to pass data between test files.
 */

import axios, { type AxiosInstance } from 'axios'
import https from 'https'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Skip TLS verification for self-signed cert
const httpsAgent = new https.Agent({ rejectUnauthorized: false })

const BASE_URL = 'https://localhost:8443'
const SHARED_STATE_FILE = join(__dirname, '.itest-state.json')

let testContext: TestContext | null = null

export interface TestContext {
  api: AxiosInstance
  token: string
  clientId: number
  roleId: number
  orgId: number
  warehouseId: number
  username: string
  // Tracked test data for cleanup verification
  createdRecords: { table: string; id: number; name: string }[]
}

// ========== Shared State (persists across test files via temp file) ==========

export interface SharedState {
  doctorAId: number
  doctorBId: number
  vendorId: number
  vendorLocationId: number
  warehouseId: number
  defaultLocatorId: number
  counterLocatorId: number
  productIds: number[]
  productNames: string[]
  patientAId: number
  patientBId: number
  assignmentAId: number
  assignmentBId: number
  stockBefore: Record<number, number>
}

const defaultState: SharedState = {
  doctorAId: 0,
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
}

export function getSharedState(): SharedState {
  if (existsSync(SHARED_STATE_FILE)) {
    return JSON.parse(readFileSync(SHARED_STATE_FILE, 'utf-8'))
  }
  return { ...defaultState }
}

export function saveSharedState(state: SharedState): void {
  writeFileSync(SHARED_STATE_FILE, JSON.stringify(state, null, 2))
}

export function updateSharedState(partial: Partial<SharedState>): SharedState {
  const current = getSharedState()
  const updated = { ...current, ...partial }
  saveSharedState(updated)
  return updated
}

// ========== Auth ==========

/**
 * Authenticate and return a configured axios instance + context.
 */
export async function getTestContext(): Promise<TestContext> {
  if (testContext) return testContext

  const client = axios.create({
    baseURL: BASE_URL,
    httpsAgent,
    timeout: 15000,
  })

  // Step 1: POST /auth/tokens
  const loginRes = await client.post('/api/v1/auth/tokens', {
    userName: 'SuperUser',
    password: 'System',
  })

  const initialToken = loginRes.data.token
  const clients = loginRes.data.clients
  if (!initialToken || !clients?.length) throw new Error('Auth failed: no token or clients')

  // Prefer Yishou client, else first client
  const yishouClient = clients.find((c: any) => c.name === 'Yishou')
  const clientId = yishouClient?.id || clients[0].id
  client.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`

  // Step 2: GET roles
  const rolesRes = await client.get(`/api/v1/auth/roles?client=${clientId}`)
  const roles = rolesRes.data.roles
  if (!roles?.length) throw new Error('No roles')
  const roleId = roles[0].id

  // Step 3: GET organizations — prefer HQ org, else first non-zero org
  const orgsRes = await client.get(`/api/v1/auth/organizations?client=${clientId}&role=${roleId}`)
  const orgs = orgsRes.data.organizations || []
  const hqOrg = orgs.find((o: any) => o.name === 'HQ' || o.identifier === 'HQ')
  const realOrg = hqOrg || orgs.find((o: any) => o.id > 0) || orgs[0]
  const orgId = realOrg?.id ?? 0

  // Step 4: GET warehouses — prefer Standard warehouse (main stock location)
  const whRes = await client.get(`/api/v1/auth/warehouses?client=${clientId}&role=${roleId}&organization=${orgId}`)
  const warehouses = whRes.data.warehouses || []
  const stdWh = warehouses.find((w: any) => w.name === 'Standard' || w.identifier === 'Standard')
  const realWh = stdWh || warehouses.find((w: any) => w.id > 0) || warehouses[0]
  const warehouseId = realWh?.id ?? 0

  // Step 5: PUT /auth/tokens (finalize)
  const ctxRes = await client.put('/api/v1/auth/tokens', {
    clientId,
    roleId,
    organizationId: orgId,
    warehouseId,
  })

  const finalToken = ctxRes.data.token
  client.defaults.headers.common['Authorization'] = `Bearer ${finalToken}`

  testContext = {
    api: client,
    token: finalToken,
    clientId,
    roleId,
    orgId,
    warehouseId,
    username: 'SuperUser',
    createdRecords: [],
  }

  return testContext
}

/**
 * Track a created record for later verification/cleanup.
 */
export function trackRecord(ctx: TestContext, table: string, id: number, name: string) {
  ctx.createdRecords.push({ table, id, name })
}

/**
 * Helper: wait briefly (avoid overwhelming API)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Format Date for iDempiere REST API — strips milliseconds.
 * iDempiere requires: yyyy-MM-dd'T'HH:mm:ss'Z' (no .000)
 */
export function toIdempiereDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
