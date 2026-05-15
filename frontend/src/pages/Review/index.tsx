import {
  BookOutlined,
  CopyOutlined,
  PauseCircleOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, Card, Input, Space, Tooltip, Typography, message } from 'antd'
import ReactMarkdown from 'react-markdown'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import { getReviews, saveReview } from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import type { ChatMessage, ReviewLog } from '@/types'

const { Text, Paragraph } = Typography

const STORAGE_KEY = 'selftend_review_messages'
const INITIAL_MSG: ChatMessage = {
  role: 'assistant',
  content: '今天怎么样？睡眠、状态、发生了什么——随便说。\n\n说完想要总结的时候，发「总结一下」。',
}

function loadLocalMessages(today: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [INITIAL_MSG]
    const { date, messages } = JSON.parse(raw)
    // 日期不同则清空，只保留当天
    if (date !== today) return [INITIAL_MSG]
    return messages as ChatMessage[]
  } catch {
    return [INITIAL_MSG]
  }
}

function saveLocalMessages(today: string, messages: ChatMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, messages }))
}

export default function ReviewPage() {
  const today = dayjs().format('YYYY-MM-DD')
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadLocalMessages(today))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<ReviewLog[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [model, setModel] = useState<string>('deepseek-v4-pro')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHistory = async () => {
    const logs = await getReviews(7)
    setHistory(logs || [])
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    saveLocalMessages(today, newMessages)
    setInput('')
    setLoading(true)

    // 先插入一条空的 assistant 消息，流式追加内容
    const assistantIndex = newMessages.length
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const toSend = newMessages.filter(
        (m, i) => (i > 0 || m.role === 'user') && !m.content.startsWith('⚠️'),
      )

      const code = localStorage.getItem('selftend_code')
      const resp = await fetch('/api/review/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(code ? { 'X-Access-Code': code } : {}),
        },
        body: JSON.stringify({ messages: toSend, model }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: '请求失败' }))
        throw new Error(err.error || '请求失败')
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let reply = ''
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
          const chunk = JSON.parse(data)
          if (chunk.error) throw new Error(chunk.error)
          if (chunk.token) {
            reply += chunk.token
            setMessages((prev) => {
              const next = [...prev]
              next[assistantIndex + 1] = { role: 'assistant', content: reply }
              return next
            })
          }
        }
      }

      const finalMessages = [...newMessages, { role: 'assistant' as const, content: reply }]
      saveLocalMessages(today, finalMessages)

      if (reply.includes('【今日总结】')) {
        message.info('AI 已生成今日总结，点击「保存总结」存入记录', 4)
      }
    } catch (e) {
      // 用户主动中止不报错，保留已有内容
      if (e instanceof Error && e.name === 'AbortError') {
        setMessages((prev) => {
          const next = [...prev]
          const cur = next[assistantIndex + 1]
          if (cur && !cur.content) {
            next.splice(assistantIndex + 1, 1) // 内容为空则移除气泡
          }
          return next
        })
      } else {
        const errMsg = e instanceof Error ? e.message : '请求失败'
        message.error(errMsg, 6)
        setMessages((prev) => {
          const next = [...prev]
          next[assistantIndex + 1] = { role: 'assistant', content: `⚠️ ${errMsg}` }
          return next
        })
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleSave = async () => {
    // 找到最后一条包含【今日总结】的 AI 消息
    const summaryMsg = [...messages].reverse().find(
      (m) => m.role === 'assistant' && m.content.includes('【今日总结】'),
    )
    if (!summaryMsg) {
      message.warning('还没有生成总结，先发「总结一下」让 AI 生成')
      return
    }

    // 提取【今日总结】后的内容
    const idx = summaryMsg.content.indexOf('【今日总结】')
    const summary = summaryMsg.content.slice(idx)

    setSaving(true)
    try {
      await saveReview(summary)
      message.success('已保存今日复盘')
      await loadHistory()
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const hasSummary = messages.some(
    (m) => m.role === 'assistant' && m.content.includes('【今日总结】'),
  )

  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />

      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, flexShrink: 0, position: 'relative', zIndex: 1 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="title-highlight" style={{ fontSize: 17, fontWeight: 700, color: '#5b21b6' }}>
              <BookOutlined style={{ marginRight: 6, color: '#a78bfa' }} />每日复盘
            </span>
            <span className="font-script" style={{ fontSize: 24, color: '#a78bfa' }}>Review</span>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs().format('YYYY年MM月DD日 dddd')}
          </Text>
        </div>
        <Space>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            {([
              { value: 'deepseek-v4-flash', label: '⚡ Flash', active: { bg: '#0ea5e9', color: '#fff' }, inactive: { bg: '#f0f9ff', color: '#0369a1' } },
              { value: 'deepseek-v4-pro',   label: '✨ Pro',   active: { bg: '#d97706', color: '#fff' }, inactive: { bg: '#fffbeb', color: '#92400e' } },
            ] as const).map((opt) => {
              const selected = model === opt.value
              const style = selected ? opt.active : opt.inactive
              return (
                <button
                  key={opt.value}
                  onClick={() => setModel(opt.value)}
                  style={{
                    padding: '3px 12px', fontSize: 12, fontWeight: selected ? 600 : 400,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: style.bg, color: style.color,
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <Button
            size="small"
            onClick={() => setShowHistory(!showHistory)}
            icon={<CopyOutlined />}
          >
            历史记录
          </Button>
          {hasSummary && (
            <Button
              size="small"
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存总结
            </Button>
          )}
        </Space>
      </div>

      {/* 历史记录面板 */}
      {showHistory && (
        <Card
          size="small"
          style={{ marginBottom: 12, maxHeight: 200, overflowY: 'auto', flexShrink: 0 }}
          title={<Text style={{ fontSize: 13 }}>近期复盘</Text>}
        >
          {history.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>还没有复盘记录</Text>
          ) : (
            history.map((log) => (
              <div key={log.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0eeff' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{log.date}</Text>
                <Paragraph style={{ fontSize: 12, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                  {log.summary}
                </Paragraph>
              </div>
            ))
          )}
        </Card>
      )}

      {/* 对话区域 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingBottom: 8,
        }}
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div style={{ flexShrink: 0, paddingTop: 12, borderTop: '1px solid #e4deff' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="说说今天怎么样... （Enter 发送，Shift+Enter 换行）"
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={loading}
            style={{ flex: 1, resize: 'none' }}
          />
          {loading ? (
            <Tooltip title="停止生成">
              <Button
                danger
                icon={<PauseCircleOutlined />}
                onClick={() => abortRef.current?.abort()}
                style={{ height: 'auto', alignSelf: 'flex-end' }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="发送 (Enter)">
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={sendMessage}
                style={{ height: 'auto', alignSelf: 'flex-end' }}
              />
            </Tooltip>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
          发「总结一下」生成今日总结
        </Text>
      </div>
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? '#7c3aed' : '#fff',
          color: isUser ? '#fff' : '#1e1826',
          border: isUser ? 'none' : '1.5px solid #e4deff',
          fontSize: 14,
          lineHeight: 1.6,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : !msg.content ? (
          <span style={{ color: '#a78bfa', fontSize: 13 }}>复盘助手思考中<span className="thinking-dots">...</span></span>
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
              ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
              strong: ({ children }) => <strong style={{ color: '#5b21b6' }}>{children}</strong>,
              h3: ({ children }) => <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>{children}</h3>,
              h4: ({ children }) => <h4 style={{ margin: '6px 0 2px', fontSize: 14 }}>{children}</h4>,
              code: ({ children }) => (
                <code style={{ background: '#f0eeff', borderRadius: 4, padding: '1px 5px', fontSize: 13 }}>
                  {children}
                </code>
              ),
              hr: () => <hr style={{ border: 'none', borderTop: '1px solid #e4deff', margin: '8px 0' }} />,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}
