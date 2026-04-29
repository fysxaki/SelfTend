import {
  BookOutlined,
  CopyOutlined,
  LoadingOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, Card, Input, Segmented, Space, Tooltip, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import { chat, getReviews, saveReview } from '@/api'
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
  const [model, setModel] = useState<string>('deepseek-v4-flash')
  const bottomRef = useRef<HTMLDivElement>(null)

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

    try {
      // 只把非初始问候的消息发给后端
      const toSend = newMessages.filter((_, i) => i > 0 || newMessages[0].role === 'user')
      const { reply } = await chat(toSend, model)
      const finalMessages = [...newMessages, { role: 'assistant' as const, content: reply }]
      setMessages(finalMessages)
      saveLocalMessages(today, finalMessages)

      // 检测是否包含总结，自动提示保存
      if (reply.includes('【今日总结】')) {
        message.info('AI 已生成今日总结，点击「保存总结」存入记录', 4)
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.error || '请求失败，请检查 API Key 配置'
      message.error(errMsg)
      setMessages([...newMessages, { role: 'assistant', content: `⚠️ ${errMsg}` }])
    } finally {
      setLoading(false)
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
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>

      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e1826' }}>
            <BookOutlined style={{ marginRight: 8, color: '#a78bfa' }} />
            每日复盘
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs().format('YYYY年MM月DD日 dddd')}
          </Text>
        </div>
        <Space>
          <Segmented
            size="small"
            value={model}
            onChange={(v) => setModel(v as string)}
            options={[
              { label: 'Flash', value: 'deepseek-v4-flash' },
              { label: 'Pro', value: 'deepseek-v4-pro' },
            ]}
          />
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
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px' }}>
            <LoadingOutlined style={{ color: '#a78bfa' }} />
            <Text type="secondary" style={{ fontSize: 13 }}>思考中...</Text>
          </div>
        )}
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
          <Tooltip title="发送 (Enter)">
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendMessage}
              loading={loading}
              style={{ height: 'auto', alignSelf: 'flex-end' }}
            />
          </Tooltip>
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
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
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
          whiteSpace: 'pre-wrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {msg.content}
      </div>
    </div>
  )
}
