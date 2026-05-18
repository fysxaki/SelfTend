import { CheckCircleOutlined, EditOutlined, FireOutlined, ThunderboltOutlined, TrophyOutlined } from '@ant-design/icons'
import { Progress, Spin, Tooltip, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { completeTask, createEnergyLog, getEnergyLogs, getTasks, updateEnergyLog } from '@/api'
import type { CompleteTaskResult } from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import SectionTitle from '@/components/SectionTitle'
import { useAppStore } from '@/stores/useAppStore'
import type { EnergyLog, Task } from '@/types'
import { calcLevel, formatExp } from '@/utils/task'
import TaskCard from './TaskCard'

export default function Dashboard() {
  const { currentSeason, stats, fetchStats } = useAppStore()
  const [dailyTasks, setDailyTasks]   = useState<Task[]>([])
  const [weeklyTasks, setWeeklyTasks] = useState<Task[]>([])
  const [seasonTasks, setSeasonTasks] = useState<Task[]>([])
  const [onceTasks, setOnceTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [todayEnergy, setTodayEnergy] = useState<EnergyLog | null>(null)
  const [energySaving, setEnergySaving] = useState(false)

  const loadTasks = async () => {
    if (!currentSeason) return
    const [daily, weekly, season, once] = await Promise.all([
      getTasks(currentSeason.id, 'daily'),
      getTasks(currentSeason.id, 'weekly'),
      getTasks(currentSeason.id, 'season'),
      getTasks(currentSeason.id, 'once'),
      fetchStats(),
    ])
    setDailyTasks(daily)
    setWeeklyTasks(weekly)
    setSeasonTasks(season)
    setOnceTasks(once)
  }

  const loadEnergy = async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const logs = await getEnergyLogs({ start_date: today, end_date: today })
    setTodayEnergy(logs?.[0] ?? null)
  }

  const handleEnergySelect = async (level: number) => {
    if (energySaving) return
    setEnergySaving(true)
    try {
      if (todayEnergy) {
        const updated = await updateEnergyLog(todayEnergy.id, { energy_level: level })
        setTodayEnergy(updated)
      } else {
        const created = await createEnergyLog({ energy_level: level })
        setTodayEnergy(created)
      }
      message.success(`能量值已记录：${level} / 5`)
    } catch {
      message.error('记录失败，请重试')
    } finally {
      setEnergySaving(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([loadTasks(), loadEnergy()]).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSeason])

  const handleComplete = async (task: Task, expOverride?: number) => {
    const res = await completeTask(task.id, undefined, expOverride)
    await loadTasks()
    return res
  }

  const handleUndo = async () => {
    await loadTasks()
  }

  if (!currentSeason) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
        <TrophyOutlined style={{ fontSize: 56, color: '#a78bfa' }} />
        <p style={{ color: '#6b7280', fontSize: 16 }}>还没有进行中的赛季</p>
        <p style={{ color: '#9ca3af', fontSize: 13 }}>前往「赛季」页面创建第一个赛季</p>
      </div>
    )
  }

  const levelInfo = stats ? calcLevel(stats.total_exp) : null
  const dailyDone  = dailyTasks.filter((t) => t.completed_today).length
  const weeklyDone = weeklyTasks.filter((t) => t.completed_this_week).length
  const seasonDone = seasonTasks.filter((t) => t.completed_in_season).length
  const onceDone   = onceTasks.filter((t) => t.completed_in_season).length
  const oncePending = onceTasks.filter((t) => !t.completed_in_season).length
  // 用当天 00:00 对齐，避免不足 24h 被截断（含结束日整天，所以 +1）
  const daysLeft   = Math.max(0, dayjs(currentSeason.end_date).startOf('day').diff(dayjs().startOf('day'), 'day') + 1)


  return (
    <div className="page-container" style={{ padding: 20, maxWidth: 820, margin: '0 auto', position: 'relative', zIndex: 1 }}>

      {/* 飘浮装饰层 */}
      <FloatingDecorations />

      {/* 赛季 Banner */}
      <div
        className="season-banner"
        style={{
          background: 'linear-gradient(135deg, #f9a8d4 0%, #c084fc 50%, #a78bfa 100%)',
          borderRadius: 20, padding: '18px 22px', marginBottom: 16,
          color: '#fff', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12,
          boxShadow: '0 4px 18px rgba(192, 132, 252, 0.25)',
          position: 'relative', zIndex: 1,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#ddd6fe', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>当前赛季</div>
          <div className="season-banner-title" style={{ fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentSeason.name}
          </div>
          <div style={{ fontSize: 12, color: '#c4b5fd', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentSeason.theme}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#c4b5fd', flexShrink: 0 }}>
          <div>{dayjs(currentSeason.start_date).format('MM/DD')} — {dayjs(currentSeason.end_date).format('MM/DD')}</div>
          <div style={{ marginTop: 2 }}>剩余 <span style={{ color: '#fff', fontWeight: 600 }}>{daysLeft}</span> 天</div>
        </div>
      </div>

      {/* 三栏统计 */}
      {levelInfo && stats && (
        <div className="stats-grid" style={{ position: 'relative', zIndex: 1 }}>
          <div className="stat-card" style={{ background: '#fff', border: '1.5px solid #e4deff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 6px rgba(124,58,237,0.06)' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <TrophyOutlined /> 等级
            </div>
            <div className="stat-card-value" style={{ fontSize: 30, fontWeight: 700, color: '#7c3aed', lineHeight: 1 }}>
              Lv.{levelInfo.level}
            </div>
            <div className="stat-card-progress">
              <Progress percent={Math.floor((levelInfo.currentExp / levelInfo.nextLevelExp) * 100)} size="small" showInfo={false} strokeColor="#7c3aed" railColor="#ede9fe" style={{ marginTop: 8 }} />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{formatExp(levelInfo.currentExp)} / {formatExp(levelInfo.nextLevelExp)} EXP</div>
            </div>
          </div>

          <div className="stat-card" style={{ background: '#fff', border: '1.5px solid #e4deff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 6px rgba(124,58,237,0.06)' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <FireOutlined /> 连续打卡
            </div>
            <div className="stat-card-value" style={{ fontSize: 30, fontWeight: 700, color: '#d97706', lineHeight: 1 }}>
              {stats.current_streak}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>天 · 最长 {stats.longest_streak} 天</div>
            <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 2 }}>可用积分 {formatExp(stats.spendable_exp)}</div>
          </div>

          <div className="stat-card" style={{ background: '#fff', border: '1.5px solid #e4deff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 6px rgba(124,58,237,0.06)' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <CheckCircleOutlined /> 今日完成
            </div>
            <div className="stat-card-value" style={{ fontSize: 30, fontWeight: 700, color: '#16a34a', lineHeight: 1 }}>
              {dailyDone}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>/ {dailyTasks.length} 个每日任务</div>
          </div>
        </div>
      )}

      {/* 今日能量记录 */}
      <EnergyBar
        value={todayEnergy?.energy_level ?? null}
        saving={energySaving}
        onSelect={handleEnergySelect}
      />

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 48 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* 每日任务 */}
          <TaskSection
            title="每日任务"
            en="Today"
            badge={`${dailyDone}/${dailyTasks.length}`}
            hint="00:00 重置"
            tasks={dailyTasks}
            empty="暂无每日任务"
            onComplete={handleComplete}
            onUndo={handleUndo}
          />

          {/* 每周任务 */}
          <TaskSection
            title="每周任务"
            en="Weekly"
            badge={`${weeklyDone}/${weeklyTasks.length}`}
            hint="周一重置"
            tasks={weeklyTasks}
            empty="暂无每周任务"
            onComplete={handleComplete}
            onUndo={handleUndo}
          />

          {/* 赛季任务 */}
          {seasonTasks.length > 0 && (
            <TaskSection
              title="赛季任务"
              en="Season"
              badge={`${seasonDone}/${seasonTasks.length}`}
              hint="赛季内完成即可"
              tasks={seasonTasks}
              empty=""
              onComplete={handleComplete}
              onUndo={handleUndo}
            />
          )}

          {/* 一次性任务：只展示未完成的，全做完后隐藏 */}
          {oncePending > 0 && (
            <TaskSection
              title="一次性任务"
              en="Once"
              badge={`${onceDone}/${onceTasks.length}`}
              hint="完成即归档"
              tasks={onceTasks}
              empty=""
              onComplete={handleComplete}
              onUndo={handleUndo}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── 今日能量快捷记录条 ────────────────────────────────────
const ENERGY_LEVELS = [
  { value: 1, emoji: '😴', label: '很差' },
  { value: 2, emoji: '😞', label: '较差' },
  { value: 3, emoji: '😐', label: '一般' },
  { value: 4, emoji: '😊', label: '不错' },
  { value: 5, emoji: '⚡', label: '满血' },
]

function EnergyBar({
  value,
  saving,
  onSelect,
}: {
  value: number | null
  saving: boolean
  onSelect: (v: number) => void
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e4deff',
        borderRadius: 14,
        padding: '12px 16px',
        marginBottom: 16,
        boxShadow: '0 1px 6px rgba(124,58,237,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <ThunderboltOutlined style={{ color: '#a78bfa', fontSize: 14 }} />
        <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>今日能量</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flex: 1 }}>
        {ENERGY_LEVELS.map((lvl) => {
          const isSelected = value === lvl.value
          return (
            <Tooltip key={lvl.value} title={lvl.label}>
              <button
                onClick={() => onSelect(lvl.value)}
                disabled={saving}
                style={{
                  flex: 1,
                  height: 40,
                  border: isSelected ? '2px solid #7c3aed' : '1.5px solid #e4deff',
                  borderRadius: 10,
                  background: isSelected ? '#ede9fe' : '#faf8ff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {lvl.emoji}
              </button>
            </Tooltip>
          )
        })}
      </div>

      {value !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <EditOutlined style={{ color: '#9ca3af', fontSize: 12 }} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {ENERGY_LEVELS.find((l) => l.value === value)?.label}
          </span>
        </div>
      )}

      {value === null && (
        <span style={{ fontSize: 12, color: '#c4b5fd', flexShrink: 0 }}>点击记录</span>
      )}
    </div>
  )
}

// ── 抽出独立小组件避免重复 ───────────────────────────────
interface SectionProps {
  title: string
  en?: string
  badge: string
  hint: string
  tasks: Task[]
  empty: string
  onComplete: (t: Task, expOverride?: number) => Promise<CompleteTaskResult>
  onUndo: (t: Task) => Promise<void>
}

function TaskSection({ title, en, badge, hint, tasks, empty, onComplete, onUndo }: SectionProps) {
  return (
    <section style={{ marginBottom: 24, position: 'relative', zIndex: 1 }}>
      <SectionTitle cn={title} en={en} count={badge} hint={hint} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.length === 0
          ? <p style={{ color: '#9ca3af', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>{empty}</p>
          : tasks.map((t) => <TaskCard key={t.id} task={t} onComplete={onComplete} onUndo={onUndo} />)
        }
      </div>
    </section>
  )
}
