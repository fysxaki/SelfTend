import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd'
import { useEffect, useState } from 'react'
import { createTask, deleteTask, getTasks, updateTask } from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import { useAppStore } from '@/stores/useAppStore'
import type { Task, TaskCategory, TaskDifficulty, TaskType, TaskVariant } from '@/types'
import { CATEGORY_CONFIG, DIFFICULTY_CONFIG, MAX_VARIANTS, VARIANT_ICON_PRESETS, parseVariants } from '@/utils/task'

const TYPE_OPTIONS = [
  { label: '每日任务', value: 'daily' },
  { label: '每周任务', value: 'weekly' },
  { label: '赛季任务', value: 'season' },
  { label: '一次性任务', value: 'once' },
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTasks() }, [currentSeason])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ type: 'daily', category: 'health', difficulty: 'easy', exp_reward: 1, variants: [] })
    setModalOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditing(task)
    // variants 后端是 JSON 字符串，表单里用对象数组
    form.setFieldsValue({ ...task, variants: parseVariants(task.variants) })
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    await deleteTask(id)
    message.success('已删除')
    fetchTasks()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    // 把表单里的 variants 对象数组序列化成 JSON 字符串（后端约定）
    const variants = (values.variants as TaskVariant[] | undefined) ?? []
    const payload = {
      ...values,
      variants: variants.length > 0 ? JSON.stringify(variants) : '',
    }
    if (editing) {
      await updateTask(editing.id, payload)
      message.success('已更新')
    } else {
      await createTask({ ...payload, season_id: currentSeason!.id, sort_order: tasks.length })
      message.success('已添加')
    }
    setModalOpen(false)
    fetchTasks()
  }

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'title',
      width: 200,
      render: (title: string, record: Task) => {
        const vs = parseVariants(record.variants)
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500, color: '#1e1826' }}>{title}</span>
              {vs.length > 0 && (
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 20, background: '#f7faf8', color: '#4a8a83' }}>
                  ✨ {vs.length} 种方式
                </span>
              )}
            </div>
            {record.description && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{record.description}</div>
            )}
            {vs.length > 0 && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {vs.map((v, i) => (
                  <span key={i} style={{ marginRight: 6 }}>
                    {v.icon ? `${v.icon} ` : ''}{v.label}（{v.exp % 1 === 0 ? v.exp : v.exp.toFixed(1)}）
                  </span>
                ))}
              </div>
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
        const map = { daily: '每日', weekly: '每周', season: '赛季', once: '一次性' }
        const colorMap = { daily: 'blue', weekly: 'purple', season: 'gold', once: 'cyan' }
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
        return (
          <span style={{
            color: d.color, background: d.bg, fontWeight: 500, fontSize: 12,
            padding: '2px 8px', borderRadius: 20,
          }}>
            {d.label}
          </span>
        )
      },
    },
    {
      title: '积分',
      dataIndex: 'exp_reward',
      width: 70,
      render: (exp: number) => (
        <span style={{ color: '#4a8a83', fontWeight: 600 }}>
          +{exp % 1 === 0 ? exp : exp.toFixed(1)}
        </span>
      ),
    },
    {
      title: '',
      width: 72,
      render: (_: unknown, record: Task) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button type="text" icon={<EditOutlined />} size="small" onClick={() => openEdit(record)} style={{ color: '#4a8a83' }} />
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
    <div style={{ padding: '16px 16px 32px', maxWidth: 820, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="title-highlight" style={{ fontSize: 19, fontWeight: 700, color: '#2f5d59' }}>任务管理</span>
          <span className="font-script" style={{ fontSize: 26, color: '#6ba39d' }}>Tasks</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建任务</Button>
      </div>

      {/* 横向可滚动表格 */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #c8dcd6', overflow: 'hidden' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="type" label="类型" rules={[{ required: true }]}>
              <Select options={TYPE_OPTIONS} />
            </Form.Item>
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

          {/* 完成方式（可选）：配置后，点击任务时弹窗按方式给分 */}
          <Form.List name="variants">
            {(fields, { add, remove }) => (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#1e1826', fontWeight: 500 }}>
                    完成方式（可选 · 最多 {MAX_VARIANTS} 种）
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    例：早上(0.5) / 晚上(0.5) / 早晚都做(1)
                  </span>
                </div>

                {fields.map((field) => (
                  <Space.Compact key={field.key} style={{ display: 'flex', marginBottom: 6 }}>
                    <Form.Item
                      name={[field.name, 'icon']}
                      noStyle
                    >
                      <Select
                        allowClear
                        placeholder="图标"
                        style={{ width: 90 }}
                        options={VARIANT_ICON_PRESETS.map((emoji) => ({ value: emoji, label: emoji }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'label']}
                      noStyle
                      rules={[{ required: true, message: '请填名称' }]}
                    >
                      <Input placeholder="名称（如 早上）" style={{ flex: 1 }} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'exp']}
                      noStyle
                      rules={[{ required: true, message: '请填积分' }]}
                    >
                      <InputNumber min={0} max={999} step={0.5} placeholder="积分" style={{ width: 110 }} />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(field.name)}
                      danger
                    />
                  </Space.Compact>
                ))}

                {fields.length < MAX_VARIANTS && (
                  <Button
                    type="dashed"
                    onClick={() => add({ icon: '', label: '', exp: 0.5 })}
                    icon={<PlusOutlined />}
                    block
                  >
                    添加一种完成方式
                  </Button>
                )}
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}
