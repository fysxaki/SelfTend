import type { TaskCategory, TaskDifficulty, TaskVariant } from '@/types'

export const CATEGORY_CONFIG: Record<TaskCategory, { label: string; color: string; bg: string; icon: string }> = {
  health: { label: '健康', color: '#16a34a', bg: '#dcfce7', icon: '🏃' },
  work:   { label: '工作', color: '#2563eb', bg: '#dbeafe', icon: '💼' },
  life:   { label: '生活', color: '#d97706', bg: '#fef3c7', icon: '🏠' },
  mood:   { label: '情绪', color: '#4a8a83', bg: '#e6f1ee', icon: '😊' },
}

export const DIFFICULTY_CONFIG: Record<TaskDifficulty, { label: string; color: string; bg: string }> = {
  easy:   { label: '简单', color: '#15803d', bg: '#dcfce7' },
  normal: { label: '普通', color: '#b45309', bg: '#fef3c7' },
  hard:   { label: '困难', color: '#dc2626', bg: '#fee2e2' },
}

// 配置「完成方式」时可选的图标预设
export const VARIANT_ICON_PRESETS = [
  '🌅', '🌙', '☀️', '🌆', '🌃',
  '⏰', '🚪', '🏃', '💼', '🍳',
  '🍽️', '🥗', '💧', '✨', '🎯',
  '⭐', '🔥', '💡', '📝', '🎵',
]

export const MAX_VARIANTS = 4

// 安全解析 task.variants（后端是 JSON 字符串），坏数据返回 []
export function parseVariants(raw: string | undefined | null): TaskVariant[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is TaskVariant =>
        v &&
        typeof v.label === 'string' &&
        typeof v.exp === 'number',
    )
  } catch {
    return []
  }
}

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
