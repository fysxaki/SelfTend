import axios from 'axios'
import type { Prize, Season, Task, TaskLog, UserStats } from '@/types'

const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err),
)

// Season
export const getSeason = (id: number) => http.get<Season, Season>(`/seasons/${id}`)
export const getSeasons = () => http.get<Season[], Season[]>('/seasons')
export const createSeason = (data: Omit<Season, 'id' | 'created_at'>) =>
  http.post<Season, Season>('/seasons', data)

// Tasks
export const getTasks = (seasonId: number, type?: string) =>
  http.get<Task[], Task[]>(`/seasons/${seasonId}/tasks`, { params: { type } })
export const createTask = (data: Omit<Task, 'id'>) =>
  http.post<Task, Task>('/tasks', data)
export const updateTask = (id: number, data: Partial<Task>) =>
  http.put<Task, Task>(`/tasks/${id}`, data)
export const deleteTask = (id: number) => http.delete(`/tasks/${id}`)

// TaskLog
export const completeTask = (taskId: number, note?: string) =>
  http.post<TaskLog, TaskLog>('/task-logs', { task_id: taskId, note })
export const undoTask = (taskId: number) =>
  http.delete(`/task-logs/undo/${taskId}`)
export const getTaskLogs = (taskId: number) =>
  http.get<TaskLog[], TaskLog[]>('/task-logs', { params: { task_id: taskId } })

// UserStats
export const getUserStats = () => http.get<UserStats, UserStats>('/stats')

// Season
export const updateSeason = (id: number, data: Partial<Season>) =>
  http.put<Season, Season>(`/seasons/${id}`, data)

// Prizes
export const getPrizes = () => http.get<Prize[], Prize[]>('/prizes')
export const createPrize = (data: Omit<Prize, 'id' | 'redeemed' | 'redeemed_at'>) =>
  http.post<Prize, Prize>('/prizes', data)
export const updatePrize = (id: number, data: Partial<Prize>) =>
  http.put<Prize, Prize>(`/prizes/${id}`, data)
export const deletePrize = (id: number) => http.delete(`/prizes/${id}`)
export const redeemPrize = (id: number) =>
  http.post<{ prize: Prize; stats: UserStats }, { prize: Prize; stats: UserStats }>(
    `/prizes/${id}/redeem`,
  )
