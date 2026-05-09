'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { TaskWithDetails, CreateTaskInput, UpdateTaskInput, ApiResponse } from '@/types/database'

type UseTasksReturn = {
  tasks: TaskWithDetails[]
  isLoading: boolean
  error: string | null
  createTask: (input: CreateTaskInput) => Promise<boolean>
  updateTask: (id: string, input: UpdateTaskInput) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>
  toggleComplete: (id: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function useTasks(filter?: { assigneeId?: string; completed?: boolean }): UseTasksReturn {
  const [tasks, setTasks] = useState<TaskWithDetails[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filter?.assigneeId) params.set('assignee_id', filter.assigneeId)
      if (filter?.completed !== undefined) params.set('completed', String(filter.completed))
      const query = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`/api/tasks${query}`)
      const result: ApiResponse<TaskWithDetails[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setTasks(result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch tasks')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter?.assigneeId, filter?.completed])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useRealtimeSubscription('tasks', () => fetchTasks(), undefined, true)

  const createTask = useCallback(async (input: CreateTaskInput): Promise<boolean> => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (res.ok) { await fetchTasks(); return true }
      return false
    } catch {
      return false
    }
  }, [fetchTasks])

  const updateTask = useCallback(async (id: string, input: UpdateTaskInput): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (res.ok) { await fetchTasks(); return true }
      return false
    } catch {
      return false
    }
  }, [fetchTasks])

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (res.ok) { await fetchTasks(); return true }
      return false
    } catch {
      return false
    }
  }, [fetchTasks])

  const toggleComplete = useCallback(async (id: string): Promise<boolean> => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return false
    return updateTask(id, { is_completed: !task.is_completed })
  }, [tasks, updateTask])

  return { tasks, isLoading, error, createTask, updateTask, deleteTask, toggleComplete, refetch: fetchTasks }
}
