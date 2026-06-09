import {
  DeleteOutlined,
  EditOutlined,
  MoonOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  TimePicker,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  createSleepLog,
  deleteSleepLog,
  getSleepLogs,
  updateSleepLog,
} from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import { useAppStore } from '@/stores/useAppStore'
import type { SleepLog } from '@/types'

const { Text } = Typography

// 睡眠统计的滑动窗口：14 天 = 2 个完整周，是睡眠科学里反映「习惯性作息」
// 和生物钟节律的标准窗口；短于此易受单次熬夜干扰，长于此对作息改善反应迟钝。
const STATS_WINDOW_DAYS = 14

export default function SleepPage() {
  const { fetchStats } = useAppStore()
  const [logs, setLogs] = useState<SleepLog[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLog, setEditingLog] = useState<SleepLog | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      // 获取最近 30 天记录
      const start = dayjs().subtract(29, 'day').format('YYYY-MM-DD')
      const end = dayjs().format('YYYY-MM-DD')
      const data = await getSleepLogs({ start_date: start, end_date: end })
      setLogs(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const openCreate = () => {
    setEditingLog(null)
    form.resetFields()
    // 起床时间默认用近 14 天的平均，没有历史数据时回退到 08:52
    const defaultWake = recentStats.avgWakeTime ?? '08:52'
    form.setFieldsValue({
      date: dayjs(),
      wake_time: dayjs(defaultWake, 'HH:mm'),
    })
    setModalOpen(true)
  }

  const openEdit = (log: SleepLog) => {
    setEditingLog(log)
    form.setFieldsValue({
      date: dayjs(log.date),
      sleep_time: dayjs(log.sleep_time, 'HH:mm'),
      wake_time: dayjs(log.wake_time || '08:52', 'HH:mm'),
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const sleepTimeStr = (values.sleep_time as dayjs.Dayjs).format('HH:mm')
      const wakeTimeStr = (values.wake_time as dayjs.Dayjs).format('HH:mm')

      if (editingLog) {
        await updateSleepLog(editingLog.id, { sleep_time: sleepTimeStr, wake_time: wakeTimeStr })
        message.success('已更新睡眠记录')
      } else {
        const dateStr = (values.date as dayjs.Dayjs).format('YYYY-MM-DD')
        const log = await createSleepLog({ date: dateStr, sleep_time: sleepTimeStr, wake_time: wakeTimeStr })
        const isToday = dateStr === dayjs().format('YYYY-MM-DD')
        const dateLabel = isToday ? '今日' : `${dayjs(dateStr).format('MM/DD')}`
        const parts: string[] = []
        if (log.penalized) {
          if (log.penalty_exp > 0)
            parts.push(`🌙 入睡偏晚，扣了 ${log.penalty_exp.toFixed(1)} 分，今晚早点休息`)
          else if (isToday)
            parts.push(`🌙 晚睡惩罚已激活，今日任务奖励将打八折`)
          else
            parts.push(`🌙 ${dateLabel} 晚睡已记录`)
        }
        if (log.bonus_exp > 0)
          parts.push(`🎉 ${dateLabel}睡眠奖励 +${log.bonus_exp.toFixed(0)} 分`)
        if (log.bonus_exp < 0)
          parts.push(`💤 ${dateLabel}睡眠时长偏短，扣 ${Math.abs(log.bonus_exp).toFixed(1)} 分`)
        if (parts.length > 0) {
          message.warning(parts.join('　'), 5)
        } else {
          message.success(`${dateLabel}睡眠记录已保存 🎉`)
        }
      }

      setModalOpen(false)
      await Promise.all([loadLogs(), fetchStats()])
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败'
      message.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (log: SleepLog) => {
    await deleteSleepLog(log.id)
    message.success('已删除')
    await Promise.all([loadLogs(), fetchStats()])
  }

  // 今日是否已记录
  const todayStr = dayjs().format('YYYY-MM-DD')
  const todayLog = logs.find((l) => l.date === todayStr)

  // 近 14 天（生物钟习惯窗口）统计：
  // - 平均入睡时间 / 平均时长 / 推荐入睡时间（平均提前 20 分钟，下限 22:40）
  // - 平均起床时间：用于新建睡眠记录时的默认值
  const recentStats = useMemo(() => {
    const cutoff = dayjs().subtract(STATS_WINDOW_DAYS - 1, 'day').format('YYYY-MM-DD')
    const recent = logs.filter((l) => l.date >= cutoff && l.sleep_time)
    if (recent.length === 0) {
      return {
        avgSleepTime: null, avgDurationH: 0, recommended: null, recommendedFloored: false,
        avgWakeTime: null, count: 0,
      }
    }
    const avgSleepTime = avgClockTime(recent.map((l) => l.sleep_time))
    const avgDurationH = recent.reduce((a, l) => a + l.duration, 0) / recent.length
    const raw = avgSleepTime ? shiftClockMinutes(avgSleepTime, -20) : null
    const recommended = raw ? clampEarliestSleep(raw, '22:40') : null
    const recommendedFloored = raw !== null && recommended !== raw
    // 起床时间都在 06:00-12:00 之间，不会跨午夜，直接均值
    const wakeTimes = recent.filter((l) => l.wake_time).map((l) => l.wake_time as string)
    const avgWakeTime = wakeTimes.length > 0 ? avgClockTimeSimple(wakeTimes) : null
    return {
      avgSleepTime, avgDurationH, recommended, recommendedFloored,
      avgWakeTime, count: recent.length,
    }
  }, [logs])

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => (
        <Text strong>{dayjs(date).format('MM/DD ddd')}</Text>
      ),
    },
    {
      title: '入睡时间',
      dataIndex: 'sleep_time',
      key: 'sleep_time',
      render: (t: string, record: SleepLog) => (
        <Space>
          <MoonOutlined style={{ color: '#6ba39d' }} />
          <Text>{t}</Text>
          {record.penalized && (
            <Tooltip title={`超过 01:30 入睡，扣除 ${record.penalty_exp.toFixed(1)} 积分`}>
              <WarningOutlined style={{ color: '#f59e0b' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '起床时间',
      dataIndex: 'wake_time',
      key: 'wake_time',
    },
    {
      title: '睡眠时长',
      dataIndex: 'duration',
      key: 'duration',
      render: (d: number) => {
        const h = Math.floor(d)
        const m = Math.round((d - h) * 60)
        const color = d >= 7 ? '#22c55e' : d >= 6 ? '#f59e0b' : '#ef4444'
        return <Text style={{ color, fontWeight: 600 }}>{h}h {m}m</Text>
      },
    },
    {
      title: '奖惩',
      key: 'bonus',
      render: (_: unknown, record: SleepLog) => {
        const isToday = record.date === todayStr
        const lines: React.ReactNode[] = []
        if (record.penalized) {
          if (record.penalty_exp > 0)
            lines.push(<div key="late" style={{ color: '#ef4444', fontSize: 12 }}>🌙 晚睡 -{record.penalty_exp.toFixed(1)}</div>)
          else if (isToday)
            lines.push(<div key="late-active" style={{ color: '#f59e0b', fontSize: 12 }}>🌙 晚睡惩罚中</div>)
          else
            lines.push(<div key="late-none" style={{ color: '#f59e0b', fontSize: 12 }}>🌙 晚睡（当日无任务）</div>)
        }
        if (record.bonus_exp > 0)
          lines.push(<div key="bonus" style={{ color: '#22c55e', fontSize: 12 }}>⏰ 时长 +{record.bonus_exp.toFixed(0)}</div>)
        if (record.bonus_exp < 0)
          lines.push(<div key="short" style={{ color: '#ef4444', fontSize: 12 }}>😴 不足6h -{Math.abs(record.bonus_exp).toFixed(1)}</div>)
        return lines.length > 0 ? <>{lines}</> : <Text style={{ color: '#22c55e', fontSize: 12 }}>无</Text>
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: SleepLog) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="确认删除？如有惩罚积分将退还"
            onConfirm={() => handleDelete(record)}
            okText="确认"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />
      {/* 顶部标题 + 今日状态 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, position: 'relative', zIndex: 1 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="title-highlight" style={{ fontSize: 19, fontWeight: 700, color: '#2f5d59' }}>
              <MoonOutlined style={{ marginRight: 6, color: '#6ba39d' }} />睡眠记录
            </span>
            <span className="font-script" style={{ fontSize: 26, color: '#6ba39d' }}>Sleep</span>
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            超过 01:30 入睡扣20% · &lt;6h 扣20% · 6→8h 线性 0~+52（≥8h 封顶）
          </Text>
        </div>
        <Button
          type="primary"
          onClick={openCreate}
          disabled={!!todayLog}
        >
          {todayLog ? '今日已记录' : '记录今晚睡眠'}
        </Button>
      </div>

      {/* 今日奖惩提示 */}
      {todayLog && (todayLog.penalized || todayLog.bonus_exp !== 0) && (
        <Card
          style={{
            marginBottom: 16,
            background: todayLog.bonus_exp > 0 && !todayLog.penalized ? '#f0fdf4' : '#fef3c7',
            border: `1px solid ${todayLog.bonus_exp > 0 && !todayLog.penalized ? '#86efac' : '#fcd34d'}`,
          }}
          size="small"
        >
          <Space direction="vertical" size={2}>
            {todayLog.penalized && (
              <Space>
                <span>🌙</span>
                <Text style={{ color: '#92400e' }}>
                  昨晚 {todayLog.sleep_time} 才入睡，{todayLog.penalty_exp > 0
                    ? <>轻轻扣了 <strong>{todayLog.penalty_exp.toFixed(1)}</strong> 分——今晚试试早点躺下？</>
                    : '晚睡惩罚已激活，今日任务奖励将打八折'}
                </Text>
              </Space>
            )}
            {todayLog.bonus_exp > 0 && (
              <Space>
                <span>🎉</span>
                <Text style={{ color: '#166534' }}>
                  睡了 {Math.floor(todayLog.duration)}h{Math.round((todayLog.duration % 1) * 60)}m，睡眠奖励 <strong>+{todayLog.bonus_exp.toFixed(0)}</strong> 分，继续保持！
                </Text>
              </Space>
            )}
            {todayLog.bonus_exp < 0 && (
              <Space>
                <span>💤</span>
                <Text style={{ color: '#92400e' }}>
                  睡眠时长偏短，扣了 <strong>{Math.abs(todayLog.bonus_exp).toFixed(1)}</strong> 分。今天注意补充能量，明天早点睡～
                </Text>
              </Space>
            )}
          </Space>
        </Card>
      )}

      {/* 近 7 天统计 */}
      {recentStats.count > 0 && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ background: '#fff', border: '1px solid #cffafe' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#6b7280' }}>
                  近 {recentStats.count} 天平均入睡
                </span>}
                value={recentStats.avgSleepTime ?? '—'}
                valueStyle={{ color: '#0891b2', fontSize: 22, fontWeight: 700 }}
                prefix={<MoonOutlined style={{ color: '#06b6d4' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small" style={{ background: '#fff', border: '1px solid #d1fae5' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#6b7280' }}>
                  近 {recentStats.count} 天平均时长
                </span>}
                value={formatDuration(recentStats.avgDurationH)}
                valueStyle={{
                  color: recentStats.avgDurationH >= 7 ? '#16a34a' : recentStats.avgDurationH >= 6 ? '#d97706' : '#dc2626',
                  fontSize: 22, fontWeight: 700,
                }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              size="small"
              style={{
                background: 'linear-gradient(135deg, #e6f1ee 0%, #ecfeff 100%)',
                border: '1px solid #b8d8d3',
              }}
            >
              <Statistic
                title={<span style={{ fontSize: 12, color: '#3d6d68' }}>
                  💡 今晚建议入睡{recentStats.recommendedFloored ? '（已是最早）' : '（提前 20 分钟）'}
                </span>}
                value={recentStats.recommended ?? '—'}
                valueStyle={{ color: '#3d6d68', fontSize: 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 记录列表 */}
      <Card>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '还没有睡眠记录，先记录今晚的吧' }}
        />
      </Card>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingLog ? '编辑睡眠记录' : '记录睡眠时间'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={editingLog ? '保存' : '记录'}
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingLog && (
            <Form.Item
              name="date"
              label="日期"
              rules={[{ required: true, message: '请选择日期' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(d) => d.isAfter(dayjs())}
                format="YYYY-MM-DD"
              />
            </Form.Item>
          )}
          <Form.Item
            name="sleep_time"
            label="入睡时间"
            rules={[{ required: true, message: '请选择入睡时间' }]}
            extra="填写你实际入睡的时间（如深夜 00:30 或 01:20）"
          >
            <TimePicker
              style={{ width: '100%' }}
              format="HH:mm"
              minuteStep={1}
              showNow={false}
            />
          </Form.Item>
          <Form.Item
            name="wake_time"
            label="起床时间"
            rules={[{ required: true, message: '请选择起床时间' }]}
            extra={recentStats.avgWakeTime
              ? `默认为近 ${recentStats.count} 天平均起床时间 ${recentStats.avgWakeTime}，可按实际调整`
              : '默认 08:50，可按实际调整'}
          >
            <TimePicker
              style={{ width: '100%' }}
              format="HH:mm"
              minuteStep={1}
              showNow={false}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ─── 工具函数 ────────────────────────────────────────────────

// 把若干个 "HH:mm" 时间求平均，正确处理跨午夜的情况。
// 思路：所有 < 12:00 的时间视为「次日凌晨」，加 24h 再平均，最后对 24h 取模。
function avgClockTime(times: string[]): string | null {
  if (!times.length) return null
  const minutes = times.map((t) => {
    const [h, m] = t.split(':').map(Number)
    let total = h * 60 + m
    if (total < 12 * 60) total += 24 * 60 // 凌晨时段归到「次日」
    return total
  })
  const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length
  const normalized = ((Math.round(avg) % (24 * 60)) + 24 * 60) % (24 * 60)
  return formatClock(normalized)
}

// 简单平均，不处理跨午夜（用于起床时间这种全部落在白天的场景）
function avgClockTimeSimple(times: string[]): string | null {
  if (!times.length) return null
  const minutes = times.map((t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  })
  const avg = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
  return formatClock(avg)
}

// 把 "HH:mm" 加/减 N 分钟，按 24h 循环
function shiftClockMinutes(time: string, deltaMin: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = ((h * 60 + m + deltaMin) % (24 * 60) + 24 * 60) % (24 * 60)
  return formatClock(total)
}

// 限制「推荐入睡时间」不能比 floor 更早。
// 入睡场景的时间只可能落在傍晚~凌晨之间：
//   - [12:00, 22:40) 视为「早于下限」，提升到 floor
//   - [22:40, 24:00) 和 [00:00, 12:00) 都视为「正常或更晚」，保持原值
// 这样避免对凌晨 03:00 这种值错误地反向钳制。
function clampEarliestSleep(time: string, floor: string): string {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const total = toMin(time)
  const floorTotal = toMin(floor)
  if (total >= 12 * 60 && total < floorTotal) {
    return floor
  }
  return time
}

function formatClock(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 把小时浮点数（如 7.38）格式化成 "7h 23m"
function formatDuration(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}h ${mm}m`
}
