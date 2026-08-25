import {
  CheckCircleFilled,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  MinusCircleOutlined,
  MobileOutlined,
  MoonOutlined,
  PlusOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  TimePicker,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { isWorkday } from 'chinese-days'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createSleepLog,
  deleteSleepLog,
  getSleepLogs,
  getUserConfig,
  getWorries,
  setUserConfig,
  updateSleepLog,
} from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import { useAppStore } from '@/stores/useAppStore'
import type { SleepLog } from '@/types'

const { Text } = Typography

// 睡眠统计的滑动窗口：14 天 = 2 个完整周，是睡眠科学里反映「习惯性作息」
// 和生物钟节律的标准窗口；短于此易受单次熬夜干扰，长于此对作息改善反应迟钝。
const STATS_WINDOW_DAYS = 14

// 「今晚建议入睡」分两套，依据明天（起床那天）是否工作日：
// - 工作日：固定 07:35 起床，建议入睡 = 07:35 − 预计睡眠时长（用 chinese-days 判断，含调休）
// - 休息日/节假日：沿用习惯窗口逻辑（近 14 天平均入睡 − 20min，下限 22:40）
const WORKDAY_WAKE = '07:35'
// 预计睡眠时长默认 8h（最少 8h，最多 9h）；晚睡多时可在卡片上调 +0.5h / +1h
const SLEEP_GOAL_MIN = '08:00'

// 睡前倒计时：不排满整晚分钟级日程（容易被打乱后直接放弃），
// 由用户自己配置几个关键锚点，从目标入睡时间往前倒推。
// 锚点配置持久化在后端 UserConfig（key=wind_down_steps），跨设备不丢；
// 每晚的打卡状态是当天临时状态，存本地即可。
interface WindDownStep {
  key: string        // React key + 打卡状态的存储 key，创建时生成，不需要用户填
  offsetMin: number  // 提前多少分钟（相对目标入睡时间）
  icon: string       // emoji
  label: string
  hint: string
}

const WIND_DOWN_CONFIG_KEY = 'wind_down_steps'
const MAX_WIND_DOWN_STEPS = 6

// 首次使用、或配置为空时的默认锚点（用户可在「配置」里改成任意内容）
const DEFAULT_WIND_DOWN_STEPS: WindDownStep[] = [
  { key: 'worry', offsetMin: 60, icon: '☁️', label: '焦虑暂存箱检查', hint: '把还悬着的事记下来，交给白天的自己' },
  { key: 'phone', offsetMin: 30, icon: '📱', label: '手机离开卧室', hint: '充电器挪到房间外' },
  { key: 'wind',  offsetMin: 10, icon: '🌙', label: '洗漱 · 关灯', hint: '准备躺下' },
]

const WIND_DOWN_ICON_PRESETS = ['☁️', '📱', '🌙', '🧴', '📖', '🛁', '🧘', '💡', '⏰', '🍵']

function parseWindDownSteps(raw: string): WindDownStep[] {
  if (!raw) return DEFAULT_WIND_DOWN_STEPS
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WIND_DOWN_STEPS
    return parsed.filter(
      (s): s is WindDownStep =>
        s && typeof s.label === 'string' && typeof s.offsetMin === 'number',
    )
  } catch {
    return DEFAULT_WIND_DOWN_STEPS
  }
}

const WIND_DOWN_STORAGE_KEY = 'selftend_wind_down'

function loadWindDownChecks(today: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(WIND_DOWN_STORAGE_KEY)
    if (!raw) return {}
    const { date, checks } = JSON.parse(raw)
    return date === today ? checks : {}
  } catch {
    return {}
  }
}

function saveWindDownChecks(today: string, checks: Record<string, boolean>) {
  localStorage.setItem(WIND_DOWN_STORAGE_KEY, JSON.stringify({ date: today, checks }))
}

