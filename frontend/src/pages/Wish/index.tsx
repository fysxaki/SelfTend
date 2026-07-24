import {
  CheckCircleFilled,
  DeleteOutlined,
  HeartOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Modal, Progress, Spin, message } from 'antd'
import { useEffect, useState } from 'react'
import { createWish, deleteWish, getWishes } from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import { useAppStore } from '@/stores/useAppStore'
import type { Wish } from '@/types'
import { formatExp } from '@/utils/task'

export default function WishPage() {
  const { fetchStats } = useAppStore()
  const [wishes, setWishes] = useState<Wish[]>([])
  const [priceCap, setPriceCap] = useState(550)
  const [maxConcurrent, setMaxConcurrent] = useState(1)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const resp = await getWishes()
      setWishes(resp.wishes || [])
      setPriceCap(resp.price_cap_yuan)
      setMaxConcurrent(resp.max_concurrent)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const active = wishes.filter((w) => w.status === 'active')
  const done = wishes.filter((w) => w.status === 'done')
  const canAdd = active.length < maxConcurrent

  const openCreate = () => {
    form.resetFields()
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await createWish({
        title: values.title,
        reason: values.reason,
        price_yuan: values.price_yuan,
      })
      message.success('心愿已启用，从现在起每一分都在替你挣回它 🌱')
      setModalOpen(false)
      await Promise.all([load(), fetchStats()])
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      if (msg) message.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (wish: Wish) => {
    Modal.confirm({
      title: `删除「${wish.title}」？`,
      content: '删除不影响你已赚到的积分和等级，只是从心愿列表移除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteWish(wish.id)
        await load()
      },
    })
  }

  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />

      {/* 标题 */}
      <div style={{ marginBottom: 20, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="title-highlight" style={{ fontSize: 19, fontWeight: 700, color: '#2f5d59' }}>
            <HeartOutlined style={{ marginRight: 6, color: '#6ba39d' }} />心愿
          </span>
          <span className="font-script" style={{ fontSize: 26, color: '#6ba39d' }}>Wish</span>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          真正想要的东西，<strong style={{ color: '#3d6d68' }}>先买下，别再犹豫</strong>。之后新赚的积分 100% 优先注入这里，用自律把它挣成你应得的。
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* 进行中的心愿 */}
          {active.map((w) => (
            <ActiveWishCard key={w.id} wish={w} onDelete={handleDelete} />
          ))}

          {/* 启用入口 / 已满提示 */}
          {canAdd ? (
            <button
              onClick={openCreate}
              style={{
                width: '100%', padding: '18px', borderRadius: 16, cursor: 'pointer',
                border: '1.5px dashed #c8dcd6', background: '#f7faf8', color: '#3d6d68',
                fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, marginBottom: 24, transition: 'all 0.15s',
              }}
            >
              <PlusOutlined /> 启用一个心愿（先买下，再挣回）
            </button>
          ) : (
            <div style={{
              padding: '14px 16px', borderRadius: 12, background: '#f7faf8',
              border: '1px solid #c8dcd6', color: '#6b7280', fontSize: 13, marginBottom: 24,
            }}>
              同时只能进行 {maxConcurrent} 个心愿——先把上面这个挣回来，才能启用下一个。
            </div>
          )}

          {/* 已挣回的（历史） */}
          {done.length > 0 && (
            <section>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#4a8a83', marginBottom: 12 }}>
                你挣回来的 · {done.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {done.map((w) => (
                  <div
                    key={w.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: '#fff', border: '1.5px solid #c8dcd6',
                      borderLeft: '4px solid #4a8a83', borderRadius: 12, padding: '12px 14px',
                    }}
                  >
                    <CheckCircleFilled style={{ color: '#4a8a83', fontSize: 18 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: '#1e1826' }}>{w.title}</div>
                      {w.reason && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{w.reason}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: '#4a8a83', fontWeight: 600, flexShrink: 0 }}>
                      已还清 {formatExp(w.target_exp)}
                    </span>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(w)} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* 启用心愿弹窗 */}
      <Modal
        title="启用一个心愿"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="启用"
        cancelText="取消"
      >
        <p style={{ color: '#6b7280', fontSize: 13, margin: '8px 0 16px' }}>
          先用真钱把它买下来（别再犹豫、别再丢），登记在这里，之后每一分都在替你挣回它。
        </p>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="想要什么" rules={[{ required: true, message: '填一下心愿名称' }]}>
            <Input placeholder="例：导弹英雄 + 狙击 账号" />
          </Form.Item>
          <Form.Item name="reason" label="为什么想要（给自己的一句话）">
            <Input.TextArea
              placeholder="例：初中就想要，省饭钱都没舍得买，这次不留遗憾了"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item
            name="price_yuan"
            label={`花了多少钱（单笔上限 ¥${priceCap}）`}
            rules={[{ required: true, message: '填一下价格' }]}
            extra={`要挣回的积分 = 价格数字（1 分 = 1 元）。超过 ¥${priceCap} 的大额心愿，建议走「先攒够再买」。`}
          >
            <InputNumber
              min={1}
              max={priceCap}
              step={1}
              addonBefore="¥"
              style={{ width: '100%' }}
              placeholder="498"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function ActiveWishCard({ wish, onDelete }: { wish: Wish; onDelete: (w: Wish) => void }) {
  const pct = wish.target_exp > 0 ? Math.min(100, Math.round((wish.earned_exp / wish.target_exp) * 100)) : 0
  const remaining = Math.max(0, wish.target_exp - wish.earned_exp)

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #e6f1ee 0%, #f4f9f7 100%)',
        border: '1.5px solid #9bc9c3',
        borderRadius: 18,
        padding: '20px 22px',
        marginBottom: 20,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#4a8a83', letterSpacing: 1, marginBottom: 2 }}>挣回中</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e1826' }}>{wish.title}</div>
          {wish.reason && (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>
              「{wish.reason}」
            </div>
          )}
        </div>
        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDelete(wish)} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Progress
          percent={pct}
          strokeColor={{ from: '#6ba39d', to: '#4a8a83' }}
          trailColor="#d1e8e4"
          format={(p) => <span style={{ color: '#3d6d68', fontWeight: 600 }}>{p}%</span>}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          <span>已挣回 <strong style={{ color: '#3d6d68' }}>{formatExp(wish.earned_exp)}</strong> / {formatExp(wish.target_exp)} 分</span>
          <span>还差 {formatExp(remaining)} 分</span>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: '#4a8a83', background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 12px' }}>
        🌱 新赚的积分正在 100% 自动注入这里。填满那天，它就彻底是你应得的了。
      </div>
    </div>
  )
}
