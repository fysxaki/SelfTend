import axios from 'axios'
import type { AnalyticsItem, ChatMessage, EnergyLog, Prize, ReviewLog, Season, SleepLog, Task, TaskLog, UserStats, Wish, WorryNote } from '@/types'

export const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 请求拦截：自动带上访问码
http.interceptors.request.use((config) => {
  const code = localStorage.getItem('selftend_code')
  if (code) {
    config.headers['X-Access-Code'] = code
  }
  return config
})

// 响应拦截：401 跳转登录
http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('selftend_code')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// Auth
export const login = (code: string) =>
  axios.post<{ ok: boolean }, { ok: boolean }>('/api/auth/login', { code })

// Season
export const getSeason = (id: number) => http.get<Season, Season>(`/seasons/${id}`)
export const getSeasons = () => http.get<Season[], Season[]>('/seasons')
export const createSeason = (data: Omit<Season, 'id' | 'created_at'>) =>
  http.post<Season, Season>('/seasons', data)
export const updateSeason = (id: number, data: Partial<Season>) =>
  http.put<Season, Season>(`/seasons/${id}`, data)

// Tasks
export const getTasks = (seasonId: number, type?: string) =>
  http.get<Task[], Task[]>(`/seasons/${seasonId}/tasks`, { params: { type } })
export const getIncompleteSeasonTasks = (seasonId: number) =>
  http.get<Task[], Task[]>(`/seasons/${seasonId}/incomplete-tasks`)
export const inheritTasks = (newSeasonId: number, taskIds: number[]) =>
  http.post<{ created: number }, { created: number }>(`/seasons/${newSeasonId}/inherit-tasks`, { task_ids: taskIds })
export const createTask = (data: Omit<Task, 'id'>) =>
  http.post<Task, Task>('/tasks', data)
export const updateTask = (id: number, data: Partial<Task>) =>
  http.put<Task, Task>(`/tasks/${id}`, data)
export const deleteTask = (id: number) => http.delete(`/tasks/${id}`)

// TaskLog
export type CompleteTaskResult = { task_log: TaskLog; penalty_applied: boolean }
export const completeTask = (taskId: number, note?: string, expOverride?: number) =>
  http.post<CompleteTaskResult, CompleteTaskResult>('/task-logs', {
    task_id: taskId,
    note,
    ...(expOverride !== undefined ? { exp_override: expOverride } : {}),
  })
export const undoTask = (taskId: number) =>
  http.delete(`/task-logs/undo/${taskId}`)
export const getTaskLogs = (taskId: number) =>
  http.get<TaskLog[], TaskLog[]>('/task-logs', { params: { task_id: taskId } })

// UserStats
export const getUserStats = () => http.get<UserStats, UserStats>('/stats')

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

// SleepLogs
export const createSleepLog = (data: { date?: string; sleep_time: string; wake_time?: string }) =>
  http.post<SleepLog, SleepLog>('/sleep-logs', data)
export const getSleepLogs = (params?: { start_date?: string; end_date?: string }) =>
  http.get<SleepLog[], SleepLog[]>('/sleep-logs', { params })
export const updateSleepLog = (id: number, data: { sleep_time: string; wake_time?: string }) =>
  http.put<SleepLog, SleepLog>(`/sleep-logs/${id}`, data)
export const deleteSleepLog = (id: number) => http.delete(`/sleep-logs/${id}`)

// EnergyLogs
export const createEnergyLog = (data: { date?: string; energy_level: number; note?: string }) =>
  http.post<EnergyLog, EnergyLog>('/energy-logs', data)
export const getEnergyLogs = (params?: { start_date?: string; end_date?: string }) =>
  http.get<EnergyLog[], EnergyLog[]>('/energy-logs', { params })
export const updateEnergyLog = (id: number, data: { energy_level: number; note?: string }) =>
  http.put<EnergyLog, EnergyLog>(`/energy-logs/${id}`, data)
export const deleteEnergyLog = (id: number) => http.delete(`/energy-logs/${id}`)

// Analytics
export const getAnalytics = (params?: { start_date?: string; end_date?: string }) =>
  http.get<AnalyticsItem[], AnalyticsItem[]>('/analytics', { params })

// Review
export const chat = (messages: ChatMessage[], model?: string) =>
  http.post<{ reply: string }, { reply: string }>('/review/chat', { messages, model }, { timeout: 60000 })
export const saveReview = (summary: string) =>
  http.post<ReviewLog, ReviewLog>('/review/save', { summary })
export const getReviews = (limit = 30) =>
  http.get<ReviewLog[], ReviewLog[]>('/review/logs', { params: { limit } })

// 焦虑暂存箱
export const createWorry = (data: { content: string; handle_date?: string }) =>
  http.post<WorryNote, WorryNote>('/worries', data)
export const getWorries = (status?: 'due' | 'pending' | 'resolved') =>
  http.get<WorryNote[], WorryNote[]>('/worries', { params: status ? { status } : {} })
export const updateWorry = (id: number, data: { content?: string; handle_date?: string }) =>
  http.put<WorryNote, WorryNote>(`/worries/${id}`, data)
export const resolveWorry = (id: number, resolved: boolean) =>
  http.post<WorryNote, WorryNote>(`/worries/${id}/resolve`, { resolved })
export const deleteWorry = (id: number) => http.delete(`/worries/${id}`)

// 心愿（特殊礼物）
export type WishListResp = { wishes: Wish[]; price_cap_yuan: number; max_concurrent: number }
export const getWishes = () => http.get<WishListResp, WishListResp>('/wishes')
export const createWish = (data: { title: string; reason?: string; price_yuan: number; target_exp?: number }) =>
  http.post<Wish, Wish>('/wishes', data)
export const deleteWish = (id: number) => http.delete(`/wishes/${id}`)

// 通用用户配置（key-value）
export const getUserConfig = (key: string) =>
  http.get<{ key: string; value: string }, { key: string; value: string }>(`/config/${key}`)
export const setUserConfig = (key: string, value: string) =>
  http.put<{ key: string; value: string }, { key: string; value: string }>(`/config/${key}`, { value })
