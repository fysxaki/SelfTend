import type { TaskCategory, TaskDifficulty, TaskTiming } from '@/types'

export const CATEGORY_CONFIG: Record<TaskCategory, { label: string; color: string; bg: string; icon: string }> = {
  health: { label: '健康', color: '#16a34a', bg: '#dcfce7', icon: '🏃' },
  work:   { label: '工作', color: '#2563eb', bg: '#dbeafe', icon: '💼' },
  life:   { label: '生活', color: '#d97706', bg: '#fef3c7', icon: '🏠' },
  mood:   { label: '情绪', color: '#7c3aed', bg: '#ede9fe', icon: '😊' },
}

export const DIFFICULTY_CONFIG: Record<TaskDifficulty, { label: string; color: string; bg: string }> = {
  easy:   { label: '简单', color: '#15803d', bg: '#dcfce7' },
  normal: { label: '普通', color: '#b45309', bg: '#fef3c7' },
  hard:   { label: '困难', color: '#dc2626', bg: '#fee2e2' },
}

export const TIMING_CONFIG: Record<TaskTiming, { label: string; icon: string }> = {
  morning: { label: '早上',  icon: '🌅' },
  evening: { label: '晚上',  icon: '🌙' },
  both:    { label: '早晚',  icon: '☀️' },
  out:     { label: '出门前', icon: '🚪' },
  anytime: { label: '随时',  icon: '⏰' },
}

export const TIMING_OPTIONS = Object.entries(TIMING_CONFIG).map(([v, c]) => ({
  value: v,
  label: `${c.icon} ${c.label}`,
}))

export function getDifficulty(exp: number): TaskDifficulty {
  if (exp <= 1) return 'easy'
  if (exp < 10) return 'normal'
  return 'hard'
}

export function calcLevel(exp: number): { level: number; currentExp: number; nextLevelExp: number } {
  let level = 1
  let required = 100
  let remaining = exp
  while (remaining >= required) {
    remaining -= required
    level++
    required = Math.floor(required * 1.3)
  }
  return { level, currentExp: remaining, nextLevelExp: required }
}

export function formatExp(exp: number): string {
  return exp % 1 === 0 ? String(exp) : exp.toFixed(1)
}
