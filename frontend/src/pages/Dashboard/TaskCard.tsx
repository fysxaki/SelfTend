import { CheckOutlined, LoadingOutlined, UndoOutlined } from '@ant-design/icons'
import { Button, Modal, Space, message } from 'antd'
import { useMemo, useState } from 'react'
import { undoTask } from '@/api'
import type { CompleteTaskResult } from '@/api'
import type { Task } from '@/types'
import { CATEGORY_CONFIG, DIFFICULTY_CONFIG, formatExp, parseVariants } from '@/utils/task'

interface Props {
  task: Task
  onComplete: (task: Task, expOverride?: number) => Promise<CompleteTaskResult>
  onUndo: (task: Task) => Promise<void>
}

export default function TaskCard({ task, onComplete, onUndo }: Props) {
  const [loading, setLoading] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [variantModalOpen, setVariantModalOpen] = useState(false)
  const isCompleted =
    task.type === 'weekly'                         ? !!task.completed_this_week :
    task.type === 'season' || task.type === 'once' ? !!task.completed_in_season :
    !!task.completed_today
  const category = CATEGORY_CONFIG[task.category]
  const difficulty = DIFFICULTY_CONFIG[task.difficulty]

  // 完成方式（>=1 个则点击时弹窗选择）
  const variants = useMemo(() => parseVariants(task.variants), [task.variants])

  const handleClick = async () => {
    if (isCompleted || loading) return

    if (variants.length > 0) {
      setVariantModalOpen(true)
      return
    }

    doComplete()
  }

  const doComplete = async (expOverride?: number) => {
    setLoading(true)
    try {
      const res = await onComplete(task, expOverride)
      const actualExp = res.task_log.exp_awarded
      if (res.penalty_applied) {
        message.warning({
          content: `😴 晚睡惩罚 -20%  实得 +${formatExp(actualExp)} 积分`,
          duration: 4,
        })
      } else {
        message.success(`✅ +${formatExp(actualExp)} 积分`)
      }
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
      message.info(`↩️ 已撤销`)
    } catch {
      message.error('撤销失败，暂无可撤销的记录')
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 12,
        background: isCompleted ? '#faf8ff' : '#ffffff',
        border: '1.5px solid #c8dcd6',
        opacity: isCompleted ? 0.7 : 1,
        cursor: isCompleted ? 'default' : 'pointer',
        transition: 'all 0.15s',
        boxShadow: isCompleted ? 'none' : '0 1px 4px rgba(74,138,131,0.05)',
        borderLeft: `4px solid ${isCompleted ? '#b8d8d3' : category.color}`,
      }}
    >
      {/* 完成圆圈 */}
      <div style={{
        width: 26, height: 26, flexShrink: 0, borderRadius: '50%',
        border: `2px solid ${isCompleted ? '#4a8a83' : '#d1d5db'}`,
        background: isCompleted ? '#e6f1ee' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isCompleted ? '#4a8a83' : 'transparent',
        fontSize: 11, transition: 'all 0.15s',
      }}>
        {loading ? <LoadingOutlined style={{ color: '#4a8a83' }} /> : isCompleted ? <CheckOutlined /> : null}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontWeight: 500, fontSize: 14,
            color: isCompleted ? '#9ca3af' : '#1e1826',
            textDecoration: isCompleted ? 'line-through' : 'none',
            maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.title}
          </span>
          {variants.length > 0 && (
            <span
              title="该任务有多种完成方式"
              style={{ fontSize: 11, padding: '1px 6px', borderRadius: 20, background: '#f7faf8', color: '#4a8a83', flexShrink: 0 }}
            >
              ✨ {variants.length} 种
            </span>
          )}
        </div>
        {task.description && (
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.description}
          </div>
        )}
      </div>

      {/* 标签 */}
      <div className="task-tags" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, color: category.color, background: category.bg, fontWeight: 500 }}>
          {category.icon} {category.label}
        </span>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, color: difficulty.color, background: difficulty.bg, fontWeight: 500 }}>
          +{formatExp(task.exp_reward)}
        </span>
      </div>

      {/* 撤销按钮 */}
      {isCompleted && (
        <button
          onClick={handleUndo}
          disabled={undoing}
          title="撤销完成"
          style={{
            flexShrink: 0, width: 26, height: 26,
            border: '1px solid #c8dcd6', borderRadius: 8,
            background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9ca3af', fontSize: 12, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#4a8a83'; e.currentTarget.style.borderColor = '#4a8a83' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#c8dcd6' }}
        >
          {undoing ? <LoadingOutlined /> : <UndoOutlined />}
        </button>
      )}

      {/* 完成方式选择弹窗（通用版），用 div 阻断冒泡到卡片的 onClick */}
      <div onClick={(e) => e.stopPropagation()}>
        <Modal
          title={`「${task.title}」选择完成方式`}
          open={variantModalOpen}
          onCancel={() => setVariantModalOpen(false)}
          footer={null}
          centered
        >
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
            根据实际完成情况，选择对应的积分档位。
          </p>
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            {variants.map((v, i) => (
              <Button
                key={i}
                block
                type={i === variants.length - 1 ? 'primary' : 'default'}
                onClick={() => { setVariantModalOpen(false); doComplete(v.exp) }}
                style={i === variants.length - 1 ? undefined : { color: '#4a8a83', borderColor: '#c8dcd6' }}
              >
                {v.icon ? `${v.icon} ` : ''}{v.label} &nbsp;+{formatExp(v.exp)} 分
              </Button>
            ))}
          </Space>
        </Modal>
      </div>
    </div>
  )
}
