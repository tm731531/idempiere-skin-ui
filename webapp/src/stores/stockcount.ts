/**
 * Stock Count Store
 *
 * 庫存盤點狀態管理
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import {
  type CountTask,
  type CountLine,
  listCountTasks,
  createCountTask,
  updateCountTask,
  completeCountTask,
  deleteCountTask,
} from '@/api/stockcount'

export const useStockCountStore = defineStore('stockcount', () => {
  const authStore = useAuthStore()

  // State
  const tasks = ref<CountTask[]>([])
  const currentTask = ref<CountTask | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const pendingTasks = computed(() =>
    tasks.value.filter(t => t.status === 'PENDING')
  )

  const inProgressTasks = computed(() =>
    tasks.value.filter(t => t.status === 'IN_PROGRESS')
  )

  const completedTasks = computed(() =>
    tasks.value.filter(t => t.status === 'COMPLETED')
  )

  const allLinesCounted = computed(() => {
    if (!currentTask.value) return false
    return currentTask.value.lines.every(line => line.actualQty !== null)
  })

  // Actions

  /**
   * Load all count tasks
   */
  async function loadTasks(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      tasks.value = await listCountTasks()
    } catch (e: any) {
      error.value = e.message || 'Failed to load count tasks'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Select a task to work on
   */
  function selectTask(task: CountTask): void {
    currentTask.value = { ...task, lines: task.lines.map(l => ({ ...l })) }
    // Auto-set status to IN_PROGRESS if still PENDING
    if (currentTask.value.status === 'PENDING') {
      currentTask.value.status = 'IN_PROGRESS'
    }
  }

  /**
   * Update a specific line's actual qty and optional reason
   */
  async function updateLine(index: number, actualQty: number, reason?: string): Promise<void> {
    if (!currentTask.value) return

    const line = currentTask.value.lines[index]
    if (!line) return

    line.actualQty = actualQty
    line.variance = actualQty - line.systemQty
    if (reason !== undefined) {
      line.reason = reason
    }

    // Auto-save progress
    error.value = null
    try {
      await updateCountTask(currentTask.value)
    } catch (e: any) {
      error.value = e.message || 'Failed to save count progress'
    }
  }

  /**
   * Complete the current task
   */
  async function completeTask(): Promise<boolean> {
    if (!currentTask.value) {
      error.value = 'No active task'
      return false
    }

    if (!allLinesCounted.value) {
      error.value = 'All lines must be counted before completing'
      return false
    }

    error.value = null
    try {
      await completeCountTask(currentTask.value)

      // Update in tasks list
      const idx = tasks.value.findIndex(t => t.id === currentTask.value!.id)
      if (idx >= 0) {
        tasks.value[idx] = { ...currentTask.value }
      }

      currentTask.value = null
      return true
    } catch (e: any) {
      error.value = e.message || 'Failed to complete count task'
      return false
    }
  }

  /**
   * Create a new count task
   */
  async function createNewTask(
    name: string,
    warehouseName: string,
    lines: CountLine[]
  ): Promise<boolean> {
    if (!authStore.context?.organizationId && authStore.context?.organizationId !== 0) {
      error.value = 'Organization not set'
      return false
    }

    error.value = null
    try {
      const task = await createCountTask(name, warehouseName, lines, authStore.context!.organizationId)
      tasks.value.unshift(task)
      return true
    } catch (e: any) {
      error.value = e.message || 'Failed to create count task'
      return false
    }
  }

  /**
   * Delete a count task
   */
  async function deleteTask(id: string): Promise<void> {
    error.value = null
    try {
      await deleteCountTask(id)
      tasks.value = tasks.value.filter(t => t.id !== id)
      if (currentTask.value?.id === id) {
        currentTask.value = null
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to delete count task'
    }
  }

  /**
   * Go back to task list
   */
  function clearCurrent(): void {
    currentTask.value = null
    error.value = null
  }

  return {
    // State
    tasks,
    currentTask,
    isLoading,
    error,

    // Getters
    pendingTasks,
    inProgressTasks,
    completedTasks,
    allLinesCounted,

    // Actions
    loadTasks,
    selectTask,
    updateLine,
    completeTask,
    createNewTask,
    deleteTask,
    clearCurrent,
  }
})
