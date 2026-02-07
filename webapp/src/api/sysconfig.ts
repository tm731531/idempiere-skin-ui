/**
 * AD_SysConfig Manager
 *
 * Shared get-or-create pattern for AD_SysConfig records.
 * Used by registration, doctor, pharmacy, checkout, and stockcount modules.
 */

import { apiClient } from './client'

export interface SysConfigRecord {
  id: number
  name: string
  value: string
}

/**
 * Get a SysConfig value by Name.
 */
export async function getSysConfigValue(name: string): Promise<string | null> {
  const record = await getSysConfigRecord(name)
  return record ? record.value : null
}

/**
 * Get a SysConfig record by Name.
 */
export async function getSysConfigRecord(name: string): Promise<SysConfigRecord | null> {
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: { '$filter': `Name eq '${name}'` },
  })

  const records = response.data.records || []
  if (records.length === 0) return null

  return {
    id: records[0].id,
    name: records[0].Name,
    value: records[0].Value,
  }
}

/**
 * Upsert a SysConfig record: update if exists, create if not.
 */
export async function upsertSysConfig(
  name: string,
  value: string,
  orgId: number,
  description?: string,
): Promise<void> {
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: { '$filter': `Name eq '${name}'` },
  })

  const records = response.data.records || []

  if (records.length > 0) {
    await apiClient.put(`/api/v1/models/AD_SysConfig/${records[0].id}`, {
      'Value': value,
    })
  } else {
    await apiClient.post('/api/v1/models/AD_SysConfig', {
      'AD_Org_ID': orgId,
      'Name': name,
      'Value': value,
      'Description': description || name,
      'ConfigurationLevel': 'S',
    })
  }
}

/**
 * List SysConfig records matching a prefix (using OData contains).
 */
export async function listSysConfigByPrefix(
  prefix: string,
  orderBy?: string,
  top?: number,
): Promise<SysConfigRecord[]> {
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: {
      '$filter': `contains(Name,'${prefix}')`,
      '$orderby': orderBy || 'Updated desc',
      '$top': top || 50,
    },
  })

  return (response.data.records || []).map((r: any) => ({
    id: r.id,
    name: r.Name,
    value: r.Value,
  }))
}

/**
 * Batch get SysConfig values by list of names.
 * Returns a map of name → value.
 */
export async function batchGetSysConfig(names: string[]): Promise<Record<string, string>> {
  if (names.length === 0) return {}

  const nameList = names.map(n => `'${n}'`).join(',')

  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: {
        '$filter': `Name in (${nameList})`,
      },
    })

    const result: Record<string, string> = {}
    for (const r of response.data.records || []) {
      result[r.Name] = r.Value
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Delete a SysConfig record by Name.
 */
export async function deleteSysConfig(name: string): Promise<void> {
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: { '$filter': `Name eq '${name}'` },
  })

  const records = response.data.records || []
  if (records.length > 0) {
    await apiClient.delete(`/api/v1/models/AD_SysConfig/${records[0].id}`)
  }
}
