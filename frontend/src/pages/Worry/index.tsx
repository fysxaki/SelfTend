import {
  CheckOutlined,
  CloudOutlined,
  DeleteOutlined,
  InboxOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, DatePicker, Empty, Input, Spin, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  createWorry,
  deleteWorry,
  getWorries,
  resolveWorry,
  updateWorry,
} from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import type { WorryNote } from '@/types'

const HANDLE_PRESETS = [
  { label: '明天', getDate: () => dayjs().add(1, 'day') },
  { label: '这个周末', getDate: () => {
    // 下一个周六
    const today = dayjs()
    const sat = today.day(6)
    return sat.isAfter(today, 'day') ? sat : sat.add(7, 'day')
  } },
  { label: '下周', getDate: () => dayjs().add(7, 'day') },
]

export default function WorryPage() {
  const [notes, setNotes] = useState<WorryNote[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [handleDate, setHandleDate] = useState<dayjs.Dayjs>(dayjs().add(1, 'day'))
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      // 一次性拉全部未处理 + 已处理，前端分组
      const [open, resolved] = await Promise.all([
        getWorries(),
        getWorries('resolved'),
      ])
      setNotes([...(open || []), ...(resolved || [])])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const todayStr = dayjs().format('YYYY-MM-DD')

  // 分三组：到期待处理 / 暂存中（未到期）/ 已处理
  const { due, pending, resolved } = useMemo(() => {
    const due: WorryNote[] = []
    const pending: WorryNote[] = []
    const resolved: WorryNote[] = []
    for (const n of notes) {
      if (n.resolved) resolved.push(n)
      else if (n.handle_date <= todayStr) due.push(n)
      else pending.push(n)
    }
    return { due, pending, resolved }
  }, [notes, todayStr])

  const handleSubmit = async () => {
    const content = input.trim()
    if (!content) return
    setSubmitting(true)
    try {
      await createWorry({ content, handle_date: handleDate.format('YYYY-MM-DD') })
      setInput('')
      setHandleDate(dayjs().add(1, 'day'))
      message.success('已记下，交给将来的你处理 🌙')
      await load()
    } catch {
      message.error('保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResolve = async (note: WorryNote) => {
    await resolveWorry(note.id, !note.resolved)
    await load()
  }

  const handleDelay = async (note: WorryNote, days: number) => {
    const next = dayjs(note.handle_date).add(days, 'day').format('YYYY-MM-DD')
    await updateWorry(note.id, { handle_date: next })
    message.info(`再放一放，${dayjs(next).format('MM/DD')} 再说`)
    await load()
  }

  const handleDelete = async (id: number) => {
    await deleteWorry(id)
    await load()
  }

  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />

      {/* 标题 */}
      <div style={{ marginBottom: 8, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="title-highlight" style={{ fontSize: 19, fontWeight: 700, color: '#2f5d59' }}>
            <CloudOutlined style={{ marginRight: 6, color: '#6ba39d' }} />焦虑暂存箱
          </span>
          <span className="font-script" style={{ fontSize: 26, color: '#6ba39d' }}>Worry Box</span>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          深夜涌上来的念头，先写下来标个处理时间，关掉。<strong style={{ color: '#3d6d68' }}>凌晨的你没有决策权，把它还给白天的你。</strong>
        </p>
      </div>

      {/* 快速记录框 */}
      <div
        style={{
          background: 'linear-gradient(135deg, #e6f1ee 0%, #f4f9f7 100%)',
          border: '1px solid #c8dcd6',
          borderRadius: 16,
          padding: 16,
          marginBottom: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="现在在焦虑什么？租房、买电动车、买手机…… 写下来就好，不用现在解决"
          autoSize={{ minRows: 2, maxRows: 5 }}
          style={{ marginBottom: 12, background: '#fff' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>什么时候处理：</span>
          {HANDLE_PRESETS.map((p) => {
            const d = p.getDate()
            const active = d.format('YYYY-MM-DD') === handleDate.format('YYYY-MM-DD')
            return (
              <button
                key={p.label}
                onClick={() => setHandleDate(d)}
                style={{
                  padding: '3px 12px', fontSize: 12, borderRadius: 16, cursor: 'pointer',
                  border: active ? '1.5px solid #4a8a83' : '1px solid #c8dcd6',
                  background: active ? '#4a8a83' : '#fff',
                  color: active ? '#fff' : '#3d6d68',
                  fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            )
          })}
          <DatePicker
            value={handleDate}
            onChange={(d) => d && setHandleDate(d)}
            disabledDate={(d) => d.isBefore(dayjs(), 'day')}
            format="MM/DD"
            allowClear={false}
            size="small"
            style={{ width: 96 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSubmit}
            loading={submitting}
            disabled={!input.trim()}
            style={{ marginLeft: 'auto', background: '#4a8a83', borderColor: '#4a8a83' }}
          >
            收进暂存箱
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* 待处理（到期） */}
          {due.length > 0 && (
            <Section
              title="该处理了"
              hint="到了你当初定的处理时间，清醒的你来面对它"
              count={due.length}
              accent="#d97706"
            >
              {due.map((n) => (
                <WorryCard key={n.id} note={n} due onResolve={handleResolve} onDelay={handleDelay} onDelete={handleDelete} />
              ))}
            </Section>
          )}

          {/* 暂存中 */}
          <Section
            title="暂存中"
            hint="已经记下了，到时间再说，现在不用想"
            count={pending.length}
            accent="#4a8a83"
          >
            {pending.length === 0
              ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有挂念的事，心很静 🌿" style={{ padding: '20px 0' }} />
              : pending.map((n) => (
                <WorryCard key={n.id} note={n} onResolve={handleResolve} onDelay={handleDelay} onDelete={handleDelete} />
              ))
            }
          </Section>

          {/* 已处理 */}
          {resolved.length > 0 && (
            <Section
              title="已处理"
              hint=""
              count={resolved.length}
              accent="#9ca3af"
            >
              {resolved.slice(0, 20).map((n) => (
                <WorryCard key={n.id} note={n} resolvedView onResolve={handleResolve} onDelay={handleDelay} onDelete={handleDelete} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({
  title, hint, count, accent, children,
}: {
  title: string; hint: string; count: number; accent: string; children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 28, position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: accent }}>{title}</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{count}</span>
      </div>
      {hint && <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{hint}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  )
}

function WorryCard({
  note, due, resolvedView, onResolve, onDelay, onDelete,
}: {
  note: WorryNote
  due?: boolean
  resolvedView?: boolean
  onResolve: (n: WorryNote) => void
  onDelay: (n: WorryNote, days: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1.5px solid ${due ? '#fcd34d' : '#c8dcd6'}`,
        borderLeft: `4px solid ${due ? '#d97706' : resolvedView ? '#d1d5db' : '#6ba39d'}`,
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        opacity: resolvedView ? 0.6 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, color: '#1e1826', lineHeight: 1.6,
          textDecoration: resolvedView ? 'line-through' : 'none',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {note.content}
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {resolvedView
            ? <Tag color="default" style={{ fontSize: 11 }}>✓ 已处理 {note.resolved_at ? dayjs(note.resolved_at).format('MM/DD') : ''}</Tag>
            : <Tag color={due ? 'warning' : 'default'} style={{ fontSize: 11 }}>
                <InboxOutlined style={{ marginRight: 3 }} />
                {due ? '待处理 · ' : '计划 '}{dayjs(note.handle_date).format('MM/DD ddd')}
              </Tag>
          }
          {!resolvedView && (
            <button
              onClick={() => onDelay(note, due ? 1 : 1)}
              style={{ fontSize: 11, color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              再放一天
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {!resolvedView && (
          <Button
            size="small"
            type="text"
            icon={<CheckOutlined />}
            onClick={() => onResolve(note)}
            title="标记已处理"
            style={{ color: '#4a8a83' }}
          />
        )}
        {resolvedView && (
          <Button
            size="small"
            type="text"
            onClick={() => onResolve(note)}
            title="重新打开"
            style={{ color: '#9ca3af', fontSize: 12 }}
          >
            撤销
          </Button>
        )}
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onDelete(note.id)}
          title="删除"
        />
      </div>
    </div>
  )
}
