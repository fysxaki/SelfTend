import { EditOutlined, PlusOutlined, TrophyOutlined } from '@ant-design/icons'
import { Button, DatePicker, Form, Input, Modal, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { createSeason, getSeasons, updateSeason } from '@/api'
import { useAppStore } from '@/stores/useAppStore'
import type { Season } from '@/types'

export default function SeasonPage() {
  const { currentSeason, setCurrentSeason } = useAppStore()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Season | null>(null)
  const [form] = Form.useForm()

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
      // 如果当前赛季就是被编辑的那个，同步更新 store
      if (currentSeason?.id === editing.id) {
        setCurrentSeason(updated)
      }
    } else {
      const season = await createSeason(payload)
      message.success('赛季创建成功')
      setCurrentSeason(season)
    }
    setModalOpen(false)
    fetchSeasons()
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
              {/* 编辑按钮 */}
              <button
                onClick={(e) => openEdit(season, e)}
                title="编辑赛季"
                style={{
                  position: 'absolute', top: 16, right: 16,
                  border: '1px solid #e4deff',
                  background: 'transparent',
                  borderRadius: 8,
                  width: 28, height: 28,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#9ca3af', fontSize: 13,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.borderColor = '#7c3aed' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e4deff' }}
              >
                <EditOutlined />
              </button>

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
    </div>
  )
}
