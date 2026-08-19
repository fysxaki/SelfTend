import {
  CheckCircleFilled,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  LockOutlined,
  PlusOutlined,
  ShoppingOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Form, Input, InputNumber, Modal, Select, Table, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  createPrize,
  deletePrize,
  getPrizes,
  getRedemptions,
  redeemPrize,
  updatePrize,
} from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import { useAppStore } from '@/stores/useAppStore'
import type { Prize, RedemptionLog } from '@/types'
import { formatExp } from '@/utils/task'

const CATEGORY_META: Record<string, { icon: string; label: string }> = {
  camera: { icon: '📸', label: '相机' },
  watch:  { icon: '⌚', label: '手表' },
  phone:  { icon: '📱', label: '手机' },
  other:  { icon: '🎁', label: '其他' },
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([v, m]) => ({
  value: v,
  label: `${m.icon} ${m.label}`,
}))

export default function Rewards() {
  const { stats, fetchStats } = useAppStore()
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Prize | null>(null)
  const [form] = Form.useForm()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [redemptions, setRedemptions] = useState<RedemptionLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchData = async () => {
    const [p] = await Promise.all([getPrizes(), fetchStats()])
    setPrizes(p)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ category: 'other' })
    setModalOpen(true)
  }

  const openEdit = (prize: Prize, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(prize)
    form.setFieldsValue(prize)
    setModalOpen(true)
  }

  const handleDelete = async (prize: Prize, e: React.MouseEvent) => {
    e.stopPropagation()
    Modal.confirm({
      title: `删除「${prize.name}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deletePrize(prize.id)
        message.success('已删除')
        fetchData()
      },
    })
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editing) {
      await updatePrize(editing.id, values)
      message.success('已更新')
    } else {
      await createPrize(values)
      message.success('奖品已添加')
    }
    setModalOpen(false)
    fetchData()
  }

  const openHistory = async () => {
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      setRedemptions(await getRedemptions())
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleRedeem = (prize: Prize) => {
    Modal.confirm({
      title: `兑换 ${prize.name}？`,
      content: (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: '#6b7280' }}>
            将消耗{' '}
            <strong style={{ color: '#4a8a83' }}>{formatExp(prize.cost)} 积分</strong>
          </p>
          <p style={{ color: '#6b7280', marginTop: 4 }}>
            兑换后积分不可退回，确定继续吗？
          </p>
        </div>
      ),
      okText: '确认兑换',
      cancelText: '再想想',
      onOk: async () => {
        try {
          const res = await redeemPrize(prize.id)
          message.success(`🎉 恭喜兑换 ${prize.name}！`)
          useAppStore.setState({ stats: res.stats })
          fetchData()
        } catch (err: unknown) {
          const e = err as { response?: { data?: { error?: string } } }
          message.error(e?.response?.data?.error ?? '兑换失败')
        }
      },
    })
  }

  const spendable = stats?.spendable_exp ?? 0
  const total = stats?.total_exp ?? 0
  const level = stats?.level ?? 1

  const grouped = prizes.reduce<Record<string, Prize[]>>((acc, p) => {
    const cat = p.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />

      {/* 页面标题 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, position: 'relative', zIndex: 1 }}>
        <span className="title-highlight" style={{ fontSize: 19, fontWeight: 700, color: '#2f5d59' }}>奖励</span>
        <span className="font-script" style={{ fontSize: 26, color: '#6ba39d' }}>Rewards</span>
      </div>

      {/* 顶部积分卡 */}
      <div
        style={{
          background: 'linear-gradient(135deg, #9bc9c3 0%, #6ba39d 50%, #3d6d68 100%)',
          borderRadius: 20,
          padding: '24px 28px',
          marginBottom: 28,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: '0 4px 18px rgba(74, 138, 131, 0.3)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#f4f9f7', fontSize: 13, marginBottom: 6, opacity: 0.9 }}>可用积分</div>
          <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' }}>
            {formatExp(spendable)}
          </div>
          <div style={{ color: '#e6f1ee', fontSize: 13, marginTop: 10 }}>
            累计获得 <span style={{ color: '#fff', fontWeight: 700 }}>{formatExp(total)}</span> 积分 · Lv.<span style={{ color: '#fff', fontWeight: 700 }}>{level}</span>
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <ShoppingOutlined style={{ fontSize: 40, color: 'rgba(255,255,255,0.25)' }} />
          <Button
            icon={<PlusOutlined />}
            size="small"
            onClick={openCreate}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
          >
            添加奖品
          </Button>
          <Button
            icon={<HistoryOutlined />}
            size="small"
            onClick={openHistory}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
          >
            兑换记录
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>加载中...</div>
      ) : prizes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <ShoppingOutlined style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
          还没有奖品，点击上方「添加奖品」开始设置目标
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => {
          const meta = CATEGORY_META[cat] ?? CATEGORY_META.other
          return (
            <section key={cat} style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e1826', marginBottom: 14 }}>
                {meta.icon} {meta.label}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {items.map((prize) => {
                  const canAfford = spendable >= prize.cost
                  const progress = Math.min((spendable / prize.cost) * 100, 100)

                  return (
                    <div
                      key={prize.id}
                      style={{
                        background: prize.redeemed ? '#f9fafb' : '#ffffff',
                        border: `1.5px solid ${
                          prize.redeemed ? '#d1fae5' : canAfford ? '#4a8a83' : '#c8dcd6'
                        }`,
                        borderRadius: 14,
                        padding: 18,
                        position: 'relative',
                        opacity: prize.redeemed ? 0.75 : 1,
                        boxShadow: canAfford && !prize.redeemed
                          ? '0 0 0 3px rgba(74,138,131,0.1)'
                          : 'none',
                      }}
                    >
                      {/* 操作按钮（右上角） */}
                      {!prize.redeemed && (
                        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
                          <button
                            onClick={(e) => openEdit(prize, e)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#4a8a83' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af' }}
                          >
                            <EditOutlined />
                          </button>
                          <button
                            onClick={(e) => handleDelete(prize, e)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af' }}
                          >
                            <DeleteOutlined />
                          </button>
                        </div>
                      )}
                      {prize.redeemed && (
                        <CheckCircleFilled style={{ position: 'absolute', top: 14, right: 14, color: '#16a34a', fontSize: 18 }} />
                      )}

                      {/* 名称 */}
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1e1826', marginBottom: 4, paddingRight: 48 }}>
                        {prize.name}
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                        {prize.description}
                      </div>

                      {/* 进度条 */}
                      {!prize.redeemed && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af', marginBottom: 5 }}>
                            <span>{formatExp(spendable)} / {formatExp(prize.cost)} 积分</span>
                            <span>{Math.floor(progress)}%</span>
                          </div>
                          <div style={{ height: 6, background: '#e6f1ee', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${progress}%`,
                              background: canAfford ? '#4a8a83' : '#6ba39d',
                              borderRadius: 3,
                              transition: 'width 0.4s ease',
                            }} />
                          </div>
                        </div>
                      )}

                      {/* 积分 + 兑换 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: prize.redeemed ? '#16a34a' : canAfford ? '#4a8a83' : '#6ba39d' }}>
                          {prize.redeemed ? '✓ 已兑换' : `${formatExp(prize.cost)} 积分`}
                        </span>
                        {!prize.redeemed && (
                          <Button
                            type={canAfford ? 'primary' : 'default'}
                            size="small"
                            icon={canAfford ? <ShoppingOutlined /> : <LockOutlined />}
                            disabled={!canAfford}
                            onClick={() => handleRedeem(prize)}
                            style={canAfford ? {} : { color: '#b8d8d3', borderColor: '#c8dcd6' }}
                          >
                            {canAfford ? '立即兑换' : `还差 ${formatExp(prize.cost - spendable)} 分`}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })
      )}

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editing ? '编辑奖品' : '添加奖品'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="奖品名称" rules={[{ required: true }]}>
            <Input placeholder="例：索尼 ZV-E10" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="简单说明" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="category" label="分类" rules={[{ required: true }]}>
              <Select options={CATEGORY_OPTIONS} />
            </Form.Item>
            <Form.Item name="cost" label="所需积分" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder="例：4000" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 兑换记录抽屉 */}
      <Drawer
        title="兑换记录"
        placement="right"
        width={480}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      >
        <Table
          dataSource={redemptions}
          rowKey="id"
          loading={historyLoading}
          pagination={false}
          size="small"
          locale={{ emptyText: '还没有兑换过任何奖品' }}
          columns={[
            {
              title: '奖品',
              dataIndex: 'prize_name',
              key: 'prize_name',
              render: (name: string, r: RedemptionLog) => {
                const meta = CATEGORY_META[r.prize_category] ?? CATEGORY_META.other
                return <span>{meta.icon} {name}</span>
              },
            },
            {
              title: '花费',
              dataIndex: 'cost',
              key: 'cost',
              align: 'right',
              render: (cost: number) => `${formatExp(cost)} 分`,
            },
            {
              title: '兑换时间',
              dataIndex: 'redeemed_at',
              key: 'redeemed_at',
              render: (t: string) => dayjs(t).format('MM/DD HH:mm'),
            },
          ]}
        />
      </Drawer>
    </div>
  )
}
