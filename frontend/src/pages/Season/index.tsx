import { EditOutlined, ImportOutlined, PlusOutlined, TrophyOutlined } from '@ant-design/icons'
import { Button, Checkbox, DatePicker, Form, Input, Modal, Select, Space, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { createSeason, getIncompleteSeasonTasks, getSeasons, getTasks, inheritTasks, updateSeason } from '@/api'
import { useAppStore } from '@/stores/useAppStore'
import type { Season, Task } from '@/types'

const { Text } = Typography

export default function SeasonPage() {
  const { currentSeason, setCurrentSeason } = useAppStore()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Season | null>(null)
  const [form] = Form.useForm()

  // 继承弹窗状态
  const [inheritOpen, setInheritOpen] = useState(false)
  const [inheritTasks_, setInheritTasks_] = useState<Task[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [newSeasonId, setNewSeasonId] = useState<number | null>(null)  // 目标赛季
  const [sourceSeasonId, setSourceSeasonId] = useState<number | null>(null) // 来源赛季
  const [inheriting, setInheriting] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)

  const fetchSeasons = async () => {
    const data = await getSeasons()
    setSeasons(data)
    if (data.length > 0 && !currentSeason) {
      setCurrentSeason(data[data.length - 1])
    }
  }

  useEffect(() => { fetchSeasons() }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      range: [dayjs(), dayjs().add(30, 'day')],
    })
    setModalOpen(true)
  }

  const openEdit = (season: Season, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(season)
    form.setFieldsValue({
      name: season.name,
      theme: season.theme,
      range: [dayjs(season.start_date), dayjs(season.end_date)],
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = {
      name: values.name,
      theme: values.theme,
      start_date: values.range[0].format('YYYY-MM-DD'),
      end_date: values.range[1].format('YYYY-MM-DD'),
    }

    if (editing) {
      const updated = await updateSeason(editing.id, payload)
      message.success('赛季已更新')
      if (currentSeason?.id === editing.id) setCurrentSeason(updated)
      setModalOpen(false)
      fetchSeasons()
    } else {
      const season = await createSeason(payload)
      setCurrentSeason(season)
      setModalOpen(false)
      await fetchSeasons()

      // 检测上一赛季是否有未完成的赛季任务
      if (currentSeason) {
        const incomplete = await getIncompleteSeasonTasks(currentSeason.id)
        if (incomplete && incomplete.length > 0) {
          setNewSeasonId(season.id)
          setInheritTasks_(incomplete)
          setSelectedIds(incomplete.map((t) => t.id)) // 默认全选
          setInheritOpen(true)
          return
        }
      }
      message.success('赛季创建成功')
    }
  }

  // 手动触发继承：点赛季卡片上的「继承任务」按钮
  const openInheritManual = async (targetSeason: Season, e: React.MouseEvent) => {
    e.stopPropagation()
    const otherSeasons = seasons.filter((s) => s.id !== targetSeason.id)
    if (otherSeasons.length === 0) {
      message.warning('没有其他赛季可以继承')
      return
    }
    setNewSeasonId(targetSeason.id)
    // 默认选上一个赛季作为来源
    const defaultSource = otherSeasons[0]
    setSourceSeasonId(defaultSource.id)
    await fetchIncompleteTasks(defaultSource.id)
    setInheritOpen(true)
  }

  // 切换来源赛季时重新拉任务
  const onSourceChange = async (id: number) => {
    setSourceSeasonId(id)
    await fetchIncompleteTasks(id)
  }

  const fetchIncompleteTasks = async (fromSeasonId: number) => {
    setLoadingTasks(true)
    try {
      // 每日/每周：全部带入（习惯类，无"完成"概念）
      // 赛季任务：只带入未完成的
      const [allTasks, incompleteSeason] = await Promise.all([
        getTasks(fromSeasonId),           // 全部任务（含完成状态）
        getIncompleteSeasonTasks(fromSeasonId), // 未完成赛季任务
      ])
      const incompleteSeasonIds = new Set((incompleteSeason || []).map((t) => t.id))
      // 过滤：每日/每周全部保留，赛季/一次性任务只保留未完成的
      const toInherit = (allTasks || []).filter(
        (t) => (t.type !== 'season' && t.type !== 'once') || incompleteSeasonIds.has(t.id)
      )
      setInheritTasks_(toInherit)
      setSelectedIds(toInherit.map((t) => t.id))
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleInherit = async () => {
    if (!newSeasonId) return
    setInheriting(true)
    try {
      if (selectedIds.length > 0) {
        const { created } = await inheritTasks(newSeasonId, selectedIds)
        message.success(`已带入 ${created} 个目标`)
      } else {
        message.info('未选择任何目标')
      }
    } finally {
      setInheriting(false)
      setInheritOpen(false)
      setInheritTasks_([])
      setSelectedIds([])
      setNewSeasonId(null)
      setSourceSeasonId(null)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e1826' }}>赛季</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建赛季</Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {seasons.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0', color: '#9ca3af' }}>
            <TrophyOutlined style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
            还没有赛季，创建你的第一个赛季吧
          </div>
        )}
        {seasons.map((season) => {
          const isActive = currentSeason?.id === season.id
          const isExpired = dayjs(season.end_date).isBefore(dayjs(), 'day')
          const daysLeft = dayjs(season.end_date).diff(dayjs(), 'day')

          return (
            <div
              key={season.id}
              onClick={() => setCurrentSeason(season)}
              style={{
                padding: '18px 20px',
                borderRadius: 14,
                border: `1.5px solid ${isActive ? '#7c3aed' : '#e4deff'}`,
                background: isActive ? '#faf8ff' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: isActive ? '0 0 0 3px rgba(124,58,237,0.1)' : 'none',
                position: 'relative',
              }}
            >
              {/* 操作按钮组 */}
              <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6 }}>
                {seasons.length > 1 && (
                  <button
                    onClick={(e) => openInheritManual(season, e)}
                    title="从其他赛季继承未完成目标"
                    style={{
                      border: '1px solid #e4deff', background: 'transparent',
                      borderRadius: 8, width: 28, height: 28, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#9ca3af', fontSize: 13, transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.borderColor = '#7c3aed' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e4deff' }}
                  >
                    <ImportOutlined />
                  </button>
                )}
                <button
                  onClick={(e) => openEdit(season, e)}
                  title="编辑赛季"
                  style={{
                    border: '1px solid #e4deff', background: 'transparent',
                    borderRadius: 8, width: 28, height: 28, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#9ca3af', fontSize: 13, transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.borderColor = '#7c3aed' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e4deff' }}
                >
                  <EditOutlined />
                </button>
              </div>

              <div style={{ paddingRight: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: '#1e1826' }}>{season.name}</span>
                  {isActive && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed', fontWeight: 500 }}>
                      当前
                    </span>
                  )}
                  {isExpired && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f3f4f6', color: '#9ca3af' }}>
                      已结束
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: '#9ca3af' }}>{season.theme || '—'}</span>
                  <div style={{ textAlign: 'right', fontSize: 13 }}>
                    <span style={{ color: '#9ca3af' }}>
                      {dayjs(season.start_date).format('YYYY/MM/DD')} — {dayjs(season.end_date).format('MM/DD')}
                    </span>
                    {!isExpired && (
                      <span style={{ marginLeft: 8, color: '#7c3aed', fontWeight: 500 }}>剩余 {daysLeft} 天</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        title={editing ? '编辑赛季' : '新建赛季'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="赛季名称" rules={[{ required: true }]}>
            <Input placeholder="例：四月自律季" />
          </Form.Item>
          <Form.Item name="theme" label="赛季主题 / 宣言">
            <Input placeholder="例：每天进步一点点，生活好一点点" />
          </Form.Item>
          <Form.Item name="range" label="时间范围" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 继承未完成任务弹窗 */}
      <Modal
        title="继承未完成的赛季目标"
        open={inheritOpen}
        onOk={handleInherit}
        onCancel={() => { setInheritOpen(false) }}
        okText={`带入 ${selectedIds.length} 个目标`}
        cancelText="取消"
        confirmLoading={inheriting}
        okButtonProps={{ disabled: selectedIds.length === 0 }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13 }}>从哪个赛季继承：</Text>
          </div>
          <Select
            style={{ width: '100%' }}
            value={sourceSeasonId}
            onChange={onSourceChange}
            loading={loadingTasks}
            options={seasons
              .filter((s) => s.id !== newSeasonId)
              .map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {loadingTasks ? '加载中...' : inheritTasks_.length === 0
              ? '该赛季没有未完成的赛季目标'
              : '勾选要带入的目标（默认全选）'}
          </Text>
        </div>
        {(() => {
          const groups = [
            { type: 'daily', label: '每日任务', color: '#059669', bg: '#ecfdf5' },
            { type: 'weekly', label: '每周任务', color: '#0284c7', bg: '#eff6ff' },
            { type: 'season', label: '赛季目标（未完成）', color: '#7c3aed', bg: '#faf8ff' },
            { type: 'once',   label: '一次性任务（未完成）', color: '#0891b2', bg: '#ecfeff' },
          ]
          return groups.map(({ type, label, color, bg }) => {
            const tasks = inheritTasks_.filter((t) => t.type === type)
            if (tasks.length === 0) return null
            const allSelected = tasks.every((t) => selectedIds.includes(t.id))
            const toggleGroup = () => {
              if (allSelected) {
                setSelectedIds((prev) => prev.filter((id) => !tasks.find((t) => t.id === id)))
              } else {
                setSelectedIds((prev) => [...new Set([...prev, ...tasks.map((t) => t.id)])])
              }
            }
            return (
              <div key={type} style={{ marginBottom: 14 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, cursor: 'pointer' }}
                  onClick={toggleGroup}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color, padding: '2px 8px', borderRadius: 6, background: bg }}>{label}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{allSelected ? '全不选' : '全选'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() =>
                        setSelectedIds((prev) =>
                          prev.includes(task.id)
                            ? prev.filter((id) => id !== task.id)
                            : [...prev, task.id],
                        )
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: `1.5px solid ${selectedIds.includes(task.id) ? color : '#e4deff'}`,
                        background: selectedIds.includes(task.id) ? bg : '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <Checkbox checked={selectedIds.includes(task.id)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#1e1826' }}>{task.title}</div>
                        {task.description && (
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{task.description}</div>
                        )}
                      </div>
                      <Space size={4}>
                        <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>{task.exp_reward} 分</Tag>
                      </Space>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        })()}
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            已选 {selectedIds.length} / {inheritTasks_.length} 个
          </Text>
        </div>
      </Modal>
    </div>
  )
}
