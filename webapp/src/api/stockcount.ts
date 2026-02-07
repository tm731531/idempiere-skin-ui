/**
 * Stock Count API Module
 *
 * 庫存盤點 API
 * - 盤點任務: AD_SysConfig (CLINIC_COUNT_TASK_{id})
 * - 盤點結果: stored within task JSON
 */

import { apiClient } from './client'

// ========== Types ==========

export type CountTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'

export interface CountLine {
  productId: number
  productName: string
  locatorName: string
  systemQty: number
  actualQty: number | null  // null = not counted yet
  variance: number          // actualQty - systemQty
  reason?: string           // reason for variance
}

export interface CountTask {
  id: string               // AD_SysConfig Name
  configId?: number        // AD_SysConfig record id
  name: string             // Display name
  warehouseName: string
  status: CountTaskStatus
  lines: CountLine[]
  createdAt: string
  completedAt?: string
}

const COUNT_PREFIX = 'CLINIC_COUNT_TASK_'

// ========== Count Task API (stored in AD_SysConfig) ==========

/**
 * List all count tasks
 */
export async function listCountTasks(): Promise<CountTask[]> {
  try {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: {
        '$filter': `contains(Name,'${COUNT_PREFIX}')`,
        '$orderby': 'Updated desc',
        '$top': 50,
      },
    })

    const tasks: CountTask[] = []
    for (const r of response.data.records || []) {
      try {
        const data = JSON.parse(r.Value)
        tasks.push({
          id: r.Name,
          configId: r.id,
          name: data.name || '',
          warehouseName: data.warehouseName || '',
          status: data.status || 'PENDING',
          lines: data.lines || [],
          createdAt: data.createdAt || '',
          completedAt: data.completedAt,
        })
      } catch { /* skip invalid */ }
    }
    return tasks
  } catch {
    return []
  }
}

/**
 * Create a new count task
 */
export async function createCountTask(
  name: string,
  warehouseName: string,
  lines: CountLine[],
  orgId: number
): Promise<CountTask> {
  const taskId = `${COUNT_PREFIX}${Date.now()}`
  const task: CountTask = {
    id: taskId,
    name,
    warehouseName,
    status: 'PENDING',
    lines,
    createdAt: new Date().toISOString(),
  }

  const value = JSON.stringify({
    name: task.name,
    warehouseName: task.warehouseName,
    status: task.status,
    lines: task.lines,
    createdAt: task.createdAt,
  })

  const response = await apiClient.post('/api/v1/models/AD_SysConfig', {
    'AD_Org_ID': orgId,
    'Name': taskId,
    'Value': value,
    'Description': `Stock count task: ${name}`,
    'ConfigurationLevel': 'S',
  })

  task.configId = response.data.id
  return task
}

/**
 * Update an existing count task (upsert to AD_SysConfig)
 */
export async function updateCountTask(task: CountTask): Promise<void> {
  const value = JSON.stringify({
    name: task.name,
    warehouseName: task.warehouseName,
    status: task.status,
    lines: task.lines,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
  })

  // Look up by Name if no configId
  if (task.configId) {
    await apiClient.put(`/api/v1/models/AD_SysConfig/${task.configId}`, {
      'Value': value,
    })
  } else {
    const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
      params: { '$filter': `Name eq '${task.id}'` },
    })

    const records = response.data.records || []
    if (records.length > 0) {
      await apiClient.put(`/api/v1/models/AD_SysConfig/${records[0].id}`, {
        'Value': value,
      })
    }
  }
}

/**
 * Complete a count task - mark as COMPLETED and set completedAt
 */
export async function completeCountTask(task: CountTask): Promise<void> {
  task.status = 'COMPLETED'
  task.completedAt = new Date().toISOString()
  await updateCountTask(task)
}

/**
 * Delete a count task (delete the AD_SysConfig record)
 */
export async function deleteCountTask(configName: string): Promise<void> {
  const response = await apiClient.get('/api/v1/models/AD_SysConfig', {
    params: { '$filter': `Name eq '${configName}'` },
  })

  const records = response.data.records || []
  if (records.length > 0) {
    await apiClient.delete(`/api/v1/models/AD_SysConfig/${records[0].id}`)
  }
}