export default function SleepPage() {
  const { fetchStats } = useAppStore()
  const [logs, setLogs] = useState<SleepLog[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLog, setEditingLog] = useState<SleepLog | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  // 今晚预计睡眠时长（工作日 / 休息日通用），默认 8h，可在卡片上调到 9h
  const [sleepGoal, setSleepGoal] = useState<dayjs.Dayjs>(dayjs(SLEEP_GOAL_MIN, 'HH:mm'))
  // 休息日「放纵一下」：开启后不按睡够时长倒推，改用宽松的习惯窗口（平均入睡 −20min）
  const [indulge, setIndulge] = useState(false)
  // 手机壁纸视图（19.8:9 竖版，可一键导出 PNG 设为锁屏壁纸）
  const [wallpaperOpen, setWallpaperOpen] = useState(false)
  const wallpaperCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // 睡前倒计时：今晚各锚点的打卡状态（本地存储，跨日自动清空）
  const todayForWindDown = dayjs().format('YYYY-MM-DD')
  const [windDownChecks, setWindDownChecks] = useState<Record<string, boolean>>(() => loadWindDownChecks(todayForWindDown))
  const [dueWorryCount, setDueWorryCount] = useState(0)
  // 锚点配置：从后端加载，用户自己在「配置」弹窗里增删改
  const [windDownSteps, setWindDownSteps] = useState<WindDownStep[]>(DEFAULT_WIND_DOWN_STEPS)
  const [windDownConfigOpen, setWindDownConfigOpen] = useState(false)
  const [windDownSaving, setWindDownSaving] = useState(false)
  const [windDownForm] = Form.useForm()

  useEffect(() => {
    getWorries('due').then((list) => setDueWorryCount(list?.length ?? 0)).catch(() => {})
    getUserConfig(WIND_DOWN_CONFIG_KEY).then((resp) => setWindDownSteps(parseWindDownSteps(resp.value))).catch(() => {})
  }, [])

  const toggleWindDownStep = (key: string) => {
    setWindDownChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveWindDownChecks(todayForWindDown, next)
      return next
    })
  }

  const openWindDownConfig = () => {
    windDownForm.setFieldsValue({ steps: windDownSteps })
    setWindDownConfigOpen(true)
  }

  const handleSaveWindDownConfig = async () => {
    try {
      const values = await windDownForm.validateFields()
      setWindDownSaving(true)
      const steps: WindDownStep[] = (values.steps as WindDownStep[]).map((s, i) => ({
        key: s.key || `step-${Date.now()}-${i}`,
        offsetMin: s.offsetMin,
        icon: s.icon || '🌙',
        label: s.label,
        hint: s.hint || '',
      }))
      await setUserConfig(WIND_DOWN_CONFIG_KEY, JSON.stringify(steps))
      setWindDownSteps(steps)
      setWindDownConfigOpen(false)
      message.success('锚点配置已保存')
    } finally {
      setWindDownSaving(false)
    }
  }

  // 一键导出壁纸：canvas 已按 1080×2376 真机分辨率绘制，直接 toBlob 下载
  const handleExportWallpaper = () => {
    const canvas = wallpaperCanvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) {
        message.error('导出失败，请重试')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `selftend-壁纸-${dayjs().format('MMDD')}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      message.success('壁纸已保存')
    }, 'image/png')
  }

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

  // 明天（起床那天）是否工作日 → 决定用哪个起床时间倒推
  const tomorrowIsWorkday = isWorkday(dayjs().add(1, 'day').format('YYYY-MM-DD'))
  // 默认都是「起床时间 − 预计睡眠时长」，只是起床时间来源不同：
  // - 工作日：固定 07:35
  // - 休息日：近 14 天平均起床时间
  // 休息日额外提供「放纵一下」开关：切回宽松的习惯窗口逻辑（平均入睡 −20min），
  // 没有历史起床数据时也自动走这条。
  const goalMinutes = sleepGoal.hour() * 60 + sleepGoal.minute()
  const restWake = recentStats.avgWakeTime
  const restUseLoose = indulge || !restWake
  const recommendedSleep = tomorrowIsWorkday
    ? shiftClockMinutes(WORKDAY_WAKE, -goalMinutes)
    : restUseLoose
      ? recentStats.recommended
      : shiftClockMinutes(restWake!, -goalMinutes)

  // 睡前倒计时的各锚点时间 = 目标入睡时间往前推 offsetMin 分钟，按 offsetMin 从大到小排（离目标最远的在最前）
  const windDownAnchors = useMemo(() => {
    if (!recommendedSleep) return []
    return [...windDownSteps]
      .sort((a, b) => b.offsetMin - a.offsetMin)
      .map((step) => ({
        ...step,
        time: shiftClockMinutes(recommendedSleep, -step.offsetMin),
      }))
  }, [recommendedSleep, windDownSteps])

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 24, position: 'relative', zIndex: 1 }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <Statistic
                  title={<span style={{ fontSize: 12, color: '#3d6d68' }}>
                    💡 今晚建议入睡{tomorrowIsWorkday
                      ? '（工作日 · 起床 7:35）'
                      : indulge
                        ? '（休息日 · 放纵中）'
                        : restWake
                          ? `（休息日 · 起床 ${restWake}）`
                          : '（休息日 · 提前 20 分钟）'}
                  </span>}
                  value={recommendedSleep ?? '—'}
                  valueStyle={{
                    color: indulge && !tomorrowIsWorkday ? '#c2410c' : '#3d6d68',
                    fontSize: 22, fontWeight: 700,
                  }}
                />
                {/* 休息日专属：放纵一下 —— 不按睡够时长倒推，改用宽松的习惯窗口 */}
                {!tomorrowIsWorkday && (
                  <Tooltip title={indulge ? '点一下回到「睡够时长」模式' : '明天不上班，按平时习惯就好（平均入睡 −20min）'}>
                    <Button
                      size="small"
                      onClick={() => setIndulge((v) => !v)}
                      style={{
                        fontSize: 11, flexShrink: 0, marginTop: 2,
                        background: indulge ? '#fff7ed' : undefined,
                        borderColor: indulge ? '#fdba74' : undefined,
                        color: indulge ? '#c2410c' : '#3d6d68',
                      }}
                    >
                      {indulge ? '🛋️ 放纵中' : '🛋️ 放纵一下'}
                    </Button>
                  </Tooltip>
                )}
              </div>
              {/* 预计睡眠时长：仅在「睡够时长」模式下有意义，限制 8h ~ 9h */}
              {(tomorrowIsWorkday || (restWake && !indulge)) && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#3d6d68' }}>预计睡</span>
                  <TimePicker
                    value={sleepGoal}
                    onChange={(v) => v && setSleepGoal(v)}
                    format="HH:mm"
                    minuteStep={10}
                    allowClear={false}
                    needConfirm={false}
                    inputReadOnly
                    size="small"
                    style={{ width: 96 }}
                    disabledTime={() => ({
                      // 限制只能选 08:00 / 08:30 / 09:00（最少 8h、最多 9h）
                      disabledHours: () => Array.from({ length: 24 }, (_, i) => i).filter((h) => h !== 8 && h !== 9),
                      disabledMinutes: (h) => (h === 9 ? Array.from({ length: 60 }, (_, i) => i).filter((m) => m !== 0) : []),
                    })}
                    hideDisabledOptions
                  />
                </div>
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* 睡前倒计时：从目标入睡时间往前推几个关键锚点（用户自定义），不排满整晚，留白抗打乱 */}
      {windDownAnchors.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 16, background: '#fff', border: '1px solid #c8dcd6' }}
          title={
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3d6d68' }}>
              🌙 今晚倒计时 · 目标 {recommendedSleep}
            </span>
          }
          extra={
            <Space size={0}>
              <Button size="small" type="text" icon={<MobileOutlined />} onClick={() => setWallpaperOpen(true)}>
                壁纸
              </Button>
              <Button size="small" type="text" icon={<SettingOutlined />} onClick={openWindDownConfig}>
                配置
              </Button>
            </Space>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {windDownAnchors.map((step) => {
              const checked = !!windDownChecks[step.key]
              const isWorryStep = step.label.includes('焦虑') || step.hint.includes('焦虑')
              return (
                <div
                  key={step.key}
                  onClick={() => toggleWindDownStep(step.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                    background: checked ? '#f0fdfa' : '#f7faf8',
                    border: `1px solid ${checked ? '#a7f3d0' : '#e5e7eb'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {checked ? <CheckCircleFilled style={{ color: '#4a8a83' }} /> : step.icon}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#3d6d68', flexShrink: 0, width: 48 }}>
                    {step.time}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: 13, color: checked ? '#9ca3af' : '#1e1826',
                      textDecoration: checked ? 'line-through' : 'none',
                    }}>
                      {step.label}
                    </span>
                    {step.hint && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{step.hint}</span>}
                  </div>
                  {isWorryStep && dueWorryCount > 0 && (
                    <Link
                      to="/worry"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 11, color: '#d97706', background: '#fef3c7',
                        padding: '1px 8px', borderRadius: 10, flexShrink: 0,
                      }}
                    >
                      {dueWorryCount} 条待处理 →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* 手机壁纸视图：19.8:9 竖版，一键导出 PNG */}
      <Modal
        title="锁屏壁纸"
        open={wallpaperOpen}
        onCancel={() => setWallpaperOpen(false)}
        footer={null}
        centered
        width={356}
        styles={{ body: { padding: '4px 0 0' } }}
      >
        <Button
          type="primary"
          size="large"
          block
          icon={<DownloadOutlined />}
          onClick={handleExportWallpaper}
          style={{ height: 46, fontSize: 15, fontWeight: 600, marginBottom: 14 }}
        >
          保存壁纸（1080×2376）
        </Button>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <WallpaperCanvas
            canvasRef={wallpaperCanvasRef}
            anchors={windDownAnchors}
            targetTime={recommendedSleep}
            isWorkday={tomorrowIsWorkday}
          />
        </div>

        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10, lineHeight: 1.6 }}>
          已按你的屏幕分辨率输出，保存后直接设为锁屏壁纸即可<br />
          若浏览器没自动下载，长按上方图片保存
        </p>
      </Modal>

      {/* 锚点配置弹窗 */}
      <Modal
        title="配置睡前倒计时锚点"
        open={windDownConfigOpen}
        onOk={handleSaveWindDownConfig}
        onCancel={() => setWindDownConfigOpen(false)}
        confirmLoading={windDownSaving}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <p style={{ color: '#6b7280', fontSize: 13, margin: '8px 0 16px' }}>
          「提前 N 分钟」是相对今晚目标入睡时间的偏移，建议只设几个关键点，别排满整晚——排太满一旦被打乱容易直接放弃。
        </p>
        <Form form={windDownForm} layout="vertical">
          <Form.List name="steps">
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field) => (
                  <Space.Compact key={field.key} style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item name={[field.name, 'key']} noStyle hidden><Input /></Form.Item>
                    <Form.Item name={[field.name, 'icon']} noStyle>
                      <Select
                        placeholder="🌙"
                        style={{ width: 72 }}
                        options={WIND_DOWN_ICON_PRESETS.map((emoji) => ({ value: emoji, label: emoji }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'offsetMin']}
                      noStyle
                      rules={[{ required: true, message: '提前分钟' }]}
                    >
                      <InputNumber min={0} max={240} step={5} placeholder="提前分钟" style={{ width: 100 }} addonAfter="分" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'label']}
                      noStyle
                      rules={[{ required: true, message: '请填名称' }]}
                    >
                      <Input placeholder="名称（如 手机离开卧室）" style={{ flex: 1 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'hint']} noStyle>
                      <Input placeholder="备注（可选）" style={{ width: 140 }} />
                    </Form.Item>
                    <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                  </Space.Compact>
                ))}
                {fields.length < MAX_WIND_DOWN_STEPS && (
                  <Button
                    type="dashed"
                    onClick={() => add({ icon: '🌙', offsetMin: 30, label: '', hint: '' })}
                    icon={<PlusOutlined />}
                    block
                  >
                    添加锚点
                  </Button>
                )}
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* 记录列表 */}
      <Card>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
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

