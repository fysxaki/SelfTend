import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Modal, Select, Table, Tag, message } from 'antd'
import { useEffect, useState } from 'react'
import { createTask, deleteTask, getTasks, updateTask } from '@/api'
import { useAppStore } from '@/stores/useAppStore'
import type { Task, TaskCategory, TaskDifficulty, TaskType } from '@/types'
import { CATEGORY_CONFIG, DIFFICULTY_CONFIG, TIMING_CONFIG, TIMING_OPTIONS } from '@/utils/task'

const TYPE_OPTIONS = [
  { label: '每日任务', value: 'daily' },
  { label: '每周任务', value: 'weekly' },
  { label: '赛季任务', value: 'season' },
]

export default function Tasks() {
  const { currentSeason } = useAppStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form] = Form.useForm()

  const fetchTasks = async () => {
    if (!currentSeason) return
    setLoading(true)
    const data = await getTasks(currentSeason.id)
    setTasks(data)
    setLoading(false)
  }

  useEffect(() => { fetchTasks() }, [currentSeason])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ type: 'daily', category: 'health', timing: 'anytime', difficulty: 'easy', exp_reward: 1 })
    setModalOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditing(task)
    form.setFieldsValue(task)
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    await deleteTask(id)
    message.success('已删除')
    fetchTasks()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editing) {
      await updateTask(editing.id, values)
      message.success('已更新')
    } else {
      await createTask({ ...values, season_id: currentSeason!.id, sort_order: tasks.length })
      message.success('已添加')
    }
    setModalOpen(false)
    fetchTasks()
  }

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'title',
      width: 160,
      render: (title: string, record: Task) => {
        const timing = record.timing ? TIMING_CONFIG[record.timing as keyof typeof TIMING_CONFIG] : null
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500, color: '#1e1826' }}>{title}</span>
              {timing && (
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed' }}>
                  {timing.icon} {timing.label}
                </span>
              )}
            </div>
            {record.description && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{record.description}</div>
            )}
          </div>
        )
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (type: TaskType) => {
        const map = { daily: '每日', weekly: '每周', season: '赛季' }
        const colorMap = { daily: 'blue', weekly: 'purple', season: 'gold' }
        return <Tag color={colorMap[type]}>{map[type]}</Tag>
      },
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 90,
      render: (cat: TaskCategory) => {
        const c = CATEGORY_CONFIG[cat]
        return (
          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, color: c.color, background: c.bg, fontWeight: 500 }}>
            {c.icon} {c.label}
          </span>
        )
      },
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      width: 70,
      render: (diff: TaskDifficulty) => {
        const d = DIFFICULTY_CONFIG[diff]
        return <span style={{ color: d.color, fontWeight: 500, fontSize: 13 }}>{d.label}</span>
      },
    },
    {
      title: '积分',
      dataIndex: 'exp_reward',
      width: 70,
      render: (exp: number) => (
        <span style={{ color: '#7c3aed', fontWeight: 600 }}>
          +{exp % 1 === 0 ? exp : exp.toFixed(1)}
        </span>
      ),
    },
    {
      title: '',
      width: 72,
      render: (_: unknown, record: Task) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button type="text" icon={<EditOutlined />} size="small" onClick={() => openEdit(record)} style={{ color: '#7c3aed' }} />
          <Button type="text" icon={<DeleteOutlined />} size="small" danger onClick={() => handleDelete(record.id)} />
        </div>
      ),
    },
  ]

  if (!currentSeason) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9ca3af' }}>
        请先创建赛季
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 32px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e1826' }}>任务管理</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建任务</Button>
      </div>

      {/* 横向可滚动表格 */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e4deff', overflow: 'hidden' }}>
        <Table
          dataSource={tasks}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 560 }}
          size="middle"
        />
      </div>

      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="任务名称" rules={[{ required: true }]}>
            <Input placeholder="例：洗脸" />
          </Form.Item>
          <Form.Item name="description" label="补充说明（可选）">
            <Input placeholder="例：早晚各一次" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="type" label="类型" rules={[{ required: true }]}>
              <Select options={TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="timing" label="执行时机" rules={[{ required: true }]}>
              <Select options={TIMING_OPTIONS} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="category" label="分类" rules={[{ required: true }]}>
              <Select options={Object.entries(CATEGORY_CONFIG).map(([v, c]) => ({ value: v, label: `${c.icon} ${c.label}` }))} />
            </Form.Item>
            <Form.Item name="difficulty" label="难度" rules={[{ required: true }]}>
              <Select options={Object.entries(DIFFICULTY_CONFIG).map(([v, d]) => ({ value: v, label: d.label }))} />
            </Form.Item>
            <Form.Item name="exp_reward" label="积分" rules={[{ required: true }]}>
              <InputNumber min={0.5} max={999} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
