import { create } from 'zustand'
import { getSeasons, getUserStats } from '@/api'
import type { Season, UserStats } from '@/types'

interface AppStore {
  currentSeason: Season | null
  stats: UserStats | null
  initialized: boolean
  setCurrentSeason: (season: Season) => void
  fetchStats: () => Promise<void>
  /** App 启动时调用一次，自动加载最新赛季和用户数据 */
  init: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentSeason: null,
  stats: null,
  initialized: false,

  setCurrentSeason: (season) => set({ currentSeason: season }),

  fetchStats: async () => {
    const stats = await getUserStats()
    set({ stats })
  },

  init: async () => {
    if (get().initialized) return
    try {
      const [seasons, stats] = await Promise.all([getSeasons(), getUserStats()])
      // 取最新赛季（列表按 created_at desc，第一条最新）
      const latest = seasons.length > 0 ? seasons[0] : null
      set({ currentSeason: latest, stats, initialized: true })
    } catch {
      // 401 会由 axios 拦截器跳转 /login，此处静默处理其他错误
      set({ initialized: true })
    }
  },
}))
