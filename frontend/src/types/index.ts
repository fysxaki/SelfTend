export type TaskCategory = 'health' | 'work' | 'life' | 'mood'
export type TaskType = 'daily' | 'weekly' | 'season'
export type TaskDifficulty = 'easy' | 'normal' | 'hard'
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
  difficulty: TaskDifficulty
  exp_reward: number   // float，支持 0.5、1.5 等
  sort_order: number
  completed_today?: boolean
  completed_this_week?: boolean
}

export interface TaskLog {
  id: number
  task_id: number
  completed_at: string
  note: string
}

export interface UserStats {
  id: number
  total_exp: number     // 累计经验，只增不减，用于等级
  spendable_exp: number // 可消费积分，兑换后扣除
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
