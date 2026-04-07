import { create } from 'zustand'
import { getUserStats } from '@/api'
import type { Season, UserStats } from '@/types'

interface AppStore {
  currentSeason: Season | null
  stats: UserStats | null
  setCurrentSeason: (season: Season) => void
  fetchStats: () => Promise<void>
}

export const useAppStore = create<AppStore>((set) => ({
  currentSeason: null,
  stats: null,
  setCurrentSeason: (season) => set({ currentSeason: season }),
  fetchStats: async () => {
    const stats = await getUserStats()
    set({ stats })
  },
}))
