import { BarChartOutlined, MoonOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Card, Col, Empty, Radio, Row, Spin, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getAnalytics } from '@/api'
import { FloatingDecorations } from '@/components/Decorations'
import type { AnalyticsItem } from '@/types'

const { Title, Text } = Typography

const ENERGY_COLOR = '#a78bfa'
const SLEEP_COLOR = '#38bdf8'
const PENALTY_COLOR = '#f87171'

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  payload?: Record<string, number>
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}

// 自定义 Tooltip（折线图）
const LineTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
      }}
    >
      <div style={{ color: '#e5e7eb', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}：{typeof p.value === 'number' ? p.value.toFixed(p.name === '能量值' ? 0 : 1) : p.value}
          {p.name === '睡眠时长' ? 'h' : ''}
          {p.name === '能量值' ? ' / 5' : ''}
        </div>
      ))}
    </div>
  )
}

// 自定义 Tooltip（散点图）
const ScatterTooltip = ({ active, payload }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div
      style={{
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
      }}
    >
      <div style={{ color: '#e5e7eb' }}>{d?.date}</div>
      <div style={{ color: SLEEP_COLOR }}>睡眠：{d?.x?.toFixed(1)}h</div>
      <div style={{ color: ENERGY_COLOR }}>能量：{d?.y} / 5</div>
      {d?.penalized && <div style={{ color: PENALTY_COLOR }}>触发惩罚</div>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'14' | '30' | '90'>('30')

  const loadData = async (days: number) => {
    setLoading(true)
    try {
      const start = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD')
      const end = dayjs().format('YYYY-MM-DD')
      const result = await getAnalytics({ start_date: start, end_date: end })
      setData(result || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(Number(range))
  }, [range])

  // 折线图数据：只要有任意一条记录的日期
  const lineData = useMemo(
    () =>
      data.map((item) => ({
        date: dayjs(item.date).format('MM/DD'),
        睡眠时长: item.duration > 0 ? Number(item.duration.toFixed(1)) : null,
        能量值: item.energy_level > 0 ? item.energy_level : null,
      })),
    [data],
  )

  // 散点图数据：睡眠时长 + 能量值都有记录的天
  const scatterData = useMemo(
    () =>
      data
        .filter((item) => item.duration > 0 && item.energy_level > 0)
        .map((item) => ({
          x: Number(item.duration.toFixed(2)),
          y: item.energy_level,
          date: item.date,
          penalized: item.penalized,
        })),
    [data],
  )

  // 简单线性回归（用于趋势线）
  const trendLine = useMemo(() => {
    if (scatterData.length < 3) return []
    const n = scatterData.length
    const sumX = scatterData.reduce((a, d) => a + d.x, 0)
    const sumY = scatterData.reduce((a, d) => a + d.y, 0)
    const sumXY = scatterData.reduce((a, d) => a + d.x * d.y, 0)
    const sumX2 = scatterData.reduce((a, d) => a + d.x * d.x, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    const minX = Math.min(...scatterData.map((d) => d.x))
    const maxX = Math.max(...scatterData.map((d) => d.x))
    return [
      { x: minX, trend: Number((slope * minX + intercept).toFixed(2)) },
      { x: maxX, trend: Number((slope * maxX + intercept).toFixed(2)) },
    ]
  }, [scatterData])

  // 统计摘要
  const stats = useMemo(() => {
    const withSleep = data.filter((d) => d.duration > 0)
    const withEnergy = data.filter((d) => d.energy_level > 0)
    const avgSleep =
      withSleep.length > 0
        ? withSleep.reduce((a, d) => a + d.duration, 0) / withSleep.length
        : 0
    const avgEnergy =
      withEnergy.length > 0
        ? withEnergy.reduce((a, d) => a + d.energy_level, 0) / withEnergy.length
        : 0
    const penaltyDays = data.filter((d) => d.penalized).length
    return { avgSleep, avgEnergy, penaltyDays, totalDays: data.length }
  }, [data])

  const isEmpty = data.length === 0

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <FloatingDecorations />
      {/* 标题 + 范围选择 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="title-highlight" style={{ fontSize: 19, fontWeight: 700, color: '#5b21b6' }}>
              <BarChartOutlined style={{ marginRight: 6, color: '#a78bfa' }} />数据分析
            </span>
            <span className="font-script" style={{ fontSize: 26, color: '#a78bfa' }}>Analytics</span>
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            看看睡得多是否真的让你更有能量
          </Text>
        </div>
        <Radio.Group
          value={range}
          onChange={(e) => setRange(e.target.value)}
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="14">近14天</Radio.Button>
          <Radio.Button value="30">近30天</Radio.Button>
          <Radio.Button value="90">近90天</Radio.Button>
        </Radio.Group>
      </div>

      {/* 统计摘要卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          {
            icon: <MoonOutlined style={{ fontSize: 20, color: SLEEP_COLOR }} />,
            value: `${stats.avgSleep.toFixed(1)}h`,
            label: '平均睡眠时长',
            color: SLEEP_COLOR,
            borderColor: '#1e3a5f',
          },
          {
            icon: <ThunderboltOutlined style={{ fontSize: 20, color: ENERGY_COLOR }} />,
            value: stats.avgEnergy.toFixed(1),
            label: '平均能量值 / 5',
            color: ENERGY_COLOR,
            borderColor: '#3b1f6b',
          },
          {
            icon: null,
            value: String(stats.penaltyDays),
            label: '触发惩罚天数',
            color: PENALTY_COLOR,
            borderColor: '#5f1f1f',
          },
        ].map((item, i) => (
          <Col key={i} span={8} style={{ display: 'flex' }}>
            <Card
              size="small"
              style={{
                flex: 1,
                textAlign: 'center',
                background: '#0f172a',
                border: `1px solid ${item.borderColor}`,
              }}
              styles={{
                body: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '16px 12px',
                },
              }}
            >
              {item.icon}
              <div style={{ fontSize: 26, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>
                {item.value}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{item.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : isEmpty ? (
        <Empty description="暂无数据，先去记录睡眠和能量吧" style={{ padding: 60 }} />
      ) : (
        <>
          {/* 双轴折线图 */}
          <Card
            title="睡眠时长 & 能量值趋势"
            style={{ marginBottom: 24 }}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>左轴：睡眠时长（h）· 右轴：能量值（1-5）</Text>}
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={lineData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="sleep"
                  domain={[0, 12]}
                  tick={{ fontSize: 11, fill: SLEEP_COLOR }}
                  label={{ value: 'h', position: 'insideTopLeft', fill: SLEEP_COLOR, fontSize: 11 }}
                />
                <YAxis
                  yAxisId="energy"
                  orientation="right"
                  domain={[0, 5]}
                  tickCount={6}
                  tick={{ fontSize: 11, fill: ENERGY_COLOR }}
                  label={{ value: '/5', position: 'insideTopRight', fill: ENERGY_COLOR, fontSize: 11 }}
                />
                <Tooltip content={<LineTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#9ca3af' }}
                />
                <Line
                  yAxisId="sleep"
                  type="monotone"
                  dataKey="睡眠时长"
                  stroke={SLEEP_COLOR}
                  strokeWidth={2}
                  dot={{ fill: SLEEP_COLOR, r: 3 }}
                  connectNulls
                />
                <Line
                  yAxisId="energy"
                  type="monotone"
                  dataKey="能量值"
                  stroke={ENERGY_COLOR}
                  strokeWidth={2}
                  dot={{ fill: ENERGY_COLOR, r: 3 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* 散点图 + 趋势线 */}
          <Card
            title="睡眠时长 vs 能量值（相关性）"
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {scatterData.length < 3
                  ? '数据不足，趋势线需至少 3 天同时记录'
                  : trendLine.length === 2 &&
                    (() => {
                      const slope =
                        (trendLine[1].trend - trendLine[0].trend) /
                        (trendLine[1].x - trendLine[0].x)
                      return slope > 0.1
                        ? '📈 睡得越多能量越高'
                        : slope < -0.1
                        ? '📉 相关性偏负，继续观察'
                        : '➡️ 相关性不明显'
                    })()}
              </Text>
            }
          >
            {scatterData.length === 0 ? (
              <Empty description="需要同时有睡眠记录和能量记录的天才能显示" style={{ padding: 40 }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 8, right: 24, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={['auto', 'auto']}
                    name="睡眠时长"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    label={{ value: '睡眠时长 (h)', position: 'insideBottom', offset: -8, fill: '#9ca3af', fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="y"
                    type="number"
                    domain={[0, 6]}
                    tickCount={6}
                    name="能量值"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    label={{ value: '能量值', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
                  />
                  <Tooltip content={<ScatterTooltip />} />
                  {/* 散点 */}
                  <Scatter
                    data={scatterData}
                    fill={ENERGY_COLOR}
                    opacity={0.8}
                  />
                  {/* 趋势线 */}
                  {trendLine.length === 2 && (
                    <Line
                      data={trendLine}
                      dataKey="trend"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      legendType="none"
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
