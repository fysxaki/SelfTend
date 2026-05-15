// 手账风 Section 标题
// 中文主标题用圆体，下面叠加一个手写英文副标题
// 中文带黄色高光下划线

interface Props {
  cn: string           // 中文主标题，如「今日任务」
  en?: string          // 英文手写副标题，如 "Today"
  count?: string       // 右侧小计数，如 "3/8"
  hint?: string        // 右侧提示
  color?: string       // 主标题颜色，默认紫蓝
}

export default function SectionTitle({ cn, en, count, hint, color = '#5b21b6' }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="title-highlight" style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>
          {cn}
        </span>
        {en && (
          <span
            className="font-script"
            style={{ fontSize: 24, color: '#a78bfa', lineHeight: 1, letterSpacing: 0.5 }}
          >
            {en}
          </span>
        )}
        {count && (
          <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>{count}</span>
        )}
      </div>
      {hint && <span style={{ fontSize: 11, color: '#9ca3af' }}>{hint}</span>}
    </div>
  )
}
