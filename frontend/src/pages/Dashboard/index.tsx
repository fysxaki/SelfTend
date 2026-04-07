import { CheckCircleOutlined, FireOutlined, TrophyOutlined } from '@ant-design/icons'
import { Progress, Spin } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { completeTask, getTasks } from '@/api'
import { useAppStore } from '@/stores/useAppStore'
import type { Task } from '@/types'
import { calcLevel, formatExp } from '@/utils/task'
import TaskCard from './TaskCard'

export default function Dashboard() {
  const { currentSeason, stats, fetchStats } = useAppStore()
  const [dailyTasks, setDailyTasks] = useState<Task[]>([])
  const [weeklyTasks, setWeeklyTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const loadTasks = async () => {
    if (!currentSeason) return
    const [daily, weekly] = await Promise.all([
      getTasks(currentSeason.id, 'daily'),
      getTasks(currentSeason.id, 'weekly'),
      fetchStats(),
    ])
    setDailyTasks(daily)
    setWeeklyTasks(weekly)
  }

  useEffect(() => {
    setLoading(true)
    loadTasks().finally(() => setLoading(false))
  }, [currentSeason])

  const handleComplete = async (task: Task) => {
    await completeTask(task.id)
    await loadTasks()
  }

  const handleUndo = async (_task: Task) => {
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
  const dailyDone = dailyTasks.filter((t) => t.completed_today).length
  const weeklyDone = weeklyTasks.filter((t) => t.completed_this_week).length
  const daysLeft = dayjs(currentSeason.end_date).diff(dayjs(), 'day')

  return (
    <div className="page-container" style={{ padding: 20, maxWidth: 820, margin: '0 auto' }}>

      {/* 赛季 Banner */}
      <div
        className="season-banner"
        style={{
          background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 60%, #a855f7 100%)',
          borderRadius: 16,
          padding: '18px 22px',
          marginBottom: 16,
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
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
          <div style={{ marginTop: 2 }}>
            剩余 <span style={{ color: '#fff', fontWeight: 600 }}>{daysLeft}</span> 天
          </div>
        </div>
      </div>

      {/* 三栏统计 */}
      {levelInfo && stats && (
        <div className="stats-grid">
          {/* 等级 */}
          <div
            className="stat-card"
            style={{ background: '#fff', border: '1.5px solid #e4deff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 6px rgba(124,58,237,0.06)' }}
          >
            <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <TrophyOutlined /> 等级
            </div>
            <div className="stat-card-value" style={{ fontSize: 30, fontWeight: 700, color: '#7c3aed', lineHeight: 1 }}>
              Lv.{levelInfo.level}
            </div>
            <div className="stat-card-progress">
              <Progress
                percent={Math.floor((levelInfo.currentExp / levelInfo.nextLevelExp) * 100)}
                size="small" showInfo={false}
                strokeColor="#7c3aed" trailColor="#ede9fe"
                style={{ marginTop: 8 }}
              />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {formatExp(levelInfo.currentExp)} / {formatExp(levelInfo.nextLevelExp)} EXP
              </div>
            </div>
          </div>

          {/* 连续打卡 */}
          <div
            className="stat-card"
            style={{ background: '#fff', border: '1.5px solid #e4deff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 6px rgba(124,58,237,0.06)' }}
          >
            <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <FireOutlined /> 连续打卡
            </div>
            <div className="stat-card-value" style={{ fontSize: 30, fontWeight: 700, color: '#d97706', lineHeight: 1 }}>
              {stats.current_streak}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              天 · 最长 {stats.longest_streak} 天
            </div>
            <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 2 }}>
              可用积分 {formatExp(stats.spendable_exp)}
            </div>
          </div>

          {/* 今日完成 */}
          <div
            className="stat-card"
            style={{ background: '#fff', border: '1.5px solid #e4deff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 6px rgba(124,58,237,0.06)' }}
          >
            <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <CheckCircleOutlined /> 今日完成
            </div>
            <div className="stat-card-value" style={{ fontSize: 30, fontWeight: 700, color: '#16a34a', lineHeight: 1 }}>
              {dailyDone}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              / {dailyTasks.length} 个每日任务
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 48 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* 每日任务 */}
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e1826', display: 'flex', alignItems: 'center', gap: 8 }}>
                每日任务
                <span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af' }}>{dailyDone}/{dailyTasks.length}</span>
              </h2>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>00:00 重置</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dailyTasks.length === 0
                ? <p style={{ color: '#9ca3af', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>暂无每日任务</p>
                : dailyTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onComplete={handleComplete} onUndo={handleUndo} />
                ))
              }
            </div>
          </section>

          {/* 每周任务 */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e1826', display: 'flex', alignItems: 'center', gap: 8 }}>
                每周任务
                <span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af' }}>{weeklyDone}/{weeklyTasks.length}</span>
              </h2>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>周一重置</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weeklyTasks.length === 0
                ? <p style={{ color: '#9ca3af', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>暂无每周任务</p>
                : weeklyTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onComplete={handleComplete} onUndo={handleUndo} />
                ))
              }
            </div>
          </section>
        </>
      )}
    </div>
  )
}
