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
    })
    setModalOpen(true)
  }

  const openEdit = (log: SleepLog) => {
    setEditingLog(log)
    form.setFieldsValue({
      date: dayjs(log.date),
      sleep_time: dayjs(log.sleep_time, 'HH:mm'),
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const sleepTimeStr = (values.sleep_time as dayjs.Dayjs).format('HH:mm')

      if (editingLog) {
        await updateSleepLog(editingLog.id, { sleep_time: sleepTimeStr })
        message.success('已更新睡眠记录')
      } else {
        const dateStr = (values.date as dayjs.Dayjs).format('YYYY-MM-DD')
        const log = await createSleepLog({ date: dateStr, sleep_time: sleepTimeStr })
        if (log.penalized) {
          message.warning(
            `记录成功，但因入睡时间晚于 01:30，扣除今日积分 ${log.penalty_exp.toFixed(1)} 分`,
            5,
          )
        } else {
          message.success('睡眠记录已保存')
        }
      }

      setModalOpen(false)
      await Promise.all([loadLogs(), fetchStats()])
    } catch (e: any) {
      const msg = e?.response?.data?.error || '操作失败'
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
      title: '惩罚',
      key: 'penalty',
      render: (_: any, record: SleepLog) =>
        record.penalized ? (
          <Text type="danger">-{record.penalty_exp.toFixed(1)} 分</Text>
        ) : (
          <Text type="success">无</Text>
        ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: SleepLog) => (
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
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {/* 顶部标题 + 今日状态 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <MoonOutlined style={{ marginRight: 8, color: '#a78bfa' }} />
            睡眠记录
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            起床时间固定 08:40 · 超过 01:30 入睡扣今日积分 20%
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

      {/* 今日惩罚提示 */}
      {todayLog?.penalized && (
        <Card
          style={{
            marginBottom: 16,
            background: '#fef3c7',
            border: '1px solid #fcd34d',
          }}
          size="small"
        >
          <Space>
            <WarningOutlined style={{ color: '#d97706', fontSize: 16 }} />
            <Text style={{ color: '#92400e' }}>
              昨晚 {todayLog.sleep_time} 入睡，超过 01:30 阈值，扣除{' '}
              <strong>{todayLog.penalty_exp.toFixed(1)}</strong> 积分
            </Text>
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
        destroyOnClose
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
              minuteStep={5}
              showNow={false}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
