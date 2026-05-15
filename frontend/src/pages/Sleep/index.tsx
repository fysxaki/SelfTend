import {
  DeleteOutlined,
  EditOutlined,
  MoonOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Modal,
  Popconfirm,
  Space,
  Table,
  TimePicker,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  createSleepLog,
  deleteSleepLog,
  getSleepLogs,
  updateSleepLog,
} from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import { useAppStore } from '@/stores/useAppStore'
import type { SleepLog } from '@/types'

const { Title, Text } = Typography

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
    form.setFieldsValue({
      date: dayjs(),
      wake_time: dayjs('08:49', 'HH:mm'),
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
            parts.push(`🌙 晚睡扣 ${log.penalty_exp.toFixed(1)} 分`)
          else if (isToday)
            parts.push(`🌙 晚睡惩罚已激活（今日后续任务将扣20%）`)
          else
            parts.push(`🌙 ${dateLabel} 晚睡已标记`)
        }
        if (log.bonus_exp > 0)
          parts.push(`⏰ ${dateLabel}睡眠奖励 +${log.bonus_exp.toFixed(0)} 分`)
        if (log.bonus_exp < 0)
          parts.push(`😴 ${dateLabel}睡眠不足扣 ${Math.abs(log.bonus_exp).toFixed(1)} 分`)
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
          <MoonOutlined style={{ color: '#a78bfa' }} />
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
            <span className="title-highlight" style={{ fontSize: 19, fontWeight: 700, color: '#5b21b6' }}>
              <MoonOutlined style={{ marginRight: 6, color: '#a78bfa' }} />睡眠记录
            </span>
            <span className="font-script" style={{ fontSize: 26, color: '#a78bfa' }}>Sleep</span>
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            超过 01:30 入睡扣20% · &lt;6h 扣20% · 7-8h +12分 · ≥8h +52分
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
                <WarningOutlined style={{ color: '#d97706' }} />
                <Text style={{ color: '#92400e' }}>
                  昨晚 {todayLog.sleep_time} 入睡，晚睡{todayLog.penalty_exp > 0
                    ? <>扣除 <strong>{todayLog.penalty_exp.toFixed(1)}</strong> 积分</>
                    : '惩罚已激活，后续任务将扣20%'}
                </Text>
              </Space>
            )}
            {todayLog.bonus_exp > 0 && (
              <Space>
                <span>🎉</span>
                <Text style={{ color: '#166534' }}>
                  睡了 {Math.floor(todayLog.duration)}h{Math.round((todayLog.duration % 1) * 60)}m，奖励 <strong>+{todayLog.bonus_exp.toFixed(0)}</strong> 积分
                </Text>
              </Space>
            )}
            {todayLog.bonus_exp < 0 && (
              <Space>
                <WarningOutlined style={{ color: '#d97706' }} />
                <Text style={{ color: '#92400e' }}>
                  睡眠不足6小时，额外扣除 <strong>{Math.abs(todayLog.bonus_exp).toFixed(1)}</strong> 积分
                </Text>
              </Space>
            )}
          </Space>
        </Card>
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
            extra="默认 08:52，可按实际调整"
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
