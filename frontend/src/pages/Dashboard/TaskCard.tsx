import { CheckOutlined, LoadingOutlined, UndoOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { useState } from 'react'
import { undoTask } from '@/api'
import type { Task } from '@/types'
import { CATEGORY_CONFIG, DIFFICULTY_CONFIG, TIMING_CONFIG, formatExp } from '@/utils/task'

interface Props {
  task: Task
  onComplete: (task: Task) => Promise<void>
  onUndo: (task: Task) => Promise<void>
}

export default function TaskCard({ task, onComplete, onUndo }: Props) {
  const [loading, setLoading] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const isCompleted = task.completed_today || task.completed_this_week
  const category = CATEGORY_CONFIG[task.category]
  const difficulty = DIFFICULTY_CONFIG[task.difficulty]
  const timing = task.timing ? TIMING_CONFIG[task.timing] : null

  const handleComplete = async () => {
    if (isCompleted || loading) return
    setLoading(true)
    try {
      await onComplete(task)
      message.success(`✅ +${formatExp(task.exp_reward)} 积分`)
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setUndoing(true)
    try {
      await undoTask(task.id)
      await onUndo(task)
      message.info(`↩️ 已撤销 −${formatExp(task.exp_reward)} 积分`)
    } catch {
      message.error('撤销失败，暂无可撤销的记录')
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div
      onClick={handleComplete}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 12,
        background: isCompleted ? '#faf8ff' : '#ffffff',
        border: '1.5px solid #e4deff',
        opacity: isCompleted ? 0.7 : 1,
        cursor: isCompleted ? 'default' : 'pointer',
        transition: 'all 0.15s',
        boxShadow: isCompleted ? 'none' : '0 1px 4px rgba(124,58,237,0.05)',
        borderLeft: `4px solid ${isCompleted ? '#c4b5fd' : category.color}`,
      }}
    >
      {/* 完成圆圈 */}
      <div
        style={{
          width: 26, height: 26, flexShrink: 0,
          borderRadius: '50%',
          border: `2px solid ${isCompleted ? '#7c3aed' : '#d1d5db'}`,
          background: isCompleted ? '#ede9fe' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isCompleted ? '#7c3aed' : 'transparent',
          fontSize: 11, transition: 'all 0.15s',
        }}
      >
        {loading ? <LoadingOutlined style={{ color: '#7c3aed' }} /> : isCompleted ? <CheckOutlined /> : null}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 标题行：任务名 + 执行时机 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontWeight: 500, fontSize: 14,
              color: isCompleted ? '#9ca3af' : '#1e1826',
              textDecoration: isCompleted ? 'line-through' : 'none',
              /* 名称过长时截断 */
              maxWidth: 160, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {task.title}
          </span>
          {timing && (
            <span style={{
              fontSize: 11, padding: '1px 6px', borderRadius: 20,
              background: '#f5f3ff', color: '#7c3aed', flexShrink: 0,
            }}>
              {timing.icon} {timing.label}
            </span>
          )}
        </div>

        {/* 描述（可选） */}
        {task.description && (
          <div style={{
            fontSize: 12, color: '#9ca3af', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.description}
          </div>
        )}
      </div>

      {/* 右侧标签区 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 20,
          color: category.color, background: category.bg, fontWeight: 500,
        }}>
          {category.icon} {category.label}
        </span>
        <span style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 20,
          color: difficulty.color, background: difficulty.bg, fontWeight: 500,
        }}>
          +{formatExp(task.exp_reward)}
        </span>
      </div>

      {/* 撤销按钮（仅完成后显示） */}
      {isCompleted && (
        <button
          onClick={handleUndo}
          disabled={undoing}
          title="撤销完成"
          style={{
            flexShrink: 0, width: 26, height: 26,
            border: '1px solid #e4deff', borderRadius: 8,
            background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9ca3af', fontSize: 12, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.borderColor = '#7c3aed' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e4deff' }}
        >
          {undoing ? <LoadingOutlined /> : <UndoOutlined />}
        </button>
      )}
    </div>
  )
}