// ─── 手机壁纸视图 ────────────────────────────────────────────
// 直接用 canvas 按真机分辨率 1080×2376（19.8:9）绘制，预览用 CSS 缩到 300px 宽显示。
// 预览和导出是同一份像素，所见即所得，导出无需再手动截图。

const WP_W = 1080
const WP_H = 2376

interface WallpaperAnchor {
  key: string
  icon: string
  label: string
  hint: string
  time: string
}

function drawWallpaper(
  canvas: HTMLCanvasElement,
  anchors: WallpaperAnchor[],
  targetTime: string | null,
  workday: boolean,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = WP_W
  canvas.height = WP_H

  const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  const setFont = (size: number, weight: number | string = 400, spacing = 0) => {
    ctx.font = `${weight} ${size}px ${FONT}`
    // letterSpacing 需要较新的浏览器支持，不支持时自动忽略，不影响主体排版
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`
  }

  // 深青绿渐变背景（对应原设计的 170deg linear-gradient）
  const g = ctx.createLinearGradient(0, 0, WP_W * 0.35, WP_H)
  g.addColorStop(0, '#0b1f1d')
  g.addColorStop(0.45, '#123330')
  g.addColorStop(1, '#1a4642')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WP_W, WP_H)

  ctx.textBaseline = 'top'
  const padX = 72
  let y = 150 + 300 // 上内边距 + 给锁屏系统时钟让出的空白

  ctx.textAlign = 'center'
  setFont(38, 400, 6)
  ctx.fillStyle = '#7fb3ac'
  ctx.fillText('今晚睡觉', WP_W / 2, y)
  y += 38 + 18

  setFont(150, 200, -2)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(targetTime ?? '--:--', WP_W / 2, y)
  y += 150 + 20

  setFont(30, 400, 0)
  ctx.fillStyle = '#5d8f89'
  ctx.fillText(workday ? '明天上班 · 起床 7:35' : '休息日', WP_W / 2, y)
  y += 30 + 110

  // 锚点列表：图标 / 时间 / 文案 三列
  const iconCx = padX + 32
  const timeX = padX + 64 + 34
  const labelX = timeX + 180 + 34

  for (const step of anchors) {
    const hasHint = !!step.hint
    const labelH = 40 * 1.25 + (hasHint ? 6 + 28 * 1.3 : 0)
    const rowH = Math.max(60, labelH)
    const midY = y + rowH / 2

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    setFont(52, 400, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(step.icon, iconCx, midY)

    ctx.textAlign = 'left'
    setFont(60, 500, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(step.time, timeX, midY)

    ctx.textBaseline = 'top'
    const labelTop = midY - labelH / 2
    setFont(40, 400, 0)
    ctx.fillStyle = '#cfe3df'
    ctx.fillText(step.label, labelX, labelTop)
    if (hasHint) {
      setFont(28, 400, 0)
      ctx.fillStyle = '#5d8f89'
      ctx.fillText(step.hint, labelX, labelTop + 40 * 1.25 + 6)
    }

    y += rowH + 46
  }

  // 底部标识（留白避开解锁手势区）
  ctx.textAlign = 'center'
  setFont(26, 400, 4)
  ctx.fillStyle = '#3f6b66'
  ctx.fillText('SelfTend', WP_W / 2, WP_H - 120 - 26)
}

function WallpaperCanvas({
  canvasRef,
  anchors,
  targetTime,
  isWorkday: workday,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  anchors: WallpaperAnchor[]
  targetTime: string | null
  isWorkday: boolean
}) {
  useEffect(() => {
    if (canvasRef.current) drawWallpaper(canvasRef.current, anchors, targetTime, workday)
  }, [canvasRef, anchors, targetTime, workday])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: 300,
        height: 300 * (WP_H / WP_W),
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        display: 'block',
      }}
    />
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
