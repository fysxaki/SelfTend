export type TaskCategory = 'health' | 'work' | 'life' | 'mood'
export type TaskType = 'daily' | 'weekly' | 'season'
export type TaskDifficulty = 'easy' | 'normal' | 'hard'
export type TaskTiming = 'morning' | 'evening' | 'both' | 'out' | 'anytime'
export type PrizeCategory = 'camera' | 'watch' | 'phone' | 'other'

export interface Season {
  id: number
  name: string
  theme: string
  start_date: string
  end_date: string
  created_at: string
}

export interface Task {
  id: number
  season_id: number
  title: string
  description: string
  category: TaskCategory
  type: TaskType
  timing: TaskTiming
  difficulty: TaskDifficulty
  exp_reward: number
  sort_order: number
  completed_today?: boolean
  completed_this_week?: boolean
  completed_in_season?: boolean
}

export interface TaskLog {
  id: number
  task_id: number
  completed_at: string
  note: string
}

export interface UserStats {
  id: number
  total_exp: number
  spendable_exp: number
  level: number
  current_streak: number
  longest_streak: number
  last_active_date: string
}

export interface Prize {
  id: number
  name: string
  description: string
  category: PrizeCategory
  cost: number
  redeemed: boolean
  redeemed_at: string | null
}

export interface SleepLog {
  id: number
  date: string        // YYYY-MM-DD
  sleep_time: string  // HH:MM
  wake_time: string   // HH:MM
  duration: number    // 小时
  penalized: boolean
  penalty_exp: number
  created_at: string
}

export interface EnergyLog {
  id: number
  date: string        // YYYY-MM-DD
  energy_level: number // 1-5
  note: string
  created_at: string
}

export interface AnalyticsItem {
  date: string
  sleep_time: string
  duration: number
  energy_level: number // 0 表示未记录
  penalized: boolean
  penalty_exp: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ReviewLog {
  id: number
  date: string
  summary: string
  created_at: string
}
