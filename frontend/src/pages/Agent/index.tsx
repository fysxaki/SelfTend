import {
  CheckOutlined,
  CloseOutlined,
  PauseCircleOutlined,
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Button, Input, Tag, Tooltip, Typography, message } from 'antd'
import dayjs from 'dayjs'
import ReactMarkdown from 'react-markdown'
import { useEffect, useRef, useState } from 'react'
import {
  completeTask,
  createEnergyLog,
  createWorry,
  redeemPrize,
} from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import { useAppStore } from '@/stores/useAppStore'
import type { AgentProposal } from '@/types'

const { Text } = Typography

// 工具名 → 中文步骤标签（用于时间线 chip）
const TOOL_LABELS: Record<string, string> = {
  get_stats: '查询积分档案',
  get_today: '查询今日快照',
  get_recent_sleep: '查询近期睡眠',
  get_recent_energy: '查询近期能量',
  get_tasks: '查询任务列表',
  get_worries: '查询焦虑暂存',
  get_wishes: '查询心愿',
  get_redemptions: '查询兑换记录',
  complete_task: '准备完成任务',
  log_energy: '准备记录能量',
  add_worry: '准备暂存焦虑',
  redeem_prize: '准备兑换奖品',
}

type ProposalStatus = 'pending' | 'done' | 'cancelled'

interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  steps?: string[]
  proposals?: Array<AgentProposal & { status: ProposalStatus }>
}

const INITIAL_MSG: AgentMessage = {
  role: 'assistant',
  content:
    '我是你的 AI 助手，可以帮你查数据、也能帮你操作。试试：\n\n- 「我最近一周睡眠拖累积分了吗？」\n- 「帮我完成今天的某个任务」\n- 「把"明天问下房东退租"暂存到焦虑箱」\n\n涉及改动的操作我会先给方案卡，你点确认后才执行。',
}

export default function AgentPage() {
  const { fetchStats } = useAppStore()
  const [messages, setMessages] = useState<AgentMessage[]>([INITIAL_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 更新最后一条 assistant 消息（流式追加用）
  const patchLastAssistant = (patch: Partial<AgentMessage>) => {
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last && last.role === 'assistant') {
        next[next.length - 1] = { ...last, ...patch }
      }
      return next
    })
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const history = [...messages, { role: 'user' as const, content: text }]
    setMessages([...history, { role: 'assistant', content: '', steps: [], proposals: [] }])
    setInput('')
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    // 只把纯对话历史发给后端（去掉步骤/方案等 UI 附加信息、去掉错误气泡）
    const toSend = history
      .filter((m, i) => (i > 0 || m.role === 'user') && !m.content.startsWith('⚠️'))
      .map((m) => ({ role: m.role, content: m.content }))

    const steps: string[] = []
    let reply = ''

    try {
      const code = localStorage.getItem('selftend_code')
      const resp = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(code ? { 'X-Access-Code': code } : {}),
        },
        body: JSON.stringify({ messages: toSend }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: '请求失败' }))
        throw new Error(err.error || '请求失败')
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          const evt = JSON.parse(data)
          if (evt.type === 'error') throw new Error(evt.error)
          if (evt.type === 'step') {
            steps.push(TOOL_LABELS[evt.tool] ?? evt.tool)
            patchLastAssistant({ steps: [...steps] })
          } else if (evt.type === 'token') {
            reply += evt.token
            patchLastAssistant({ content: reply })
          } else if (evt.type === 'proposal') {
            const proposals = (evt.actions as AgentProposal[]).map((a) => ({
              ...a,
              status: 'pending' as ProposalStatus,
            }))
            patchLastAssistant({ proposals })
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 主动中止：内容为空则移除空气泡
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant' && !last.content && !(last.proposals?.length)) {
            next.pop()
          }
          return next
        })
      } else {
        const errMsg = e instanceof Error ? e.message : '请求失败'
        message.error(errMsg, 6)
        patchLastAssistant({ content: `⚠️ ${errMsg}` })
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  // 确认执行一个方案 → 调现有业务接口（不重造积分逻辑）
  const runProposal = async (msgIdx: number, propIdx: number) => {
    const msg = messages[msgIdx]
    const p = msg.proposals?.[propIdx]
    if (!p || p.status !== 'pending') return

    try {
      switch (p.action_type) {
        case 'complete_task':
          await completeTask(Number(p.params.task_id), p.params.note as string | undefined)
          break
        case 'log_energy':
          await createEnergyLog({
            energy_level: Number(p.params.energy_level),
            note: p.params.note as string | undefined,
          })
          break
        case 'add_worry':
          await createWorry({
            content: String(p.params.content),
            handle_date: (p.params.handle_date as string) || undefined,
          })
          break
        case 'redeem_prize':
          await redeemPrize(Number(p.params.prize_id))
          break
      }
      setProposalStatus(msgIdx, propIdx, 'done')
      message.success(`已执行：${p.human_summary}`)
      fetchStats()
    } catch (e) {
      const msgText =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : '执行失败')
      message.error(msgText)
    }
  }

  const setProposalStatus = (msgIdx: number, propIdx: number, status: ProposalStatus) => {
    setMessages((prev) => {
      const next = [...prev]
      const m = next[msgIdx]
      if (m?.proposals) {
        const proposals = [...m.proposals]
        proposals[propIdx] = { ...proposals[propIdx], status }
        next[msgIdx] = { ...m, proposals }
      }
      return next
    })
  }

  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />

      {/* 标题栏 */}
      <div style={{ marginBottom: 16, flexShrink: 0, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="title-highlight" style={{ fontSize: 17, fontWeight: 700, color: '#2f5d59' }}>
            <RobotOutlined style={{ marginRight: 6, color: '#6ba39d' }} />AI 助手
          </span>
          <span className="font-script" style={{ fontSize: 24, color: '#6ba39d' }}>Agent</span>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          能查数据、能帮你操作 · {dayjs().format('YYYY年MM月DD日')}
        </Text>
      </div>

      {/* 对话区域 */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            loading={loading}
            onConfirm={(pi) => runProposal(i, pi)}
            onCancel={(pi) => setProposalStatus(i, pi, 'cancelled')}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div style={{ flexShrink: 0, paddingTop: 12, borderTop: '1px solid #c8dcd6' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // 输入法组词时 Enter 只确认候选词，不触发发送
              if (e.key !== 'Enter' || e.shiftKey) return
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              sendMessage()
            }}
            placeholder="问我数据，或让我帮你做点什么..."
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={loading}
            style={{ flex: 1, resize: 'none' }}
          />
          {loading ? (
            <Tooltip title="停止">
              <Button danger icon={<PauseCircleOutlined />} onClick={() => abortRef.current?.abort()} style={{ height: 'auto', alignSelf: 'flex-end' }} />
            </Tooltip>
          ) : (
            <Tooltip title="发送 (Enter)">
              <Button type="primary" icon={<SendOutlined />} onClick={sendMessage} style={{ height: 'auto', alignSelf: 'flex-end' }} />
            </Tooltip>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
          改动类操作会先给方案卡，确认后才执行 · Enter 发送，Shift+Enter 换行
        </Text>
      </div>
    </div>
  )
}

function MessageBubble({
  msg,
  loading,
  onConfirm,
  onCancel,
}: {
  msg: AgentMessage
  loading: boolean
  onConfirm: (propIdx: number) => void
  onCancel: (propIdx: number) => void
}) {
  const isUser = msg.role === 'user'
  const hasSteps = !!msg.steps?.length
  const hasProposals = !!msg.proposals?.length

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '82%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? '#4a8a83' : '#fff',
          color: isUser ? '#fff' : '#1e1826',
          border: isUser ? 'none' : '1.5px solid #c8dcd6',
          fontSize: 14,
          lineHeight: 1.6,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {/* 工具调用时间线 */}
        {hasSteps && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: msg.content ? 8 : 0 }}>
            {msg.steps!.map((s, i) => (
              <Tag key={i} icon={<ThunderboltOutlined />} color="cyan" style={{ margin: 0, fontSize: 11 }}>
                {s}
              </Tag>
            ))}
          </div>
        )}

        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : !msg.content && !hasProposals ? (
          <span style={{ color: '#6ba39d', fontSize: 13 }}>
            {hasSteps ? '正在思考' : '助手思考中'}
            <span className="thinking-dots">...</span>
          </span>
        ) : (
          msg.content && (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>,
                li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
                strong: ({ children }) => <strong style={{ color: '#2f5d59' }}>{children}</strong>,
                h3: ({ children }) => <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>{children}</h3>,
                h4: ({ children }) => <h4 style={{ margin: '6px 0 2px', fontSize: 14 }}>{children}</h4>,
                code: ({ children }) => (
                  <code style={{ background: '#f4f9f7', borderRadius: 4, padding: '1px 5px', fontSize: 13 }}>{children}</code>
                ),
                hr: () => <hr style={{ border: 'none', borderTop: '1px solid #c8dcd6', margin: '8px 0' }} />,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )
        )}

        {/* 待确认方案卡 */}
        {hasProposals && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msg.proposals!.map((p, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid #b8d8d3',
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: '#f4f9f7',
                }}
              >
                <div style={{ fontSize: 13, color: '#2f5d59', marginBottom: p.status === 'pending' ? 8 : 0 }}>
                  {p.human_summary}
                </div>
                {p.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="small" type="primary" icon={<CheckOutlined />} disabled={loading} onClick={() => onConfirm(i)}>
                      确认执行
                    </Button>
                    <Button size="small" icon={<CloseOutlined />} onClick={() => onCancel(i)}>
                      取消
                    </Button>
                  </div>
                ) : p.status === 'done' ? (
                  <Text style={{ fontSize: 12, color: '#16a34a' }}>
                    <CheckOutlined /> 已执行
                  </Text>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>已取消</Text>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
